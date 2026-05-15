import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { resolveApiBase } from "@/lib/api-base";
import { loadHistory } from "@/lib/scan-history";

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 980;

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [history, health] = await Promise.all([
          loadHistory(),
          fetch(`${resolveApiBase()}/health`).then((r) => r.json()).catch(() => null),
        ]);
        if (!mounted) return;
        setLastQuery(String(history[0]?.query || ""));
        setBackendOk(Boolean(health?.ok));
      } catch {
        if (!mounted) return;
        setBackendOk(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const backendLabel = backendOk == null ? "Preparing scanner..." : backendOk ? "Ready to scan" : "Connection issue";

  return (
    <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />

          <Text style={styles.kicker}>VALUEVISION</Text>
          <Text style={styles.title}>Know What It Is. Know What It&apos;s Worth.</Text>
          <Text style={styles.subtitle}>One scan reveals item identity, resale value range, and next best selling route.</Text>

          <Pressable style={styles.primaryMode} onPress={() => router.push("/(tabs)/scan?mode=items" as any)}>
            <Text style={styles.primaryModeTitle}>Anything Mode</Text>
            <Text style={styles.primaryModeText}>Scan items, tools, tech, clothes, books, coins and more</Text>
          </Pressable>

          <View style={styles.modeRow}>
            <Pressable style={styles.modeBtn} onPress={() => router.push("/(tabs)/scan?mode=cars" as any)}>
              <Text style={styles.modeBtnTitle}>Car Mode</Text>
              <Text style={styles.modeBtnText}>Plate, MOT and value checks</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, styles.modeBtnMuted]} disabled>
              <Text style={styles.modeBtnTitle}>AI Photo ID</Text>
              <Text style={styles.modeBtnText}>Coming Gen 2</Text>
            </Pressable>
          </View>

          <View style={styles.priceStrip}>
            <Text style={styles.priceStripText}>
              {`Item scan from ${formatGbp(LaunchPricing.aiScanFromGbp)} • Car valuation from ${formatGbp(LaunchPricing.carValuationFromGbp)} • Full car check ${formatGbp(LaunchPricing.fullCarCheckSingleGbp)}`}
            </Text>
          </View>
          <Text style={styles.marketContextText}>Values are shown as current resale estimates, with new-retail context where available.</Text>

          <View style={styles.howCard}>
            <Text style={styles.howTitle}>How it works</Text>
            <Text style={styles.howLine}>1. Take or upload one photo.</Text>
            <Text style={styles.howLine}>2. We detect the item or registration automatically.</Text>
            <Text style={styles.howLine}>3. You get a valuation range and confidence instantly.</Text>
          </View>

          <Text
            style={[
              styles.backendText,
              backendOk === true ? styles.backendTextGood : backendOk === false ? styles.backendTextWarn : styles.backendTextNeutral,
            ]}>
            {backendLabel}
          </Text>
          {lastQuery ? <Text style={styles.lastScan}>Last scan: {lastQuery}</Text> : null}
        </View>

        <View style={styles.footerActions}>
          <Pressable style={styles.footerBtnPrimary} onPress={() => router.push("/(tabs)/scan?mode=items" as any)}>
            <Text style={styles.footerBtnPrimaryText}>Start Scanning</Text>
          </Pressable>
          <Pressable style={styles.footerBtn} onPress={() => router.push("/(tabs)/history" as any)}>
            <Text style={styles.footerBtnText}>Collection</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#eef3fa",
    padding: 16,
  },
  containerWide: {
    alignItems: "center",
    justifyContent: "center",
  },
  shell: {
    width: "100%",
    maxWidth: 980,
    gap: 12,
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#123052",
    backgroundColor: "#071a30",
    padding: 18,
    gap: 12,
    shadowColor: "#050d18",
    shadowOpacity: 0.26,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroGlowA: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 999,
    right: -90,
    top: -80,
    backgroundColor: "rgba(22, 163, 74, 0.25)",
  },
  heroGlowB: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    left: -80,
    bottom: -120,
    backgroundColor: "rgba(37, 99, 235, 0.26)",
  },
  kicker: {
    color: "#8db8ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: "#f8fbff",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    maxWidth: 760,
  },
  subtitle: {
    color: "#b9c8df",
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 760,
  },
  primaryMode: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#5eead4",
    backgroundColor: "#14b8a6",
    padding: 14,
    minHeight: 64,
    justifyContent: "center",
    gap: 4,
  },
  primaryModeTitle: {
    color: "#05231f",
    fontSize: 18,
    fontWeight: "900",
  },
  primaryModeText: {
    color: "#0f4039",
    fontSize: 12,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d4a70",
    backgroundColor: "#112947",
    padding: 12,
    minHeight: 62,
    justifyContent: "center",
    gap: 2,
  },
  modeBtnMuted: {
    opacity: 0.82,
    borderColor: "#4b6384",
    backgroundColor: "#1a314d",
  },
  modeBtnTitle: {
    color: "#f8fbff",
    fontSize: 15,
    fontWeight: "800",
  },
  modeBtnText: {
    color: "#b2c6e4",
    fontSize: 12,
  },
  priceStrip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#335780",
    backgroundColor: "#0d2541",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  priceStripText: {
    color: "#d7e8ff",
    fontSize: 12,
    fontWeight: "700",
  },
  marketContextText: {
    color: "#aac3e7",
    fontSize: 12,
    lineHeight: 17,
  },
  howCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#335780",
    backgroundColor: "#0d2541",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  howTitle: {
    color: "#f5fbff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  howLine: {
    color: "#c4d8f6",
    fontSize: 12,
    lineHeight: 17,
  },
  backendText: {
    fontSize: 12,
    fontWeight: "700",
  },
  backendTextGood: {
    color: "#5eead4",
  },
  backendTextWarn: {
    color: "#fde68a",
  },
  backendTextNeutral: {
    color: "#bfd0e8",
  },
  lastScan: {
    color: "#a8bddb",
    fontSize: 12,
    fontWeight: "600",
  },
  footerActions: {
    flexDirection: "row",
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  footerBtnText: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  footerBtnPrimary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.accentDeep,
    backgroundColor: AppTheme.accent,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  footerBtnPrimaryText: {
    color: "#04130f",
    fontSize: 13,
    fontWeight: "800",
  },
});
