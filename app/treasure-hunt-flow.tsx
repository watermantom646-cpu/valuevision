import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatGbp } from "@/constants/pricing";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { resolveApiBase } from "@/lib/api-base";
import { pushPublicRoute } from "@/lib/public-navigation";
import {
  loadScanAccess,
  recordCompletedItemScan,
  type ScanAccess,
} from "@/lib/scan-access";
import { addHistoryEntry, type ScanHistoryEntry } from "@/lib/scan-history";

const MAX_SESSION_VIEWS = 12;
const ANALYSIS_TIMEOUT_MS = 50_000;

const palette = {
  ink: "#06120f",
  forest: "#0a1f19",
  forestRaised: "#102a22",
  forestSoft: "#17382e",
  cream: "#f4f0e4",
  creamMuted: "#c8c8b8",
  lime: "#d9ff68",
  mint: "#8dd3b3",
  coral: "#ff8c70",
  line: "rgba(244, 240, 228, 0.14)",
  lineStrong: "rgba(217, 255, 104, 0.42)",
};

type Phase = "intro" | "camera" | "review" | "results";
type TreasureStatus = "queued" | "processing" | "complete" | "failed" | "blocked";

type TreasureItem = {
  id: string;
  uri: string;
  status: TreasureStatus;
  title: string;
  category: string;
  low: number | null;
  median: number | null;
  high: number | null;
  confidenceLabel: string;
  confidenceScore: number | null;
  evidenceCount: number;
  evidenceAgeDays: number | null;
  contextTitle?: string;
  error?: string;
  historyId?: string;
};

type NormalizedAnalysis = {
  title: string;
  category: string;
  low: number | null;
  median: number | null;
  high: number | null;
  confidenceLabel: string;
  confidenceScore: number | null;
  confidenceReasons: string[];
  qualityGate: string;
  comps: ScanHistoryEntry["comps"];
  recommendations: string[];
  sellTime?: ScanHistoryEntry["sellTime"];
  profit?: ScanHistoryEntry["profit"];
  listingAssistant?: ScanHistoryEntry["listingAssistant"];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
  );
}

function normalizeAnalysis(payload: unknown): NormalizedAnalysis {
  const envelope = record(payload);
  const primary = record(envelope.result ?? envelope.analysis ?? envelope.data ?? envelope);
  const root = record(primary.analysis ?? primary.result ?? primary);
  const identification = record(root.identification ?? root.identity ?? root.item);
  const valuation = record(root.valuation ?? root.estimate ?? root.priceEstimate ?? root.pricing);
  const range = record(valuation.range ?? valuation.resale ?? root.estimatedValue ?? root.valueRange);
  const confidence = record(root.confidence);

  const low = firstNumber(
    valuation.low,
    valuation.valueLow,
    valuation.resaleLow,
    range.low,
    root.low,
    root.valueLow,
  );
  const median = firstNumber(
    valuation.median,
    valuation.average,
    valuation.mid,
    valuation.valueMedian,
    valuation.estimatedValue,
    range.median,
    range.average,
    range.mid,
    root.median,
    root.average,
    root.estimatedValue,
  );
  const high = firstNumber(
    valuation.high,
    valuation.valueHigh,
    valuation.resaleHigh,
    range.high,
    root.high,
    root.valueHigh,
  );

  let confidenceScore = firstNumber(
    confidence.score,
    confidence.value,
    root.confidenceScore,
    root.confidence,
  );
  if (confidenceScore !== null && confidenceScore <= 1) confidenceScore *= 100;

  const rawComps = Array.isArray(root.comps)
    ? root.comps
    : Array.isArray(valuation.comps)
      ? valuation.comps
      : [];

  return {
    title:
      firstText(
        root.detectedQuery,
        root.query,
        root.itemName,
        root.title,
        root.name,
        identification.name,
        identification.title,
        identification.item,
      ) || "Unidentified find",
    category:
      firstText(root.category, identification.category, identification.type) || "General",
    low,
    median: median ?? (low !== null && high !== null ? Math.round((low + high) / 2) : low ?? high),
    high,
    confidenceLabel:
      firstText(confidence.label, root.confidenceLabel) ||
      (confidenceScore !== null && confidenceScore >= 75 ? "Strong match" : "Needs review"),
    confidenceScore,
    confidenceReasons: stringList(root.confidenceReasons ?? confidence.reasons),
    qualityGate: firstText(root.qualityGate, root.quality) || "review",
    comps: rawComps as ScanHistoryEntry["comps"],
    recommendations: stringList(root.recommendations),
    sellTime: root.sellTime as ScanHistoryEntry["sellTime"],
    profit: root.profit as ScanHistoryEntry["profit"],
    listingAssistant: root.listingAssistant as ScanHistoryEntry["listingAssistant"],
  };
}

function isVehicleResult(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return ["car", "cars", "vehicle", "vehicles", "van", "motorcycle", "automotive"].includes(
    normalized,
  );
}

