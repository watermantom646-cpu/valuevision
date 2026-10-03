import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { resolveApiBase } from "@/lib/api-base";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { loadBillingState } from "@/lib/billing-state";
import { activateFoundingSellerAccess } from "@/lib/founding-access";
import { pushPublicRoute, replacePublicRoute } from "@/lib/public-navigation";
import { loadScanAccess, type ScanAccess } from "@/lib/scan-access";
import { useValueVisionBilling } from "@/lib/use-valuevision-billing";

export default function PaywallScreen() {
  const router = useRouter();
  const [scanAccess, setScanAccess] = useState<ScanAccess | null>(null);
  const [foundingCode, setFoundingCode] = useState("");
  const [foundingStatus, setFoundingStatus] = useState("");
  const [activatingCode, setActivatingCode] = useState(false);
  const [foundingReferralCode, setFoundingReferralCode] = useState("");
  const [webCheckoutReady, setWebCheckoutReady] = useState(false);
  const [webCheckoutChecked, setWebCheckoutChecked] = useState(false);
  const nativeBilling = useValueVisionBilling();

  useEffect(() => {
    void trackAnalyticsEvent("paywall_open", { platform: Platform.OS });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [access, billingState] = await Promise.all([loadScanAccess(), loadBillingState()]);
      if (!mounted) return;
      setScanAccess(access);
      setFoundingReferralCode(String(billingState.foundingReferralCode || ""));
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!nativeBilling.billingState) return;
    void loadScanAccess().then(setScanAccess);
    setFoundingReferralCode(String(nativeBilling.billingState.foundingReferralCode || ""));
  }, [nativeBilling.billingState]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let mounted = true;
    fetch(`${resolveApiBase()}/api/v1/payments/readiness`)
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted) return;
        setWebCheckoutReady(Boolean(
          payload?.stripe?.secretKey &&
          payload?.stripe?.webhookSecret &&
          payload?.stripe?.monthlyPrice
        ));
      })
      .catch(() => {
        if (mounted) setWebCheckoutReady(false);
      })
      .finally(() => {
        if (mounted) setWebCheckoutChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
    FeatureFlags.fullCarChecksAvailable && nativeBilling.connected && Boolean(nativeBilling.catalog.single);
  const bundleAvailable =
    FeatureFlags.fullCarChecksAvailable && nativeBilling.connected && Boolean(nativeBilling.catalog.bundle);
  const credits25Available = nativeBilling.connected && Boolean(nativeBilling.catalog.credits25);
  const credits75Available = nativeBilling.connected && Boolean(nativeBilling.catalog.credits75);
  const isWebPreview = Platform.OS === "web";
  const webCheckoutAvailable = isWebPreview && webCheckoutReady;
  const primaryPurchaseAvailable = webCheckoutAvailable || monthlyAvailable;
  const monthlyPrice =
    String((nativeBilling.catalog.monthly as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    `${formatGbp(LaunchPricing.monthlySubscriptionGbp)}/month`;
  const singleCheckPrice =
    String((nativeBilling.catalog.single as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    formatGbp(LaunchPricing.fullCarCheckSingleGbp);
  const bundleCheckPrice =
    String((nativeBilling.catalog.bundle as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    formatGbp(LaunchPricing.fullCarCheckBundleGbp);
  const credits25Price =
    String((nativeBilling.catalog.credits25 as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    formatGbp(LaunchPricing.valueCreditPack25Gbp);
  const credits75Price =
    String((nativeBilling.catalog.credits75 as { displayPrice?: string } | null)?.displayPrice || "").trim() ||
    formatGbp(LaunchPricing.valueCreditPack75Gbp);
  const canStartSubscription = primaryPurchaseAvailable && !scanAccess?.planActive;

  async function handlePrimaryPurchase() {
    if (webCheckoutAvailable) {
      setFoundingStatus("");
      await trackAnalyticsEvent("purchase_start", {
        platform: Platform.OS,
        source: "stripe_checkout",
      });
      try {
        const response = await fetch(`${resolveApiBase()}/api/v1/payments/web-checkout?product=monthly`);
        const payload = await response.json().catch(() => ({}));
        const checkoutUrl = String(payload?.url || "");
        if (!response.ok || !/^https:\/\//i.test(checkoutUrl)) {
          throw new Error(String(payload?.error || "Secure checkout is not available yet."));
        }
        await Linking.openURL(checkoutUrl);
      } catch (error: unknown) {
        const message = String((error as { message?: string })?.message || error || "Checkout could not open.");
        setFoundingStatus(message);
        await trackAnalyticsEvent("purchase_failure", {
          platform: Platform.OS,
          source: "stripe_checkout",
          message,
        });
      }
      return;
    }
    await nativeBilling.purchaseSku("monthly");
  }

  async function handleFoundingCodeActivation() {
    const code = foundingCode.trim();
    if (!code) {
      setFoundingStatus("Enter the access code sent after your purchase.");
      return;
    }
    setActivatingCode(true);
      setFoundingStatus("Activating ValueVision Plus...");
    try {
      const result = await activateFoundingSellerAccess(code);
      const access = await loadScanAccess();
      setScanAccess(access);
      setFoundingReferralCode(String(result.referralCode || ""));
      setFoundingCode("");
      setFoundingStatus(`Access active until ${new Date(result.expiresAt).toLocaleDateString()}.`);
      await trackAnalyticsEvent("purchase_success", {
        platform: Platform.OS,
        source: "founding_access_code",
      });
    } catch (error: unknown) {
      const message = String((error as { message?: string })?.message || error || "Access code could not be activated.");
      setFoundingStatus(message);
      await trackAnalyticsEvent("purchase_failure", {
        platform: Platform.OS,
        source: "founding_access_code",
        message,
      });
    } finally {
      setActivatingCode(false);
    }
  }

  async function shareFoundingReferral() {
    if (!foundingReferralCode) return;
    const referralLink =
      `https://valuevision.expo.app/?utm_source=customer_referral` +
      `&utm_medium=referral&utm_campaign=value_vision_plus&ref=${encodeURIComponent(foundingReferralCode)}`;
    try {
      await Share.share({
        message:
          "I use ValueVision, a photo-first sourcing and pricing assistant for resellers. " +
          `You can see it here: ${referralLink}`,
        url: referralLink,
        title: "ValueVision Plus",
      });
      setFoundingStatus("Referral link ready to share.");
    } catch (error: unknown) {
      setFoundingStatus(String((error as { message?: string })?.message || error || "Referral link could not be shared."));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.glowA} />
        <View style={styles.glowB} />
        <Text style={styles.kicker}>VALUEVISION PLUS</Text>
        <Text style={styles.title}>Buy smarter. Price faster. List with confidence.</Text>
        <Text style={styles.subtitle}>
          A focused reseller toolkit for turning photos into market evidence, profit guidance, and listing drafts.
        </Text>

        <View style={styles.planCard}>
          <Text style={styles.planEyebrow}>{`${LaunchPricing.monthlyItemScanAllowance} VALUE CREDITS EVERY 30 DAYS`}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.planPrice}>{monthlyPrice.replace(/\s*\/\s*month/i, "")}</Text>
            <Text style={styles.planPeriod}>{isWebPreview ? " / 30 days" : " / month"}</Text>
          </View>
          <Text style={styles.planNote}>
            {isWebPreview
              ? "Secure checkout shows the renewal terms before any payment is taken."
              : "Cancel any time in your Apple subscriptions."}
          </Text>
        </View>

        <View style={styles.benefitCard}>
          <Text style={styles.benefitLine}>{`${LaunchPricing.monthlyItemScanAllowance} Value Credits every 30 days`}</Text>
          <Text style={styles.benefitLine}>1 credit per item or Treasure Hunt valuation; 3 credits per basic car valuation</Text>
          <Text style={styles.benefitLine}>Full vehicle history checks are purchased separately</Text>
          <Text style={styles.benefitLine}>Market evidence, resale ranges, and confidence</Text>
          <Text style={styles.benefitLine}>Profit guidance and ready-to-edit listing drafts</Text>
          <Text style={styles.benefitLine}>Saved finds and valuations in My Collection</Text>
        </View>

        <View style={[styles.statusCard, scanAccess?.planActive && styles.statusCardActive]}>
          <Text style={styles.statusTitle}>
            {scanAccess?.planActive ? "ValueVision Plus is active" : "Your Value Credits"}
          </Text>
          <Text style={styles.statusLine}>
            {scanAccess?.planActive
              ? `${scanAccess.remaining} Value Credits available${scanAccess.purchasedCredits ? `, including ${scanAccess.purchasedCredits} top-up credits.` : "."}`
              : `${scanAccess?.remaining ?? LaunchPricing.freeStarterScans} Value Credits available${scanAccess?.purchasedCredits ? `, including ${scanAccess.purchasedCredits} purchased credits.` : "."}`}
          </Text>
          {busyLabel ? <Text style={styles.statusMeta}>{busyLabel}</Text> : null}
          {nativeBilling.error ? <Text style={styles.statusWarn}>{nativeBilling.error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, !canStartSubscription && styles.buttonDisabled]}
            disabled={!canStartSubscription || nativeBilling.purchasingSku !== null}
            onPress={() => void handlePrimaryPurchase()}>
            <Text style={styles.primaryBtnText}>
              {webCheckoutAvailable
                ? `Start ValueVision Plus - ${formatGbp(LaunchPricing.monthlySubscriptionGbp)}`
                : nativeBilling.purchasingSku === "monthly"
                ? "Opening App Store..."
                : scanAccess?.planActive
                  ? "ValueVision Plus Active"
                  : `Start ValueVision Plus - ${monthlyPrice}`}
            </Text>
          </Pressable>
          {!primaryPurchaseAvailable && !scanAccess?.planActive ? (
            <Text style={styles.storeHint}>
              {isWebPreview
                ? webCheckoutChecked
                  ? "Secure web checkout is not connected yet. Starter scans remain available."
                  : "Checking secure web checkout..."
                : nativeBilling.loading
                ? "Connecting securely to the App Store..."
                : "Monthly access will appear when the App Store product is available."}
            </Text>
          ) : null}
          {!isWebPreview && (credits25Available || credits75Available) ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeTitle}>Need more Value Credits?</Text>
              <Text style={styles.codeText}>One-off top-ups do not expire. Your included or starter credits are always used first.</Text>
              {credits25Available ? (
                <Pressable
                  style={[styles.secondaryBtn, nativeBilling.purchasingSku !== null && styles.buttonDisabled]}
                  disabled={nativeBilling.purchasingSku !== null}
                  onPress={() => nativeBilling.purchaseSku("credits25")}>
                  <Text style={styles.secondaryBtnText}>{`Add ${LaunchPricing.valueCreditPack25Credits} Credits - ${credits25Price}`}</Text>
                </Pressable>
              ) : null}
              {credits75Available ? (
                <Pressable
                  style={[styles.secondaryBtn, nativeBilling.purchasingSku !== null && styles.buttonDisabled]}
                  disabled={nativeBilling.purchasingSku !== null}
                  onPress={() => nativeBilling.purchaseSku("credits75")}>
                  <Text style={styles.secondaryBtnText}>{`Add ${LaunchPricing.valueCreditPack75Credits} Credits - ${credits75Price}`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isWebPreview ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeTitle}>Already purchased ValueVision Plus?</Text>
              <Text style={styles.codeText}>
                Enter the access code sent to your checkout email to activate this browser.
              </Text>
              <TextInput
                value={foundingCode}
                onChangeText={setFoundingCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Access code"
                placeholderTextColor="#7790ad"
                style={styles.codeInput}
              />
              <Pressable
                style={[styles.secondaryBtn, activatingCode && styles.buttonDisabled]}
                disabled={activatingCode}
                onPress={() => void handleFoundingCodeActivation()}>
                <Text style={styles.secondaryBtnText}>{activatingCode ? "Activating..." : "Activate Access"}</Text>
              </Pressable>
              {foundingStatus ? <Text style={styles.statusMeta}>{foundingStatus}</Text> : null}
            </View>
          ) : null}
          {scanAccess?.planActive && foundingReferralCode ? (
            <View style={styles.referralCard}>
              <Text style={styles.codeTitle}>Know another active reseller?</Text>
              <Text style={styles.codeText}>
                Share your public referral link. It identifies the introduction but never reveals your private access code.
              </Text>
              <Pressable style={styles.secondaryBtn} onPress={() => void shareFoundingReferral()}>
                <Text style={styles.secondaryBtnText}>Invite a Reseller</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            style={[styles.secondaryBtn, !nativeBilling.supported && styles.buttonDisabled]}
            disabled={!nativeBilling.supported || nativeBilling.restoring}
            onPress={nativeBilling.restorePurchases}>
            <Text style={styles.secondaryBtnText}>
              {nativeBilling.restoring ? "Restoring..." : "Restore Purchase"}
            </Text>
          </Pressable>
          {!isWebPreview && scanAccess?.planActive ? (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => void Linking.openURL("https://apps.apple.com/account/subscriptions")}>
              <Text style={styles.secondaryBtnText}>Manage Apple Subscription</Text>
            </Pressable>
          ) : null}
          {FeatureFlags.fullCarChecksAvailable ? (
            <>
              <Pressable
                style={[styles.secondaryBtn, !singleAvailable && styles.buttonDisabled]}
                disabled={!singleAvailable || nativeBilling.purchasingSku !== null}
                onPress={() => nativeBilling.purchaseSku("single")}>
                <Text style={styles.secondaryBtnText}>{`Buy Full Vehicle Check - ${singleCheckPrice}`}</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, !bundleAvailable && styles.buttonDisabled]}
                disabled={!bundleAvailable || nativeBilling.purchasingSku !== null}
                onPress={() => nativeBilling.purchaseSku("bundle")}>
                <Text style={styles.secondaryBtnText}>
                  {`Buy ${LaunchPricing.fullCarCheckBundleChecks} Full Checks - ${bundleCheckPrice}`}
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
        <View style={styles.legalLinks}>
          <Pressable style={styles.legalLink} onPress={() => pushPublicRoute(router, "/terms")}>
            <Text style={styles.legalLinkText}>Terms</Text>
          </Pressable>
          <Pressable style={styles.legalLink} onPress={() => pushPublicRoute(router, "/privacy")}>
            <Text style={styles.legalLinkText}>Privacy</Text>
          </Pressable>
          <Pressable style={styles.legalLink} onPress={() => pushPublicRoute(router, "/support")}>
            <Text style={styles.legalLinkText}>Support</Text>
          </Pressable>
        </View>
        <Text style={styles.terms}>
          {isWebPreview
            ? webCheckoutAvailable
              ? "Web payment is handled by secure hosted checkout. Access is activated after payment confirmation."
              : "No payment is taken until secure web checkout is connected."
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
    borderColor: "#31594b",
    backgroundColor: "#0b241b",
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
    backgroundColor: "rgba(206, 255, 104, 0.16)",
  },
  glowB: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    left: -120,
    bottom: -100,
    backgroundColor: "rgba(242, 139, 112, 0.12)",
  },
  kicker: {
    color: "#ccff68",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: "#fffaf0",
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "900",
  },
  subtitle: {
    color: "#d7e6dd",
    fontSize: 14,
    lineHeight: 21,
  },
  statusCard: {
    borderRadius: 18,
    backgroundColor: "rgba(38, 82, 66, 0.72)",
    borderWidth: 1,
    borderColor: "#4c7567",
    padding: 14,
    gap: 6,
  },
  statusCardActive: {
    backgroundColor: "rgba(82, 133, 103, 0.32)",
    borderColor: "#a6d8b8",
  },
  statusTitle: {
    color: "#fffaf0",
    fontSize: 15,
    fontWeight: "800",
  },
  statusLine: {
    color: "#e7efe9",
    fontSize: 13,
    lineHeight: 18,
  },
  statusMeta: {
    color: "#bcd5c7",
    fontSize: 12,
    lineHeight: 17,
  },
  statusWarn: {
    color: "#ffd985",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  planCard: {
    borderRadius: 18,
    backgroundColor: "rgba(41, 91, 69, 0.8)",
    borderWidth: 1,
    borderColor: "#6c9a85",
    padding: 14,
    gap: 6,
  },
  planEyebrow: {
    color: "#ccff68",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  planPrice: {
    color: "#fffaf0",
    fontSize: 34,
    fontWeight: "900",
  },
  planPeriod: {
    color: "#cfe3d8",
    fontSize: 14,
    fontWeight: "700",
  },
  planNote: {
    color: "#cfe3d8",
    fontSize: 12,
    lineHeight: 17,
  },
  benefitCard: {
    borderRadius: 18,
    backgroundColor: "rgba(18, 53, 41, 0.92)",
    borderWidth: 1,
    borderColor: "#31594b",
    padding: 14,
    gap: 9,
  },
  benefitLine: {
    color: "#edf4ef",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  codeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#31594b",
    backgroundColor: "rgba(18, 53, 41, 0.92)",
    padding: 12,
    gap: 8,
  },
  codeTitle: {
    color: "#fffaf0",
    fontSize: 14,
    fontWeight: "900",
  },
  codeText: {
    color: "#bfd2c7",
    fontSize: 12,
    lineHeight: 17,
  },
  codeInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5a7f70",
    backgroundColor: "#0b241b",
    color: "#fffaf0",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  referralCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#9dcc7f",
    backgroundColor: "rgba(107, 151, 92, 0.2)",
    padding: 12,
    gap: 8,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 16,
    backgroundColor: "#ccff68",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#102117",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryBtn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#5a7f70",
    backgroundColor: "rgba(18, 53, 41, 0.62)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#edf4ef",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  storeHint: {
    color: "#bfd2c7",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  textBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  textBtnText: {
    color: "#d6e8dc",
    fontSize: 13,
    fontWeight: "800",
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  legalLink: {
    minHeight: 44,
    minWidth: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#466c5d",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  legalLinkText: {
    color: "#cfe3d8",
    fontSize: 12,
    fontWeight: "800",
  },
  terms: {
    color: "#94aa9e",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
});
