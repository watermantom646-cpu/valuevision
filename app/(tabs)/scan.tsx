import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import Constants from "expo-constants";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Button, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { isPlaceholderApiBase, looksLikeLocalApiBase, resolveApiBase } from "@/lib/api-base";
import { pushPublicRoute } from "@/lib/public-navigation";
import { loadScanAccess, recordCompletedStarterScan, type ScanAccess } from "@/lib/scan-access";
import { addHistoryEntry, loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";
import { loadWatchlist, upsertWatchlistEntry, type WatchlistEntry } from "@/lib/watchlist";

const API_BASE = resolveApiBase();
const API_BASE_NEEDS_REMOTE_CONFIG = !__DEV__ && (looksLikeLocalApiBase(API_BASE) || isPlaceholderApiBase(API_BASE));
const FAST_TIMEOUT_MS = 25000;
const REFINE_TIMEOUT_MS = 22000;
const LIVE_SCAN_INTERVAL_MS = 4000;
const VOICE_TURN_CAPTURE_MS = 5000;
const VOICE_TURN_GAP_MS = 900;
const LIVE_NARRATION_COOLDOWN_MS = 9000;
const URL_PROBE_TIMEOUT_MS = 3500;
const ANALYZE_ATTEMPT_TIMEOUT_FAST_MS = 18000;
const ANALYZE_ATTEMPT_TIMEOUT_REFINE_MS = 26000;
const STATUS_ATTEMPT_TIMEOUT_MS = 12000;
const VOICE_ATTEMPT_TIMEOUT_MS = 10000;
const PAID_ACCESS_HEADER = String(process.env.EXPO_PUBLIC_PAID_ACCESS_HEADER || "x-valuevision-paid-token")
  .trim()
  .toLowerCase();
const PAID_ACCESS_TOKEN = String(process.env.EXPO_PUBLIC_PAID_ACCESS_TOKEN || "").trim();

function barcodeQueryFromScan(rawValue: string, rawType?: string) {
  const value = String(rawValue || "").trim();
  const type = String(rawType || "").toLowerCase();
  const digits = value.replace(/\D/g, "");
  const looksLikeIsbn13 = digits.length === 13 && (digits.startsWith("978") || digits.startsWith("979"));
  if (looksLikeIsbn13 || type === "ean13") {
    return `ISBN ${digits || value} book`;
  }
  if (digits.length === 8 || digits.length === 12 || digits.length === 13 || type.includes("upc")) {
    return `barcode ${digits || value}`;
  }
  return value;
}

function currencySymbol(currency?: string, preferred?: string) {
  if (preferred) return preferred;
  if (currency === "GBP") return "£";
  if (currency === "EUR") return "€";
  if (currency === "CAD") return "C$";
  if (currency === "AUD") return "A$";
  return "$";
}

function formatMoney(value: number | null | undefined, symbol: string, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `${symbol}${value.toFixed(decimals)}`;
}

function formatUkDate(value?: string | null) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

function recommendationScore(rec: SellRecommendation): number {
  const speed = String(rec.speed || "").toLowerCase();
  const fee = String(rec.fee || "").toLowerCase();
  const speedScore = speed.includes("fast") ? 25 : speed.includes("medium") ? 14 : speed.includes("slow") ? 6 : 10;
  const feePctMatch = fee.match(/(\d+(\.\d+)?)\s*%/);
  const feePct = feePctMatch ? Number(feePctMatch[1]) : null;
  const feePenalty = feePct != null && Number.isFinite(feePct) ? Math.min(28, feePct * 2.2) : fee.includes("low") ? 6 : 12;
  const reasonBonus = String(rec.reason || "").toLowerCase().includes("demand") ? 8 : 4;
  return Math.max(1, Math.min(100, Math.round(55 + speedScore + reasonBonus - feePenalty)));
}

function parseMotOk(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (!s) return null;
  if (s.includes("valid")) return true;
  if (s.includes("expired")) return false;
  return null;
}

function parseTaxOk(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (!s) return null;
  if (s.includes("taxed") || s.includes("paid")) return true;
  if (s.includes("untaxed") || s.includes("expired")) return false;
  return null;
}

function normalizeUkReg(value?: string | null) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function looksLikeUkReg(value?: string | null) {
  const reg = normalizeUkReg(value);
  if (!reg) return false;
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(reg)) return true;
  if (/^[A-Z]\d{1,3}[A-Z]{3}$/.test(reg)) return true;
  if (/^[A-Z]{3}\d{1,3}[A-Z]$/.test(reg)) return true;
  return false;
}

function findUkRegInText(value?: string | null) {
  const source = String(value || "").toUpperCase();
  if (!source) return null;
  const compact = normalizeUkReg(source);
  const patterns = [
    /([A-Z]{2}\d{2}[A-Z]{3})/,
    /([A-Z]\d{1,3}[A-Z]{3})/,
    /([A-Z]{3}\d{1,3}[A-Z])/,
  ];
  for (const re of patterns) {
    const m = compact.match(re);
    if (m?.[1] && looksLikeUkReg(m[1])) return m[1];
  }
  return null;
}

function classifyScanError(raw: string, apiBase: string) {
  const message = String(raw || "").trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("network request failed") ||
    lower.includes("no backend url reachable") ||
    lower.includes("wrong url/port") ||
    lower.includes("backend not running")
  ) {
    const isHttpsTarget = /^https:\/\//i.test(apiBase);
    return {
      title: "Connection issue",
      summary: "Your device could not reach the valuation server.",
      steps: isHttpsTarget
        ? [
            "Check your internet connection.",
            "Make sure your live API server is online.",
            `Server target: ${apiBase}`,
          ]
        : [
            "Check phone and laptop are on the same Wi-Fi.",
            "Make sure backend is running on port 5050.",
            `Server target: ${apiBase}`,
          ],
      tone: "network" as const,
    };
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      title: "Scan timed out",
      summary: "The request took too long to complete.",
      steps: [
        "Try again with a clearer, closer photo.",
        "If this repeats, test server connection.",
      ],
      tone: "timeout" as const,
    };
  }

  if (lower.includes("photo quality too low")) {
    return {
      title: "Photo quality too low",
      summary: "We need a clearer image to price this item.",
      steps: [
        "Fill more of the frame with one item.",
        "Avoid blur, glare, and shadows.",
      ],
      tone: "photo" as const,
    };
  }

  if (
    lower.includes("paid access required") ||
    lower.includes("full car check requires paid access") ||
    lower.includes("paid feature is currently locked")
  ) {
    return {
      title: "Paid check required",
      summary: "This vehicle check is protected until paid access is unlocked.",
      steps: [
        "Use item scans as normal.",
        "Unlock paid car checks for live vehicle data calls.",
      ],
      tone: "network" as const,
    };
  }

  return {
    title: "Scan issue",
    summary: message || "Something went wrong during scan.",
    steps: ["Try scan again or upload a different photo."],
    tone: "generic" as const,
  };
}

async function assessImageQuality(uri: string): Promise<ImageQualityAssessment> {
  const tips: string[] = [];
  let sizeBytes = 0;
  let width = 0;
  let height = 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    sizeBytes = Number((info as any)?.size || 0);
  } catch {}
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      Image.getSize(
        uri,
        (w, h) => resolve({ width: w, height: h }),
        () => resolve({ width: 0, height: 0 })
      );
    });
    width = dims.width;
    height = dims.height;
  } catch {}

  let score = 100;
  const minSide = Math.min(width || 0, height || 0);
  const megaPixels = (width * height) / 1_000_000;

  if (!width || !height) {
    score -= 35;
    tips.push("Retake photo after camera fully focuses.");
  }
  if (minSide > 0 && minSide < 700) {
    score -= 28;
    tips.push("Move closer so the item fills more of the frame.");
  }
  if (megaPixels > 0 && megaPixels < 0.7) {
    score -= 20;
    tips.push("Use a higher-resolution photo.");
  }
  if (sizeBytes > 0 && sizeBytes < 70_000) {
    score -= 24;
    tips.push("Avoid over-compressed images or screenshots.");
  }
  if (sizeBytes > 9_000_000) {
    score -= 6;
    tips.push("Large images are fine, but avoid heavy filters.");
  }

  if (!tips.length) tips.push("Good image quality detected.");
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: normalized,
    pass: normalized >= 40,
    tips: tips.slice(0, 4),
    detail: `${width || "?"}x${height || "?"}, ${(sizeBytes / 1024).toFixed(0)} KB`,
  };
}

type PricingComp = { title: string; price: string; source: string; link: string };
type SellRecommendation = { name: string; reason: string; speed: string; fee: string };
type ScanCategory = "auto" | "vehicle" | "electronics" | "fashion" | "home" | "collectible" | "tools" | "general";
type ImageQualityAssessment = {
  score: number;
  pass: boolean;
  tips: string[];
  detail: string;
};

const SCAN_CATEGORY_OPTIONS: {
  value: ScanCategory;
  label: string;
  icon: string;
  description: string;
}[] = [
  { value: "auto", label: "Auto", icon: "AUTO", description: "Auto-detect best category" },
  { value: "vehicle", label: "Cars", icon: "CARS", description: "Cars and vehicle checks" },
  { value: "electronics", label: "Technology", icon: "TECH", description: "Phones, laptops, consoles" },
  { value: "collectible", label: "Collectibles", icon: "ANTI", description: "Coins, books, rocks, vintage items" },
  { value: "fashion", label: "Fashion", icon: "WEAR", description: "Clothes, shoes, accessories" },
  { value: "home", label: "Home", icon: "HOME", description: "Furniture and home goods" },
  { value: "tools", label: "Tools", icon: "TOOL", description: "Power and hand tools" },
  { value: "general", label: "General", icon: "GEN", description: "Everything else" },
];
type AnalyzeResponse = {
  labels: string[];
  pricing: {
    ok: boolean;
    finalStatus?: "usable" | "needs_details";
    query: string;
    category?: string;
    region?: string;
    currency?: string;
    currencySymbol?: string;
    autoDetectedQuery?: string | null;
    detectionConfidence?: "low" | "medium" | "high" | null;
    low?: number | null;
    median?: number | null;
    high?: number | null;
    recommendedRetail?: {
      low: number;
      median: number;
      high: number;
      retentionRate: number;
      label: string;
      note: string;
    } | null;
    error?: string;
    comps?: PricingComp[];
    recommendations?: SellRecommendation[];
    confidence?: { score: number; label: "low" | "medium" | "high" };
    conditionTier?: "mint" | "good" | "fair" | "broken";
    valuationAdjustments?: string[];
    sellTime?: { speed: string; minDays: number; maxDays: number; text: string };
    profit?: {
      buyPrice: number;
      expectedProfit?: number | null;
      conservativeProfit?: number | null;
      optimisticProfit?: number | null;
      expectedMarginPct?: number | null;
    };
    listingAssistant?: {
      suggestedTitle: string;
      suggestedStartPrice: string;
      suggestedRange: string;
      bulletPoints: string[];
      listingTip: string;
    };
    liveDataAt?: string;
    vehicleAdjustments?: { factor: number; reasons: string[] };
    stage?: "fast" | "refine";
    refineRecommended?: boolean;
    confidenceReasons?: string[];
    accuracyNextSteps?: string[];
    qualityGate?: {
      status: "pass" | "caution" | "hold";
      score: number;
      metrics?: {
        compCount: number;
        sourceCount: number;
        avgMatchScore: number;
        spreadPct: number;
      };
      reasons?: string[];
    };
    accuracy?: {
      ready: boolean;
      score: number;
      blockers?: string[];
    };
    vehicleStatus?: UkVehicleStatus | null;
    vehicleStatusError?: string | null;
    vehicleRegDetected?: string | null;
    soldCompsBenchmark?: {
      count: number;
      low: number;
      median: number;
      high: number;
      currency?: string;
      source?: string;
      make?: string | null;
      model?: string | null;
    } | null;
    itemProfile?: {
      categoryRouted?: string;
      tech?: { storage?: string | null; ramGb?: number | null };
      tool?: { brand?: string | null; voltage?: string | null };
      card?: { grading?: string | null; set?: string | null };
    } | null;
  };
};

type LiveAssistantResponse = {
  ok?: boolean;
  reply?: string;
  shouldScan?: boolean;
  categoryHint?: ScanCategory | null;
  source?: string;
  warning?: string;
  error?: string;
};

type MonetizationPolicyResponse = {
  ok?: boolean;
  policy?: {
    mode?: "open" | "token" | "locked" | string;
    header?: string;
    tokenConfigured?: boolean;
    enforceVehicleData?: boolean;
  };
  usage?: {
    byType?: {
      blocked_vehicle_pricing?: number;
      blocked_fullcar_check?: number;
      allowed_vehicle_pricing?: number;
      allowed_fullcar_check?: number;
    };
  };
};

type UkVehicleStatus = {
  ok: boolean;
  registrationNumber?: string;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  fuelType?: string | null;
  yearOfManufacture?: number | null;
  mileage?: {
    valueMiles?: number | null;
    source?: string | null;
  } | null;
  motHistory?: {
    testDate?: string | null;
    result?: string | null;
    expiryDate?: string | null;
    odometerMiles?: number | null;
  }[] | null;
  motStatus?: string | null;
  motExpiryDate?: string | null;
  taxStatus?: string | null;
  taxDueDate?: string | null;
  source?: string;
  checkedAt?: string;
  crashHistory?: {
    hasWriteOffRecord?: boolean;
    writeOffCount?: number;
    latestWriteOffStatus?: string | null;
    source?: string;
  };
  historyCategories?: {
    hasFinanceRecord?: boolean;
    financeCount?: number;
    hasStolenRecord?: boolean;
    stolenCount?: number;
    hasWriteOffRecord?: boolean;
    writeOffCount?: number;
  };
  error?: string;
};

type ScanScreenProps = {
  vehicleOnly?: boolean;
  itemsOnly?: boolean;
  fullCarOnly?: boolean;
  presetCategory?: ScanCategory;
  presetTitle?: string;
  presetSubtitle?: string;
  forceAdvanced?: boolean;
};

