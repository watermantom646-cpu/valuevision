import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { resolveApiBase } from "@/lib/api-base";
import { loadBillingState } from "@/lib/billing-state";
import { loadCarCheckCredits } from "@/lib/car-check-credits";
import { loadScanAccess, type ScanAccess } from "@/lib/scan-access";
import { loadHistory } from "@/lib/scan-history";

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 980;

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [monthlyAccessLabel, setMonthlyAccessLabel] = useState("Checking monthly access...");
  const [storedCredits, setStoredCredits] = useState(0);
  const [scanAccess, setScanAccess] = useState<ScanAccess | null>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    (async () => {
      try {
        const [history, health, billingState, credits, access] = await Promise.all([
          loadHistory(),
          fetch(`${resolveApiBase()}/health`).then((r) => r.json()).catch(() => null),
          loadBillingState(),
          loadCarCheckCredits(),
          loadScanAccess(),
        ]);
        if (!mounted) return;
        setLastQuery(String(history[0]?.query || ""));
        setBackendOk(Boolean(health?.ok));
        setMonthlyAccessLabel(
          billingState.monthlyUnlocked
            ? "Unlimited Anything Mode scans active"
            : "Starter access active"
        );
        setStoredCredits(credits.credits);
        setScanAccess(access);
      } catch {
        if (!mounted) return;
        setBackendOk(false);
        setMonthlyAccessLabel("Monthly access status unavailable");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []));

  const backendLabel = backendOk == null ? "Preparing scanner..." : backendOk ? "Ready to scan" : "Connection issue";

  return (
    <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />

          <Text style={styles.kicker}>VALUEVISION</Text>
          <Text style={styles.title}>Know What It Is. Know What It&apos;s Worth.</Text>
          <Text style={styles.subtitle}>
            One scan reveals item identity, resale value range, and next best selling route across collectibles, cards,
            coins, tech, tools, fashion, and home goods.
          </Text>

          <Pressable style={styles.primaryMode} onPress={() => router.push("/(tabs)/scan?mode=items" as any)}>
            <Text style={styles.primaryModeTitle}>Anything Mode</Text>
            <Text style={styles.primaryModeText}>
              Scan Pokemon cards, coins, antiques, vintage items, tools, tech, fashion and more
            </Text>
          </Pressable>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, !FeatureFlags.carChecksAvailable && styles.modeBtnMuted]}
              disabled={!FeatureFlags.carChecksAvailable}
              onPress={() => router.push("/(tabs)/scan?mode=cars" as any)}>
              <Text style={styles.modeBtnTitle}>Car Mode</Text>
              <Text style={styles.modeBtnText}>
                {FeatureFlags.carChecksAvailable ? "Plate, MOT and value checks" : "Temporarily unavailable"}
              </Text>
            </Pressable>
            <Pressable style={styles.modeBtn} onPress={() => router.push("/(tabs)/history" as any)}>
              <Text style={styles.modeBtnTitle}>My Collection</Text>
              <Text style={styles.modeBtnText}>Saved scans and valuations</Text>
            </Pressable>
          </View>

          <View style={styles.priceStrip}>
            <Text style={styles.priceStripText}>
              {`Free download • ${LaunchPricing.freeStarterScans} starter scans • Monthly access ${formatGbp(LaunchPricing.monthlySubscriptionGbp)}/month`}
            </Text>
          </View>
          <View style={styles.oneOffCard}>
            <Text style={styles.oneOffTitle}>Try before you pay</Text>
            <Text style={styles.oneOffLine}>
              {scanAccess?.unlimited
                ? "Unlimited Anything Mode scans are active on this device."
                : `${scanAccess?.remaining ?? LaunchPricing.freeStarterScans} of ${LaunchPricing.freeStarterScans} free Anything Mode scans remaining.`}
            </Text>
          </View>
          <View style={styles.howCard}>
            <Text style={styles.howTitle}>What people can scan</Text>
            <Text style={styles.howLine}>Pokemon cards, graded cards, and collectibles</Text>
            <Text style={styles.howLine}>Coins, notes, medals, and vintage keepsakes</Text>
            <Text style={styles.howLine}>Tools, tech, fashion, books, furniture, and mixed resale finds</Text>
          </View>
          <View style={styles.subscriptionCard}>
            <Text style={styles.subscriptionTitle}>{LaunchPricing.monthlySubscriptionName}</Text>
            <Text style={styles.subscriptionPrice}>{`${formatGbp(LaunchPricing.monthlySubscriptionGbp)} / month`}</Text>
            <Text style={styles.subscriptionText}>Unlimited Anything Mode scans, Live Mode, and continued access to valuation tools.</Text>
            <Text style={styles.subscriptionMeta}>{monthlyAccessLabel}</Text>
            <Pressable style={styles.subscriptionCta} onPress={() => router.push("/paywall" as any)}>
              <Text style={styles.subscriptionCtaText}>View Billing Status</Text>
            </Pressable>
          </View>
          <View style={styles.oneOffCard}>
            <Text style={styles.oneOffTitle}>Car checks status</Text>
            <Text style={styles.oneOffLine}>
              {FeatureFlags.carChecksAvailable
                ? `Car valuation ${formatGbp(LaunchPricing.carValuationFromGbp)} • Full check ${formatGbp(LaunchPricing.fullCarCheckSingleGbp)} • ${storedCredits} checks available`
                : FeatureFlags.carChecksStatusLabel}
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
  liveBuildBanner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fbbf24",
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  liveBuildBannerTitle: {
    color: "#fde68a",
    fontSize: 14,
    fontWeight: "900",
  },
  liveBuildBannerText: {
    color: "#fde68a",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
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
  subscriptionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#5eead4",
    backgroundColor: "rgba(20, 184, 166, 0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  subscriptionTitle: {
    color: "#ccfbf1",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  subscriptionPrice: {
    color: "#f8fbff",
    fontSize: 20,
    fontWeight: "900",
  },
  subscriptionText: {
    color: "#b9f5ea",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  subscriptionMeta: {
    color: "#ccfbf1",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  subscriptionCta: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subscriptionCtaText: {
    color: "#134e4a",
    fontSize: 12,
    fontWeight: "900",
  },
  oneOffCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#335780",
    backgroundColor: "#0d2541",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  oneOffTitle: {
    color: "#f5fbff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  oneOffLine: {
    color: "#d7e8ff",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
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
