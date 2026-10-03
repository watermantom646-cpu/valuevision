import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { resolveApiBase } from "@/lib/api-base";
import { loadBillingState } from "@/lib/billing-state";
import { loadCarCheckCredits } from "@/lib/car-check-credits";
import { pushPublicRoute } from "@/lib/public-navigation";
import { loadScanAccess, type ScanAccess } from "@/lib/scan-access";
import { loadHistory } from "@/lib/scan-history";

const C = {
  ink: "#071813",
  inkSoft: "#0D251E",
  panel: "#102E25",
  cream: "#F6F1E6",
  paper: "#FFFCF5",
  muted: "#B7C7BF",
  forestMuted: "#587068",
  line: "rgba(246, 241, 230, 0.14)",
  lime: "#CBFF62",
  mint: "#75E6BD",
  coral: "#FF8C68",
  gold: "#F3C76B",
};

const bodyFont = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  web: "Avenir Next, Trebuchet MS, sans-serif",
});

const displayFont = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: "Georgia, Times New Roman, serif",
});

type StatusPillProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tone?: "light" | "dark";
};

function StatusPill({ icon, label, tone = "dark" }: StatusPillProps) {
  const light = tone === "light";
  return (
    <View style={[styles.statusPill, light && styles.statusPillLight]}>
      <Ionicons name={icon} size={13} color={light ? C.ink : C.mint} />
      <Text style={[styles.statusPillText, light && styles.statusPillTextLight]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const compact = width < 620;
  const reveal = useRef(new Animated.Value(0)).current;

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [monthlyAccessLabel, setMonthlyAccessLabel] = useState("Checking access...");
  const [storedCredits, setStoredCredits] = useState(0);
  const [scanAccess, setScanAccess] = useState<ScanAccess | null>(null);

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [reveal]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const [history, health, billingState, credits, access] = await Promise.all([
            loadHistory(),
            fetch(`${resolveApiBase()}/health`).then((response) => response.json()).catch(() => null),
            loadBillingState(),
            loadCarCheckCredits(),
            loadScanAccess(),
          ]);
          if (!mounted) return;
          setLastQuery(String(history[0]?.query || ""));
          setBackendOk(Boolean(health?.ok));
          setMonthlyAccessLabel(
            billingState.monthlyUnlocked
              ? `${LaunchPricing.monthlyItemScanAllowance} Value Credit plan active`
              : "Starter access active",
          );
          setStoredCredits(credits.credits);
          setScanAccess(access);
        } catch {
          if (!mounted) return;
          setBackendOk(false);
          setMonthlyAccessLabel("Access status unavailable");
        }
      })();
      return () => {
        mounted = false;
      };
    }, []),
  );

  const remainingScans = scanAccess?.remaining ?? LaunchPricing.freeStarterScans;
  const entranceY = reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const backendLabel = backendOk == null ? "Connecting" : backendOk ? "All systems ready" : "Service reconnecting";

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.atmosphere}>
        <View style={styles.glowLime} />
        <View style={styles.glowMint} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.container, compact && styles.containerCompact]}
        >
          <Animated.View style={{ opacity: reveal, transform: [{ translateY: entranceY }] }}>
            <View style={styles.header}>
              <View style={styles.brandLockup}>
                <View style={styles.brandMark}>
                  <Text style={styles.brandMarkText}>V</Text>
                </View>
                <View>
                  <Text style={styles.brandName}>VALUEVISION</Text>
                  <Text style={styles.brandLine}>KNOW WHAT IT&apos;S WORTH</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open saved collection"
                onPress={() => pushPublicRoute(router, "/history")}
                style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              >
                <Ionicons name="bookmark-outline" size={18} color={C.cream} />
                {!compact ? <Text style={styles.headerActionText}>My collection</Text> : null}
              </Pressable>
            </View>

            <View style={[styles.hero, isWide && styles.heroWide]}>
              <View style={styles.heroMain}>
                <View style={styles.eyebrowRow}>
                  <View style={styles.eyebrowLine} />
                  <Text style={styles.eyebrow}>THE SMARTER WAY TO VALUE WHAT YOU OWN</Text>
                </View>
                <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
                  See the value.{"\n"}Make the right move.
                </Text>
                <Text style={styles.heroBody}>
                  ValueVision turns photos and number plates into practical resale intelligence. Identify an item, check a car, or uncover the best finds in an entire room.
                </Text>

                <View style={styles.heroPills}>
                  <StatusPill icon="sparkles-outline" label="AI identification" />
                  <StatusPill icon="analytics-outline" label="Market evidence" />
                  <StatusPill icon="shield-checkmark-outline" label="Clear confidence" />
                </View>
              </View>

              <View style={[styles.heroAside, isWide && styles.heroAsideWide]}>
                <Text style={styles.heroAsideKicker}>YOUR ACCESS</Text>
                <View style={styles.accessNumberRow}>
                  <Text style={styles.accessNumber}>{remainingScans}</Text>
                  <Text style={styles.accessUnit}>credits{"\n"}remaining</Text>
                </View>
                <Text style={styles.accessMeta}>{monthlyAccessLabel}</Text>
                <View style={styles.heroAsideRule} />
                <View style={styles.serviceRow}>
                  <View style={[styles.serviceDot, backendOk === false && styles.serviceDotWarn]} />
                  <Text style={styles.serviceText}>{backendLabel}</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionKicker}>CHOOSE YOUR MODE</Text>
                <Text style={styles.sectionTitle}>What would you like to discover?</Text>
              </View>
              {!compact ? <Text style={styles.sectionHint}>Three focused tools. One simple app.</Text> : null}
            </View>

            <View style={[styles.modeGrid, isWide && styles.modeGridWide]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Value an item"
                onPress={() => pushPublicRoute(router, "/scan?mode=items")}
                style={({ pressed }) => [
                  styles.modeCard,
                  styles.itemCard,
                  isWide && styles.modeCardWide,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.modeTopRow}>
                  <View style={[styles.modeIcon, styles.modeIconLime]}>
                    <Ionicons name="camera-outline" size={24} color={C.ink} />
                  </View>
                  <View style={styles.modeNumberLight}>
                    <Text style={styles.modeNumberTextLight}>01</Text>
                  </View>
                </View>
                <Text style={styles.modeEyebrowDark}>ONE ITEM · ONE CLEAR ANSWER</Text>
                <Text style={styles.modeTitleDark}>Value an item</Text>
                <Text style={styles.modeBodyDark}>
                  Take one photo for identification, a realistic selling range, current market evidence and guidance on where to sell.
                </Text>
                <View style={styles.modeFeatureRow}>
                  <StatusPill icon="pricetag-outline" label="Resale range" tone="light" />
                  <StatusPill icon="storefront-outline" label="Selling guide" tone="light" />
                </View>
                <View style={styles.modeCtaDark}>
                  <Text style={styles.modeCtaTextDark}>Scan one item</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.ink} />
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open car mode"
                onPress={() => pushPublicRoute(router, "/car-mode")}
                style={({ pressed }) => [
                  styles.modeCard,
                  styles.carCard,
                  isWide && styles.modeCardWide,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.modeTopRow}>
                  <View style={[styles.modeIcon, styles.modeIconCream]}>
                    <Ionicons name="car-sport-outline" size={25} color={C.ink} />
                  </View>
                  <View style={styles.modeNumberDark}>
                    <Text style={styles.modeNumberTextDark}>02</Text>
                  </View>
                </View>
                <Text style={styles.modeEyebrowDark}>UK VEHICLE INTELLIGENCE</Text>
                <Text style={styles.modeTitleDark}>Full car check</Text>
                <Text style={styles.modeBodyDark}>
                  Photograph a number plate or type it in. See vehicle facts and value, then unlock finance, stolen, write-off and mileage history.
                </Text>
                <View style={styles.priceRow}>
                  <View>
                    <Text style={styles.priceLabel}>BASIC DETAILS</Text>
                    <Text style={styles.priceValue}>Included</Text>
                  </View>
                  <View style={styles.priceDivider} />
                  <View>
                    <Text style={styles.priceLabel}>FULL CHECK</Text>
                    <Text style={styles.priceValue}>{formatGbp(LaunchPricing.fullCarCheckSingleGbp)}</Text>
                  </View>
                </View>
                <View style={styles.modeCtaDark}>
                  <Text style={styles.modeCtaTextDark}>Check a car</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.ink} />
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start Treasure Hunt"
                onPress={() => pushPublicRoute(router, "/treasure-hunt")}
                style={({ pressed }) => [
                  styles.modeCard,
                  styles.treasureCard,
                  isWide && styles.modeCardWide,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.treasureGlow} />
                <View style={styles.modeTopRow}>
                  <View style={[styles.modeIcon, styles.modeIconMint]}>
                    <Ionicons name="scan-outline" size={25} color={C.ink} />
                  </View>
                  <View style={styles.newBadge}>
                    <View style={styles.newBadgeDot} />
                    <Text style={styles.newBadgeText}>NEW MODE</Text>
                  </View>
                </View>
                <Text style={styles.modeEyebrowLight}>ROOM-TO-RESALE DISCOVERY</Text>
                <Text style={styles.modeTitleLight}>Treasure Hunt</Text>
                <Text style={styles.modeBodyLight}>
                  Photograph a room or several objects. ValueVision ranks the visible finds most worth a closer look.
                </Text>
                <View style={styles.miniRankings}>
                  <View style={styles.miniRanking}>
                    <Text style={styles.miniRank}>1</Text>
                    <Text style={styles.miniObject}>Strongest find</Text>
                    <View style={[styles.confidenceBar, styles.confidenceHigh]} />
                  </View>
                  <View style={styles.miniRanking}>
                    <Text style={styles.miniRank}>2</Text>
                    <Text style={styles.miniObject}>Worth checking</Text>
                    <View style={[styles.confidenceBar, styles.confidenceMid]} />
                  </View>
                </View>
                <View style={styles.modeCtaLight}>
                  <Text style={styles.modeCtaTextLight}>Start hunting</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.lime} />
                </View>
              </Pressable>
            </View>

            <View style={[styles.supportGrid, isWide && styles.supportGridWide]}>
              <View style={[styles.membershipCard, isWide && styles.supportCardWide]}>
                <View style={styles.membershipHeader}>
                  <View>
                    <Text style={styles.membershipKicker}>VALUEVISION PLUS</Text>
                    <Text style={styles.membershipTitle}>More answers. Less guesswork.</Text>
                  </View>
                  <View style={styles.membershipPricePill}>
                    <Text style={styles.membershipPrice}>{formatGbp(LaunchPricing.monthlySubscriptionGbp)}</Text>
                    <Text style={styles.membershipPeriod}>/ month</Text>
                  </View>
                </View>
                <Text style={styles.membershipBody}>
                  {LaunchPricing.monthlyItemScanAllowance} Value Credits every 30 days, market evidence, profit guidance, listing drafts and saved results.
                </Text>
                <Pressable
                  onPress={() => pushPublicRoute(router, "/paywall")}
                  style={({ pressed }) => [styles.membershipButton, pressed && styles.pressed]}
                >
                  <Text style={styles.membershipButtonText}>Explore Plus</Text>
                  <Ionicons name="arrow-forward" size={17} color={C.cream} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => pushPublicRoute(router, "/history")}
                style={({ pressed }) => [
                  styles.collectionCard,
                  isWide && styles.supportCardWide,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.collectionIcon}>
                  <Ionicons name="library-outline" size={23} color={C.ink} />
                </View>
                <View style={styles.collectionCopy}>
                  <Text style={styles.collectionKicker}>MY COLLECTION</Text>
                  <Text style={styles.collectionTitle}>Your finds, kept together.</Text>
                  <Text style={styles.collectionBody}>
                    {lastQuery ? `Continue from your last scan: ${lastQuery}` : "Saved valuations and car checks will appear here."}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.ink} />
              </Pressable>
            </View>

            <View style={styles.trustStrip}>
              <View style={styles.trustIcon}>
                <Ionicons name="shield-checkmark" size={22} color={C.ink} />
              </View>
              <View style={styles.trustCopy}>
                <Text style={styles.trustTitle}>Clear about confidence. Careful with your money.</Text>
                <Text style={styles.trustBody}>
                  Values are evidence-led estimates, not guarantees. When a photo is unclear, we ask for better detail instead of pretending to know.
                </Text>
              </View>
              {!compact ? (
                <View style={styles.creditSummary}>
                  <Text style={styles.creditSummaryValue}>{storedCredits}</Text>
                  <Text style={styles.creditSummaryLabel}>car checks ready</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerBrand}>VALUEVISION</Text>
              <View style={styles.footerLinks}>
                <Pressable onPress={() => pushPublicRoute(router, "/support")}>
                  <Text style={styles.footerLink}>Support</Text>
                </Pressable>
                <Pressable onPress={() => pushPublicRoute(router, "/privacy")}>
                  <Text style={styles.footerLink}>Privacy</Text>
                </Pressable>
                <Pressable onPress={() => pushPublicRoute(router, "/terms")}>
                  <Text style={styles.footerLink}>Terms</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ink },
  safeArea: { flex: 1 },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  glowLime: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: "rgba(203,255,98,0.12)",
    right: -260,
    top: -240,
  },
  glowMint: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: 999,
    backgroundColor: "rgba(117,230,189,0.08)",
    left: -230,
    top: 470,
  },
  container: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 30,
    paddingBottom: 38,
  },
  containerCompact: { paddingHorizontal: 17, paddingBottom: 28 },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
  },
  brandMarkText: { color: C.ink, fontFamily: displayFont, fontSize: 20, fontWeight: "900" },
  brandName: { color: C.cream, fontFamily: bodyFont, fontSize: 12, fontWeight: "900", letterSpacing: 1.8 },
  brandLine: { color: C.mint, fontFamily: bodyFont, fontSize: 8, fontWeight: "800", letterSpacing: 1.8, marginTop: 3 },
  headerAction: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
  },
  headerActionText: { color: C.cream, fontFamily: bodyFont, fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  hero: { paddingTop: 47, paddingBottom: 46, gap: 27 },
  heroWide: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 50 },
  heroMain: { flex: 1, maxWidth: 790 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 17 },
  eyebrowLine: { width: 29, height: 2, backgroundColor: C.coral },
  eyebrow: { color: C.coral, fontFamily: bodyFont, fontSize: 9, fontWeight: "900", letterSpacing: 1.75 },
  heroTitle: { color: C.cream, fontFamily: displayFont, fontSize: 58, lineHeight: 63, letterSpacing: -2.6 },
  heroTitleCompact: { fontSize: 43, lineHeight: 47, letterSpacing: -1.8 },
  heroBody: { color: C.muted, fontFamily: bodyFont, fontSize: 16, lineHeight: 25, maxWidth: 720, marginTop: 20 },
  heroPills: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 24 },
  statusPill: {
    minHeight: 29,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  statusPillLight: { borderColor: "rgba(7,24,19,0.11)", backgroundColor: "rgba(7,24,19,0.055)" },
  statusPillText: { color: C.cream, fontFamily: bodyFont, fontSize: 9, fontWeight: "700" },
  statusPillTextLight: { color: C.ink },
  heroAside: {
    width: "100%",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(203,255,98,0.2)",
    backgroundColor: C.panel,
    padding: 20,
  },
  heroAsideWide: { width: 250 },
  heroAsideKicker: { color: C.mint, fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.7 },
  accessNumberRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 7 },
  accessNumber: { color: C.cream, fontFamily: displayFont, fontSize: 48, lineHeight: 54 },
  accessUnit: { color: C.muted, fontFamily: bodyFont, fontSize: 10, lineHeight: 13, fontWeight: "700", paddingBottom: 8 },
  accessMeta: { color: C.cream, fontFamily: bodyFont, fontSize: 10, fontWeight: "600" },
  heroAsideRule: { height: 1, backgroundColor: C.line, marginVertical: 15 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  serviceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime },
  serviceDotWarn: { backgroundColor: C.gold },
  serviceText: { color: C.muted, fontFamily: bodyFont, fontSize: 9, fontWeight: "700" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    paddingTop: 34,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  sectionKicker: { color: C.coral, fontFamily: bodyFont, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  sectionTitle: { color: C.cream, fontFamily: displayFont, fontSize: 29, lineHeight: 35, letterSpacing: -0.9, marginTop: 7 },
  sectionHint: { color: C.muted, fontFamily: bodyFont, fontSize: 10, paddingBottom: 5 },
  modeGrid: { gap: 14 },
  modeGridWide: { flexDirection: "row", alignItems: "stretch" },
  modeCard: { minHeight: 410, borderRadius: 27, padding: 21, overflow: "hidden" },
  modeCardWide: { flex: 1 },
  itemCard: { backgroundColor: C.cream },
  carCard: { backgroundColor: C.coral },
  treasureCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: "rgba(203,255,98,0.22)" },
  cardPressed: { opacity: 0.91, transform: [{ scale: 0.992 }] },
  modeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  modeIcon: { width: 51, height: 51, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  modeIconLime: { backgroundColor: C.lime },
  modeIconCream: { backgroundColor: C.cream },
  modeIconMint: { backgroundColor: C.mint },
  modeNumberLight: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(7,24,19,0.14)", alignItems: "center", justifyContent: "center" },
  modeNumberTextLight: { color: C.ink, fontFamily: bodyFont, fontSize: 9, fontWeight: "900" },
  modeNumberDark: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(7,24,19,0.19)", alignItems: "center", justifyContent: "center" },
  modeNumberTextDark: { color: C.ink, fontFamily: bodyFont, fontSize: 9, fontWeight: "900" },
  modeEyebrowDark: { color: C.forestMuted, fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  modeEyebrowLight: { color: C.mint, fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  modeTitleDark: { color: C.ink, fontFamily: displayFont, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, marginTop: 8 },
  modeTitleLight: { color: C.cream, fontFamily: displayFont, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, marginTop: 8 },
  modeBodyDark: { flexGrow: 1, color: "#435B52", fontFamily: bodyFont, fontSize: 12, lineHeight: 19, marginTop: 12 },
  modeBodyLight: { flexGrow: 1, color: C.muted, fontFamily: bodyFont, fontSize: 12, lineHeight: 19, marginTop: 12 },
  modeFeatureRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
  modeCtaDark: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(7,24,19,0.13)", paddingTop: 17, marginTop: 19 },
  modeCtaTextDark: { color: C.ink, fontFamily: bodyFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  modeCtaLight: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 17, marginTop: 19 },
  modeCtaTextLight: { color: C.lime, fontFamily: bodyFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 17, marginTop: 20 },
  priceLabel: { color: "rgba(7,24,19,0.58)", fontFamily: bodyFont, fontSize: 7, fontWeight: "900", letterSpacing: 1.1 },
  priceValue: { color: C.ink, fontFamily: displayFont, fontSize: 18, fontWeight: "700", marginTop: 3 },
  priceDivider: { width: 1, height: 34, backgroundColor: "rgba(7,24,19,0.15)" },
  treasureGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(203,255,98,0.09)", right: -90, top: -75 },
  newBadge: { minHeight: 28, borderRadius: 14, backgroundColor: "rgba(203,255,98,0.09)", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
  newBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  newBadgeText: { color: C.lime, fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  miniRankings: { gap: 7, marginTop: 18 },
  miniRanking: { minHeight: 35, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10 },
  miniRank: { color: C.lime, fontFamily: displayFont, fontSize: 14, fontWeight: "700" },
  miniObject: { flex: 1, color: C.cream, fontFamily: bodyFont, fontSize: 9, fontWeight: "700" },
  confidenceBar: { height: 4, borderRadius: 2 },
  confidenceHigh: { width: 42, backgroundColor: C.lime },
  confidenceMid: { width: 29, backgroundColor: C.gold },
  supportGrid: { gap: 14, paddingTop: 28 },
  supportGridWide: { flexDirection: "row" },
  supportCardWide: { flex: 1 },
  membershipCard: { borderRadius: 25, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.035)", padding: 22 },
  membershipHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  membershipKicker: { color: C.mint, fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  membershipTitle: { color: C.cream, fontFamily: displayFont, fontSize: 22, lineHeight: 28, marginTop: 6 },
  membershipPricePill: { alignItems: "flex-end" },
  membershipPrice: { color: C.lime, fontFamily: displayFont, fontSize: 22, fontWeight: "700" },
  membershipPeriod: { color: C.muted, fontFamily: bodyFont, fontSize: 8, fontWeight: "600" },
  membershipBody: { color: C.muted, fontFamily: bodyFont, fontSize: 11, lineHeight: 18, marginTop: 13 },
  membershipButton: { minHeight: 40, borderRadius: 20, backgroundColor: C.panel, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, marginTop: 17 },
  membershipButtonText: { color: C.cream, fontFamily: bodyFont, fontSize: 10, fontWeight: "900" },
  collectionCard: { minHeight: 164, borderRadius: 25, backgroundColor: C.mint, padding: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  collectionIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(246,241,230,0.75)", alignItems: "center", justifyContent: "center" },
  collectionCopy: { flex: 1 },
  collectionKicker: { color: "rgba(7,24,19,0.6)", fontFamily: bodyFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  collectionTitle: { color: C.ink, fontFamily: displayFont, fontSize: 22, lineHeight: 28, marginTop: 5 },
  collectionBody: { color: "#294A40", fontFamily: bodyFont, fontSize: 10, lineHeight: 16, marginTop: 7 },
  trustStrip: { borderRadius: 24, backgroundColor: C.cream, padding: 20, flexDirection: "row", alignItems: "center", gap: 15, marginTop: 14 },
  trustIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" },
  trustCopy: { flex: 1 },
  trustTitle: { color: C.ink, fontFamily: bodyFont, fontSize: 12, fontWeight: "900" },
  trustBody: { color: C.forestMuted, fontFamily: bodyFont, fontSize: 9, lineHeight: 14, marginTop: 4 },
  creditSummary: { minWidth: 90, alignItems: "center", borderLeftWidth: 1, borderLeftColor: "rgba(7,24,19,0.12)", paddingLeft: 18 },
  creditSummaryValue: { color: C.ink, fontFamily: displayFont, fontSize: 25, fontWeight: "700" },
  creditSummaryLabel: { color: C.forestMuted, fontFamily: bodyFont, fontSize: 8, fontWeight: "700", marginTop: 2 },
  footer: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  footerBrand: { color: C.cream, fontFamily: bodyFont, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  footerLinks: { flexDirection: "row", alignItems: "center", gap: 17 },
  footerLink: { color: C.muted, fontFamily: bodyFont, fontSize: 9, fontWeight: "700" },
});