function initialTreasureItem(uri: string, id: string, contextTitle?: string): TreasureItem {
  return {
    id,
    uri,
    status: "queued",
    title: contextTitle ? `Checking ${contextTitle}` : "Searching this view",
    category: "Treasure Hunt",
    low: null,
    median: null,
    high: null,
    confidenceLabel: "Queued",
    confidenceScore: null,
    evidenceCount: 0,
    evidenceAgeDays: null,
    contextTitle,
  };
}

function fileMimeType(uri: string): string {
  const clean = uri.toLowerCase().split("?")[0];
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".heic") || clean.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function errorMessage(payload: unknown, fallback: string): string {
  const body = record(payload);
  return firstText(body.error, body.message, record(body.error).message) || fallback;
}

function compDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function evidenceAgeDays(comps: ScanHistoryEntry["comps"]): number | null {
  if (!Array.isArray(comps) || comps.length === 0) return null;
  const dates = comps
    .map((comp) => {
      const row = record(comp);
      return compDate(row.soldAt ?? row.date ?? row.endedAt ?? row.listedAt);
    })
    .filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return null;
  const newest = Math.max(...dates.map((date) => date.getTime()));
  return Math.max(0, Math.round((Date.now() - newest) / 86_400_000));
}

function priceLabel(item: TreasureItem): string {
  if (item.low !== null && item.high !== null) {
    return `${formatGbp(item.low)}–${formatGbp(item.high)}`;
  }
  const single = item.median ?? item.low ?? item.high;
  return single !== null ? `About ${formatGbp(single)}` : "Worth checking";
}

function confidenceTone(score: number | null): "strong" | "review" | "unknown" {
  if (score === null) return "unknown";
  if (score >= 70) return "strong";
  return "review";
}

