import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { replacePublicRoute } from "@/lib/public-navigation";
import { loadScanAccess, type ScanAccess } from "@/lib/scan-access";
import { useValueVisionBilling } from "@/lib/use-valuevision-billing";

export default function PaywallScreen() {
  const router = useRouter();
  const [scanAccess, setScanAccess] = useState<ScanAccess | null>(null);
  const nativeBilling = useValueVisionBilling();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const access = await loadScanAccess();
      if (!mounted) return;
      setScanAccess(access);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!nativeBilling.billingState) return;
    void loadScanAccess().then(setScanAccess);
  }, [nativeBilling.billingState]);

  const busyLabel =
    nativeBilling.loading
      ? "Connecting to App Store billing..."
      : nativeBilling.restoring
        ? "Restoring past purchases..."
        : nativeBilling.purchasingSku
          ? `Starting ${nativeBilling.purchasingSku} purchase...`
          : "";
  const monthlyAvailable = nativeBilling.connected && Boolean(nativeBilling.catalog.monthly);
  const singleAvailable =
    FeatureFlags.carChecksAvailable && nativeBilling.connected && Boolean(nativeBilling.catalog.single);
  const bundleAvailable =
    FeatureFlags.carChecksAvailable && nativeBilling.connected && Boolean(nativeBilling.catalog.bundle);
  const isWebPreview = Platform.OS === "web";
  const monthlyPrice =
    String((nativeBilling.catalog.monthly as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    `${formatGbp(LaunchPricing.monthlySubscriptionGbp)}/month`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.glowA} />
        <View style={styles.glowB} />
        <Text style={styles.kicker}>VALUEVISION MONTHLY</Text>
        <Text style={styles.title}>Turn every find into a smarter decision.</Text>
        <Text style={styles.subtitle}>
          Scan without limits, use hands-free Live Mode, and keep building your collection of valuations.
        </Text>

        <View style={styles.planCard}>
          <Text style={styles.planEyebrow}>ONE SIMPLE PLAN</Text>
          <View style={styles.priceRow}>
            <Text style={styles.planPrice}>{monthlyPrice.replace(/\s*\/\s*month/i, "")}</Text>
            <Text style={styles.planPeriod}> / month</Text>
          </View>
          <Text style={styles.planNote}>
            {isWebPreview
              ? "Web preview shows the plan. Apple billing is tested in the iOS app."
              : "Cancel any time in your Apple subscriptions."}
          </Text>
        </View>

        <View style={styles.benefitCard}>
          <Text style={styles.benefitLine}>Unlimited Anything Mode scans</Text>
          <Text style={styles.benefitLine}>Continuous hands-free Live Mode</Text>
          <Text style={styles.benefitLine}>Saved valuations in My Collection</Text>
          <Text style={styles.benefitLine}>Pricing ranges, confidence, and selling guidance</Text>
        </View>

        <View style={[styles.statusCard, scanAccess?.unlimited && styles.statusCardActive]}>
          <Text style={styles.statusTitle}>
            {scanAccess?.unlimited ? "Monthly access is active" : "Your free access"}
          </Text>
          <Text style={styles.statusLine}>
            {scanAccess?.unlimited
              ? "Unlimited scans are unlocked on this device."
              : `${scanAccess?.remaining ?? LaunchPricing.freeStarterScans} of ${LaunchPricing.freeStarterScans} starter scans remaining.`}
          </Text>
          {busyLabel ? <Text style={styles.statusMeta}>{busyLabel}</Text> : null}
          {nativeBilling.error ? <Text style={styles.statusWarn}>{nativeBilling.error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, !monthlyAvailable && styles.buttonDisabled]}
            disabled={!monthlyAvailable || nativeBilling.purchasingSku !== null}
            onPress={() => nativeBilling.purchaseSku("monthly")}>
            <Text style={styles.primaryBtnText}>
              {nativeBilling.purchasingSku === "monthly"
                ? "Opening App Store..."
                : scanAccess?.unlimited
                  ? "Monthly Access Active"
                  : `Unlock Unlimited Scans - ${monthlyPrice}`}
            </Text>
          </Pressable>
          {!monthlyAvailable && !scanAccess?.unlimited ? (
            <Text style={styles.storeHint}>
              {isWebPreview
                ? "This web demo keeps billing disabled. Use the iOS TestFlight/App Store build to verify the Apple subscription."
                : nativeBilling.loading
                ? "Connecting securely to the App Store..."
                : "Monthly access will appear when the App Store product is available."}
            </Text>
          ) : null}
          <Pressable
            style={[styles.secondaryBtn, !nativeBilling.supported && styles.buttonDisabled]}
            disabled={!nativeBilling.supported || nativeBilling.restoring}
            onPress={nativeBilling.restorePurchases}>
            <Text style={styles.secondaryBtnText}>
              {nativeBilling.restoring ? "Restoring..." : "Restore Purchase"}
            </Text>
          </Pressable>
          {FeatureFlags.carChecksAvailable ? (
            <>
              <Pressable
                style={[styles.secondaryBtn, !singleAvailable && styles.buttonDisabled]}
                disabled={!singleAvailable || nativeBilling.purchasingSku !== null}
                onPress={() => nativeBilling.purchaseSku("single")}>
                <Text style={styles.secondaryBtnText}>Buy 1 Vehicle Check</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, !bundleAvailable && styles.buttonDisabled]}
                disabled={!bundleAvailable || nativeBilling.purchasingSku !== null}
                onPress={() => nativeBilling.purchaseSku("bundle")}>
                <Text style={styles.secondaryBtnText}>
                  {`Buy ${LaunchPricing.fullCarCheckBundleChecks}-Check Bundle`}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            style={styles.textBtn}
            onPress={() => replacePublicRoute(router, "/scan?mode=items")}>
            <Text style={styles.textBtnText}>Continue with current access</Text>
          </Pressable>
          {__DEV__ ? (
            <Pressable style={styles.textBtn} onPress={() => router.push("/launch-checklist" as any)}>
              <Text style={styles.textBtnText}>Developer launch checklist</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.terms}>
          {isWebPreview
            ? "No payment is taken on this web preview. Subscription billing is only available through Apple in the iOS build."
            : "Payment is charged to your Apple ID after confirmation. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period."}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: AppTheme.bg,
    padding: 16,
  },
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#16324f",
    backgroundColor: "#071a30",
    padding: 18,
    gap: 14,
  },
  glowA: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 999,
    right: -110,
    top: -100,
    backgroundColor: "rgba(20, 184, 166, 0.2)",
  },
  glowB: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    left: -120,
    bottom: -100,
    backgroundColor: "rgba(37, 99, 235, 0.18)",
  },
  kicker: {
    color: "#8db8ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: "#f8fbff",
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "900",
  },
  subtitle: {
    color: "#d5e6ff",
    fontSize: 14,
    lineHeight: 21,
  },
  statusCard: {
    borderRadius: 18,
    backgroundColor: "rgba(37, 99, 235, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.35)",
    padding: 14,
    gap: 6,
  },
  statusCardActive: {
    backgroundColor: "rgba(22, 163, 74, 0.16)",
    borderColor: "rgba(134, 239, 172, 0.45)",
  },
  statusTitle: {
    color: "#dbeafe",
    fontSize: 15,
    fontWeight: "800",
  },
  statusLine: {
    color: "#e8f1ff",
    fontSize: 13,
    lineHeight: 18,
  },
  statusMeta: {
    color: "#bfdbfe",
    fontSize: 12,
    lineHeight: 17,
  },
  statusWarn: {
    color: "#fde68a",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  planCard: {
    borderRadius: 18,
    backgroundColor: "rgba(20, 184, 166, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(94, 234, 212, 0.42)",
    padding: 14,
    gap: 6,
  },
  planEyebrow: {
    color: "#99f6e4",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  planPrice: {
    color: "#f8fbff",
    fontSize: 34,
    fontWeight: "900",
  },
  planPeriod: {
    color: "#b9f5ea",
    fontSize: 14,
    fontWeight: "700",
  },
  planNote: {
    color: "#b9f5ea",
    fontSize: 12,
    lineHeight: 17,
  },
  benefitCard: {
    borderRadius: 18,
    backgroundColor: "rgba(15, 37, 65, 0.88)",
    borderWidth: 1,
    borderColor: "#294b70",
    padding: 14,
    gap: 9,
  },
  benefitLine: {
    color: "#e7f2ff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 16,
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#052e16",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryBtn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#4b6b8d",
    backgroundColor: "rgba(15, 23, 42, 0.32)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#d7e7ff",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  storeHint: {
    color: "#b8cbe5",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  textBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  textBtnText: {
    color: "#b9d4f5",
    fontSize: 13,
    fontWeight: "800",
  },
  terms: {
    color: "#8299b8",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
});