export function ScanScreen({
  vehicleOnly = false,
  itemsOnly = false,
  fullCarOnly = false,
  presetCategory,
  presetTitle,
  presetSubtitle,
  forceAdvanced = false,
}: ScanScreenProps) {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const isCompact = height < 760 || width < 360;
  const isLandscape = width > height;
  const tinyMvp = true;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isRefining, setIsRefining] = useState(false);

  const [itemQuery, setItemQuery] = useState("");
  const [quickMode, setQuickMode] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [conditionTier, setConditionTier] = useState<"mint" | "good" | "fair" | "broken">("good");
  const [buyPrice, setBuyPrice] = useState("");
  const [condition, setCondition] = useState<"new" | "used">("used");
  const [conditionNotes, setConditionNotes] = useState("");
  const [techSpecs, setTechSpecs] = useState("");
  const [techBatteryHealth, setTechBatteryHealth] = useState("");
  const [antiquesEra, setAntiquesEra] = useState("");
  const [antiquesMaker, setAntiquesMaker] = useState("");
  const [collectibleSet, setCollectibleSet] = useState("");
  const [collectibleGrade, setCollectibleGrade] = useState("");
  const [toolBrand, setToolBrand] = useState("");
  const [toolModel, setToolModel] = useState("");
  const [toolVoltage, setToolVoltage] = useState("");
  const [fashionBrand, setFashionBrand] = useState("");
  const [fashionSize, setFashionSize] = useState("");
  const [fashionMaterial, setFashionMaterial] = useState("");
  const [homeBrand, setHomeBrand] = useState("");
  const [homeDimensions, setHomeDimensions] = useState("");
  const [homeAgeStyle, setHomeAgeStyle] = useState("");
  const [category, setCategory] = useState<ScanCategory>(
    vehicleOnly ? "vehicle" : presetCategory || "auto"
  );
  const [region, setRegion] = useState<"us" | "uk" | "eu" | "ca" | "au">(vehicleOnly ? "uk" : "uk");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMileage, setVehicleMileage] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleFuelType, setVehicleFuelType] = useState("");
  const [vehicleTransmission, setVehicleTransmission] = useState("");
  const [vehicleTrim, setVehicleTrim] = useState("");
  const [vehicleServiceHistory, setVehicleServiceHistory] = useState("");
  const [vehicleOwners, setVehicleOwners] = useState("");
  const [vehicleAccidentFlags, setVehicleAccidentFlags] = useState("");
  const [vehicleMods, setVehicleMods] = useState("");
  const [vehicleKnownFaults, setVehicleKnownFaults] = useState("");
  const [showVehicleTools, setShowVehicleTools] = useState(false);
  const [vehicleStatus, setVehicleStatus] = useState<UkVehicleStatus | null>(null);
  const [vehicleStatusError, setVehicleStatusError] = useState<string>("");
  const [vehicleStatusLoading, setVehicleStatusLoading] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState(API_BASE);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [backendPulseAt, setBackendPulseAt] = useState<number | null>(null);
  const [monetizationPolicy, setMonetizationPolicy] = useState<MonetizationPolicyResponse | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showQuickDetailsModal, setShowQuickDetailsModal] = useState(false);
  const [showAllComps, setShowAllComps] = useState(false);
  const [lastImageQuality, setLastImageQuality] = useState<ImageQualityAssessment | null>(null);
  const [showDeveloperTools, setShowDeveloperTools] = useState(API_BASE_NEEDS_REMOTE_CONFIG);
  const [scanError, setScanError] = useState("");
  const [scanAccess, setScanAccess] = useState<ScanAccess | null>(null);
  const [recentQueryChips, setRecentQueryChips] = useState<string[]>([]);
  const [latestSavedScan, setLatestSavedScan] = useState<ScanHistoryEntry | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [showResultDetails, setShowResultDetails] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [handsFreeVoice, setHandsFreeVoice] = useState(false);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [liveMode, setLiveMode] = useState(false);
  const [autoLiveScan, setAutoLiveScan] = useState(true);
  const [barcodeSnapshot, setBarcodeSnapshot] = useState<{ value: string; type: string; at: number } | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const lastBarcodeScanRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const liveScanBusyRef = useRef(false);
  const userCancelledScanRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const handsFreeVoiceRef = useRef(false);
  const voiceTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startVoiceCaptureRef = useRef<(() => Promise<void>) | null>(null);
  const lastLiveNarrationRef = useRef<{ query: string; median: number; at: number }>({
    query: "",
    median: 0,
    at: 0,
  });
  const analyzeControllersRef = useRef<Set<AbortController>>(new Set());
  const analyzeRunIdRef = useRef(0);
  const analyzeInFlightRef = useRef(false);
  const lastAnalyzeRef = useRef<{ signature: string; at: number }>({ signature: "", at: 0 });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    let mounted = true;
    void loadScanAccess().then((access) => {
      if (mounted) setScanAccess(access);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const clearCurrentScanView = useCallback(() => {
    userCancelledScanRef.current = true;
    analyzeRunIdRef.current += 1;
    analyzeInFlightRef.current = false;
    for (const controller of analyzeControllersRef.current) {
      controller.abort();
    }
    analyzeControllersRef.current.clear();

    setLoading(false);
    setIsRefining(false);
    setStatus("");
    setScanError("");
    setImageUri(null);
    setData(null);
    setVehicleStatus(null);
    setVehicleStatusError("");
    setBarcodeSnapshot(null);
    setLastImageQuality(null);
    setShowResultDetails(false);
    setShowAllComps(false);
    lastAnalyzeRef.current = { signature: "", at: 0 };
  }, []);

  const effectiveApiBase = useMemo(() => {
    const raw = String(apiBaseInput || "").trim();
    if (!raw) return API_BASE;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withScheme.replace(/\/+$/, "");
  }, [apiBaseInput]);
  const fallbackApiBases = useMemo(() => {
    const out = new Set<string>();
    out.add(effectiveApiBase);
    out.add(API_BASE);
    const hostUri =
      (Constants as any)?.expoConfig?.hostUri ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost ||
      "";
    const host = String(hostUri).split(":")[0].trim();
    if (host) out.add(`http://${host}:5050`);
    return Array.from(out).filter(Boolean);
  }, [effectiveApiBase]);
  useEffect(() => {
    if (!API_BASE_NEEDS_REMOTE_CONFIG) return;
    setConnectionStatus("error");
    setConnectionMessage("Production build needs a live HTTPS backend URL. Open developer tools and set backend URL.");
  }, []);
  const shouldShowVehicleDetails = vehicleOnly || category === "vehicle";
  const isCategoryLocked = vehicleOnly || Boolean(presetCategory);
  const shouldShowTechFields = category === "electronics";
  const shouldShowAntiqueFields = category === "collectible";
  const shouldShowToolFields = category === "tools";
  const shouldShowFashionFields = category === "fashion";
  const shouldShowHomeFields = category === "home";
  const composedConditionNotes = useMemo(() => {
    const out: string[] = [];
    const base = conditionNotes.trim();
    if (base) out.push(base);
    if (barcodeSnapshot?.value) out.push(`Barcode: ${barcodeSnapshot.value}`);
    if (shouldShowTechFields && techSpecs.trim()) out.push(`Tech specs: ${techSpecs.trim()}`);
    if (shouldShowTechFields && techBatteryHealth.trim()) out.push(`Battery health: ${techBatteryHealth.trim()}`);
    if (shouldShowAntiqueFields && antiquesEra.trim()) out.push(`Era: ${antiquesEra.trim()}`);
    if (shouldShowAntiqueFields && antiquesMaker.trim()) out.push(`Maker/provenance: ${antiquesMaker.trim()}`);
    if (shouldShowAntiqueFields && collectibleSet.trim()) out.push(`Set/series: ${collectibleSet.trim()}`);
    if (shouldShowAntiqueFields && collectibleGrade.trim()) out.push(`Grade: ${collectibleGrade.trim()}`);
    if (shouldShowToolFields && toolBrand.trim()) out.push(`Tool brand: ${toolBrand.trim()}`);
    if (shouldShowToolFields && toolModel.trim()) out.push(`Tool model: ${toolModel.trim()}`);
    if (shouldShowToolFields && toolVoltage.trim()) out.push(`Tool voltage/power: ${toolVoltage.trim()}`);
    if (shouldShowFashionFields && fashionBrand.trim()) out.push(`Fashion brand: ${fashionBrand.trim()}`);
    if (shouldShowFashionFields && fashionSize.trim()) out.push(`Fashion size: ${fashionSize.trim()}`);
    if (shouldShowFashionFields && fashionMaterial.trim()) out.push(`Material: ${fashionMaterial.trim()}`);
    if (shouldShowHomeFields && homeBrand.trim()) out.push(`Home brand: ${homeBrand.trim()}`);
    if (shouldShowHomeFields && homeDimensions.trim()) out.push(`Dimensions: ${homeDimensions.trim()}`);
    if (shouldShowHomeFields && homeAgeStyle.trim()) out.push(`Age/style: ${homeAgeStyle.trim()}`);
    return out.join(" | ");
  }, [
    conditionNotes,
    barcodeSnapshot,
    shouldShowTechFields,
    techSpecs,
    techBatteryHealth,
    shouldShowAntiqueFields,
    antiquesEra,
    antiquesMaker,
    collectibleSet,
    collectibleGrade,
    shouldShowToolFields,
    toolBrand,
    toolModel,
    toolVoltage,
    shouldShowFashionFields,
    fashionBrand,
    fashionSize,
    fashionMaterial,
    shouldShowHomeFields,
    homeBrand,
    homeDimensions,
    homeAgeStyle,
  ]);

  const onLiveBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const value = String(result?.data || "").trim();
      if (!value) return;
      const type = String(result?.type || "unknown");
      const normalized = value.replace(/\s+/g, "");
      const key = `${type}:${normalized}`;
      const now = Date.now();
      if (lastBarcodeScanRef.current.key === key && now - lastBarcodeScanRef.current.at < 7000) return;
      lastBarcodeScanRef.current = { key, at: now };
      setBarcodeSnapshot({ value: normalized, type, at: now });

      const suggestedQuery = barcodeQueryFromScan(normalized, type);
      if (!itemQuery.trim()) {
        setItemQuery(suggestedQuery);
      }
      if (!vehicleOnly && category === "auto" && /^isbn/i.test(suggestedQuery)) {
        setCategory("collectible");
      }
    },
    [itemQuery, vehicleOnly, category]
  );

  const applyScanPreset = useCallback((preset: "cars" | "antiques" | "technology" | "general") => {
    clearCurrentScanView();
    setShowAdvanced(false);
    setQuickMode(true);
    if (preset === "cars") {
      setCategory("vehicle");
      setRegion("uk");
      setShowVehicleTools(false);
      return;
    }
    setShowVehicleTools(false);
    if (preset === "antiques") {
      setCategory("collectible");
      setCondition("used");
      return;
    }
    if (preset === "technology") {
      setCategory("electronics");
      setCondition("used");
      return;
    }
    setCategory("auto");
  }, [clearCurrentScanView]);

  useEffect(() => {
    if (!vehicleOnly) return;
    setCategory("vehicle");
    setRegion("uk");
    setShowAdvanced(false);
    setShowVehicleTools(false);
  }, [vehicleOnly]);

  useEffect(() => {
    if (!vehicleOnly && presetCategory) {
      setCategory(presetCategory);
      if (presetCategory === "vehicle") setRegion("uk");
    }
  }, [vehicleOnly, presetCategory]);

  useEffect(() => {
    if (!vehicleOnly && category !== "vehicle") {
      setShowVehicleTools(false);
    }
  }, [category, vehicleOnly]);

  useEffect(() => {
    if (forceAdvanced && !tinyMvp) setShowAdvanced(true);
  }, [forceAdvanced, tinyMvp]);

  useEffect(() => {
    let mounted = true;
    loadHistory()
      .then((rows) => {
        if (!mounted) return;
        const chips = Array.from(
          new Set(
            rows
              .map((x) => String(x.query || "").trim())
              .filter(Boolean)
              .slice(0, 20)
          )
        ).slice(0, 6);
        setRecentQueryChips(chips);
        setLatestSavedScan(rows[0] || null);
      })
      .catch(() => {});
    loadWatchlist().then((rows) => {
      if (!mounted) return;
      setWatchlist(rows);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    handsFreeVoiceRef.current = handsFreeVoice;
  }, [handsFreeVoice]);

  useEffect(() => {
    return () => {
      if (voiceTurnTimerRef.current) {
        clearTimeout(voiceTurnTimerRef.current);
        voiceTurnTimerRef.current = null;
      }
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
      Speech.stop();
    };
  }, [recording]);

  useEffect(() => {
    const activeControllers = analyzeControllersRef.current;
    return () => {
      for (const controller of activeControllers) {
        controller.abort();
      }
      activeControllers.clear();
      analyzeInFlightRef.current = false;
    };
  }, []);

  const tryFetchWithApiFallback = useCallback(
    async (path: string, init?: RequestInit, opts?: { attemptTimeoutMs?: number }) => {
      let lastError: any = null;
      const attemptTimeoutMs = Math.max(1200, Number(opts?.attemptTimeoutMs || URL_PROBE_TIMEOUT_MS));
      for (const base of fallbackApiBases) {
        const externalSignal = init?.signal;
        const controller = new AbortController();
        let timedOut = false;
        const forwardAbort = () => controller.abort();
        if (externalSignal) {
          if (externalSignal.aborted) throw new Error("Request aborted.");
          externalSignal.addEventListener("abort", forwardAbort, { once: true });
        }
        const timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, attemptTimeoutMs);
        try {
          const headers = new Headers((init?.headers || {}) as HeadersInit);
          if (PAID_ACCESS_TOKEN && PAID_ACCESS_HEADER && !headers.get(PAID_ACCESS_HEADER)) {
            headers.set(PAID_ACCESS_HEADER, PAID_ACCESS_TOKEN);
          }
          const resp = await fetch(`${base}${path}`, {
            ...(init || {}),
            headers,
            signal: controller.signal,
          });
          if (base !== effectiveApiBase) {
            setApiBaseInput(base);
          }
          return { base, resp };
        } catch (err) {
          if (externalSignal?.aborted) throw err;
          if (timedOut) {
            lastError = new Error(`Backend timeout on ${base}${path} after ${attemptTimeoutMs}ms`);
            continue;
          }
          lastError = err;
        } finally {
          clearTimeout(timeoutId);
          if (externalSignal) {
            externalSignal.removeEventListener("abort", forwardAbort);
          }
        }
      }
      throw lastError || new Error("No backend URL reachable.");
    },
    [fallbackApiBases, effectiveApiBase]
  );

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!data?.pricing) return;
    const isVehicleResult = String(data?.pricing?.category || category || "").toLowerCase() === "vehicle";
    setShowResultDetails(tinyMvp ? false : isVehicleResult);
    resultAnim.setValue(0);
    Animated.timing(resultAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [data?.pricing, data?.pricing?.query, data?.pricing?.median, data?.pricing?.category, category, resultAnim, tinyMvp]);

  const runAnalyzeRequest = useCallback(
    async (
      uri: string,
      stage: "fast" | "refine",
      timeoutMs: number,
      opts?: { forceVehicleReg?: string | null }
    ): Promise<AnalyzeResponse> => {
      const controller = new AbortController();
      analyzeControllersRef.current.add(controller);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const typedReg =
          findUkRegInText(itemQuery) ||
          findUkRegInText(composedConditionNotes) ||
          findUkRegInText(`${vehicleMake} ${vehicleModel}`);
        const derivedVehicleReg = normalizeUkReg(String(opts?.forceVehicleReg || vehicleReg.trim() || typedReg || ""));
        const form = new FormData();
        if (Platform.OS === "web") {
          const webImageResp = await fetch(uri);
          const webImageBlob = await webImageResp.blob();
          (form as any).append("image", webImageBlob, "photo.jpg");
        } else {
          form.append("image", {
            uri,
            name: "photo.jpg",
            type: "image/jpeg",
          } as any);
        }
        form.append("itemQuery", itemQuery.trim());
        form.append("condition", condition);
        form.append("conditionTier", conditionTier);
        form.append("conditionNotes", composedConditionNotes);
        form.append("quickMode", quickMode ? "1" : "0");
        form.append("liveMode", liveMode ? "1" : "0");
        form.append("buyPrice", buyPrice.trim());
        form.append("category", category);
        form.append("region", region);
        form.append("vehicleYear", vehicleYear.trim());
        form.append("vehicleMileage", vehicleMileage.trim());
        form.append("vehicleReg", derivedVehicleReg);
        form.append("vehicleMake", vehicleMake.trim());
        form.append("vehicleModel", vehicleModel.trim());
        form.append("vehicleFuelType", vehicleFuelType.trim());
        form.append("vehicleTransmission", vehicleTransmission.trim());
        form.append("vehicleTrim", vehicleTrim.trim());
        form.append("vehicleServiceHistory", vehicleServiceHistory.trim());
        form.append("vehicleOwners", vehicleOwners.trim());
        form.append("vehicleAccidentFlags", vehicleAccidentFlags.trim());
        form.append("vehicleMods", vehicleMods.trim());
        form.append("vehicleKnownFaults", vehicleKnownFaults.trim());
        form.append("fullCarCheck", fullCarOnly ? "1" : "0");
        form.append("itemOnly", itemsOnly ? "1" : "0");
        form.append("stage", stage);

        const { base, resp: r } = await tryFetchWithApiFallback(
          "/analyze",
          {
            method: "POST",
            body: form,
            signal: controller.signal,
          },
          {
            attemptTimeoutMs:
              stage === "fast" ? ANALYZE_ATTEMPT_TIMEOUT_FAST_MS : ANALYZE_ATTEMPT_TIMEOUT_REFINE_MS,
          }
        );
        const text = await r.text();
        const trimmed = text.trim();
        if (trimmed.startsWith("<")) {
          throw new Error(`Backend returned HTML (wrong URL/port or backend not running).\n\nURL: ${base}/analyze`);
        }
        let json: AnalyzeResponse | null = null;
        try {
          json = JSON.parse(text) as AnalyzeResponse;
        } catch {
          json = null;
        }
        if (!json) {
          const shortBody = trimmed ? trimmed.slice(0, 220) : "Empty response body.";
          throw new Error(`Backend response could not be parsed.\n\nURL: ${base}/analyze\n\n${shortBody}`);
        }
        if (!r.ok) {
          throw new Error(json?.pricing?.error || (json as any)?.error || `Server error (${r.status})`);
        }
        return json;
      } catch (err: any) {
        if (err?.name === "AbortError") {
          const label = stage === "fast" ? "initial scan" : "refine scan";
          throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s during ${label}.`);
        }
        throw err;
      } finally {
        analyzeControllersRef.current.delete(controller);
        clearTimeout(timeoutId);
      }
    },
    [itemQuery, condition, conditionTier, composedConditionNotes, quickMode, liveMode, buyPrice, category, region, vehicleYear, vehicleMileage, vehicleReg, vehicleMake, vehicleModel, vehicleFuelType, vehicleTransmission, vehicleTrim, vehicleServiceHistory, vehicleOwners, vehicleAccidentFlags, vehicleMods, vehicleKnownFaults, fullCarOnly, itemsOnly, tryFetchWithApiFallback]
  );

  const analyze = useCallback(
    async (uri: string, opts?: { silent?: boolean }) => {
      userCancelledScanRef.current = false;
      const signature = `${uri}|${itemQuery.trim().toLowerCase()}|${category}|${region}`;
      const now = Date.now();
      if (lastAnalyzeRef.current.signature === signature && now - lastAnalyzeRef.current.at < 2500) {
        return;
      }
      if (analyzeInFlightRef.current && opts?.silent) return;
      lastAnalyzeRef.current = { signature, at: now };
      analyzeInFlightRef.current = true;
      const runId = ++analyzeRunIdRef.current;
      const isCurrentRun = () => analyzeRunIdRef.current === runId;
      if (isCurrentRun()) {
        setData(null);
        setVehicleStatus(null);
        setVehicleStatusError("");
        setScanError("");
      }
      if (!quickMode && !itemQuery.trim()) {
        analyzeInFlightRef.current = false;
        if (!opts?.silent) {
          Alert.alert("Add item details", "Enter brand + model + item name for manual pricing mode.");
        }
        return;
      }
      const likelyVehicleProviderFlow =
        region === "uk" &&
        (
          vehicleOnly ||
          category === "vehicle" ||
          fullCarOnly ||
          Boolean(vehicleReg.trim())
        );
      if (!likelyVehicleProviderFlow) {
        const access = await loadScanAccess();
        if (!isCurrentRun()) return;
        setScanAccess(access);
        if (!access.canScan) {
          analyzeInFlightRef.current = false;
          if (opts?.silent) {
            setLiveMode(false);
          } else {
            Alert.alert(
              "Starter scans used",
              `You have used your ${LaunchPricing.freeStarterScans} free scans. Monthly access unlocks unlimited Anything Mode scans.`,
              [
                { text: "Not now", style: "cancel" },
                { text: "View monthly access", onPress: () => pushPublicRoute(router, "/paywall") },
              ]
            );
          }
          return;
        }
      }
      const scanPaidAccessMode = String(monetizationPolicy?.policy?.mode || "unknown").toLowerCase();
      const scanPaidGuardEnforced = Boolean(monetizationPolicy?.policy?.enforceVehicleData);
      const scanPaidGuardLockedForVehicle =
        scanPaidGuardEnforced &&
        scanPaidAccessMode !== "open" &&
        !Boolean(PAID_ACCESS_TOKEN);
      if (scanPaidGuardLockedForVehicle && likelyVehicleProviderFlow) {
        analyzeInFlightRef.current = false;
        setVehicleStatusError(
          "Vehicle pricing is currently protected until paid access is unlocked for this app session."
        );
        if (!opts?.silent) {
          Alert.alert(
            "Paid vehicle checks locked",
            "This build does not have paid-check access yet. Item scans still work, or launch with paid mode enabled."
          );
        }
        return;
      }

      try {
        const quality = await assessImageQuality(uri);
        setLastImageQuality(quality);
        if (!opts?.silent && !quality.pass) {
          Alert.alert(
            "Photo quality too low",
            `Quality score: ${quality.score}/100\n${quality.detail}\n\n${quality.tips.join("\n")}`
          );
          return;
        }
        // Start from clean UI state for each scan attempt.
        const needsUkVehicleCheck =
          !itemsOnly &&
          region === "uk" &&
          (vehicleOnly || category === "vehicle");
        if (needsUkVehicleCheck && !vehicleReg.trim() && !opts?.silent) {
          setVehicleStatusError("Auto-detecting UK plate from photo. If missed, enter reg manually in advanced details.");
        }
        setLoading(true);
        setStatus("Quick pricing...");
        let fast: AnalyzeResponse;
        try {
          fast = await runAnalyzeRequest(uri, "fast", FAST_TIMEOUT_MS);
        } catch (fastErr: any) {
          const fastMsg = String(fastErr?.message || fastErr).toLowerCase();
          const shouldRetryOnce =
            !liveMode &&
            (fastMsg.includes("timed out") || fastMsg.includes("backend timeout") || fastMsg.includes("network request failed"));
          if (!shouldRetryOnce || userCancelledScanRef.current) {
            throw fastErr;
          }
          setStatus("Retrying scan...");
          fast = await runAnalyzeRequest(uri, "fast", Math.min(FAST_TIMEOUT_MS + 10000, 38000));
        }
        if (!isCurrentRun()) return;
        setData(fast);
        if (fast?.pricing?.vehicleStatus?.ok) {
          setVehicleStatus(fast.pricing.vehicleStatus);
          setVehicleStatusError("");
        } else if (fast?.pricing?.vehicleStatusError) {
          setVehicleStatusError(fast.pricing.vehicleStatusError);
        }
        setLoading(false);

        const fastConf = Number(fast?.pricing?.confidence?.score || 0);
        const fastGate = String(fast?.pricing?.qualityGate?.status || "");
        const vehicleFlow =
          !itemsOnly &&
          (vehicleOnly || category === "vehicle" || fast?.pricing?.category === "vehicle");
        const fastUsable = String(fast?.pricing?.finalStatus || "") === "usable";
        const vehicleNeedsRefine = !fastUsable || fastConf < 72 || fastGate !== "pass";
        const shouldRefine =
          !liveMode &&
          (vehicleFlow ? vehicleNeedsRefine : (fast.pricing?.refineRecommended ?? true)) &&
          !(fastConf >= 75 && fastGate === "pass" && !vehicleFlow);
        let finalData = fast;
        if (shouldRefine) {
          setIsRefining(true);
          setStatus("Refining price...");
          try {
            const refined = await runAnalyzeRequest(uri, "refine", REFINE_TIMEOUT_MS);
            if (!isCurrentRun()) return;
            setData(refined);
            if (refined?.pricing?.vehicleStatus?.ok) {
              setVehicleStatus(refined.pricing.vehicleStatus);
              setVehicleStatusError("");
            } else if (refined?.pricing?.vehicleStatusError) {
              setVehicleStatusError(refined.pricing.vehicleStatusError);
            }
            finalData = refined;
          } catch {
            // Keep fast result when refine fails/timeouts.
          } finally {
            setIsRefining(false);
          }
        }

        if (!isCurrentRun()) return;
        const finalStatus = finalData?.pricing?.vehicleStatus;
        const fallbackPlateCandidates = [
          vehicleReg.trim(),
          finalData?.pricing?.vehicleRegDetected || "",
          finalStatus?.registrationNumber || "",
          findUkRegInText(finalData?.pricing?.query),
          findUkRegInText(finalData?.pricing?.autoDetectedQuery),
        ]
          .map((x) => normalizeUkReg(x))
          .filter((x) => looksLikeUkReg(x));
        const fallbackPlate = Array.from(new Set(fallbackPlateCandidates))[0];
        const shouldFetchUkStatusFallback =
          !itemsOnly &&
          region === "uk" &&
          (vehicleOnly || category === "vehicle" || finalData?.pricing?.category === "vehicle") &&
          !finalStatus?.ok &&
          Boolean(fallbackPlate);
        if (shouldFetchUkStatusFallback && fallbackPlate && isCurrentRun()) {
          try {
            const { resp: r } = await tryFetchWithApiFallback(
              "/uk-vehicle-status",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ registrationNumber: fallbackPlate }),
              },
              { attemptTimeoutMs: STATUS_ATTEMPT_TIMEOUT_MS }
            );
            const j = (await r.json()) as UkVehicleStatus;
            if (!isCurrentRun()) return;
            if (r.ok && j?.ok) {
              setVehicleStatus(j);
              setVehicleStatusError("");
              if (!vehicleReg.trim()) {
                setVehicleReg(fallbackPlate);
              }
              const finalGate = String(finalData?.pricing?.qualityGate?.status || "");
              const finalStatusLabel = String(finalData?.pricing?.finalStatus || "");
              const finalMedian = Number(finalData?.pricing?.median || NaN);
              const shouldRepriceAfterPlateVerify =
                (category === "vehicle" || finalData?.pricing?.category === "vehicle") &&
                (
                  finalStatusLabel !== "usable" ||
                  finalGate === "hold" ||
                  !Number.isFinite(finalMedian)
                );
              if (shouldRepriceAfterPlateVerify) {
                try {
                  setStatus("Plate verified. Repricing...");
                  const verified = await runAnalyzeRequest(uri, "refine", REFINE_TIMEOUT_MS, {
                    forceVehicleReg: fallbackPlate,
                  });
                  if (!isCurrentRun()) return;
                  setData(verified);
                  if (verified?.pricing?.vehicleStatus?.ok) {
                    setVehicleStatus(verified.pricing.vehicleStatus);
                    setVehicleStatusError("");
                  } else if (verified?.pricing?.vehicleStatusError) {
                    setVehicleStatusError(verified.pricing.vehicleStatusError);
                  }
                  finalData = verified;
                } catch {
                  // Keep previous result if repricing attempt fails.
                }
              }
            }
          } catch {
            // Keep original scan result when fallback vehicle lookup fails.
          }
        }

        if (!isCurrentRun()) return;
        setStatus("Done");
        setBackendReachable(true);
        setBackendPulseAt(Date.now());
        const isItemModeVehicleHandoff =
          itemsOnly &&
          String(finalData.pricing?.category || "").toLowerCase() === "vehicle" &&
          String(finalData.pricing?.finalStatus || "").toLowerCase() === "needs_details";
        if (isItemModeVehicleHandoff) return;
        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await addHistoryEntry({
          id: newId,
          createdAt: new Date().toISOString(),
          query: finalData.pricing?.query || itemQuery,
          detectedQuery: finalData.pricing?.autoDetectedQuery || null,
          category: finalData.pricing?.category,
          confidenceLabel: finalData.pricing?.confidence?.label,
          confidenceScore: finalData.pricing?.confidence?.score,
          currency: finalData.pricing?.currency,
          currencySymbol: finalData.pricing?.currencySymbol,
          low: finalData.pricing?.low,
          median: finalData.pricing?.median,
          high: finalData.pricing?.high,
          recommendedRetail: finalData.pricing?.recommendedRetail || undefined,
          comps: finalData.pricing?.comps || [],
          recommendations: finalData.pricing?.recommendations || [],
          sellTime: finalData.pricing?.sellTime,
          profit: finalData.pricing?.profit || undefined,
          listingAssistant: finalData.pricing?.listingAssistant || undefined,
          confidenceReasons: finalData.pricing?.confidenceReasons || [],
          qualityGate: finalData.pricing?.qualityGate,
        });
        if (!likelyVehicleProviderFlow && !opts?.silent) {
          const nextAccess = await recordCompletedStarterScan();
          if (isCurrentRun()) setScanAccess(nextAccess);
        }
        setLatestSavedScan({
          id: newId,
          createdAt: new Date().toISOString(),
          query: finalData.pricing?.query || itemQuery,
          category: finalData.pricing?.category,
          currency: finalData.pricing?.currency,
          currencySymbol: finalData.pricing?.currencySymbol,
          median: finalData.pricing?.median,
        });
        setRecentQueryChips((prev) =>
          Array.from(new Set([finalData.pricing?.query || itemQuery, ...prev].filter(Boolean))).slice(0, 6)
        );
        trackAnalyticsEvent("scan_success", {
          category: finalData.pricing?.category || category,
          confidence: finalData.pricing?.confidence?.label || "unknown",
          finalStatus: finalData.pricing?.finalStatus || "unknown",
        }).catch(() => {});
        const band = String(finalData.pricing?.confidence?.label || "").toLowerCase();
        if (band === "high") trackAnalyticsEvent("scan_confidence_high").catch(() => {});
        if (band === "medium") trackAnalyticsEvent("scan_confidence_medium").catch(() => {});
        if (band === "low") trackAnalyticsEvent("scan_confidence_low").catch(() => {});
      } catch (e: any) {
        if (!isCurrentRun()) return;
        if (userCancelledScanRef.current) return;
        const message = String(e?.message || e);
        const isNetworkOrTimeout = /network request failed|timeout|timed out|backend timeout|no backend url reachable|wrong url\/port|backend not running/i.test(
          message
        );
        if (isNetworkOrTimeout) {
          setBackendReachable(false);
          setBackendPulseAt(Date.now());
          setData(null);
          setScanError("Connection to valuation server failed. No verified price was returned.");
          if (!opts?.silent) {
            Alert.alert(
              "Connection issue",
              "We could not return a verified valuation. Please retry on stable Wi-Fi."
            );
          }
          return;
        }
        setScanError(String(e?.message || e));
        trackAnalyticsEvent("scan_failure", {
          message: message.slice(0, 120),
          category,
        }).catch(() => {});
        if (!opts?.silent) {
          const detail = classifyScanError(message, effectiveApiBase);
          Alert.alert(
            detail.title,
            `${detail.summary}\n\n${detail.steps.map((step) => `• ${step}`).join("\n")}`
          );
        }
      } finally {
        if (!isCurrentRun()) return;
        setIsRefining(false);
        setLoading(false);
        setStatus("");
        analyzeInFlightRef.current = false;
      }
    },
    [
      itemQuery,
      quickMode,
      liveMode,
      runAnalyzeRequest,
      region,
      category,
      vehicleReg,
      vehicleOnly,
      itemsOnly,
      fullCarOnly,
      monetizationPolicy,
      effectiveApiBase,
      tryFetchWithApiFallback,
      router,
    ]
  );

  const pickPhoto = async () => {
    setScanError("");
    setStatus("Requesting photo permissions...");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setStatus("");
      Alert.alert("Permission needed", "Please allow photo access.");
      return;
    }

    setStatus("Opening photo library...");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: category === "vehicle" ? 0.65 : 0.6,
    });

    if (res.canceled) {
      setStatus("");
      return;
    }
    const uri = res.assets[0].uri;
    setImageUri(uri);
    setData(null);
    await analyze(uri);
  };

  const takePhoto = async () => {
    setScanError("");
    setStatus("Requesting camera permissions...");
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setStatus("");
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }

    setStatus("Opening camera...");
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: category === "vehicle" ? 0.65 : 0.6,
      cameraType: ImagePicker.CameraType.back,
    });

    if (res.canceled) {
      setStatus("");
      return;
    }
    const uri = res.assets[0].uri;
    setImageUri(uri);
    setData(null);
    await analyze(uri);
  };

  const enterLiveMode = async () => {
    if (!vehicleOnly) {
      const access = await loadScanAccess();
      setScanAccess(access);
      if (!access.unlimited) {
        Alert.alert(
          "Live Mode is a monthly feature",
          "Your free scans work with Scan Now. Monthly access unlocks continuous Live Mode scanning.",
          [
            { text: "Use Scan Now", style: "cancel" },
            { text: "View monthly access", onPress: () => pushPublicRoute(router, "/paywall") },
          ]
        );
        return;
      }
    }
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert("Permission needed", "Please allow camera access for live scan.");
        return;
      }
    }
    setQuickMode(true);
    setLiveMode(true);
    setData(null);
  };

  const speakVoice = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      const text = String(message || "").trim();
      if (!text) {
        resolve();
        return;
      }
      Speech.stop();
      Speech.speak(text, {
        language: "en-GB",
        rate: 0.98,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }, []);

  const runLiveAssistant = useCallback(
    async (transcript: string): Promise<LiveAssistantResponse> => {
      const payload = {
        transcript,
        liveMode,
        category,
        region,
        pricing: data?.pricing
          ? {
              query: data.pricing.query,
              autoDetectedQuery: data.pricing.autoDetectedQuery,
              finalStatus: data.pricing.finalStatus,
              median: data.pricing.median,
              low: data.pricing.low,
              high: data.pricing.high,
              currency: data.pricing.currency,
              currencySymbol: data.pricing.currencySymbol,
              confidence: data.pricing.confidence,
              qualityGate: data.pricing.qualityGate,
            }
          : null,
      };
      try {
        const { resp: r } = await tryFetchWithApiFallback(
          "/voice/live-assistant",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          { attemptTimeoutMs: VOICE_ATTEMPT_TIMEOUT_MS }
        );
        const j = (await r.json()) as LiveAssistantResponse;
        if (!r.ok || !j?.ok) {
          return {
            ok: false,
            reply: "",
            shouldScan: false,
            categoryHint: null,
            error: j?.error || `assistant failed (${r.status})`,
          };
        }
        return j;
      } catch (err: any) {
        return {
          ok: false,
          reply: "",
          shouldScan: false,
          categoryHint: null,
          error: String(err?.message || err),
        };
      }
    },
    [liveMode, category, region, data?.pricing, tryFetchWithApiFallback]
  );

  const queueNextHandsFreeTurn = useCallback(() => {
    if (!handsFreeVoiceRef.current) return;
    if (voiceTurnTimerRef.current) clearTimeout(voiceTurnTimerRef.current);
    voiceTurnTimerRef.current = setTimeout(() => {
      const fn = startVoiceCaptureRef.current;
      if (fn) fn().catch(() => {});
    }, VOICE_TURN_GAP_MS);
  }, []);

  const stopVoiceCapture = useCallback(
    async (explicitRecording?: Audio.Recording | null) => {
      const active = explicitRecording || recordingRef.current;
      if (!active) return;
      if (voiceTurnTimerRef.current) {
        clearTimeout(voiceTurnTimerRef.current);
        voiceTurnTimerRef.current = null;
      }
      setRecording(null);
      recordingRef.current = null;
      setVoiceLoading(true);
      setVoiceStatus("Transcribing...");
      try {
        await active.stopAndUnloadAsync();
        const uri = active.getURI();
        if (!uri) throw new Error("No recorded audio found.");
        const form = new FormData();
        form.append("audio", {
          uri,
          name: "speech.m4a",
          type: "audio/m4a",
        } as any);
        const { resp: r } = await tryFetchWithApiFallback(
          "/voice/transcribe",
          {
            method: "POST",
            body: form,
          },
          { attemptTimeoutMs: VOICE_ATTEMPT_TIMEOUT_MS }
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || `Transcription failed (${r.status}).`);
        }
        const text = String(j?.text || "").trim();
        if (!text) {
          setVoiceStatus("No speech detected.");
          if (!handsFreeVoiceRef.current) {
            Alert.alert("No speech detected", "Try again and speak a bit closer to the microphone.");
          }
          return;
        }
        setItemQuery(text);
        setShowAdvanced(true);
        setVoiceStatus("Thinking...");
        const assistant = await runLiveAssistant(text);
        const hinted = assistant?.categoryHint;
        if (hinted && hinted !== category && !isCategoryLocked) {
          setCategory(hinted);
        }
        if (liveMode && assistant?.shouldScan && cameraRef.current && !liveScanBusyRef.current) {
          try {
            liveScanBusyRef.current = true;
            const shot = await cameraRef.current.takePictureAsync({
              quality: category === "vehicle" ? 0.6 : 0.35,
              skipProcessing: true,
            });
            if (shot?.uri) {
              setImageUri(shot.uri);
              await analyze(shot.uri, { silent: true });
            }
          } finally {
            liveScanBusyRef.current = false;
          }
        }
        const reply = String(assistant?.reply || `Got it. ${text}`).trim();
        await speakVoice(reply);
        setVoiceStatus("Ready.");
      } catch (e: any) {
        if (!handsFreeVoiceRef.current) {
          Alert.alert("Voice input failed", e?.message || String(e));
        }
        setVoiceStatus("Voice input failed.");
      } finally {
        setVoiceLoading(false);
        if (handsFreeVoiceRef.current) {
          queueNextHandsFreeTurn();
        } else {
          setTimeout(() => setVoiceStatus(""), 1500);
        }
      }
    },
    [tryFetchWithApiFallback, runLiveAssistant, category, isCategoryLocked, liveMode, analyze, speakVoice, queueNextHandsFreeTurn]
  );

  const startVoiceCapture = useCallback(async () => {
    if (voiceLoading || recordingRef.current) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow microphone access to use voice input.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(rec);
      setVoiceStatus(handsFreeVoiceRef.current ? "Listening (hands-free)..." : "Listening...");
      if (handsFreeVoiceRef.current) {
        if (voiceTurnTimerRef.current) clearTimeout(voiceTurnTimerRef.current);
        voiceTurnTimerRef.current = setTimeout(() => {
          stopVoiceCapture(rec).catch(() => {});
        }, VOICE_TURN_CAPTURE_MS);
      }
    } catch (e: any) {
      Alert.alert("Voice start failed", e?.message || String(e));
      setVoiceStatus("");
    }
  }, [voiceLoading, stopVoiceCapture]);

  useEffect(() => {
    startVoiceCaptureRef.current = startVoiceCapture;
  }, [startVoiceCapture]);

  const runLiveScan = useCallback(
    async (silent = true) => {
      if (!cameraRef.current || liveScanBusyRef.current) return;
      liveScanBusyRef.current = true;
      try {
        const shot = await cameraRef.current.takePictureAsync({
          quality: category === "vehicle" ? 0.6 : 0.35,
          skipProcessing: true,
        });
        if (shot?.uri) {
          setImageUri(shot.uri);
          await analyze(shot.uri, { silent });
        }
      } catch {
        if (!silent) {
          Alert.alert("Live scan failed", "Could not capture frame from camera.");
        }
      } finally {
        liveScanBusyRef.current = false;
      }
    },
    [analyze, category]
  );

  useEffect(() => {
    if (!liveMode || !autoLiveScan) return;
    const id = setInterval(() => {
      runLiveScan(true);
    }, LIVE_SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [liveMode, autoLiveScan, runLiveScan]);

  useEffect(() => {
    if (!liveMode || !handsFreeVoice) return;
    const pricing = data?.pricing;
    if (!pricing?.ok) return;
    const query = String(pricing.query || pricing.autoDetectedQuery || "").trim();
    const median = Number(pricing.median || 0);
    if (!query || !Number.isFinite(median) || median <= 0) return;
    if (recordingRef.current || voiceLoading) return;
    const now = Date.now();
    const prev = lastLiveNarrationRef.current;
    const sameQuery = prev.query.toLowerCase() === query.toLowerCase();
    const pctDelta = sameQuery && prev.median > 0 ? Math.abs(median - prev.median) / prev.median : 1;
    const cooldownOk = now - prev.at >= LIVE_NARRATION_COOLDOWN_MS;
    if (!cooldownOk || (sameQuery && pctDelta < 0.12)) return;
    lastLiveNarrationRef.current = { query, median, at: now };
    const symbol = currencySymbol(pricing.currency, pricing.currencySymbol);
    const statusLabel = pricing.finalStatus === "usable"
      ? "estimate ready"
      : "estimate needs more detail";
    const line = `${query}. Approximate value ${formatMoney(median, symbol, 0)}. ${statusLabel}.`;
    speakVoice(line).catch(() => {});
  }, [liveMode, handsFreeVoice, data?.pricing, voiceLoading, speakVoice]);

  const activeCurrency = data?.pricing?.currency || "USD";
  const activeCurrencySymbol = currencySymbol(activeCurrency, data?.pricing?.currencySymbol);

  const priceLine = useMemo(() => {
    if (!data?.pricing) return null;
    if (!data.pricing.ok) return `No price: ${data.pricing.error || "unknown error"}`;

    const low = data.pricing.low;
    const med = data.pricing.median;
    const high = data.pricing.high;
    if (
      data.pricing.finalStatus !== "usable" &&
      (!Number.isFinite(Number(low)) || !Number.isFinite(Number(med)) || !Number.isFinite(Number(high)))
    ) {
      return "No reliable price yet. Add details and run refine scan.";
    }
    return `Estimate (${data.pricing.query}): ${formatMoney(low, activeCurrencySymbol, 2)}  |  ${formatMoney(med, activeCurrencySymbol, 2)}  |  ${formatMoney(high, activeCurrencySymbol, 2)}`;
  }, [data, activeCurrencySymbol]);
  const valuationContextTitle = "Estimated resale value";
  const valuationContextText = useMemo(() => {
    if (shouldShowVehicleDetails) {
      return "This is what the vehicle is likely worth in the current used market, not the original new price.";
    }
    return "This is what the item is likely worth in today's resale market, not a new shop replacement price.";
  }, [shouldShowVehicleDetails]);

  const liveValueText = useMemo(() => {
    const med = data?.pricing?.median;
    if (typeof med !== "number") return "Scanning...";
    return formatMoney(med, activeCurrencySymbol, 0);
  }, [data, activeCurrencySymbol]);

  const liveDetectedText = useMemo(() => {
    return data?.pricing?.autoDetectedQuery || "Detecting item...";
  }, [data]);
  const scanGuideText = useMemo(() => {
    if (lastImageQuality && lastImageQuality.score < 55) {
      return `Improve capture: ${lastImageQuality.tips[0] || "Hold steady and move closer."}`;
    }
    if (category === "vehicle") {
      return "Center the plate, avoid glare, and keep the full registration visible.";
    }
    return "Center one item, fill most of frame, and avoid shadows.";
  }, [lastImageQuality, category]);

  const confidenceLabel = data?.pricing?.confidence?.label || "pending";
  const confidenceScore = data?.pricing?.confidence?.score;
  const qualityStatus = data?.pricing?.qualityGate?.status || "pass";
  const accuracyScore = Number(data?.pricing?.accuracy?.score || 0);
  const accuracyBlockers = data?.pricing?.accuracy?.blockers || [];
  const isHoldResult = qualityStatus === "hold";
  const isCautionResult = qualityStatus === "caution";
  const lowTrustEstimate = useMemo(() => {
    const reasons = data?.pricing?.confidenceReasons || [];
    return reasons.some((r) => String(r).toLowerCase().includes("low-trust estimate shown"));
  }, [data]);
  const motOk = parseMotOk(vehicleStatus?.motStatus);
  const taxOk = parseTaxOk(vehicleStatus?.taxStatus);
  const hasWriteOffRecord = Boolean(
    vehicleStatus?.historyCategories?.hasWriteOffRecord ?? vehicleStatus?.crashHistory?.hasWriteOffRecord
  );
  const hasFinanceRecord = Boolean(vehicleStatus?.historyCategories?.hasFinanceRecord);
  const hasStolenRecord = Boolean(vehicleStatus?.historyCategories?.hasStolenRecord);
  const vehicleMileageMiles = useMemo(() => {
    const direct = Number((vehicleStatus as any)?.mileage?.valueMiles || 0);
    if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
    const motHistory = Array.isArray((vehicleStatus as any)?.motHistory) ? (vehicleStatus as any).motHistory : [];
    for (const row of motHistory) {
      const miles = Number(row?.odometerMiles || 0);
      if (Number.isFinite(miles) && miles > 0) return Math.round(miles);
    }
    const manual = Number(vehicleMileage || 0);
    return Number.isFinite(manual) && manual > 0 ? Math.round(manual) : null;
  }, [vehicleStatus, vehicleMileage]);
  const effectiveCategory: ScanCategory = (data?.pricing?.category as ScanCategory) || category;
  const vehicleRiskFlags = useMemo(() => {
    if (effectiveCategory !== "vehicle") return 0;
    let flags = 0;
    if (motOk === false) flags += 1;
    if (taxOk === false) flags += 1;
    if (hasStolenRecord) flags += 2;
    if (hasFinanceRecord) flags += 1;
    if (hasWriteOffRecord) flags += 2;
    return flags;
  }, [effectiveCategory, motOk, taxOk, hasStolenRecord, hasFinanceRecord, hasWriteOffRecord]);
  const vehicleTrustPenalty = useMemo(() => {
    if (effectiveCategory !== "vehicle") return 0;
    if (qualityStatus === "hold") return 25;
    if (qualityStatus === "caution") return 10;
    return 0;
  }, [effectiveCategory, qualityStatus]);
  const vehicleReportScore = useMemo(() => {
    if (effectiveCategory !== "vehicle") return null;
    const base = 100 - vehicleRiskFlags * 14 - vehicleTrustPenalty;
    return Math.max(5, Math.min(100, Math.round(base)));
  }, [effectiveCategory, vehicleRiskFlags, vehicleTrustPenalty]);
  const vehicleReportTone = useMemo(() => {
    if (effectiveCategory !== "vehicle") return "clear";
    if ((vehicleReportScore || 0) >= 78) return "clear";
    if ((vehicleReportScore || 0) >= 55) return "review";
    return "risk";
  }, [effectiveCategory, vehicleReportScore]);
  const vehicleHasReportData = effectiveCategory === "vehicle" && Boolean(vehicleStatus?.ok || data?.pricing?.ok);
  const holdPrompts = useMemo(() => {
    if (!isHoldResult) return [];
    const categoryHint = data?.pricing?.category || category;
    if (categoryHint === "vehicle") {
      return ["Add make + model", "Add vehicle year", "Add mileage", "Add condition notes"];
    }
    if (categoryHint === "electronics") {
      return ["Add brand + model", "Add storage/spec (e.g. 128GB)", "Add condition notes"];
    }
    if (categoryHint === "fashion") {
      return ["Add brand", "Add material/carat (if jewelry)", "Add condition notes"];
    }
    if (categoryHint === "tools") {
      return ["Add brand", "Add voltage/model", "Add condition notes"];
    }
    return ["Add brand + model", "Add key condition details", "Run refine scan"];
  }, [isHoldResult, data, category]);
  const trustLevel = useMemo(() => {
    const gate = data?.pricing?.qualityGate?.status;
    if (gate === "hold") return "Needs More Data";
    if (gate === "caution") return "Caution";
    return "Safe";
  }, [data]);
  const nextStep = useMemo(() => {
    if (isHoldResult) {
      return {
        title: "Next step: add detail and rescan",
        text: holdPrompts[0] || "Add brand/model detail, then scan again.",
      };
    }
    if (isCautionResult) {
      return {
        title: "Next step: optional refine pass",
        text: "Good estimate returned. Add one more detail for a tighter range.",
      };
    }
    if (data?.pricing?.finalStatus === "usable") {
      return {
        title: "Next step: save and move on",
        text: "Price is ready. Save this result to Collection or scan the next item.",
      };
    }
    return {
      title: "Next step",
      text: "Scan again with clearer framing if you want a tighter valuation.",
    };
  }, [isHoldResult, isCautionResult, holdPrompts, data?.pricing?.finalStatus]);
  const resultReadinessLabel = useMemo(() => {
    if (isHoldResult) return "Needs more detail before you rely on it";
    if (isCautionResult) return "Useful estimate, but refine if price matters";
    if (data?.pricing?.finalStatus === "usable") return "Ready to use";
    return "Scan again for a stronger result";
  }, [isHoldResult, isCautionResult, data?.pricing?.finalStatus]);
  const trustSummaryLines = useMemo(() => {
    if (data?.pricing?.qualityGate?.reasons?.length) return data.pricing.qualityGate.reasons.slice(0, 3);
    if (data?.pricing?.confidenceReasons?.length) return data.pricing.confidenceReasons.slice(0, 3);
    if (holdPrompts.length) return holdPrompts.slice(0, 3);
    return ["No major risk flags from the current scan."];
  }, [data?.pricing?.qualityGate?.reasons, data?.pricing?.confidenceReasons, holdPrompts]);
  const comparisonDelta = useMemo(() => {
    const current = Number(data?.pricing?.median || 0);
    const previous = Number(latestSavedScan?.median || 0);
    if (!current || !previous) return null;
    const pct = ((current - previous) / Math.max(1, previous)) * 100;
    return {
      pct,
      direction: pct >= 0 ? "up" : "down",
      previousQuery: latestSavedScan?.query || "Previous scan",
      previousValue: previous,
    };
  }, [data?.pricing?.median, latestSavedScan]);
  const watchlistMatch = useMemo(() => {
    const q = String(data?.pricing?.query || data?.pricing?.autoDetectedQuery || itemQuery || "").trim().toLowerCase();
    const c = String((data?.pricing?.category || category || "general")).toLowerCase();
    if (!q) return null;
    return watchlist.find((x) => x.query.toLowerCase() === q && x.category.toLowerCase() === c) || null;
  }, [watchlist, data?.pricing?.query, data?.pricing?.autoDetectedQuery, data?.pricing?.category, itemQuery, category]);
  const rankedChannels = useMemo(() => {
    const recs = data?.pricing?.recommendations || [];
    return recs
      .map((r) => ({ ...r, score: recommendationScore(r) }))
      .sort((a, b) => b.score - a.score);
  }, [data?.pricing?.recommendations]);
  const saveToWatchlist = useCallback(async (withAlert: boolean) => {
    if (!data?.pricing) return;
    const query = String(data.pricing.query || data.pricing.autoDetectedQuery || itemQuery || "").trim();
    const categoryName = String(data.pricing.category || category || "general").toLowerCase();
    if (!query) {
      Alert.alert("No item name", "Run a scan first so we can save it.");
      return;
    }
    const med = typeof data.pricing.median === "number" ? data.pricing.median : null;
    const alertPrice = withAlert && med ? Math.max(1, Math.round(med * 0.9)) : watchlistMatch?.alertPrice ?? null;
    const id = watchlistMatch?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextEntry: WatchlistEntry = {
      id,
      createdAt: watchlistMatch?.createdAt || new Date().toISOString(),
      query,
      category: categoryName,
      currency: data.pricing.currency,
      currencySymbol: data.pricing.currencySymbol,
      lastMedian: med,
      alertEnabled: withAlert ? true : watchlistMatch?.alertEnabled || false,
      alertPrice,
      alertTriggered: Boolean(alertPrice && med && med <= alertPrice),
    };
    await upsertWatchlistEntry(nextEntry);
    const rows = await loadWatchlist();
    setWatchlist(rows);
    Alert.alert(
      withAlert ? "Alert set" : "Saved to watchlist",
      withAlert && alertPrice
        ? `${query}\nAlert target: ${formatMoney(alertPrice, activeCurrencySymbol, 0)}`
        : `${query} added to watchlist.`
    );
  }, [data, itemQuery, category, watchlistMatch, activeCurrencySymbol]);
  const activeModeLabel = vehicleOnly ? "Car Mode" : "Anything Mode";
  const paidAccessMode = String(monetizationPolicy?.policy?.mode || "unknown").toLowerCase();
  const paidGuardEnforced = Boolean(monetizationPolicy?.policy?.enforceVehicleData);
  const paidTokenConfiguredOnServer = Boolean(monetizationPolicy?.policy?.tokenConfigured);
  const paidTokenPresentInApp = Boolean(PAID_ACCESS_TOKEN);
  const paidGuardLockedForVehicle =
    paidGuardEnforced &&
    paidAccessMode !== "open" &&
    !paidTokenPresentInApp;
  const monetizationUsage = monetizationPolicy?.usage?.byType || {};
  const blockedPaidAttemptsToday = Number(
    monetizationUsage.blocked_vehicle_pricing || 0
  ) + Number(monetizationUsage.blocked_fullcar_check || 0);
  const backendHealthLabel = useMemo(() => {
    if (backendReachable === null) return "Preparing scan service...";
    return backendReachable ? "Ready to scan" : "Connection issue detected";
  }, [backendReachable]);
  const backendHealthHint = useMemo(() => {
    if (backendReachable === null) return "Running startup checks.";
    if (backendReachable) return "Take one clear photo and we'll handle the rest.";
    return "If scans fail, check Wi-Fi and try again.";
  }, [backendReachable]);
  const backendHealthTone = useMemo<"good" | "warn" | "neutral">(() => {
    if (backendReachable === null) return "neutral";
    return backendReachable ? "good" : "warn";
  }, [backendReachable]);
  const slowScanHint = useMemo(() => {
    if (!loading || elapsedSec < 12) return "";
    if (isRefining) return "Refining price with extra checks. This can take a bit longer.";
    if (shouldShowVehicleDetails) return "Fetching plate and vehicle data. Keep the app open while checks complete.";
    return "Fetching live market comps. Keep the app open while valuation completes.";
  }, [loading, elapsedSec, isRefining, shouldShowVehicleDetails]);
  const scanErrorDetail = useMemo(() => {
    if (!scanError) return null;
    return classifyScanError(scanError, effectiveApiBase);
  }, [scanError, effectiveApiBase]);
  const loadingGuide = useMemo(() => {
    if (!loading && !isRefining) return "";
    if (elapsedSec < 4) return "Uploading image...";
    if (elapsedSec < 9) return "Identifying item and matching category...";
    if (shouldShowVehicleDetails) return "Running vehicle checks and valuation...";
    return "Matching live market data and sold benchmarks...";
  }, [loading, isRefining, elapsedSec, shouldShowVehicleDetails]);
  const cancelCurrentScan = useCallback(() => {
    userCancelledScanRef.current = true;
    analyzeRunIdRef.current += 1;
    for (const controller of analyzeControllersRef.current) {
      controller.abort();
    }
    analyzeControllersRef.current.clear();
    analyzeInFlightRef.current = false;
    setLoading(false);
    setIsRefining(false);
    setStatus("");
    setScanError("");
  }, []);

  const improveResult = useCallback(() => {
    const detected = data?.pricing?.autoDetectedQuery?.trim();
    if (itemsOnly && data?.pricing?.category === "vehicle") {
      pushPublicRoute(router, "/car-mode");
      return;
    }
    if (detected && !itemQuery.trim()) {
      setItemQuery(detected);
    }
    const detectedCategory = data?.pricing?.category;
    if (
      detectedCategory &&
      ["vehicle", "electronics", "fashion", "home", "collectible", "tools", "general"].includes(detectedCategory)
    ) {
      setCategory(detectedCategory as "vehicle" | "electronics" | "fashion" | "home" | "collectible" | "tools" | "general");
    }
    setQuickMode(false);
    setShowAdvanced(true);
    setShowQuickDetailsModal(true);
  }, [data, itemQuery, itemsOnly, router]);

  const categoryInsight = useMemo(() => {
    if (!data?.pricing?.ok) return null;
    if (effectiveCategory === "vehicle") {
      return {
        title: "Vehicle Checklist",
        lines: [
          `Registration: ${vehicleStatus?.registrationNumber || data?.pricing?.vehicleRegDetected || "Add manually"}`,
          `MOT: ${vehicleStatus?.motStatus || "Not checked"}`,
          `Tax: ${vehicleStatus?.taxStatus || "Not checked"}`,
          hasWriteOffRecord ? "History: write-off flag found" : "History: no write-off flag found",
        ],
      };
    }
    if (effectiveCategory === "electronics") {
      return {
        title: "Technology Checklist",
        lines: [
          "Add storage/spec in title (e.g. 256GB, i7, OLED).",
          "State battery health and screen condition clearly.",
          `Confidence: ${confidenceLabel}${confidenceScore ? ` (${confidenceScore}/100)` : ""}.`,
          `Expected resale median: ${formatMoney(data.pricing.median, activeCurrencySymbol, 2)}.`,
        ],
      };
    }
    if (effectiveCategory === "collectible") {
      return {
        title: "Collectibles Checklist",
        lines: [
          "Include maker/era/material for better comps.",
          "Photograph marks, stamps, and signatures close-up.",
          `Comparable items found: ${data.pricing.comps?.length || 0}.`,
          "List flaws and provenance to improve buyer trust.",
        ],
      };
    }
    if (effectiveCategory === "fashion") {
      return {
        title: "Fashion Checklist",
        lines: [
          "Add brand, size, and material in title.",
          "Photograph labels, tags, and any wear points.",
          `Suggested list range: ${formatMoney(data.pricing.low, activeCurrencySymbol)} - ${formatMoney(data.pricing.high, activeCurrencySymbol)}.`,
        ],
      };
    }
    if (effectiveCategory === "tools") {
      return {
        title: "Tools Checklist",
        lines: [
          "Include brand, model, and voltage/amp details.",
          "Show battery, charger, and accessories in photos.",
          "Mention runtime/power and any motor faults.",
          `Confidence: ${confidenceLabel}${confidenceScore ? ` (${confidenceScore}/100)` : ""}.`,
        ],
      };
    }
    if (effectiveCategory === "home") {
      return {
        title: "Home Goods Checklist",
        lines: [
          "Add dimensions, material, and brand to improve comp matching.",
          "Photograph all sides plus any defects close-up.",
          "Mention age/style and assembly status.",
          `Suggested list range: ${formatMoney(data.pricing.low, activeCurrencySymbol)} - ${formatMoney(data.pricing.high, activeCurrencySymbol)}.`,
        ],
      };
    }
    return {
      title: "Resale Checklist",
      lines: [
        "Use clear title with brand + model + variant.",
        "Show defects up front to reduce returns.",
        `Confidence: ${confidenceLabel}${confidenceScore ? ` (${confidenceScore}/100)` : ""}.`,
      ],
    };
  }, [
    data,
    effectiveCategory,
    vehicleStatus,
    hasWriteOffRecord,
    confidenceLabel,
    confidenceScore,
    activeCurrencySymbol,
  ]);
  const vehicleTimeline = useMemo(() => {
    if (!vehicleHasReportData) return [] as { title: string; detail: string; tone: "good" | "warn" | "bad" | "neutral" }[];
    const events: { title: string; detail: string; tone: "good" | "warn" | "bad" | "neutral" }[] = [];
    events.push({
      title: "Scan completed",
      detail: data?.pricing?.liveDataAt ? new Date(data.pricing.liveDataAt).toLocaleString() : "Current session",
      tone: "neutral",
    });
    events.push({
      title: "MOT status",
      detail: `${vehicleStatus?.motStatus || "Unknown"}${vehicleStatus?.motExpiryDate ? ` • expires ${formatUkDate(vehicleStatus.motExpiryDate)}` : ""}`,
      tone: motOk === false ? "bad" : motOk === true ? "good" : "warn",
    });
    events.push({
      title: "Tax status",
      detail: `${vehicleStatus?.taxStatus || "Unknown"}${vehicleStatus?.taxDueDate ? ` • due ${formatUkDate(vehicleStatus.taxDueDate)}` : ""}`,
      tone: taxOk === false ? "bad" : taxOk === true ? "good" : "warn",
    });
    if (hasStolenRecord) {
      events.push({
        title: "Theft record",
        detail: vehicleStatus?.historyCategories?.stolenCount ? `${vehicleStatus.historyCategories.stolenCount} record(s) found` : "Record found",
        tone: "bad",
      });
    } else {
      events.push({ title: "Theft record", detail: "No stolen record found", tone: "good" });
    }
    if (hasFinanceRecord) {
      events.push({
        title: "Finance record",
        detail: vehicleStatus?.historyCategories?.financeCount ? `${vehicleStatus.historyCategories.financeCount} record(s) found` : "Record found",
        tone: "warn",
      });
    } else {
      events.push({ title: "Finance record", detail: "No finance record found", tone: "good" });
    }
    if (hasWriteOffRecord) {
      events.push({
        title: "Write-off",
        detail: vehicleStatus?.crashHistory?.latestWriteOffStatus || "Write-off record found",
        tone: "bad",
      });
    } else {
      events.push({ title: "Write-off", detail: "No write-off record found", tone: "good" });
    }
    return events;
  }, [
    vehicleHasReportData,
    data?.pricing?.liveDataAt,
    vehicleStatus,
    motOk,
    taxOk,
    hasStolenRecord,
    hasFinanceRecord,
    hasWriteOffRecord,
  ]);
  const shareReport = useCallback(async () => {
    if (!data?.pricing) return;
    const target = vehicleHasReportData ? "Vehicle Report" : "Valuation Report";
    const name = data.pricing.query || data.pricing.autoDetectedQuery || itemQuery || "Scanned item";
    const text = [
      `Value Vision ${target}`,
      `${name}`,
      `Estimate: ${formatMoney(data.pricing.low, activeCurrencySymbol, 0)} - ${formatMoney(data.pricing.high, activeCurrencySymbol, 0)} (median ${formatMoney(data.pricing.median, activeCurrencySymbol, 0)})`,
      `Confidence: ${data.pricing.confidence ? `${data.pricing.confidence.label} ${data.pricing.confidence.score}/100` : "pending"}`,
      vehicleStatus?.registrationNumber ? `Registration: ${vehicleStatus.registrationNumber}` : "",
      vehicleStatus?.motStatus ? `MOT: ${vehicleStatus.motStatus}` : "",
      vehicleStatus?.taxStatus ? `Tax: ${vehicleStatus.taxStatus}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await Share.share({ message: text });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message || String(e));
    }
  }, [data, vehicleHasReportData, itemQuery, activeCurrencySymbol, vehicleStatus]);

  const checkUkVehicleStatus = useCallback(async () => {
    const reg = vehicleReg.trim();
    if (!reg) {
      Alert.alert("Add registration", "Enter the UK registration first.");
      return;
    }
    try {
      setVehicleStatusLoading(true);
      const { resp: r } = await tryFetchWithApiFallback("/uk-vehicle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNumber: reg, fullCarCheck: fullCarOnly ? "1" : "0" }),
      });
      const j = (await r.json()) as UkVehicleStatus;
      if (!r.ok || !j.ok) {
        throw new Error(j?.error || "Could not fetch MOT/Tax status.");
      }
      setVehicleStatus(j);
    } catch (e: any) {
      Alert.alert("MOT/Tax check failed", e?.message || String(e));
    } finally {
      setVehicleStatusLoading(false);
    }
  }, [vehicleReg, fullCarOnly, tryFetchWithApiFallback]);
  const itemQueryPlaceholder = useMemo(() => {
    if (category === "electronics") return "Apple iPhone 13 128GB";
    if (category === "collectible") return "Pokemon Charizard card PSA 9";
    if (category === "tools") return "Milwaukee M18 impact driver";
    if (category === "fashion") return "Nike Air Max 97 size 9";
    if (category === "home") return "IKEA oak dining table 160cm";
    if (category === "vehicle") return "BMW 320d M Sport 2018";
    return "Brand + model + key detail";
  }, [category]);
  const itemQueryHelp = useMemo(() => {
    if (category === "electronics") return "Brand + model + storage/spec (best for accurate value)";
    if (category === "collectible") return "Name + set + grade/provenance if known";
    if (category === "tools") return "Brand + model + voltage/power details";
    if (category === "fashion") return "Brand + model + size/material";
    if (category === "home") return "Item + brand + dimensions/material";
    if (category === "vehicle") return "Make + model + year or registration";
    return "Brand + model + key detail (best for accurate value)";
  }, [category]);

  const testBackendConnection = useCallback(async () => {
    try {
      setConnectionStatus("checking");
      setConnectionMessage("Checking backend...");
      const { base, resp: r } = await tryFetchWithApiFallback("/health");
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      try {
        const { resp: policyResp } = await tryFetchWithApiFallback(
          "/monetization-policy",
          undefined,
          { attemptTimeoutMs: 2200 }
        );
        const policyJson = (await policyResp.json()) as MonetizationPolicyResponse;
        if (policyResp.ok && policyJson?.ok) {
          setMonetizationPolicy(policyJson);
        }
      } catch {
        // Keep connection green even if policy endpoint is temporarily unavailable.
      }
      setConnectionStatus("ok");
      setConnectionMessage(`Connected to ${base} on port ${j.port}`);
      setBackendReachable(true);
      setBackendPulseAt(Date.now());
      Alert.alert("Backend OK", `Connected on port ${j.port}`);
    } catch (e: any) {
      setConnectionStatus("error");
      setConnectionMessage(e?.message || "Connection failed.");
      setBackendReachable(false);
      setBackendPulseAt(Date.now());
      Alert.alert("Backend not reachable", `Could not reach any backend URL.\nTried:\n${fallbackApiBases.join("\n")}`);
    }
  }, [tryFetchWithApiFallback, fallbackApiBases]);

  const refreshBackendPulse = useCallback(async () => {
    try {
      const { resp: r } = await tryFetchWithApiFallback("/health", undefined, { attemptTimeoutMs: 2200 });
      const j = await r.json();
      const ok = Boolean(r.ok && j?.ok);
      setBackendReachable(ok);
      setBackendPulseAt(Date.now());
      if (ok) {
        try {
          const { resp: policyResp } = await tryFetchWithApiFallback(
            "/monetization-policy",
            undefined,
            { attemptTimeoutMs: 2200 }
          );
          const policyJson = (await policyResp.json()) as MonetizationPolicyResponse;
          if (policyResp.ok && policyJson?.ok) {
            setMonetizationPolicy(policyJson);
          }
        } catch {
          // Keep last policy snapshot.
        }
      }
    } catch {
      setBackendReachable(false);
      setBackendPulseAt(Date.now());
    }
  }, [tryFetchWithApiFallback]);

  useEffect(() => {
    refreshBackendPulse();
    const id = setInterval(() => {
      refreshBackendPulse();
    }, 30000);
    return () => clearInterval(id);
  }, [refreshBackendPulse]);

  return (
    <ScrollView contentContainerStyle={[styles.screen, isCompact && styles.screenCompact]}>
      <View style={[styles.heroCard, isCompact && styles.heroCardCompact]}>
        <Text style={styles.kicker}>VALUEVISION</Text>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>
          {presetTitle || (vehicleOnly ? "Car Mode" : "Know What It Is. Know What It's Worth.")}
        </Text>
        <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
          {presetSubtitle || (vehicleOnly
            ? "Car-only mode for registration, MOT/tax checks, and a cleaner valuation flow."
            : "Scan anything anywhere with one picture for a true valuation range.")}
        </Text>
        <View
          style={[
            styles.connectionBanner,
            backendHealthTone === "good"
              ? styles.connectionBannerGood
              : backendHealthTone === "warn"
                ? styles.connectionBannerWarn
                : styles.connectionBannerNeutral,
          ]}>
          <Text style={styles.connectionBannerTitle}>{backendHealthLabel}</Text>
          <Text style={styles.connectionBannerText}>
            {backendHealthHint}
            {!tinyMvp && backendPulseAt ? ` • ${new Date(backendPulseAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
        </View>
        {tinyMvp ? (
          <View style={[styles.heroMetaRow, isCompact && styles.heroMetaRowCompact]}>
            <View style={styles.heroMetaChip}>
              <Text style={styles.heroMetaLabel}>Mode</Text>
              <Text style={styles.heroMetaValue}>{activeModeLabel}</Text>
            </View>
            <View style={styles.heroMetaChip}>
              <Text style={styles.heroMetaLabel}>Status</Text>
              <Text style={styles.heroMetaValue}>
                {loading ? "Scanning..." : backendReachable === false ? "Connection issue" : "Ready"}
              </Text>
            </View>
            {!vehicleOnly ? (
              <View style={styles.heroMetaChip}>
                <Text style={styles.heroMetaLabel}>Access</Text>
                <Text style={styles.heroMetaValue}>
                  {scanAccess?.unlimited
                    ? "Unlimited"
                    : scanAccess
                      ? `${scanAccess.remaining} free left`
                      : "Checking..."}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.heroMetaRow, isCompact && styles.heroMetaRowCompact]}>
            <View style={styles.heroMetaChip}>
              <Text style={styles.heroMetaLabel}>Mode</Text>
              <Text style={styles.heroMetaValue}>{quickMode ? "Quick" : "Manual"}</Text>
            </View>
            <View style={styles.heroMetaChip}>
              <Text style={styles.heroMetaLabel}>Confidence</Text>
              <Text style={styles.heroMetaValue}>
                {confidenceScore ? `${confidenceLabel} (${confidenceScore}/100)` : confidenceLabel}
              </Text>
            </View>
            <View style={styles.heroMetaChip}>
              <Text style={styles.heroMetaLabel}>Region</Text>
              <Text style={styles.heroMetaValue}>{region.toUpperCase()}</Text>
            </View>
          </View>
        )}
        {tinyMvp && vehicleOnly ? (
          <View style={styles.fullCarPriceCard}>
            <Text style={styles.fullCarPriceTitle}>Paid Access Pricing</Text>
            <Text style={styles.fullCarPriceText}>
              {`${LaunchPricing.freeStarterScans} free starter item scans included before monthly access.`}
            </Text>
            <Text style={styles.fullCarPriceText}>
              {`Monthly access: ${formatGbp(LaunchPricing.monthlySubscriptionGbp)}/month`}
            </Text>
            <Text style={styles.fullCarPriceText}>{`Single check: ${formatGbp(LaunchPricing.fullCarCheckSingleGbp)}`}</Text>
            <Text style={styles.fullCarPriceText}>
              {`Bundle (${LaunchPricing.fullCarCheckBundleChecks} checks): ${formatGbp(LaunchPricing.fullCarCheckBundleGbp)}`}
            </Text>
            <Text style={styles.fullCarPriceMeta}>
              {`Car valuation only: ${formatGbp(LaunchPricing.carValuationFromGbp)}`}
            </Text>
            <Text style={styles.fullCarPriceMeta}>
              {`Paid mode: ${paidAccessMode} • Guard: ${paidGuardEnforced ? "on" : "off"}`}
            </Text>
            <Text style={styles.fullCarPriceMeta}>
              {`Server token configured: ${paidTokenConfiguredOnServer ? "yes" : "no"}`}
            </Text>
            {paidGuardLockedForVehicle ? (
              <Text style={styles.fullCarPriceMetaWarn}>
                Full paid vehicle checks stay protected until Apple purchase access is unlocked.
              </Text>
            ) : null}
            {blockedPaidAttemptsToday > 0 ? (
              <Text style={styles.fullCarPriceMeta}>
                {`Blocked paid attempts today: ${blockedPaidAttemptsToday}`}
              </Text>
            ) : null}
            <Pressable style={styles.fullCarPriceCta} onPress={() => pushPublicRoute(router, "/paywall")}>
              <Text style={styles.fullCarPriceCtaText}>Open Billing Status</Text>
            </Pressable>
          </View>
        ) : null}
        {vehicleOnly || tinyMvp || !FeatureFlags.carChecksAvailable ? null : (
          <Pressable
            style={styles.carsModeCta}
            onPress={() => {
              clearCurrentScanView();
              pushPublicRoute(router, "/scan?mode=cars");
            }}>
            <Text style={styles.carsModeCtaText}>Need full vehicle checks? Open Car Mode</Text>
          </Pressable>
        )}
        {tinyMvp ? (
          <View style={[styles.row, styles.laneRow]}>
            <Pressable
              style={styles.miniLaneBtn}
              onPress={() => pushPublicRoute(router, "/history")}>
              <Text style={styles.miniLaneBtnText}>My Collection</Text>
              <Text style={styles.miniLaneBtnSubText}>Saved scans</Text>
            </Pressable>
            <Pressable
              style={[styles.miniLaneBtn, scanAccess?.unlimited && styles.miniLaneBtnActive]}
              onPress={() => pushPublicRoute(router, "/paywall")}>
              <Text style={[styles.miniLaneBtnText, scanAccess?.unlimited && styles.miniLaneBtnTextActive]}>
                Monthly Access
              </Text>
              <Text style={[styles.miniLaneBtnSubText, scanAccess?.unlimited && styles.miniLaneBtnTextActive]}>
                {scanAccess?.unlimited
                  ? "Unlimited active"
                  : `${scanAccess?.remaining ?? LaunchPricing.freeStarterScans} free scans left`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {tinyMvp ? null : (
        <View style={[styles.modeRow, isCompact && styles.modeRowCompact]}>
          <Pressable
            style={[styles.modeChip, quickMode && styles.modeChipActive]}
            onPress={() => setQuickMode(true)}>
            <Text style={[styles.modeChipText, quickMode && styles.modeChipTextActive]}>Fast scan</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, !quickMode && styles.modeChipActive]}
            onPress={() => setQuickMode(false)}>
            <Text style={[styles.modeChipText, !quickMode && styles.modeChipTextActive]}>Detailed scan</Text>
          </Pressable>
        </View>
      )}

      {lastImageQuality && (loading || scanError || lastImageQuality.score < 85) ? (
        <View style={styles.captureGuideCard}>
          <Text style={styles.bold}>{`Photo quality: ${lastImageQuality.score}/100`}</Text>
          <Text style={styles.metaText}>{lastImageQuality.detail}</Text>
          {lastImageQuality.tips.map((tip) => (
            <Text key={tip} style={styles.compRow}>• {tip}</Text>
          ))}
        </View>
      ) : null}
      {tinyMvp ? (
        <View style={styles.captureGuideCard}>
          <Text style={styles.bold}>Quick tip</Text>
          <Text style={styles.compRow}>
            • {shouldShowVehicleDetails
              ? "For cars, center the full plate and avoid glare."
              : "For items, fill most of the frame with one product."}
          </Text>
        </View>
      ) : null}

      {tinyMvp || isCategoryLocked ? null : (
        <View style={styles.presetCard}>
          <Text style={styles.presetTitle}>Scan shortcuts</Text>
          <View style={[styles.wrapRow, isCompact && styles.rowStack]}>
            <Pressable style={styles.presetChip} onPress={() => applyScanPreset("cars")}>
              <Text style={styles.presetChipTitle}>Cars</Text>
              <Text style={styles.presetChipText}>Plate and vehicle details</Text>
            </Pressable>
            <Pressable style={styles.presetChip} onPress={() => applyScanPreset("antiques")}>
              <Text style={styles.presetChipTitle}>Collectibles</Text>
              <Text style={styles.presetChipText}>Cards, coins, antiques</Text>
            </Pressable>
            <Pressable style={styles.presetChip} onPress={() => applyScanPreset("technology")}>
              <Text style={styles.presetChipTitle}>Technology</Text>
              <Text style={styles.presetChipText}>Phones and gadgets</Text>
            </Pressable>
            <Pressable style={styles.presetChip} onPress={() => applyScanPreset("general")}>
              <Text style={styles.presetChipTitle}>General</Text>
              <Text style={styles.presetChipText}>Let ValueVision decide</Text>
            </Pressable>
          </View>
        </View>
      )}

      {tinyMvp ? null : (
      <View style={[styles.proCard, isCompact && styles.proCardCompact]}>
        <Text style={styles.proTitle}>{LaunchPricing.monthlySubscriptionName}</Text>
        <Text style={[styles.proPrice, isCompact && styles.proPriceCompact]}>
          {`${formatGbp(LaunchPricing.monthlySubscriptionGbp)} / month`}
        </Text>
        <Text style={styles.proText}>
          Unlock paid scans, vehicle tools, and deeper resale guidance.
        </Text>
        <Text style={styles.proFinePrint}>
          Vehicle data stays protected until paid access is unlocked.
        </Text>
        <Text style={styles.proFinePrint}>
          {FeatureFlags.carChecksAvailable
            ? `One-off car checks: valuation ${formatGbp(LaunchPricing.carValuationFromGbp)}, full check ${formatGbp(LaunchPricing.fullCarCheckSingleGbp)}, ${LaunchPricing.fullCarCheckBundleChecks}-pack ${formatGbp(LaunchPricing.fullCarCheckBundleGbp)}.`
            : FeatureFlags.carChecksStatusLabel}
        </Text>
        <Pressable style={styles.proCardCta} onPress={() => pushPublicRoute(router, "/paywall")}>
          <Text style={styles.proCardCtaText}>View billing and unlock status</Text>
        </Pressable>
      </View>
      )}

      {tinyMvp ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Simple Scan Mode</Text>
          <Text style={styles.fieldHelp}>
            Take or upload one clear photo. Add details only when you want a tighter valuation.
          </Text>
          <Pressable style={styles.advancedToggle} onPress={() => setShowQuickDetailsModal(true)}>
            <Text style={styles.advancedToggleText}>Add optional details</Text>
          </Pressable>
          {itemQuery || conditionNotes || vehicleReg ? (
            <Text style={styles.metaText}>
              {`Saved details${itemQuery ? " • item" : ""}${conditionNotes ? " • condition" : ""}${vehicleReg ? " • plate" : ""}`}
            </Text>
          ) : null}
        </View>
      ) : (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Item details</Text>
        <Text style={styles.fieldHelp}>
          {quickMode
            ? "Start with a photo. Add details only if you want a tighter price."
            : "Add a little more detail for the strongest valuation."}
        </Text>
        <View style={styles.fieldCard}>
          <Text style={styles.fieldTitle}>What are you scanning?</Text>
          <Text style={styles.fieldHelp}>{itemQueryHelp}</Text>
          <TextInput
            value={itemQuery}
            onChangeText={setItemQuery}
            placeholder={itemQueryPlaceholder}
            autoCapitalize="none"
            placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
          />
          <Text style={styles.fieldHelp}>
            Leave this blank if you want ValueVision to identify the item from the photo.
          </Text>
          {tinyMvp && recentQueryChips.length ? (
            <View style={styles.recentChipWrap}>
              {recentQueryChips.map((chip) => (
                <Pressable key={chip} style={styles.recentChip} onPress={() => setItemQuery(chip)}>
                  <Text numberOfLines={1} style={styles.recentChipText}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tinyMvp ? (
            <View style={[styles.row, isCompact && styles.rowStack]}>
              <Button title="Clear query" onPress={() => setItemQuery("")} />
              {imageUri ? <Button title="Rescan last photo" onPress={() => analyze(imageUri)} disabled={loading || isRefining} /> : null}
            </View>
          ) : null}
        </View>
        {tinyMvp ? null : (
          <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced((v) => !v)}>
            <Text style={styles.advancedToggleText}>{showAdvanced ? "Hide extra details" : "Add extra details"}</Text>
          </Pressable>
        )}

        {showAdvanced && !tinyMvp ? (
          <View style={{ gap: 8 }}>
            <View style={styles.fieldCard}>
              <Text style={styles.fieldTitle}>Condition and price</Text>
              <Text style={styles.fieldHelp}>Only add this if damage, wear, or buy price materially changes the value.</Text>
              <TextInput
                value={conditionNotes}
                onChangeText={setConditionNotes}
                placeholder="Cracked screen, battery weak"
                autoCapitalize="none"
                placeholderTextColor={AppTheme.textSecondary}
                style={styles.inputCompact}
              />
              <View style={styles.row}>
                <Button title={condition === "used" ? "Condition: Used ✓" : "Condition: Used"} onPress={() => setCondition("used")} />
                <Button title={condition === "new" ? "Condition: New ✓" : "Condition: New"} onPress={() => setCondition("new")} />
              </View>
              <Text style={styles.sectionLabel}>Condition quality</Text>
              <View style={styles.wrapRow}>
                <Button title={conditionTier === "mint" ? "Mint ✓" : "Mint"} onPress={() => setConditionTier("mint")} />
                <Button title={conditionTier === "good" ? "Good ✓" : "Good"} onPress={() => setConditionTier("good")} />
                <Button title={conditionTier === "fair" ? "Fair ✓" : "Fair"} onPress={() => setConditionTier("fair")} />
                <Button title={conditionTier === "broken" ? "Broken ✓" : "Broken"} onPress={() => setConditionTier("broken")} />
              </View>
              <TextInput
                value={buyPrice}
                onChangeText={setBuyPrice}
                placeholder="Buy price for profit tracking (optional)"
                keyboardType="decimal-pad"
                placeholderTextColor={AppTheme.textSecondary}
                style={styles.inputCompact}
              />
            </View>

            {shouldShowTechFields || shouldShowAntiqueFields || shouldShowToolFields || shouldShowFashionFields || shouldShowHomeFields ? (
              <View style={styles.fieldCard}>
                <Text style={styles.fieldTitle}>Category details</Text>
                <Text style={styles.fieldHelp}>Only add the fields that matter for this item.</Text>

                {shouldShowTechFields ? (
                  <>
                    <TextInput
                      value={techSpecs}
                      onChangeText={setTechSpecs}
                      placeholder="Specs (e.g. 256GB, 16GB RAM, i7)"
                      autoCapitalize="none"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={techBatteryHealth}
                      onChangeText={setTechBatteryHealth}
                      placeholder="Battery health (e.g. 89%)"
                      autoCapitalize="none"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                  </>
                ) : null}

                {shouldShowAntiqueFields ? (
                  <>
                    <TextInput
                      value={antiquesEra}
                      onChangeText={setAntiquesEra}
                      placeholder="Era / period (e.g. Victorian)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={antiquesMaker}
                      onChangeText={setAntiquesMaker}
                      placeholder="Maker / provenance"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={collectibleSet}
                      onChangeText={setCollectibleSet}
                      placeholder="Set / series (optional, e.g. Base Set)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={collectibleGrade}
                      onChangeText={setCollectibleGrade}
                      placeholder="Grade (optional, e.g. PSA 9, BGS 8.5)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                  </>
                ) : null}

                {shouldShowToolFields ? (
                  <>
                    <TextInput
                      value={toolBrand}
                      onChangeText={setToolBrand}
                      placeholder="Brand (e.g. DeWalt)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={toolModel}
                      onChangeText={setToolModel}
                      placeholder="Model (e.g. DCD996)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={toolVoltage}
                      onChangeText={setToolVoltage}
                      placeholder="Voltage / power (e.g. 18V)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                  </>
                ) : null}

                {shouldShowFashionFields ? (
                  <>
                    <TextInput
                      value={fashionBrand}
                      onChangeText={setFashionBrand}
                      placeholder="Brand (e.g. Nike)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={fashionSize}
                      onChangeText={setFashionSize}
                      placeholder="Size (e.g. UK 9 / M)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={fashionMaterial}
                      onChangeText={setFashionMaterial}
                      placeholder="Material (e.g. leather, cotton)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                  </>
                ) : null}

                {shouldShowHomeFields ? (
                  <>
                    <TextInput
                      value={homeBrand}
                      onChangeText={setHomeBrand}
                      placeholder="Brand / maker"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={homeDimensions}
                      onChangeText={setHomeDimensions}
                      placeholder="Dimensions (e.g. 160 x 90 cm)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                    <TextInput
                      value={homeAgeStyle}
                      onChangeText={setHomeAgeStyle}
                      placeholder="Age / style (e.g. Mid-century)"
                      autoCapitalize="words"
                      placeholderTextColor={AppTheme.textSecondary}
                      style={styles.inputCompact}
                    />
                  </>
                ) : null}
              </View>
            ) : null}

            {shouldShowVehicleDetails ? (
              <View style={styles.fieldCard}>
                <View style={[styles.row, isCompact && styles.rowStack]}>
                  <Text style={styles.fieldTitle}>Vehicle tools</Text>
                  <Button
                    title={showVehicleTools ? "Hide Vehicle Tools" : "Open Vehicle Tools"}
                    onPress={() => setShowVehicleTools((v) => !v)}
                  />
                </View>
                <Text style={styles.fieldHelp}>Keep this closed for quick scans. Open when you need MOT/tax/history checks and deeper vehicle details.</Text>

                {showVehicleTools ? (
                  <>
                    <Text style={styles.sectionLabel}>Core details (recommended)</Text>
                    <TextInput
                      value={vehicleReg}
                      onChangeText={setVehicleReg}
                      placeholder="Registration (e.g. AB12CDE)"
                      autoCapitalize="characters"
                      placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
                    />
                    <View style={[styles.row, isCompact && styles.rowStack]}>
                      <TextInput value={vehicleMake} onChangeText={setVehicleMake} placeholder="Make (e.g. BMW)" autoCapitalize="words" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                      <TextInput value={vehicleModel} onChangeText={setVehicleModel} placeholder="Model (e.g. 320d)" autoCapitalize="words" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                    </View>
                    <View style={[styles.row, isCompact && styles.rowStack]}>
                      <TextInput value={vehicleYear} onChangeText={setVehicleYear} placeholder="Year (e.g. 2018)" keyboardType="number-pad" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                      <TextInput value={vehicleMileage} onChangeText={setVehicleMileage} placeholder="Mileage" keyboardType="number-pad" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                    </View>
                    <View style={[styles.row, isCompact && styles.rowStack]}>
                      <TextInput value={vehicleFuelType} onChangeText={setVehicleFuelType} placeholder="Fuel (petrol/diesel/hybrid)" autoCapitalize="words" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                      <TextInput value={vehicleTransmission} onChangeText={setVehicleTransmission} placeholder="Transmission (manual/auto)" autoCapitalize="words" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                    </View>
                    <View style={[styles.row, isCompact && styles.rowStack]}>
                      <Button
                        title={vehicleStatusLoading ? "Checking..." : "Check MOT & Tax"}
                        onPress={checkUkVehicleStatus}
                        disabled={vehicleStatusLoading}
                      />
                    </View>

                    <Text style={styles.sectionLabel}>Optional details (advanced)</Text>
                    <View style={[styles.row, isCompact && styles.rowStack]}>
                      <TextInput value={vehicleTrim} onChangeText={setVehicleTrim} placeholder="Trim / variant (e.g. M Sport)" autoCapitalize="words" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                      <TextInput value={vehicleOwners} onChangeText={setVehicleOwners} placeholder="Number of owners" keyboardType="number-pad" placeholderTextColor={AppTheme.textSecondary}
                      style={[styles.input, styles.flex1]} />
                    </View>
                    <TextInput
                      value={vehicleServiceHistory}
                      onChangeText={setVehicleServiceHistory}
                      placeholder="Service history (e.g. full service history)"
                      autoCapitalize="sentences"
                      placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
                    />
                    <TextInput
                      value={vehicleAccidentFlags}
                      onChangeText={setVehicleAccidentFlags}
                      placeholder="Accident/history flags (if any)"
                      autoCapitalize="sentences"
                      placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
                    />
                    <TextInput
                      value={vehicleMods}
                      onChangeText={setVehicleMods}
                      placeholder="Mods/upgrades"
                      autoCapitalize="sentences"
                      placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
                    />
                    <TextInput
                      value={vehicleKnownFaults}
                      onChangeText={setVehicleKnownFaults}
                      placeholder="Known faults / issues"
                      autoCapitalize="sentences"
                      placeholderTextColor={AppTheme.textSecondary}
            style={styles.inputCompact}
                    />
                  </>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Category</Text>
            {isCategoryLocked ? (
              <View style={styles.fieldCard}>
                <Text style={styles.fieldHelp}>This scanner mode locks category for simplicity.</Text>
                <Text style={styles.fieldTitle}>{`${category.charAt(0).toUpperCase()}${category.slice(1)} ✓`}</Text>
              </View>
            ) : (
              <View style={styles.fieldCard}>
                <Text style={styles.fieldHelp}>Current: {SCAN_CATEGORY_OPTIONS.find((x) => x.value === category)?.label || category}</Text>
                <Pressable style={styles.categoryPickerBtn} onPress={() => setShowCategoryModal(true)}>
                  <Text style={styles.categoryPickerBtnText}>Choose Category</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionLabel}>Region / Currency</Text>
            <View style={styles.wrapRow}>
              <Button title={region === "us" ? "US ($) ✓" : "US ($)"} onPress={() => setRegion("us")} />
              <Button title={region === "uk" ? "UK (£) ✓" : "UK (£)"} onPress={() => setRegion("uk")} />
              <Button title={region === "eu" ? "EU (€) ✓" : "EU (€)"} onPress={() => setRegion("eu")} />
              <Button title={region === "ca" ? "CA (C$) ✓" : "CA (C$)"} onPress={() => setRegion("ca")} />
              <Button title={region === "au" ? "AU (A$) ✓" : "AU (A$)"} onPress={() => setRegion("au")} />
            </View>

            <Pressable style={styles.advancedToggle} onPress={() => setShowDeveloperTools((v) => !v)}>
              <Text style={styles.advancedToggleText}>
                {showDeveloperTools ? "Hide developer tools" : "Show developer tools"}
              </Text>
            </Pressable>
            {showDeveloperTools ? (
              <>
                <Text style={styles.sectionLabel}>Backend Connection</Text>
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldHelp}>
                    Use live HTTPS URL for TestFlight/App Store, or your Mac IP + port 5050 on same Wi-Fi for local testing.
                  </Text>
                  <TextInput
                    value={apiBaseInput}
                    onChangeText={setApiBaseInput}
                    placeholder="https://api.valuevisionapp.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={AppTheme.textSecondary}
                    style={styles.inputCompact}
                  />
                  <Text style={styles.fieldHelp}>{`Using: ${effectiveApiBase}`}</Text>
                  <View style={[styles.row, isCompact && styles.rowStack]}>
                    <Button
                      title={connectionStatus === "checking" ? "Checking..." : "Test Connection"}
                      onPress={testBackendConnection}
                      disabled={connectionStatus === "checking"}
                    />
                  </View>
                  {connectionMessage ? (
                    <Text style={styles.fieldHelp}>
                      {connectionStatus === "ok" ? `Connected: ${connectionMessage}` : connectionStatus === "error" ? `Error: ${connectionMessage}` : connectionMessage}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
      )}

      {tinyMvp && !imageUri && !data ? (
        <View style={styles.captureGuideCard}>
          <Text style={styles.bold}>How it works</Text>
          <Text style={styles.compRow}>1. Take or upload one clear photo.</Text>
          <Text style={styles.compRow}>2. We identify the item and check current market evidence.</Text>
          <Text style={styles.compRow}>3. Review the valuation and keep it in My Collection.</Text>
        </View>
      ) : null}

      <View style={styles.buttonGrid}>
        <View style={styles.primaryActionLead}>
          <Text style={styles.primaryActionLeadTitle}>Ready to scan</Text>
          <Text style={styles.primaryActionLeadText}>Use one clear photo. We do the rest automatically.</Text>
        </View>
        <View style={[styles.row, isCompact && styles.rowStack]}>
          <Pressable
            style={[styles.quickBtn, (loading || isRefining) && styles.quickBtnDisabled]}
            onPress={pickPhoto}
            disabled={loading || isRefining}>
            <Text style={styles.quickBtnTitle}>{loading || isRefining ? "Working..." : "Upload Photo"}</Text>
            <Text style={styles.quickBtnSub}>From gallery</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtnPrimary, (loading || isRefining) && styles.quickBtnDisabled]}
            onPress={takePhoto}
            disabled={loading || isRefining}>
            <Text style={styles.quickBtnTitlePrimary}>{loading || isRefining ? "Working..." : "Scan Now"}</Text>
            <Text style={styles.quickBtnSubPrimary}>Open camera</Text>
          </Pressable>
        </View>
        {tinyMvp ? null : (
        <View style={[styles.row, isCompact && styles.rowStack]}>
          <Pressable
            style={styles.quickBtn}
            onPress={() => (liveMode ? setLiveMode(false) : enterLiveMode())}>
            <Text style={styles.quickBtnTitle}>{liveMode ? "Exit Live" : "Live Mode"}</Text>
            <Text style={styles.quickBtnSub}>Continuous scan</Text>
          </Pressable>
          <Pressable
            style={styles.quickBtn}
            onPress={() => pushPublicRoute(router, "/history")}>
            <Text style={styles.quickBtnTitle}>My Collection</Text>
            <Text style={styles.quickBtnSub}>Saved scans</Text>
          </Pressable>
        </View>
        )}
        {tinyMvp || liveMode ? null : (
        <View style={[styles.row, isCompact && styles.rowStack]}>
          <Pressable
            style={[styles.quickBtn, handsFreeVoice && styles.voiceBtnActive]}
            onPress={async () => {
              const next = !handsFreeVoice;
              setHandsFreeVoice(next);
              if (!next) {
                if (voiceTurnTimerRef.current) {
                  clearTimeout(voiceTurnTimerRef.current);
                  voiceTurnTimerRef.current = null;
                }
                if (recordingRef.current) {
                  await stopVoiceCapture(recordingRef.current);
                }
                setVoiceStatus("Hands-free off.");
              } else {
                setVoiceStatus("Hands-free on. Tap Start Voice to begin.");
              }
            }}>
            <Text style={styles.quickBtnTitle}>{handsFreeVoice ? "Hands-Free: ON" : "Hands-Free: OFF"}</Text>
            <Text style={styles.quickBtnSub}>Continuous AI voice turns</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtn, voiceLoading && styles.quickBtnDisabled]}
            onPress={() => (recordingRef.current ? stopVoiceCapture(recordingRef.current) : startVoiceCapture())}
            disabled={voiceLoading}>
            <Text style={styles.quickBtnTitle}>{recordingRef.current ? "Stop Voice" : "Start Voice"}</Text>
            <Text style={styles.quickBtnSub}>{handsFreeVoice ? "Auto listen and respond" : "Tap-to-start voice turn"}</Text>
          </Pressable>
        </View>
        )}
        {tinyMvp || liveMode ? null : (
        <Pressable
          style={[styles.quickBtn, recording && styles.voiceBtnActive, voiceLoading && styles.quickBtnDisabled]}
          onPressIn={handsFreeVoice ? undefined : startVoiceCapture}
          onPressOut={handsFreeVoice ? undefined : (() => stopVoiceCapture(recordingRef.current))}
          onPress={handsFreeVoice ? (() => (recordingRef.current ? stopVoiceCapture(recordingRef.current) : startVoiceCapture())) : undefined}
          disabled={voiceLoading}>
          <Text style={styles.quickBtnTitle}>
            {handsFreeVoice ? (recording ? "Listening..." : "Start Hands-Free Voice") : (recording ? "Release to Stop" : "Hold to Talk")}
          </Text>
          <Text style={styles.quickBtnSub}>
            {voiceLoading
              ? "Working..."
              : handsFreeVoice
                ? `Each turn listens for ${Math.round(VOICE_TURN_CAPTURE_MS / 1000)}s, then AI responds`
                : "Speak item details naturally"}
          </Text>
        </Pressable>
        )}
        {voiceStatus ? <Text style={styles.metaText}>{voiceStatus}</Text> : null}
      </View>

      {liveMode ? (
        <View style={styles.liveCard}>
          <Text style={styles.cardTitle}>Live Scan</Text>
          <View style={[styles.liveCameraWrap, isCompact && styles.liveCameraWrapCompact, isLandscape && styles.liveCameraWrapLandscape]}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              onBarcodeScanned={onLiveBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "pdf417", "qr"],
              }}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.targetBox} />
              <View style={styles.valueBadge}>
                <Text style={styles.valueBadgeText}>{liveValueText}</Text>
              </View>
              <View style={styles.itemBadge}>
                <Text numberOfLines={1} style={styles.itemBadgeText}>{liveDetectedText}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.liveHelp}>
            {`Point the center box at one item. Live scan updates every ${LIVE_SCAN_INTERVAL_MS / 1000}s.`}
          </Text>
          <Text style={styles.liveHelp}>{scanGuideText}</Text>
          {barcodeSnapshot ? (
            <Text style={styles.liveHelp}>
              {`Barcode detected (${barcodeSnapshot.type}): ${barcodeSnapshot.value}`}
            </Text>
          ) : null}
          <View style={[styles.row, isCompact && styles.rowStack]}>
            <Button title={autoLiveScan ? "Auto scan: ON" : "Auto scan: OFF"} onPress={() => setAutoLiveScan((v) => !v)} />
            <Button title="Scan now" onPress={() => runLiveScan(false)} disabled={loading || isRefining} />
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator />
          <Text style={styles.bold}>{status || "Working..."}</Text>
          <Text>{`Elapsed: ${elapsedSec}s`}</Text>
          {loadingGuide ? <Text style={styles.metaText}>{loadingGuide}</Text> : null}
          <Text>{`Fast target: ${FAST_TIMEOUT_MS / 1000}s | Refine target: ${REFINE_TIMEOUT_MS / 1000}s`}</Text>
          {slowScanHint ? <Text style={styles.metaText}>{slowScanHint}</Text> : null}
          <Pressable style={styles.loadingCancelBtn} onPress={cancelCurrentScan}>
            <Text style={styles.loadingCancelText}>Cancel Scan</Text>
          </Pressable>
          <View style={styles.loadingSkeletonWrap}>
            <View style={styles.loadingSkeletonLg} />
            <View style={styles.loadingSkeletonRow}>
              <View style={styles.loadingSkeletonSm} />
              <View style={styles.loadingSkeletonSm} />
              <View style={styles.loadingSkeletonSm} />
            </View>
          </View>
        </View>
      ) : null}

      {!loading && isRefining ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator />
          <Text style={styles.bold}>Refining price in background...</Text>
          <Pressable style={styles.loadingCancelBtn} onPress={cancelCurrentScan}>
            <Text style={styles.loadingCancelText}>Cancel Refine</Text>
          </Pressable>
        </View>
      ) : null}

      {scanError ? (
        <View style={styles.errorCard}>
          <Text style={styles.warnTitle}>{scanErrorDetail?.title || "Scan issue"}</Text>
          <Text style={styles.warnText}>{scanErrorDetail?.summary || scanError}</Text>
          {(scanErrorDetail?.steps || []).slice(0, 3).map((step) => (
            <Text key={step} style={styles.warnListItem}>• {step}</Text>
          ))}
          <View style={[styles.warnActionRow, isCompact && styles.rowStack]}>
            <Pressable style={styles.warnAction} onPress={() => (imageUri ? analyze(imageUri) : takePhoto())}>
              <Text style={styles.warnActionText}>Try Again</Text>
            </Pressable>
            <Pressable style={styles.warnActionSecondary} onPress={pickPhoto}>
              <Text style={styles.warnActionSecondaryText}>Use Gallery</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.warnActionSecondary, styles.warnActionUtility]}
            onPress={() => {
              setShowDeveloperTools(true);
              testBackendConnection();
            }}>
            <Text style={styles.warnActionSecondaryText}>Check Connection</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && imageUri ? (
        <View>
          <Button title="Scan this photo again" onPress={() => analyze(imageUri)} />
        </View>
      ) : null}

      {tinyMvp ? null : (
        <View style={styles.row}>
          <Button
            title="Try Health Check"
            onPress={testBackendConnection}
          />
        </View>
      )}

      {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" /> : null}

      {priceLine ? (
        <Animated.View
          style={[
            styles.pricingCard,
            { opacity: resultAnim, transform: [{ translateY: resultAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
          ]}>
          <Text style={styles.bold}>Your Result</Text>
          <View style={styles.resultHeadRow}>
            <Text numberOfLines={1} style={styles.resultHeadTitle}>
              {data?.pricing?.query || data?.pricing?.autoDetectedQuery || "Detected item"}
            </Text>
            <View
              style={[
                styles.confChip,
                confidenceLabel === "high" ? styles.confHigh : confidenceLabel === "medium" ? styles.confMid : styles.confLow,
              ]}>
              <Text style={styles.confText}>
                {data?.pricing?.confidence ? `${data.pricing.confidence.label} ${data.pricing.confidence.score}` : "pending"}
              </Text>
            </View>
          </View>
          <View style={styles.resultStatusPill}>
            <Text style={styles.resultStatusPillText}>
              {`${resultReadinessLabel} • Confidence ${confidenceScore || accuracyScore || 0}/100`}
            </Text>
          </View>
          <View style={[styles.resultValueRow, isCompact && styles.snapshotRowCompact]}>
            <View style={styles.resultValueTile}>
              <Text style={styles.resultValueLabel}>Low</Text>
              <Text style={styles.resultValueText}>{formatMoney(data?.pricing?.low, activeCurrencySymbol, 0)}</Text>
            </View>
            <View style={styles.resultValueTileFeatured}>
              <Text style={styles.resultValueLabel}>Median</Text>
              <Text style={styles.resultValueTextFeatured}>{formatMoney(data?.pricing?.median, activeCurrencySymbol, 0)}</Text>
            </View>
            <View style={styles.resultValueTile}>
              <Text style={styles.resultValueLabel}>High</Text>
              <Text style={styles.resultValueText}>{formatMoney(data?.pricing?.high, activeCurrencySymbol, 0)}</Text>
            </View>
          </View>
          <View style={styles.valuationContextCard}>
            <Text style={styles.valuationContextTitle}>{valuationContextTitle}</Text>
            <Text style={styles.valuationContextText}>{valuationContextText}</Text>
          </View>
          {typeof data?.pricing?.recommendedRetail?.median === "number" ? (
            <View style={styles.retailContextCard}>
              <Text style={styles.retailContextTitle}>
                {`Estimated new retail equivalent: ${formatMoney(data.pricing.recommendedRetail.median, activeCurrencySymbol, 0)}`}
              </Text>
              <Text style={styles.retailContextText}>
                {`Resale currently tracks about ${(Number(data.pricing.recommendedRetail.retentionRate || 0) * 100).toFixed(0)}% of new price.`}
              </Text>
            </View>
          ) : null}
          <Text style={styles.resultSummaryText}>{priceLine}</Text>
          <View style={styles.trustCardInline}>
            <Text style={styles.trustCardInlineTitle}>{`Trust level: ${trustLevel}`}</Text>
            {trustSummaryLines.map((line) => (
              <Text key={line} style={styles.trustCardInlineText}>• {line}</Text>
            ))}
          </View>
          <View style={styles.nextStepCard}>
            <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
            <Text style={styles.nextStepText}>{nextStep.text}</Text>
          </View>
          <Pressable style={styles.detailsToggleBtn} onPress={() => setShowResultDetails((v) => !v)}>
            <Text style={styles.detailsToggleText}>{showResultDetails ? "Hide details" : "Show more details"}</Text>
          </Pressable>
          {isHoldResult || lowTrustEstimate ? (
            <View style={styles.warnCardHold}>
              <Text style={styles.warnTitle}>Price not trustworthy yet</Text>
              <Text style={styles.warnText}>Answer one or two quick questions and ValueVision will revalue it.</Text>
              {(data?.pricing?.accuracyNextSteps?.length ? data.pricing.accuracyNextSteps : holdPrompts).map((p) => (
                <Text key={p} style={styles.warnListItem}>• {p}</Text>
              ))}
              {accuracyBlockers.slice(0, 4).map((b) => (
                <Text key={b} style={styles.warnListItem}>• Blocker: {b}</Text>
              ))}
              <View style={[styles.warnActionRow, isCompact && styles.rowStack]}>
                <Pressable style={styles.warnAction} onPress={improveResult}>
                  <Text style={styles.warnActionText}>
                    {itemsOnly && effectiveCategory === "vehicle" ? "Open Car Mode" : "Improve This Valuation"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.warnActionSecondary}
                  onPress={() => (imageUri ? analyze(imageUri) : takePhoto())}>
                  <Text style={styles.warnActionSecondaryText}>Scan Again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {isCautionResult ? (
            <View style={styles.warnCardCaution}>
              <Text style={styles.warnTitle}>Use caution</Text>
              <Text style={styles.warnText}>Good starting estimate, but details can improve accuracy.</Text>
            </View>
          ) : null}
          {showResultDetails ? (
            <View style={[styles.snapshotRow, isCompact && styles.snapshotRowCompact]}>
              <View style={styles.snapshotTile}>
                <Text style={styles.snapshotLabel}>Resale (mid)</Text>
                <Text style={styles.snapshotValue}>{formatMoney(data?.pricing?.median, activeCurrencySymbol)}</Text>
              </View>
              <View style={styles.snapshotTile}>
                <Text style={styles.snapshotLabel}>Retail New (est)</Text>
                <Text style={styles.snapshotValue}>{formatMoney(data?.pricing?.recommendedRetail?.median, activeCurrencySymbol)}</Text>
              </View>
              <View style={styles.snapshotTile}>
                <Text style={styles.snapshotLabel}>Confidence</Text>
                <Text style={styles.snapshotValue}>
                  {data?.pricing?.confidence ? `${data.pricing.confidence.label} ${data.pricing.confidence.score}/100` : "pending"}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.row, isCompact && styles.rowStack]}>
            <Pressable style={styles.reportActionBtn} onPress={() => saveToWatchlist(false)}>
              <Text style={styles.reportActionText}>{watchlistMatch ? "In Watchlist" : "Save to Watchlist"}</Text>
            </Pressable>
            <Pressable style={styles.reportActionPrimary} onPress={() => saveToWatchlist(true)}>
              <Text style={styles.reportActionPrimaryText}>Set Price Alert</Text>
            </Pressable>
          </View>
          {watchlistMatch?.alertEnabled ? (
            <Text style={styles.metaText}>
              {`Alert armed at ${formatMoney(watchlistMatch.alertPrice, activeCurrencySymbol, 0)}${watchlistMatch.alertTriggered ? " • Triggered" : ""}`}
            </Text>
          ) : null}
          {showResultDetails && rankedChannels.length ? (
            <View style={styles.bestChannelCard}>
              <Text style={styles.bold}>Best Sell Channel</Text>
              <Text style={styles.bestChannelTitle}>{`${rankedChannels[0].name} (${rankedChannels[0].score}/100)`}</Text>
              <Text style={styles.compRow}>{`• ${rankedChannels[0].reason}`}</Text>
              <Text style={styles.compRow}>{`• Speed: ${rankedChannels[0].speed} | Fees: ${rankedChannels[0].fee}`}</Text>
              {rankedChannels.slice(1, 3).map((r) => (
                <View key={r.name} style={styles.bestChannelRow}>
                  <Text style={styles.bestChannelRowName}>{r.name}</Text>
                  <View style={styles.bestChannelTrack}>
                    <View style={[styles.bestChannelFill, { width: `${r.score}%` }]} />
                  </View>
                  <Text style={styles.bestChannelScore}>{r.score}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {showResultDetails && data?.pricing?.recommendedRetail ? (
            <Text style={styles.metaText}>
              {`RRP range: ${formatMoney(data.pricing.recommendedRetail.low, activeCurrencySymbol)} - ${formatMoney(data.pricing.recommendedRetail.high, activeCurrencySymbol)} | retains ${(data.pricing.recommendedRetail.retentionRate * 100).toFixed(0)}%`}
            </Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.autoDetectedQuery ? (
            <Text style={styles.metaText}>{`Detected item: ${data.pricing.autoDetectedQuery}`}</Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.detectionConfidence ? (
            <Text style={styles.metaText}>{`Detection confidence: ${data.pricing.detectionConfidence}`}</Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.category ? <Text style={styles.metaText}>{`Category: ${data.pricing.category}`}</Text> : null}
          {showResultDetails && !tinyMvp && data?.pricing?.confidence ? <Text style={styles.metaText}>{`Confidence: ${data.pricing.confidence.label} (${data.pricing.confidence.score}/100)`}</Text> : null}
          {showResultDetails && !tinyMvp && data?.pricing?.qualityGate ? (
            <Text style={styles.metaText}>{`Quality gate: ${data.pricing.qualityGate.status} (${data.pricing.qualityGate.score}/100)`}</Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.confidenceReasons?.length ? (
            <Text style={styles.metaText}>{`Why: ${data.pricing.confidenceReasons.join(", ")}`}</Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.valuationAdjustments?.length ? (
            <Text style={styles.metaText}>{`Adjustments: ${data.pricing.valuationAdjustments.join(", ")}`}</Text>
          ) : null}
          {showResultDetails && !tinyMvp && data?.pricing?.liveDataAt ? <Text style={styles.metaText}>{`Live market data: ${new Date(data.pricing.liveDataAt).toLocaleString()}`}</Text> : null}
          {showResultDetails && !tinyMvp && data?.pricing?.vehicleAdjustments?.reasons?.length ? (
            <Text style={styles.metaText}>{`Vehicle adjustments: ${data.pricing.vehicleAdjustments.reasons.join(", ")}`}</Text>
          ) : null}
          <View style={[styles.row, isCompact && styles.rowStack]}>
            <Pressable style={styles.reportActionPrimary} onPress={clearCurrentScanView}>
              <Text style={styles.reportActionPrimaryText}>Scan Another</Text>
            </Pressable>
            <Pressable style={styles.reportActionBtn} onPress={() => pushPublicRoute(router, "/history")}>
              <Text style={styles.reportActionText}>Open Collection</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
      {showResultDetails && comparisonDelta ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Quick Compare</Text>
          <Text style={styles.compRow}>
            {`• ${comparisonDelta.direction === "up" ? "Up" : "Down"} ${Math.abs(comparisonDelta.pct).toFixed(1)}% vs last saved scan`}
          </Text>
          <Text style={styles.compRow}>
            {`• Last: ${comparisonDelta.previousQuery} (${formatMoney(comparisonDelta.previousValue, activeCurrencySymbol, 0)})`}
          </Text>
        </View>
      ) : null}

      {showResultDetails && data?.pricing ? (
        <View style={styles.categoryInsightCard}>
          <Text style={styles.bold}>Confidence Coach</Text>
          {(data.pricing.qualityGate?.reasons?.length
            ? data.pricing.qualityGate.reasons
            : holdPrompts.length
            ? holdPrompts
            : ["Use one clear photo", "Add model and condition details", "Rescan after improving framing"]
          )
            .slice(0, 4)
            .map((tip) => (
              <Text key={tip} style={styles.compRow}>
                • {tip}
              </Text>
            ))}
        </View>
      ) : null}

      {showResultDetails && categoryInsight ? (
        <View style={styles.categoryInsightCard}>
          <Text style={styles.bold}>{categoryInsight.title}</Text>
          {categoryInsight.lines.map((line) => (
            <Text key={line} style={styles.compRow}>• {line}</Text>
          ))}
        </View>
      ) : null}

      {showResultDetails && data?.pricing?.soldCompsBenchmark ? (
        <View style={styles.categoryInsightCard}>
          <Text style={styles.bold}>Sold Data Benchmark</Text>
          <Text style={styles.compRow}>
            • Source: {data.pricing.soldCompsBenchmark.source || "sold comps"} ({data.pricing.soldCompsBenchmark.count} comps)
          </Text>
          <Text style={styles.compRow}>
            • Sold median: {formatMoney(data.pricing.soldCompsBenchmark.median, currencySymbol(data.pricing.soldCompsBenchmark.currency, activeCurrencySymbol), 2)}
          </Text>
          <Text style={styles.compRow}>
            • Sold range: {formatMoney(data.pricing.soldCompsBenchmark.low, currencySymbol(data.pricing.soldCompsBenchmark.currency, activeCurrencySymbol), 2)} - {formatMoney(data.pricing.soldCompsBenchmark.high, currencySymbol(data.pricing.soldCompsBenchmark.currency, activeCurrencySymbol), 2)}
          </Text>
          {typeof data?.pricing?.median === "number" ? (
            <Text style={styles.compRow}>
              • Model delta vs sold median: {`${(((data.pricing.median - data.pricing.soldCompsBenchmark.median) / Math.max(1, data.pricing.soldCompsBenchmark.median)) * 100).toFixed(1)}%`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showResultDetails && vehicleHasReportData ? (
        <View style={styles.vehicleReportCard}>
          <View style={[styles.row, styles.vehicleReportHeader, isCompact && styles.rowStack]}>
            <View style={styles.vehicleTitleWrap}>
              <Text style={styles.vehicleReportEyebrow}>VEHICLE INTELLIGENCE</Text>
              <Text style={styles.vehicleReportTitle}>Vehicle Intelligence Report</Text>
              <Text style={styles.vehicleReportSub}>Checks, value, and sale strategy in one place.</Text>
            </View>
            <View style={styles.vehicleRegPill}>
              <Text style={styles.vehicleRegPillText}>
                {vehicleStatus?.registrationNumber || data?.pricing?.vehicleRegDetected || "Unknown reg"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.vehicleScorePanel,
              vehicleReportTone === "risk"
                ? styles.vehicleScorePanelRisk
                : vehicleReportTone === "review"
                ? styles.vehicleScorePanelReview
                : styles.vehicleScorePanelClear,
            ]}>
            <View
              style={[
                styles.vehicleScoreRing,
                vehicleReportTone === "risk"
                  ? styles.vehicleScoreRingRisk
                  : vehicleReportTone === "review"
                  ? styles.vehicleScoreRingReview
                  : styles.vehicleScoreRingClear,
              ]}>
              <Text style={styles.vehicleScoreRingValue}>{vehicleReportScore != null ? String(vehicleReportScore) : "--"}</Text>
              <Text style={styles.vehicleScoreRingLabel}>/100</Text>
            </View>
            <View style={styles.vehicleScoreCopy}>
              <Text style={styles.vehicleScoreTitle}>Overall vehicle score</Text>
              <Text style={styles.vehicleScoreText}>
                {vehicleReportTone === "risk"
                  ? "Higher risk profile. Verify history and adjust offer aggressively."
                  : vehicleReportTone === "review"
                  ? "Mixed signals. Review MOT/tax/history and negotiate margin."
                  : "Low-risk scan profile from current checks and confidence."}
              </Text>
              <View style={styles.vehicleFlagsRow}>
                <View style={[styles.vehicleFlagChip, motOk === false ? styles.vehicleFlagBad : styles.vehicleFlagGood]}>
                  <Text style={styles.vehicleFlagText}>{`MOT ${motOk === false ? "Risk" : "OK"}`}</Text>
                </View>
                <View style={[styles.vehicleFlagChip, taxOk === false ? styles.vehicleFlagBad : styles.vehicleFlagGood]}>
                  <Text style={styles.vehicleFlagText}>{`Tax ${taxOk === false ? "Risk" : "OK"}`}</Text>
                </View>
                <View style={[styles.vehicleFlagChip, hasFinanceRecord ? styles.vehicleFlagWarn : styles.vehicleFlagGood]}>
                  <Text style={styles.vehicleFlagText}>{hasFinanceRecord ? "Finance Flag" : "No Finance Flag"}</Text>
                </View>
                <View style={[styles.vehicleFlagChip, hasWriteOffRecord ? styles.vehicleFlagBad : styles.vehicleFlagGood]}>
                  <Text style={styles.vehicleFlagText}>{hasWriteOffRecord ? "Write-off Flag" : "No Write-off Flag"}</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.vehicleSectionTitle}>Identity</Text>
          <View style={styles.vehicleIdentityGrid}>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Make</Text>
              <Text style={styles.vehicleIdentityValue}>{vehicleStatus?.make || vehicleMake || "Unknown"}</Text>
            </View>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Model</Text>
              <Text style={styles.vehicleIdentityValue}>{vehicleStatus?.model || vehicleModel || "Unknown"}</Text>
            </View>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Year</Text>
              <Text style={styles.vehicleIdentityValue}>
                {vehicleStatus?.yearOfManufacture ? String(vehicleStatus.yearOfManufacture) : vehicleYear || "Unknown"}
              </Text>
            </View>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Mileage</Text>
              <Text style={styles.vehicleIdentityValue}>
                {vehicleMileageMiles != null ? `${vehicleMileageMiles.toLocaleString()} mi` : "Unknown"}
              </Text>
            </View>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Fuel</Text>
              <Text style={styles.vehicleIdentityValue}>{vehicleStatus?.fuelType || vehicleFuelType || "Unknown"}</Text>
            </View>
            <View style={styles.vehicleIdentityTile}>
              <Text style={styles.vehicleIdentityLabel}>Colour</Text>
              <Text style={styles.vehicleIdentityValue}>{vehicleStatus?.colour || "Unknown"}</Text>
            </View>
          </View>

          <Text style={styles.vehicleSectionTitle}>Checks</Text>
          <View style={styles.vehicleStatusChipWrap}>
            <View
              style={[
                styles.vehicleStatusChip,
                motOk === true ? styles.vehicleChipGood : motOk === false ? styles.vehicleChipAlert : styles.vehicleChipNeutral,
              ]}>
              <Text style={styles.vehicleStatusChipTitle}>MOT</Text>
              <Text style={styles.vehicleStatusChipValue}>
                {vehicleStatus?.motStatus || "Unknown"}
                {vehicleStatus?.motExpiryDate ? ` • ${formatUkDate(vehicleStatus.motExpiryDate)}` : ""}
              </Text>
            </View>
            <View
              style={[
                styles.vehicleStatusChip,
                taxOk === true ? styles.vehicleChipGood : taxOk === false ? styles.vehicleChipAlert : styles.vehicleChipNeutral,
              ]}>
              <Text style={styles.vehicleStatusChipTitle}>Tax</Text>
              <Text style={styles.vehicleStatusChipValue}>
                {vehicleStatus?.taxStatus || "Unknown"}
                {vehicleStatus?.taxDueDate ? ` • ${formatUkDate(vehicleStatus.taxDueDate)}` : ""}
              </Text>
            </View>
            <View style={[styles.vehicleStatusChip, hasStolenRecord ? styles.vehicleChipAlert : styles.vehicleChipGood]}>
              <Text style={styles.vehicleStatusChipTitle}>Theft</Text>
              <Text style={styles.vehicleStatusChipValue}>
                {hasStolenRecord ? `Record found${vehicleStatus?.historyCategories?.stolenCount ? ` (${vehicleStatus.historyCategories.stolenCount})` : ""}` : "No record"}
              </Text>
            </View>
            <View style={[styles.vehicleStatusChip, hasFinanceRecord ? styles.vehicleChipWarn : styles.vehicleChipGood]}>
              <Text style={styles.vehicleStatusChipTitle}>Finance</Text>
              <Text style={styles.vehicleStatusChipValue}>
                {hasFinanceRecord ? `Record found${vehicleStatus?.historyCategories?.financeCount ? ` (${vehicleStatus.historyCategories.financeCount})` : ""}` : "No record"}
              </Text>
            </View>
            <View style={[styles.vehicleStatusChip, hasWriteOffRecord ? styles.vehicleChipAlert : styles.vehicleChipGood]}>
              <Text style={styles.vehicleStatusChipTitle}>Write-off</Text>
              <Text style={styles.vehicleStatusChipValue}>
                {hasWriteOffRecord
                  ? vehicleStatus?.crashHistory?.latestWriteOffStatus || "Record found"
                  : "No record"}
              </Text>
            </View>
          </View>

          <Text style={styles.vehicleSectionTitle}>Valuation</Text>
          <View style={styles.vehicleValueGrid}>
            <View style={styles.vehicleValueTile}>
              <Text style={styles.vehicleIdentityLabel}>Low</Text>
              <Text style={styles.vehicleIdentityValue}>{formatMoney(data?.pricing?.low, activeCurrencySymbol, 0)}</Text>
            </View>
            <View style={styles.vehicleValueTileFeatured}>
              <Text style={styles.vehicleIdentityLabel}>Median</Text>
              <Text style={styles.vehicleIdentityValueFeatured}>{formatMoney(data?.pricing?.median, activeCurrencySymbol, 0)}</Text>
            </View>
            <View style={styles.vehicleValueTile}>
              <Text style={styles.vehicleIdentityLabel}>High</Text>
              <Text style={styles.vehicleIdentityValue}>{formatMoney(data?.pricing?.high, activeCurrencySymbol, 0)}</Text>
            </View>
          </View>
          {data?.pricing?.soldCompsBenchmark ? (
            <Text style={styles.compRow}>
              • Sold benchmark median: {formatMoney(data.pricing.soldCompsBenchmark.median, currencySymbol(data.pricing.soldCompsBenchmark.currency, activeCurrencySymbol), 0)} from {data.pricing.soldCompsBenchmark.count} sold comps.
            </Text>
          ) : (
            <Text style={styles.compRow}>• Sold benchmark unavailable for this vehicle profile yet.</Text>
          )}

          <Text style={styles.vehicleSectionTitle}>Where to sell</Text>
          {data?.pricing?.recommendations?.length ? (
            data.pricing.recommendations.slice(0, 3).map((r, i) => (
              <Text key={`${r.name}-${i}`} style={styles.compRow}>
                • {r.name}: {r.reason} ({r.speed} speed, {r.fee} fees)
              </Text>
            ))
          ) : (
            <Text style={styles.compRow}>• Seller channel suggestions will appear after valuation match confidence improves.</Text>
          )}
          {data?.pricing?.sellTime ? (
            <Text style={styles.compRow}>
              • Estimated sale time: {data.pricing.sellTime.text} ({data.pricing.sellTime.speed} speed).
            </Text>
          ) : null}
          <Text style={styles.vehicleSectionTitle}>Timeline</Text>
          <View style={styles.vehicleTimelineWrap}>
            {vehicleTimeline.map((event, idx) => (
              <View key={`${event.title}-${idx}`} style={styles.vehicleTimelineRow}>
                <View
                  style={[
                    styles.vehicleTimelineDot,
                    event.tone === "good"
                      ? styles.vehicleTimelineDotGood
                      : event.tone === "warn"
                      ? styles.vehicleTimelineDotWarn
                      : event.tone === "bad"
                      ? styles.vehicleTimelineDotBad
                      : styles.vehicleTimelineDotNeutral,
                  ]}
                />
                <View style={styles.vehicleTimelineContent}>
                  <Text style={styles.vehicleTimelineTitle}>{event.title}</Text>
                  <Text style={styles.vehicleTimelineText}>{event.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.row, isCompact && styles.rowStack]}>
            <Pressable style={styles.reportActionPrimary} onPress={() => pushPublicRoute(router, "/history")}>
              <Text style={styles.reportActionPrimaryText}>Save and Open Collection</Text>
            </Pressable>
            <Pressable style={styles.reportActionBtn} onPress={shareReport}>
              <Text style={styles.reportActionText}>Share Report</Text>
            </Pressable>
          </View>

          {vehicleStatus?.checkedAt ? (
            <Text style={styles.metaText}>{`Checked: ${new Date(vehicleStatus.checkedAt).toLocaleString()}`}</Text>
          ) : null}
        </View>
      ) : null}
      {showResultDetails && vehicleStatusError ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>UK Vehicle Status</Text>
          <Text style={styles.compRow}>{vehicleStatusError}</Text>
          {vehicleStatusError.includes("DVLA API key was rejected") ? (
            <Text style={styles.metaText}>Fix: update `DVLA_VEHICLE_API_KEY` in `/Users/abbiemaytum/ValueVision/backend/.env`, then restart backend.</Text>
          ) : null}
        </View>
      ) : null}

      {showResultDetails && data?.pricing?.comps?.length ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>{data?.pricing?.ok ? "Matched comps" : "Closest comps found"}</Text>
          {(showAllComps ? data.pricing.comps : data.pricing.comps.slice(0, 5)).map((c, i) => (
            <Text key={i} style={styles.compRow}>
              • {c.price || "n/a"} - {c.title}
            </Text>
          ))}
          {data.pricing.comps.length > 5 ? (
            <Pressable style={styles.linkBtn} onPress={() => setShowAllComps((v) => !v)}>
              <Text style={styles.linkBtnText}>
                {showAllComps ? "Show top verified comps only" : `Show all comps (${data.pricing.comps.length})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showResultDetails && effectiveCategory !== "vehicle" && data?.pricing?.recommendations?.length ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Where to sell</Text>
          {data.pricing.recommendations.map((r, i) => (
            <Text key={`${r.name}-${i}`} style={styles.compRow}>
              • {r.name} ({r.speed} speed / {r.fee} fees): {r.reason}
            </Text>
          ))}
        </View>
      ) : null}

      {showResultDetails && effectiveCategory !== "vehicle" && data?.pricing?.sellTime ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Estimated time to sell</Text>
          <Text style={styles.compRow}>
            • {data.pricing.sellTime.text} ({data.pricing.sellTime.speed} speed)
          </Text>
        </View>
      ) : null}

      {showResultDetails && data?.pricing?.profit ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Profit snapshot</Text>
          <Text style={styles.compRow}>• Buy price: {formatMoney(data.pricing.profit.buyPrice, activeCurrencySymbol, 2)}</Text>
          {typeof data.pricing.profit.expectedProfit === "number" ? (
            <Text style={styles.compRow}>• Expected profit: {formatMoney(data.pricing.profit.expectedProfit, activeCurrencySymbol, 2)}</Text>
          ) : null}
          {typeof data.pricing.profit.expectedMarginPct === "number" ? (
            <Text style={styles.compRow}>• Expected margin: {data.pricing.profit.expectedMarginPct.toFixed(1)}%</Text>
          ) : null}
        </View>
      ) : null}

      {showResultDetails && data?.pricing?.listingAssistant ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Listing assistant</Text>
          <Text style={styles.compRow}>• Title: {data.pricing.listingAssistant.suggestedTitle}</Text>
          <Text style={styles.compRow}>• Start price: {data.pricing.listingAssistant.suggestedStartPrice}</Text>
          <Text style={styles.compRow}>• Suggested range: {data.pricing.listingAssistant.suggestedRange}</Text>
          {data.pricing.listingAssistant.bulletPoints.map((b, i) => (
            <Text key={`${b}-${i}`} style={styles.compRow}>• {b}</Text>
          ))}
          <Text style={styles.compRow}>• Tip: {data.pricing.listingAssistant.listingTip}</Text>
        </View>
      ) : null}

      {showResultDetails && tinyMvp && data?.pricing ? (
        <View style={styles.compsCard}>
          <Text style={styles.bold}>Saved automatically</Text>
          <Text style={styles.compRow}>• This scan was added to your Collection.</Text>
          <View style={styles.row}>
            <Button title="Open Collection" onPress={() => pushPublicRoute(router, "/history")} />
          </View>
        </View>
      ) : null}

      <Modal
        visible={showQuickDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowQuickDetailsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.quickDetailsModalCard}>
            <Text style={styles.modalTitle}>
              {isHoldResult || lowTrustEstimate ? "Improve This Valuation" : "Optional Details"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {isHoldResult || lowTrustEstimate
                ? "Add the details you can see. Leave anything unknown blank."
                : "Only add these if you want to tighten the price."}
            </Text>
            <ScrollView contentContainerStyle={styles.quickDetailsModalContent}>
              <View style={styles.fieldCard}>
                <Text style={styles.fieldTitle}>What item is this? (optional)</Text>
                <TextInput
                  value={itemQuery}
                  onChangeText={setItemQuery}
                  placeholder={itemQueryPlaceholder}
                  autoCapitalize="none"
                  placeholderTextColor={AppTheme.textSecondary}
                  style={styles.inputCompact}
                />
              </View>
              <View style={styles.fieldCard}>
                <Text style={styles.fieldTitle}>Condition notes (optional)</Text>
                <TextInput
                  value={conditionNotes}
                  onChangeText={setConditionNotes}
                  placeholder="Any damage, wear, missing parts"
                  autoCapitalize="sentences"
                  placeholderTextColor={AppTheme.textSecondary}
                  style={styles.inputCompact}
                />
              </View>
              {effectiveCategory === "collectible" ? (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldTitle}>Set, year or maker (optional)</Text>
                  <TextInput
                    value={collectibleSet}
                    onChangeText={setCollectibleSet}
                    placeholder="e.g. Base Set 1999, Royal Mint, maker's mark"
                    placeholderTextColor={AppTheme.textSecondary}
                    style={styles.inputCompact}
                  />
                  <Text style={styles.fieldTitle}>Grade or condition label (optional)</Text>
                  <TextInput
                    value={collectibleGrade}
                    onChangeText={setCollectibleGrade}
                    placeholder="e.g. PSA 9, ungraded, circulated"
                    placeholderTextColor={AppTheme.textSecondary}
                    style={styles.inputCompact}
                  />
                </View>
              ) : null}
              {effectiveCategory === "electronics" ? (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldTitle}>Model and specification (optional)</Text>
                  <TextInput
                    value={techSpecs}
                    onChangeText={setTechSpecs}
                    placeholder="e.g. 256GB, model number, battery health"
                    placeholderTextColor={AppTheme.textSecondary}
                    style={styles.inputCompact}
                  />
                </View>
              ) : null}
              {shouldShowVehicleDetails ? (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldTitle}>Registration (optional)</Text>
                  <TextInput
                    value={vehicleReg}
                    onChangeText={setVehicleReg}
                    placeholder="AB12CDE"
                    autoCapitalize="characters"
                    placeholderTextColor={AppTheme.textSecondary}
                    style={styles.inputCompact}
                  />
                  <View style={styles.row}>
                    <Button
                      title={vehicleStatusLoading ? "Checking..." : "Check MOT & Tax"}
                      onPress={checkUkVehicleStatus}
                      disabled={vehicleStatusLoading}
                    />
                  </View>
                  {vehicleStatusError ? <Text style={styles.fieldHelp}>{vehicleStatusError}</Text> : null}
                </View>
              ) : null}
              {recentQueryChips.length ? (
                <View style={styles.recentChipWrap}>
                  {recentQueryChips.map((chip) => (
                    <Pressable key={chip} style={styles.recentChip} onPress={() => setItemQuery(chip)}>
                      <Text numberOfLines={1} style={styles.recentChipText}>{chip}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowQuickDetailsModal(false);
                if ((isHoldResult || lowTrustEstimate) && imageUri) {
                  void analyze(imageUri);
                }
              }}>
              <Text style={styles.modalCloseText}>
                {isHoldResult || lowTrustEstimate ? "Revalue Item" : "Save Details"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCategoryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCategoryModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Category</Text>
            <Text style={styles.modalSubtitle}>Pick what you are scanning right now.</Text>
            <ScrollView contentContainerStyle={styles.modalGrid}>
              {SCAN_CATEGORY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, category === option.value && styles.modalOptionActive]}
                  onPress={() => {
                    setCategory(option.value);
                    if (option.value === "vehicle") setRegion("uk");
                    setShowCategoryModal(false);
                  }}>
                  <Text style={styles.modalOptionIcon}>{option.icon}</Text>
                  <View style={styles.modalOptionBody}>
                    <Text style={styles.modalOptionTitle}>{option.label}</Text>
                    <Text style={styles.modalOptionText}>{option.description}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowCategoryModal(false)}>
              <Text style={styles.modalCloseText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function parsePresetCategory(raw: unknown): ScanCategory | undefined {
  const category = String(raw || "").toLowerCase();
  const allowed = new Set(["auto", "vehicle", "electronics", "fashion", "home", "collectible", "tools", "general"]);
  if (!allowed.has(category)) return undefined;
  return category as ScanCategory;
}

export default function DefaultScanScreen() {
  const params = useLocalSearchParams<{ mode?: string; category?: string }>();
  const mode = String(params.mode || "").toLowerCase();
  const presetCategory = parsePresetCategory(params.category);
  const fullCarOnly = mode === "fullcar";
  const vehicleOnly = mode === "cars" || fullCarOnly || presetCategory === "vehicle";
  const itemsOnly = mode === "items";
  const aiOnly = mode === "ai";
  const forceAdvanced = mode === "category";

  let presetTitle: string | undefined;
  let presetSubtitle: string | undefined;
  if (fullCarOnly) {
    presetTitle = "Full Car Check";
    presetSubtitle = `Complete vehicle checks and valuation. Monthly access ${formatGbp(
      LaunchPricing.monthlySubscriptionGbp
    )}/month. Single check ${formatGbp(
      LaunchPricing.fullCarCheckSingleGbp
    )} or ${LaunchPricing.fullCarCheckBundleChecks} checks for ${formatGbp(LaunchPricing.fullCarCheckBundleGbp)}.`;
  } else if (vehicleOnly) {
    presetTitle = "Car Mode";
    presetSubtitle = FeatureFlags.carChecksAvailable
      ? "Scan number plates, pull MOT/tax checks, and value vehicles in one flow."
      : FeatureFlags.carChecksStatusLabel;
  } else if (itemsOnly) {
    presetTitle = "Anything Mode";
    presetSubtitle = "Scan non-car items and get a fast valuation range.";
  } else if (aiOnly) {
    presetTitle = "AI Gen 2 Preview";
    presetSubtitle = "Photo identification is coming in the next update. Use Anything Mode for launch scans today.";
  } else if (presetCategory === "collectible") {
    presetTitle = "Collectibles Scanner";
    presetSubtitle = "Collectibles only. Focus on condition, rarity, and resale range.";
  } else if (presetCategory === "electronics") {
    presetTitle = "Technology Scanner";
    presetSubtitle = "Technology only. Scan phones, laptops, consoles, and gadgets for fast valuation.";
  } else if (forceAdvanced) {
    presetTitle = "Category Scanner";
    presetSubtitle = "Pick a category and scan with guided details for better pricing accuracy.";
  }

  const modeSessionKey = [
    mode || "default",
    vehicleOnly ? "vehicle" : itemsOnly ? "items" : aiOnly ? "ai" : presetCategory || "none",
    fullCarOnly ? "fullcar" : "standard",
    forceAdvanced ? "advanced" : "quick",
  ].join(":");

  return (
    <ScanScreen
      key={modeSessionKey}
      vehicleOnly={vehicleOnly}
      itemsOnly={itemsOnly}
      fullCarOnly={fullCarOnly}
      presetCategory={vehicleOnly ? "vehicle" : itemsOnly ? "auto" : aiOnly ? "auto" : presetCategory}
      presetTitle={presetTitle}
      presetSubtitle={presetSubtitle}
      forceAdvanced={forceAdvanced}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 18,
    gap: 12,
    backgroundColor: AppTheme.bg,
  },
  screenCompact: {
    padding: 12,
    gap: 10,
  },
  heroCard: {
    backgroundColor: "#081a30",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#123052",
    padding: 16,
    gap: 8,
    shadowColor: "#030d1a",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroCardCompact: {
    padding: 12,
    gap: 6,
  },
  kicker: {
    color: "#8db8ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f8fbff",
  },
  titleCompact: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 15,
    color: "#bfd0e8",
    lineHeight: 21,
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  connectionBanner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 1,
  },
  connectionBannerGood: {
    borderColor: "#2db7a6",
    backgroundColor: "#e6fbf6",
  },
  connectionBannerWarn: {
    borderColor: "#d17a00",
    backgroundColor: "#fff6e8",
  },
  connectionBannerNeutral: {
    borderColor: "#335780",
    backgroundColor: "#edf4ff",
  },
  connectionBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: AppTheme.textPrimary,
  },
  connectionBannerText: {
    fontSize: 11,
    color: AppTheme.textSecondary,
  },
  carsModeCta: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  carsModeCtaText: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  fullCarPriceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fbbf24",
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  fullCarPriceTitle: {
    color: "#fde68a",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  fullCarPriceText: {
    color: "#fff7d1",
    fontSize: 13,
    fontWeight: "700",
  },
  fullCarPriceMeta: {
    color: "#f6e6b0",
    fontSize: 11,
    marginTop: 2,
  },
  fullCarPriceMetaWarn: {
    color: "#f59e0b",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "800",
  },
  fullCarPriceCta: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fde68a",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fullCarPriceCtaText: {
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: "900",
  },
  miniLaneBtn: {
    flexGrow: 1,
    flexBasis: "47%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d4a70",
    backgroundColor: "#112947",
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  miniLaneBtnActive: {
    borderColor: "#5eead4",
    backgroundColor: "#15a189",
  },
  miniLaneBtnComing: {
    opacity: 0.82,
    borderColor: "#4b6384",
    backgroundColor: "#1a314d",
  },
  miniLaneBtnText: {
    color: "#f8fbff",
    fontWeight: "800",
    fontSize: 13,
  },
  miniLaneBtnSubText: {
    color: "#b2c6e4",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  miniLaneBtnTextActive: {
    color: "#06251f",
  },
  quickCategoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  quickCategoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2d4a70",
    backgroundColor: "#112947",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  quickCategoryChipActive: {
    borderColor: "#5eead4",
    backgroundColor: "#0f766e",
  },
  quickCategoryChipText: {
    color: "#f8fbff",
    fontSize: 12,
    fontWeight: "800",
  },
  quickCategoryChipTextActive: {
    color: "#d8fffa",
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 8,
  },
  heroMetaRowCompact: {
    gap: 6,
  },
  heroMetaChip: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#112947",
    borderWidth: 1,
    borderColor: "#2d4a70",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  heroMetaLabel: {
    color: "#97b3d9",
    fontSize: 11,
    fontWeight: "600",
  },
  heroMetaValue: {
    color: "#f8fbff",
    fontSize: 12,
    fontWeight: "800",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeRowCompact: {
    gap: 6,
  },
  modeChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    paddingVertical: 11,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppTheme.bgAlt,
  },
  modeChipActive: {
    backgroundColor: AppTheme.accent,
    borderColor: AppTheme.accent,
  },
  modeChipText: {
    fontWeight: "700",
    color: AppTheme.textSecondary,
    fontSize: 13,
  },
  modeChipTextActive: {
    color: "#04130f",
  },
  presetCard: {
    backgroundColor: AppTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    padding: 10,
    gap: 8,
  },
  presetTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  presetChip: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  presetChipTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 12,
  },
  presetChipText: {
    color: AppTheme.textSecondary,
    fontSize: 11,
  },
  proCard: {
    backgroundColor: AppTheme.surface,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 4,
  },
  proCardCompact: {
    padding: 10,
  },
  proTitle: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  proPrice: {
    color: AppTheme.textPrimary,
    fontSize: 24,
    fontWeight: "900",
  },
  proPriceCompact: {
    fontSize: 20,
  },
  proText: {
    color: AppTheme.textSecondary,
    fontSize: 13,
  },
  proFinePrint: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  proCardCta: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: AppTheme.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: "center",
  },
  proCardCtaText: {
    color: "#04130f",
    fontSize: 12,
    fontWeight: "800",
  },
  card: {
    gap: 8,
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  cardTitle: {
    fontWeight: "800",
    fontSize: 16,
    color: AppTheme.textPrimary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#94A3B8",
    borderRadius: 10,
    padding: 11,
    backgroundColor: AppTheme.surface,
    color: AppTheme.textPrimary,
    fontSize: 15,
  },
  fieldCard: {
    borderRadius: 10,
    backgroundColor: AppTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    padding: 10,
    gap: 4,
  },
  fieldTitle: {
    fontWeight: "700",
    color: AppTheme.textPrimary,
    fontSize: 13,
  },
  fieldHelp: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  categoryPickerBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: AppTheme.accent,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  categoryPickerBtnText: {
    color: "#04130f",
    fontWeight: "700",
    fontSize: 12,
  },
  inputCompact: {
    borderWidth: 1.5,
    borderColor: "#94A3B8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: AppTheme.surface,
    color: AppTheme.textPrimary,
    fontSize: 15,
  },
  recentChipWrap: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  recentChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.bgAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: "center",
    maxWidth: "100%",
  },
  recentChipText: {
    color: AppTheme.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  advancedToggle: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: AppTheme.surfaceSoft,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  advancedToggleText: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  laneRow: {
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  rowStack: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionLabel: {
    fontWeight: "700",
    marginTop: 4,
    color: AppTheme.textSecondary,
  },
  flex1: {
    flex: 1,
  },
  liveCard: {
    gap: 8,
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  liveCameraWrap: {
    height: 240,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  liveCameraWrapCompact: {
    height: 200,
  },
  liveCameraWrapLandscape: {
    height: 180,
  },
  camera: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  targetBox: {
    width: 220,
    height: 160,
    borderWidth: 2,
    borderColor: AppTheme.accent,
    borderRadius: 14,
    backgroundColor: "rgba(20,200,184,0.08)",
  },
  valueBadge: {
    position: "absolute",
    top: 20,
    backgroundColor: "rgba(13, 19, 33, 0.86)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  valueBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
  },
  itemBadge: {
    position: "absolute",
    bottom: 14,
    left: 12,
    right: 12,
    backgroundColor: "rgba(17, 26, 45, 0.86)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  liveHelp: {
    color: AppTheme.textSecondary,
  },
  loadingCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 8,
  },
  loadingCancelBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c5cfe2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  loadingCancelText: {
    color: AppTheme.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  loadingSkeletonWrap: {
    marginTop: 2,
    gap: 8,
  },
  loadingSkeletonLg: {
    height: 48,
    borderRadius: 10,
    backgroundColor: AppTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  loadingSkeletonRow: {
    flexDirection: "row",
    gap: 8,
  },
  loadingSkeletonSm: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    backgroundColor: AppTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  previewImage: {
    width: "100%",
    height: 260,
    borderRadius: 12,
    backgroundColor: "#ddd",
  },
  pricingCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 8,
    shadowColor: "#17233d",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  resultHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultHeadTitle: {
    flex: 1,
    color: AppTheme.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  resultStatusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfd6fb",
    backgroundColor: "#edf4ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultStatusPillText: {
    color: "#1e3a8a",
    fontSize: 11,
    fontWeight: "700",
  },
  resultValueRow: {
    flexDirection: "row",
    gap: 8,
  },
  resultValueTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  resultValueTileFeatured: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2db7a6",
    backgroundColor: "#e6fbf6",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  resultValueLabel: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultValueText: {
    color: AppTheme.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  resultValueTextFeatured: {
    color: "#0b3f39",
    fontSize: 20,
    fontWeight: "900",
  },
  resultSummaryText: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  valuationContextCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfd6fb",
    backgroundColor: "#edf4ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  valuationContextTitle: {
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "800",
  },
  valuationContextText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 17,
  },
  retailContextCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9d6e8",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  retailContextTitle: {
    color: AppTheme.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  retailContextText: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  detailsToggleBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailsToggleText: {
    color: AppTheme.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  confChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 28,
    borderWidth: 1,
  },
  confHigh: {
    backgroundColor: "#e8f7ed",
    borderColor: "#2f9d74",
  },
  confMid: {
    backgroundColor: "#fff7e6",
    borderColor: "#b77b00",
  },
  confLow: {
    backgroundColor: "#ffecec",
    borderColor: "#a03031",
  },
  confText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  captureGuideCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b45309",
    backgroundColor: "#fff7ed",
    padding: 12,
    gap: 8,
  },
  trustCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  trustCardInline: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    gap: 4,
  },
  trustCardInlineTitle: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  trustCardInlineText: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  trustSafe: {
    backgroundColor: "#ecfbf3",
    borderColor: "#53b37f",
  },
  trustCaution: {
    backgroundColor: "#fff9e8",
    borderColor: "#d6b34c",
  },
  trustNeedsData: {
    backgroundColor: "#fff0f0",
    borderColor: "#cf6566",
  },
  categoryInsightCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  warnCardHold: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f0b13f",
    backgroundColor: "#fff4dd",
    padding: 10,
    gap: 4,
  },
  warnCardCaution: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6b34c",
    backgroundColor: "#fff9e8",
    padding: 10,
    gap: 4,
  },
  warnCardLowTrust: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#9f1239",
    backgroundColor: "#ffe4e6",
    padding: 10,
    gap: 4,
  },
  warnTitle: {
    color: "#5a3a00",
    fontWeight: "800",
    fontSize: 13,
  },
  warnText: {
    color: "#715014",
    fontSize: 12,
  },
  warnListItem: {
    color: "#6a4a0c",
    fontSize: 12,
  },
  warnAction: {
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: AppTheme.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  warnActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  warnActionSecondary: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b4831e",
    backgroundColor: "#fff9e8",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  warnActionText: {
    color: "#04130f",
    fontWeight: "700",
    fontSize: 12,
  },
  warnActionSecondaryText: {
    color: "#7a560a",
    fontWeight: "700",
    fontSize: 12,
  },
  warnActionUtility: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  snapshotRow: {
    flexDirection: "row",
    gap: 8,
  },
  snapshotRowCompact: {
    flexDirection: "column",
    gap: 6,
  },
  snapshotTile: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: AppTheme.surface,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 2,
  },
  snapshotLabel: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  snapshotValue: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  compsCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  bestChannelCard: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    padding: 10,
    gap: 5,
  },
  bestChannelTitle: {
    color: AppTheme.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  bestChannelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bestChannelRowName: {
    width: 86,
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  bestChannelTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: AppTheme.surfaceSoft,
    overflow: "hidden",
  },
  bestChannelFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: AppTheme.accent,
  },
  bestChannelScore: {
    width: 28,
    textAlign: "right",
    color: AppTheme.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  linkBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  linkBtnText: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  vehicleReportCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: AppTheme.bgAlt,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 10,
    shadowColor: "#17233d",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  vehicleTitleWrap: {
    flex: 1,
    gap: 2,
  },
  vehicleReportEyebrow: {
    color: AppTheme.purpleDeep,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  vehicleReportSub: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  vehicleScorePanel: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  vehicleScorePanelClear: {
    borderColor: "#2f9d74",
    backgroundColor: "#eafaf2",
  },
  vehicleScorePanelReview: {
    borderColor: "#b77b00",
    backgroundColor: "#fff7e6",
  },
  vehicleScorePanelRisk: {
    borderColor: "#a03031",
    backgroundColor: "#fff0f0",
  },
  vehicleScoreRing: {
    width: 86,
    height: 86,
    borderRadius: 999,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppTheme.white,
  },
  vehicleScoreRingClear: {
    borderColor: "#2f9d74",
  },
  vehicleScoreRingReview: {
    borderColor: "#b77b00",
  },
  vehicleScoreRingRisk: {
    borderColor: "#a03031",
  },
  vehicleScoreRingValue: {
    fontSize: 26,
    color: "#000000",
    fontWeight: "900",
    lineHeight: 28,
  },
  vehicleScoreRingLabel: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "700",
  },
  vehicleScoreCopy: {
    flex: 1,
    minWidth: 210,
    gap: 4,
  },
  vehicleScoreTitle: {
    fontSize: 12,
    color: "#000000",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vehicleScoreText: {
    fontSize: 12,
    color: "#000000",
    fontWeight: "600",
    lineHeight: 17,
  },
  vehicleFlagsRow: {
    marginTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  vehicleFlagChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  vehicleFlagGood: {
    borderColor: "#65c39c",
    backgroundColor: "#f1fcf6",
  },
  vehicleFlagWarn: {
    borderColor: "#d5aa4b",
    backgroundColor: "#fff8e8",
  },
  vehicleFlagBad: {
    borderColor: "#cf6b6c",
    backgroundColor: "#fff2f2",
  },
  vehicleFlagText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "700",
  },
  vehicleTimelineWrap: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    padding: 10,
  },
  vehicleTimelineRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  vehicleTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  vehicleTimelineDotGood: {
    backgroundColor: "#2f9d74",
  },
  vehicleTimelineDotWarn: {
    backgroundColor: "#b77b00",
  },
  vehicleTimelineDotBad: {
    backgroundColor: "#a03031",
  },
  vehicleTimelineDotNeutral: {
    backgroundColor: "#64748b",
  },
  vehicleTimelineContent: {
    flex: 1,
    gap: 1,
  },
  vehicleTimelineTitle: {
    color: AppTheme.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  vehicleTimelineText: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  vehicleSectionTitle: {
    marginTop: 4,
    fontSize: 13,
    color: AppTheme.textPrimary,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  vehicleReportHeader: {
    justifyContent: "space-between",
  },
  vehicleReportTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: AppTheme.textPrimary,
  },
  vehicleRegPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#14121c",
    borderWidth: 1,
    borderColor: "#2f273d",
  },
  vehicleRegPillText: {
    color: "#f5ecff",
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  vehicleIdentityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleValueGrid: {
    flexDirection: "row",
    gap: 8,
  },
  vehicleValueTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 70,
    gap: 2,
  },
  vehicleValueTileFeatured: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2db7a6",
    backgroundColor: "#e6fbf6",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 70,
    gap: 2,
  },
  vehicleIdentityTile: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  vehicleIdentityLabel: {
    fontSize: 11,
    color: AppTheme.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  vehicleIdentityValue: {
    fontSize: 14,
    color: AppTheme.textPrimary,
    fontWeight: "800",
  },
  vehicleIdentityValueFeatured: {
    fontSize: 16,
    color: "#0b3f39",
    fontWeight: "900",
  },
  reportActionPrimary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.accentDeep,
    backgroundColor: AppTheme.accent,
    minHeight: 46,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reportActionPrimaryText: {
    color: "#04130f",
    fontSize: 13,
    fontWeight: "800",
  },
  reportActionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    minHeight: 46,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reportActionText: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  vehicleStatusChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleStatusChip: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  vehicleChipGood: {
    borderColor: "#0f8a5f",
    backgroundColor: "#eafaf2",
  },
  vehicleChipWarn: {
    borderColor: "#b77b00",
    backgroundColor: "#fff7e6",
  },
  vehicleChipAlert: {
    borderColor: "#a03031",
    backgroundColor: "#fff0f0",
  },
  vehicleChipNeutral: {
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
  },
  vehicleStatusChipTitle: {
    fontSize: 11,
    color: "#000000",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  vehicleStatusChipValue: {
    fontSize: 13,
    color: "#000000",
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,20,0.56)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    maxHeight: "86%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.bgAlt,
    padding: 12,
    gap: 10,
  },
  quickDetailsModalCard: {
    maxHeight: "78%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.bgAlt,
    padding: 12,
    gap: 10,
  },
  quickDetailsModalContent: {
    gap: 8,
    paddingBottom: 8,
  },
  modalTitle: {
    color: AppTheme.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  modalGrid: {
    gap: 8,
    paddingBottom: 8,
  },
  modalOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  modalOptionActive: {
    borderColor: AppTheme.accent,
    backgroundColor: AppTheme.surfaceSoft,
  },
  modalOptionIcon: {
    fontSize: 13,
    color: AppTheme.textPrimary,
    fontWeight: "800",
    minWidth: 40,
  },
  modalOptionBody: {
    flex: 1,
  },
  modalOptionTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  modalOptionText: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  modalCloseBtn: {
    borderRadius: 10,
    backgroundColor: AppTheme.accent,
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  modalCloseText: {
    color: "#04130f",
    fontWeight: "800",
    fontSize: 13,
  },
  bold: {
    fontWeight: "700",
    color: AppTheme.textPrimary,
  },
  metaText: {
    marginTop: 6,
    color: AppTheme.textSecondary,
  },
  compRow: {
    marginBottom: 6,
    color: AppTheme.textSecondary,
  },
  buttonGrid: {
    gap: 10,
  },
  primaryActionLead: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.bgAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  primaryActionLeadTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 14,
  },
  primaryActionLeadText: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  quickBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: AppTheme.surface,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 3,
    shadowColor: "#111827",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  voiceBtnActive: {
    borderColor: AppTheme.accentDeep,
    backgroundColor: "#d6faf6",
  },
  quickBtnPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: AppTheme.accent,
    borderWidth: 1,
    borderColor: AppTheme.accent,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 3,
    shadowColor: "#0b3f39",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  quickBtnDisabled: {
    opacity: 0.6,
  },
  quickBtnTitle: {
    fontWeight: "800",
    color: AppTheme.textPrimary,
    fontSize: 15,
  },
  quickBtnSub: {
    color: AppTheme.textSecondary,
    fontSize: 13,
  },
  quickBtnTitlePrimary: {
    fontWeight: "800",
    color: "#04130f",
    fontSize: 15,
  },
  quickBtnSubPrimary: {
    color: "#083b35",
    fontSize: 13,
  },
  nextStepCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfd6fb",
    backgroundColor: "#edf4ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  nextStepTitle: {
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  nextStepText: {
    color: "#2a4376",
    fontSize: 12,
  },
});