export default function TreasureHuntScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(0);
  const transition = useRef(new Animated.Value(1)).current;
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("intro");
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [closeUpFor, setCloseUpFor] = useState("");
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [access, setAccess] = useState<ScanAccess | null>(null);

  const refreshAccess = useCallback(async () => {
    const next = await loadScanAccess();
    setAccess(next);
    return next;
  }, []);

  const resetSession = useCallback(() => {
    sessionIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase("intro");
    setCameraReady(false);
    setCapturing(false);
    setDraftUri(null);
    setCloseUpFor("");
    setItems([]);
    setProcessingId(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      sessionIdRef.current += 1;
      void refreshAccess();
      return resetSession;
    }, [refreshAccess, resetSession]),
  );

  useEffect(() => {
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [phase, transition]);

  const patchItem = useCallback((id: string, patch: Partial<TreasureItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const activeCount = useMemo(
    () => items.filter((item) => item.status === "queued" || item.status === "processing").length,
    [items],
  );
  const completeCount = useMemo(
    () => items.filter((item) => item.status === "complete").length,
    [items],
  );
  const remainingCapacity = Math.max(
    0,
    Math.min(MAX_SESSION_VIEWS - items.length, (access?.remaining ?? MAX_SESSION_VIEWS) - activeCount),
  );

  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.status === "complete" && b.status !== "complete") return -1;
      if (a.status !== "complete" && b.status === "complete") return 1;
      if (a.status === "complete" && b.status === "complete") {
        return (b.median ?? b.high ?? 0) - (a.median ?? a.high ?? 0);
      }
      if (a.status === "processing" && b.status !== "processing") return -1;
      return 0;
    });
  }, [items]);

  const addUrisToQueue = useCallback(
    (uris: string[], contextTitle?: string) => {
      const available = Math.max(0, remainingCapacity);
      if (available <= 0) {
        pushPublicRoute(router, "/paywall");
        return;
      }
      const now = Date.now();
      const next = uris
        .slice(0, available)
        .map((uri, index) =>
          initialTreasureItem(uri, `treasure-${now}-${index}`, contextTitle),
        );
      if (next.length === 0) return;
      setItems((current) => [...current, ...next]);
      setCloseUpFor("");
      setDraftUri(null);
      setPhase("results");
    },
    [remainingCapacity, router],
  );

  const captureView = useCallback(async () => {
    if (capturing || !cameraReady) return;
    if (remainingCapacity <= 0) {
      pushPublicRoute(router, "/paywall");
      return;
    }
    try {
      setCapturing(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.76,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setDraftUri(photo.uri);
        setPhase("review");
      }
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing, remainingCapacity, router]);

  const choosePhotos = useCallback(async () => {
    if (remainingCapacity <= 0) {
      pushPublicRoute(router, "/paywall");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.min(remainingCapacity, 6),
      quality: 0.78,
    });
    if (!result.canceled) {
      addUrisToQueue(
        result.assets.map((asset) => asset.uri),
        closeUpFor || undefined,
      );
    }
  }, [addUrisToQueue, closeUpFor, remainingCapacity, router]);

  const processItem = useCallback(
    async (item: TreasureItem) => {
      const sessionId = sessionIdRef.current;
      const currentAccess = await loadScanAccess();
      if (sessionId !== sessionIdRef.current) return;
      setAccess(currentAccess);
      if (!currentAccess.canScan) {
        patchItem(item.id, {
          status: "blocked",
          error: "No Value Credits remain. This photo did not use a credit.",
        });
        return;
      }

      patchItem(item.id, {
        status: "processing",
        title: item.contextTitle ? `Verifying ${item.contextTitle}` : "Finding the strongest candidate",
        confidenceLabel: "Analysing",
      });
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

      try {
        const form = new FormData();
        form.append(
          "image",
          {
            uri: item.uri,
            name: `${item.id}.jpg`,
            type: fileMimeType(item.uri),
          } as unknown as Blob,
        );
        form.append(
          "query",
          item.contextTitle
            ? `This is a close-up intended to verify ${item.contextTitle}. Identify the exact visible model or variant only when the image proves it. Estimate a realistic current UK resale range using sold-market evidence, accounting for visible condition.`
            : "Identify the strongest clearly visible non-vehicle resale candidate in this image. If an exact model cannot be proven, use a broad honest name and low confidence. Estimate a realistic current UK resale range from sold-market evidence where possible. Do not invent model, completeness, labels, or condition.",
        );
        form.append("category", "general");
        form.append("mode", "treasure-hunt");

        const response = await fetch(`${resolveApiBase()}/analyze`, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const responseText = await response.text();
        let payload: unknown = {};
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = { message: responseText };
        }
        if (!response.ok) throw new Error(errorMessage(payload, "This view could not be analysed."));
        if (sessionId !== sessionIdRef.current) return;

        const analysis = normalizeAnalysis(payload);
        if (isVehicleResult(analysis.category)) {
          patchItem(item.id, {
            status: "failed",
            title: analysis.title,
            category: analysis.category,
            error: "That looks like a vehicle. Use Car Mode for plate, valuation and history checks.",
          });
          return;
        }
        if (analysis.median === null && analysis.low === null && analysis.high === null) {
          patchItem(item.id, {
            status: "failed",
            title: analysis.title,
            category: analysis.category,
            confidenceScore: analysis.confidenceScore,
            confidenceLabel: "Close-up needed",
            error: "We found a possible item but cannot support a responsible price from this view.",
          });
          return;
        }

        const historyId = `treasure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const historyEntry = {
          id: historyId,
          createdAt: new Date().toISOString(),
          query: analysis.title,
          detectedQuery: analysis.title,
          category: analysis.category,
          confidenceLabel: analysis.confidenceLabel,
          confidenceScore: analysis.confidenceScore,
          currency: "GBP",
          currencySymbol: "£",
          low: analysis.low,
          median: analysis.median,
          high: analysis.high,
          confidenceReasons: analysis.confidenceReasons,
          qualityGate: analysis.qualityGate,
          comps: analysis.comps,
          recommendations: analysis.recommendations,
          sellTime: analysis.sellTime,
          profit: analysis.profit,
          listingAssistant: analysis.listingAssistant,
        } as unknown as ScanHistoryEntry;
        await addHistoryEntry(historyEntry);
        if (sessionId !== sessionIdRef.current) return;

        const nextAccess = await recordCompletedItemScan();
        if (sessionId !== sessionIdRef.current) return;
        setAccess(nextAccess);
        patchItem(item.id, {
          status: "complete",
          title: analysis.title,
          category: analysis.category,
          low: analysis.low,
          median: analysis.median,
          high: analysis.high,
          confidenceLabel: analysis.confidenceLabel,
          confidenceScore: analysis.confidenceScore,
          evidenceCount: Array.isArray(analysis.comps) ? analysis.comps.length : 0,
          evidenceAgeDays: evidenceAgeDays(analysis.comps),
          historyId,
          error: undefined,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void trackAnalyticsEvent("scan_success", {
          mode: "treasure_hunt",
          category: analysis.category,
          has_value: true,
        });
      } catch (error) {
        if (sessionId !== sessionIdRef.current) return;
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Analysis took too long. This photo was not counted."
            : error instanceof Error
              ? error.message
              : "This view could not be analysed.";
        patchItem(item.id, { status: "failed", error: message });
        void trackAnalyticsEvent("scan_failure", { mode: "treasure_hunt", reason: message });
      } finally {
        clearTimeout(timeout);
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [patchItem],
  );

  useEffect(() => {
    if (phase !== "results" || processingId) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) return;
    setProcessingId(next.id);
    void processItem(next).finally(() => setProcessingId(null));
  }, [items, phase, processItem, processingId]);

  const retryItem = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "queued",
              title: item.contextTitle ? `Checking ${item.contextTitle}` : "Searching this view",
              error: undefined,
            }
          : item,
      ),
    );
  }, []);

  const startCloseUp = useCallback((title: string) => {
    setCloseUpFor(title);
    setDraftUri(null);
    setCameraReady(false);
    setPhase("camera");
  }, []);

  const finishSession = useCallback(() => {
    resetSession();
    router.back();
  }, [resetSession, router]);

  const animatedStyle = {
    opacity: transition,
    transform: [
      {
        translateY: transition.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <Animated.View style={[styles.animatedPage, animatedStyle]}>
        {phase === "intro" ? (
          <IntroScreen
            remaining={access?.remaining ?? null}
            onBack={() => router.back()}
            onStart={() => {
              setItems([]);
              setDraftUri(null);
              setCloseUpFor("");
              setCameraReady(false);
              setPhase("camera");
            }}
            onUpload={() => void choosePhotos()}
          />
        ) : null}

        {phase === "camera" ? (
          <CameraScreen
            permissionGranted={Boolean(permission?.granted)}
            cameraRef={cameraRef}
            cameraReady={cameraReady}
            capturing={capturing}
            closeUpFor={closeUpFor}
            remaining={access?.remaining ?? null}
            onReady={() => setCameraReady(true)}
            onBack={() => {
              setCameraReady(false);
              setCloseUpFor("");
              setPhase(items.length > 0 ? "results" : "intro");
            }}
            onPermission={() => void requestPermission()}
            onCapture={() => void captureView()}
            onUpload={() => void choosePhotos()}
          />
        ) : null}

        {phase === "review" && draftUri ? (
          <ReviewScreen
            uri={draftUri}
            closeUpFor={closeUpFor}
            onRetake={() => {
              setDraftUri(null);
              setCameraReady(false);
              setPhase("camera");
            }}
            onUse={() => addUrisToQueue([draftUri], closeUpFor || undefined)}
          />
        ) : null}

        {phase === "results" ? (
          <ResultsScreen
            items={orderedItems}
            activeCount={activeCount}
            completeCount={completeCount}
            remaining={access?.remaining ?? null}
            onBack={finishSession}
            onAdd={() => {
              setCloseUpFor("");
              setDraftUri(null);
              setCameraReady(false);
              setPhase("camera");
            }}
            onCloseUp={startCloseUp}
            onRetry={retryItem}
            onOpen={(historyId) => pushPublicRoute(router, `/item/${historyId}`)}
            onUpgrade={() => pushPublicRoute(router, "/paywall")}
          />
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}

function AppHeader({ label, onBack, action }: { label: string; onBack: () => void; action?: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Go back" style={styles.headerButton} onPress={onBack}>
        <Text style={styles.headerButtonText}>‹</Text>
      </Pressable>
      <Text style={styles.headerLabel}>{label}</Text>
      <View style={styles.headerAction}>{action ? <Text style={styles.headerActionText}>{action}</Text> : null}</View>
    </View>
  );
}

function IntroScreen({
  remaining,
  onBack,
  onStart,
  onUpload,
}: {
  remaining: number | null;
  onBack: () => void;
  onStart: () => void;
  onUpload: () => void;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.introContent} showsVerticalScrollIndicator={false}>
      <AppHeader label="TREASURE HUNT" onBack={onBack} action={remaining === null ? "" : `${remaining} CREDITS`} />
      <View style={styles.orbitWrap}>
        <View style={styles.orbitOuter} />
        <View style={styles.orbitInner} />
        <View style={[styles.orbitDot, styles.orbitDotOne]} />
        <View style={[styles.orbitDot, styles.orbitDotTwo]} />
        <View style={styles.orbitCore}>
          <Text style={styles.orbitCoreMark}>V</Text>
        </View>
      </View>
      <Text style={styles.introEyebrow}>ROOM-TO-RESALE DISCOVERY</Text>
      <Text style={styles.displayTitle}>Turn any room into a shortlist.</Text>
      <Text style={styles.introSubtitle}>
        Photograph a space or several objects. ValueVision finds the strongest visible resale candidates and ranks what deserves a closer look.
      </Text>

      <View style={styles.stepStack}>
        <Step number="01" title="Photograph the space" text="Start wide, then add another angle if objects overlap." />
        <Step number="02" title="Review ranked finds" text="The strongest supported opportunities rise to the top." />
        <Step number="03" title="Confirm the value" text="Close-ups verify labels, condition and completeness before you sell." />
      </View>

      <View style={styles.truthCard}>
        <Text style={styles.truthMark}>✓</Text>
        <View style={styles.truthCopy}>
          <Text style={styles.truthTitle}>Honest by design</Text>
          <Text style={styles.truthText}>A wide photo creates a shortlist. We only present a confident price when the evidence supports it.</Text>
        </View>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Start a room scan"
        accessibilityHint="Opens the camera to photograph a room or collection"
      >
        <Text style={styles.primaryButtonText}>Start a room scan</Text>
        <Text style={styles.primaryButtonArrow}>→</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={onUpload}
        accessibilityRole="button"
        accessibilityLabel="Choose existing photos"
        accessibilityHint="Opens your photo library to select room or collection photos"
      >
        <Text style={styles.secondaryButtonText}>Choose existing photos</Text>
      </Pressable>
      <Text style={styles.privacyNote}>Each completed item valuation uses 1 Value Credit. Photos are used only to produce your results and saved history.</Text>
    </ScrollView>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNumber}>{number}</Text>
      <View style={styles.stepRule} />
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

function CameraScreen({
  permissionGranted,
  cameraRef,
  cameraReady,
  capturing,
  closeUpFor,
  remaining,
  onReady,
  onBack,
  onPermission,
  onCapture,
  onUpload,
}: {
  permissionGranted: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  cameraReady: boolean;
  capturing: boolean;
  closeUpFor: string;
  remaining: number | null;
  onReady: () => void;
  onBack: () => void;
  onPermission: () => void;
  onCapture: () => void;
  onUpload: () => void;
}) {
  return (
    <View style={styles.cameraPage}>
      {permissionGranted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={onReady} />
      ) : (
        <View style={styles.cameraPermissionBackdrop} />
      )}
      <View style={styles.cameraOverlay}>
        <View style={styles.cameraTopRow}>
          <Pressable accessibilityLabel="Go back" style={styles.cameraRoundButton} onPress={onBack}>
            <Text style={styles.cameraRoundButtonText}>‹</Text>
          </Pressable>
          <View style={styles.cameraPill}>
            <View style={styles.liveDot} />
            <Text style={styles.cameraPillText}>{closeUpFor ? "CLOSE-UP" : "ROOM SCAN"}</Text>
          </View>
          <View style={styles.cameraCountPill}>
            <Text style={styles.cameraCountText}>{remaining === null ? "–" : remaining}</Text>
          </View>
        </View>

        <View style={styles.finderArea}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
          <View style={styles.cameraInstruction}>
            <Text style={styles.cameraInstructionTitle}>
              {closeUpFor ? `Verify ${closeUpFor}` : "Fit the useful area inside the frame"}
            </Text>
            <Text style={styles.cameraInstructionText}>
              {closeUpFor ? "Show labels, markings and condition clearly." : "Avoid glare and include objects from floor to shelf."}
            </Text>
          </View>
        </View>

        <View style={styles.cameraControls}>
          {!permissionGranted ? (
            <Pressable style={styles.allowCameraButton} onPress={onPermission}>
              <Text style={styles.allowCameraText}>Allow camera access</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.controlSideButton} onPress={onUpload}>
                <Text style={styles.controlSideIcon}>▧</Text>
                <Text style={styles.controlSideText}>UPLOAD</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Take photo"
                disabled={!cameraReady || capturing}
                style={({ pressed }) => [
                  styles.shutterOuter,
                  (pressed || !cameraReady || capturing) && styles.buttonDimmed,
                ]}
                onPress={onCapture}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.controlSideButton}>
                <Text style={styles.controlSideIcon}>◎</Text>
                <Text style={styles.controlSideText}>STEADY</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function ReviewScreen({
  uri,
  closeUpFor,
  onRetake,
  onUse,
}: {
  uri: string;
  closeUpFor: string;
  onRetake: () => void;
  onUse: () => void;
}) {
  return (
    <View style={styles.reviewPage}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.reviewShade} />
      <AppHeader label={closeUpFor ? "CHECK THE CLOSE-UP" : "CHECK THE VIEW"} onBack={onRetake} />
      <View style={styles.reviewBottom}>
        <View style={styles.reviewBadge}>
          <Text style={styles.reviewBadgeText}>{closeUpFor ? "VERIFICATION PHOTO" : "1 VIEW READY"}</Text>
        </View>
        <Text style={styles.reviewTitle}>
          {closeUpFor ? "Can you read the useful details?" : "Is the room clear enough to search?"}
        </Text>
        <Text style={styles.reviewText}>
          {closeUpFor
            ? "The exact model, markings and visible condition improve the final valuation."
            : "Wide photos create candidates. You can add more angles after the first analysis."}
        </Text>
        <Pressable style={styles.primaryButton} onPress={onUse}>
          <Text style={styles.primaryButtonText}>{closeUpFor ? "Verify this item" : "Analyse this room"}</Text>
          <Text style={styles.primaryButtonArrow}>→</Text>
        </Pressable>
        <Pressable style={styles.reviewRetake} onPress={onRetake}>
          <Text style={styles.reviewRetakeText}>Retake photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ResultsScreen({
  items,
  activeCount,
  completeCount,
  remaining,
  onBack,
  onAdd,
  onCloseUp,
  onRetry,
  onOpen,
  onUpgrade,
}: {
  items: TreasureItem[];
  activeCount: number;
  completeCount: number;
  remaining: number | null;
  onBack: () => void;
  onAdd: () => void;
  onCloseUp: (title: string) => void;
  onRetry: (id: string) => void;
  onOpen: (historyId: string) => void;
  onUpgrade: () => void;
}) {
  const finished = activeCount === 0;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>
      <AppHeader label="TREASURE HUNT" onBack={onBack} action={remaining === null ? "" : `${remaining} LEFT`} />
      <View style={styles.resultsLead}>
        <Text style={styles.resultsEyebrow}>{finished ? "RANKED SHORTLIST" : "ANALYSIS IN PROGRESS"}</Text>
        <Text style={styles.resultsTitle}>
          {finished ? (completeCount > 0 ? "Your strongest finds." : "This view needs another look.") : "Searching for resale potential."}
        </Text>
        <Text style={styles.resultsSubtitle}>
          {finished
            ? `${completeCount} supported ${completeCount === 1 ? "candidate" : "candidates"}. Add another angle to uncover more.`
            : "Identifying objects, checking evidence and ranking supported values."}
        </Text>
      </View>

      {!finished ? (
        <View style={styles.analysisCard}>
          <View style={styles.radar}>
            <View style={styles.radarRingLarge} />
            <View style={styles.radarRingSmall} />
            <View style={styles.radarSweep} />
            <View style={styles.radarCore} />
          </View>
          <View style={styles.analysisCopy}>
            <Text style={styles.analysisTitle}>Evidence-led analysis</Text>
            <Text style={styles.analysisLine}>Locating the strongest visible item</Text>
            <Text style={styles.analysisLine}>Checking identification confidence</Text>
            <Text style={styles.analysisLine}>Comparing realistic resale evidence</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.resultList}>
        {items.map((item, index) => (
          <FindCard
            key={item.id}
            item={item}
            rank={index + 1}
            onCloseUp={() => onCloseUp(item.title)}
            onRetry={() => onRetry(item.id)}
            onOpen={() => item.historyId && onOpen(item.historyId)}
            onUpgrade={onUpgrade}
          />
        ))}
      </View>

      <View style={styles.shortlistNote}>
        <Text style={styles.shortlistNoteTitle}>Why a close-up matters</Text>
        <Text style={styles.shortlistNoteText}>
          Hidden labels, missing parts and condition can change value dramatically. Treasure Hunt narrows the room down first; focused photos make the price dependable.
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={onAdd}>
        <Text style={styles.primaryButtonText}>Add another view</Text>
        <Text style={styles.primaryButtonArrow}>＋</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Finish and return home</Text>
      </Pressable>
    </ScrollView>
  );
}

function FindCard({
  item,
  rank,
  onCloseUp,
  onRetry,
  onOpen,
  onUpgrade,
}: {
  item: TreasureItem;
  rank: number;
  onCloseUp: () => void;
  onRetry: () => void;
  onOpen: () => void;
  onUpgrade: () => void;
}) {
  const tone = confidenceTone(item.confidenceScore);
  const showPrice = item.status === "complete" && tone !== "review";

  return (
    <View style={[styles.findCard, item.status === "processing" && styles.findCardActive]}>
      <View style={styles.findImageWrap}>
        <Image source={{ uri: item.uri }} style={styles.findImage} resizeMode="cover" />
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>{String(rank).padStart(2, "0")}</Text>
        </View>
      </View>
      <View style={styles.findBody}>
        {item.status === "queued" || item.status === "processing" ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator color={palette.lime} size="small" />
            <Text style={styles.pendingText}>{item.title}</Text>
          </View>
        ) : null}

        {item.status === "complete" ? (
          <>
            <Text style={styles.findCategory}>{item.category.toUpperCase()}</Text>
            <Text style={styles.findTitle}>{item.title}</Text>
            <View style={styles.findValueRow}>
              <Text style={showPrice ? styles.findPrice : styles.findCheck}>{showPrice ? priceLabel(item) : "Worth checking"}</Text>
              <View style={[styles.confidenceBadge, tone === "strong" ? styles.confidenceStrong : styles.confidenceReview]}>
                <Text style={styles.confidenceBadgeText}>
                  {item.confidenceScore === null ? item.confidenceLabel : `${Math.round(item.confidenceScore)}% match`}
                </Text>
              </View>
            </View>
            <Text style={styles.evidenceText}>
              {item.evidenceCount > 0
                ? `${item.evidenceCount} market ${item.evidenceCount === 1 ? "match" : "matches"}${item.evidenceAgeDays === null ? "" : ` • newest ${item.evidenceAgeDays}d ago`}`
                : "Estimate available • open the result for supporting detail"}
            </Text>
            {tone === "review" ? (
              <Pressable style={styles.closeUpButton} onPress={onCloseUp}>
                <Text style={styles.closeUpButtonText}>Take a close-up for a reliable value</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.openResultButton} onPress={onOpen}>
                <Text style={styles.openResultButtonText}>Open full valuation</Text>
                <Text style={styles.openResultArrow}>→</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {item.status === "failed" ? (
          <>
            <Text style={styles.findCategory}>NEEDS ANOTHER VIEW</Text>
            <Text style={styles.findTitle}>{item.title}</Text>
            <Text style={styles.findError}>{item.error}</Text>
            <View style={styles.errorActions}>
              <Pressable style={styles.miniPrimary} onPress={onCloseUp}>
                <Text style={styles.miniPrimaryText}>Take close-up</Text>
              </Pressable>
              <Pressable style={styles.miniSecondary} onPress={onRetry}>
                <Text style={styles.miniSecondaryText}>Retry</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {item.status === "blocked" ? (
          <>
            <Text style={styles.findCategory}>SCAN ALLOWANCE</Text>
            <Text style={styles.findTitle}>Keep hunting</Text>
            <Text style={styles.findError}>{item.error}</Text>
            <Pressable style={styles.closeUpButton} onPress={onUpgrade}>
              <Text style={styles.closeUpButtonText}>View scan options</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.forest },
  animatedPage: { flex: 1 },
  page: { flex: 1, backgroundColor: palette.forest },
  introContent: { paddingBottom: 34 },
  resultsContent: { paddingBottom: 34 },
  header: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  headerButtonText: { color: palette.cream, fontSize: 32, lineHeight: 34, marginTop: -3 },
  headerLabel: { color: palette.creamMuted, fontSize: 11, fontWeight: "900", letterSpacing: 2.1 },
  headerAction: { width: 58, alignItems: "flex-end" },
  headerActionText: { color: palette.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  orbitWrap: { height: 184, alignItems: "center", justifyContent: "center", marginTop: 8 },
  orbitOuter: { position: "absolute", width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: "rgba(141,211,179,0.22)" },
  orbitInner: { position: "absolute", width: 116, height: 116, borderRadius: 58, borderWidth: 1, borderColor: "rgba(217,255,104,0.25)" },
  orbitDot: { position: "absolute", width: 11, height: 11, borderRadius: 6, backgroundColor: palette.lime },
  orbitDotOne: { top: 31, right: "31%" },
  orbitDotTwo: { bottom: 28, left: "29%", backgroundColor: palette.mint },
  orbitCore: { width: 74, height: 74, borderRadius: 37, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center", shadowColor: palette.lime, shadowOpacity: 0.32, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  orbitCoreMark: { color: palette.ink, fontFamily: "Georgia", fontWeight: "900", fontSize: 34 },
  introEyebrow: { marginHorizontal: 22, color: palette.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.7, marginBottom: 9 },
  displayTitle: { marginHorizontal: 22, color: palette.cream, fontFamily: "Georgia", fontSize: 39, lineHeight: 44, fontWeight: "700", letterSpacing: -1.1 },
  introSubtitle: { marginHorizontal: 22, marginTop: 14, color: palette.creamMuted, fontSize: 15, lineHeight: 23 },
  stepStack: { marginHorizontal: 22, marginTop: 28, borderTopWidth: 1, borderTopColor: palette.line },
  stepRow: { minHeight: 88, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: palette.line },
  stepNumber: { color: palette.lime, fontSize: 11, fontWeight: "900", letterSpacing: 1.3, width: 32 },
  stepRule: { width: 1, height: 42, backgroundColor: palette.line, marginRight: 16 },
  stepCopy: { flex: 1, paddingVertical: 15 },
  stepTitle: { color: palette.cream, fontSize: 15, fontWeight: "800" },
  stepText: { color: palette.creamMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  truthCard: { marginHorizontal: 22, marginTop: 22, padding: 15, borderRadius: 18, backgroundColor: palette.forestSoft, borderWidth: 1, borderColor: palette.lineStrong, flexDirection: "row", gap: 12 },
  truthMark: { width: 28, height: 28, borderRadius: 14, color: palette.ink, backgroundColor: palette.lime, textAlign: "center", lineHeight: 28, fontWeight: "900" },
  truthCopy: { flex: 1 },
  truthTitle: { color: palette.cream, fontSize: 13, fontWeight: "900" },
  truthText: { color: palette.creamMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  primaryButton: { marginHorizontal: 22, marginTop: 22, minHeight: 56, borderRadius: 17, paddingHorizontal: 18, backgroundColor: palette.lime, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryButtonText: { color: palette.ink, fontSize: 15, fontWeight: "900" },
  primaryButtonArrow: { color: palette.ink, fontSize: 22, fontWeight: "700" },
  secondaryButton: { marginHorizontal: 22, marginTop: 10, minHeight: 52, borderRadius: 17, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.025)" },
  secondaryButtonText: { color: palette.cream, fontSize: 14, fontWeight: "800" },
  privacyNote: { color: "#778f84", fontSize: 10, lineHeight: 15, textAlign: "center", marginHorizontal: 36, marginTop: 14 },
  cameraPage: { flex: 1, backgroundColor: palette.ink },
  cameraPermissionBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.forestSoft },
  cameraOverlay: { flex: 1, backgroundColor: "rgba(2,10,8,0.12)", paddingBottom: 18 },
  cameraTopRow: { paddingHorizontal: 16, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cameraRoundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(5,18,15,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  cameraRoundButtonText: { color: palette.cream, fontSize: 32, lineHeight: 34, marginTop: -3 },
  cameraPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 13, backgroundColor: "rgba(5,18,15,0.72)", flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.lime },
  cameraPillText: { color: palette.cream, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  cameraCountPill: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(5,18,15,0.7)", alignItems: "center", justifyContent: "center" },
  cameraCountText: { color: palette.lime, fontSize: 12, fontWeight: "900" },
  finderArea: { flex: 1, marginHorizontal: 26, marginVertical: 30, position: "relative", alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: 38, height: 38, borderColor: palette.lime },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  cameraInstruction: { maxWidth: 290, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 12, backgroundColor: "rgba(5,18,15,0.74)", alignItems: "center" },
  cameraInstructionTitle: { color: palette.cream, textAlign: "center", fontSize: 14, fontWeight: "900" },
  cameraInstructionText: { color: palette.creamMuted, textAlign: "center", fontSize: 11, lineHeight: 16, marginTop: 4 },
  cameraControls: { minHeight: 102, marginHorizontal: 16, borderRadius: 26, paddingHorizontal: 20, backgroundColor: "rgba(5,18,15,0.86)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlSideButton: { width: 72, minHeight: 60, alignItems: "center", justifyContent: "center" },
  controlSideIcon: { color: palette.cream, fontSize: 24 },
  controlSideText: { color: palette.creamMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: palette.cream, padding: 6, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: palette.lime },
  buttonDimmed: { opacity: 0.48 },
  allowCameraButton: { flex: 1, minHeight: 56, borderRadius: 18, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center" },
  allowCameraText: { color: palette.ink, fontSize: 14, fontWeight: "900" },
  reviewPage: { flex: 1, backgroundColor: palette.ink },
  reviewShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,10,8,0.28)" },
  reviewBottom: { marginTop: "auto", paddingTop: 28, paddingBottom: 30, backgroundColor: "rgba(7,23,19,0.94)", borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  reviewBadge: { alignSelf: "flex-start", marginHorizontal: 22, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.forestSoft },
  reviewBadgeText: { color: palette.lime, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  reviewTitle: { marginHorizontal: 22, marginTop: 14, color: palette.cream, fontFamily: "Georgia", fontSize: 29, lineHeight: 34, fontWeight: "700" },
  reviewText: { marginHorizontal: 22, marginTop: 9, color: palette.creamMuted, fontSize: 13, lineHeight: 20 },
  reviewRetake: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 4 },
  reviewRetakeText: { color: palette.creamMuted, fontSize: 13, fontWeight: "800" },
  resultsLead: { paddingHorizontal: 22, paddingTop: 16 },
  resultsEyebrow: { color: palette.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  resultsTitle: { marginTop: 9, color: palette.cream, fontFamily: "Georgia", fontSize: 34, lineHeight: 39, fontWeight: "700" },
  resultsSubtitle: { marginTop: 9, color: palette.creamMuted, fontSize: 13, lineHeight: 20 },
  analysisCard: { marginHorizontal: 22, marginTop: 22, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.forestRaised, flexDirection: "row", alignItems: "center", gap: 16 },
  radar: { width: 78, height: 78, borderRadius: 39, backgroundColor: "rgba(217,255,104,0.05)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  radarRingLarge: { position: "absolute", width: 66, height: 66, borderRadius: 33, borderWidth: 1, borderColor: "rgba(217,255,104,0.3)" },
  radarRingSmall: { position: "absolute", width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: "rgba(217,255,104,0.35)" },
  radarSweep: { position: "absolute", width: 34, height: 2, backgroundColor: palette.lime, left: 39, top: 38, transform: [{ rotate: "-32deg" }] },
  radarCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.lime },
  analysisCopy: { flex: 1 },
  analysisTitle: { color: palette.cream, fontSize: 13, fontWeight: "900", marginBottom: 5 },
  analysisLine: { color: palette.creamMuted, fontSize: 10, lineHeight: 16 },
  resultList: { marginHorizontal: 16, marginTop: 20, gap: 12 },
  findCard: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.forestRaised },
  findCardActive: { borderColor: palette.lineStrong },
  findImageWrap: { height: 174, position: "relative", backgroundColor: palette.forestSoft },
  findImage: { width: "100%", height: "100%" },
  rankBadge: { position: "absolute", left: 14, top: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center" },
  rankBadgeText: { color: palette.ink, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  findBody: { padding: 17 },
  pendingRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12 },
  pendingText: { color: palette.cream, fontSize: 14, fontWeight: "800", flex: 1 },
  findCategory: { color: palette.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  findTitle: { color: palette.cream, fontFamily: "Georgia", fontSize: 23, lineHeight: 28, fontWeight: "700", marginTop: 7 },
  findValueRow: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  findPrice: { color: palette.lime, fontSize: 22, fontWeight: "900", flexShrink: 1 },
  findCheck: { color: palette.coral, fontSize: 17, fontWeight: "900", flexShrink: 1 },
  confidenceBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  confidenceStrong: { backgroundColor: "rgba(141,211,179,0.16)" },
  confidenceReview: { backgroundColor: "rgba(255,140,112,0.16)" },
  confidenceBadgeText: { color: palette.cream, fontSize: 9, fontWeight: "900" },
  evidenceText: { color: palette.creamMuted, fontSize: 10, lineHeight: 16, marginTop: 9 },
  closeUpButton: { minHeight: 46, borderRadius: 14, marginTop: 14, paddingHorizontal: 13, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center" },
  closeUpButtonText: { color: palette.ink, fontSize: 12, fontWeight: "900", textAlign: "center" },
  openResultButton: { minHeight: 46, borderRadius: 14, marginTop: 14, paddingHorizontal: 13, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  openResultButtonText: { color: palette.cream, fontSize: 12, fontWeight: "900" },
  openResultArrow: { color: palette.lime, fontSize: 18 },
  findError: { color: palette.creamMuted, fontSize: 12, lineHeight: 19, marginTop: 9 },
  errorActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  miniPrimary: { flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center" },
  miniPrimaryText: { color: palette.ink, fontSize: 11, fontWeight: "900" },
  miniSecondary: { minWidth: 82, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  miniSecondaryText: { color: palette.cream, fontSize: 11, fontWeight: "900" },
  shortlistNote: { marginHorizontal: 22, marginTop: 20, padding: 16, borderRadius: 19, backgroundColor: "rgba(141,211,179,0.09)", borderWidth: 1, borderColor: "rgba(141,211,179,0.2)" },
  shortlistNoteTitle: { color: palette.cream, fontSize: 13, fontWeight: "900" },
  shortlistNoteText: { color: palette.creamMuted, fontSize: 11, lineHeight: 18, marginTop: 5 },
});
