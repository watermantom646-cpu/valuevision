import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  PremiumButton,
  PremiumCard,
  PremiumHero,
  PremiumScreen,
} from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";
import { getHistoryEntry, type ScanHistoryEntry } from "@/lib/scan-history";

function money(item: ScanHistoryEntry, value: number | undefined) {
  if (typeof value !== "number") return "Not available";
  return `${item.currencySymbol || "£"}${Math.round(value).toLocaleString("en-GB")}`;
}

function textFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.title || record.name || record.label || record.description || "");
  }
  return "";
}

export default function ItemDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [item, setItem] = useState<ScanHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    getHistoryEntry(id).then((result) => {
      if (active) {
        setItem(result || null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  const comps = useMemo(() => {
    if (!item || !Array.isArray(item.comps)) return [];
    return item.comps as unknown[];
  }, [item]);

  const recommendations = useMemo(() => {
    if (!item || !Array.isArray(item.recommendations)) return [];
    return item.recommendations.map(textFromUnknown).filter(Boolean);
  }, [item]);

  const confidenceReasons = useMemo(() => {
    if (!item || !Array.isArray(item.confidenceReasons)) return [];
    return item.confidenceReasons.map(textFromUnknown).filter(Boolean);
  }, [item]);

  const assistant = (item?.listingAssistant || {}) as Record<string, unknown>;
  const listingTitle = textFromUnknown(assistant.title);
  const listingDescription = textFromUnknown(assistant.description || assistant.body);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.stateScreen}>
          <View style={styles.loadingMark}>
            <Text style={styles.loadingLetter}>V</Text>
          </View>
          <Text style={styles.stateTitle}>Opening your valuation</Text>
        </View>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <PremiumScreen contentContainerStyle={styles.notFoundContent}>
          <PremiumCard style={styles.notFoundCard}>
            <Ionicons color={AppTheme.accent} name="search-outline" size={34} />
            <Text style={styles.notFoundTitle}>This saved result is not available</Text>
            <Text style={styles.notFoundBody}>It may have been removed from your collection.</Text>
            <PremiumButton label="Back to collection" onPress={() => router.replace("/history")} />
          </PremiumCard>
        </PremiumScreen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={AppTheme.accentDeep} name="arrow-back" size={19} />
          <Text style={styles.backText}>Collection</Text>
        </Pressable>

        <PremiumHero
          description={item.detectedQuery && item.detectedQuery !== item.query
            ? `Identified as ${item.detectedQuery}. Review the evidence and range before deciding what to do next.`
            : "Review the evidence and range behind this saved valuation before deciding what to do next."}
          eyebrow={item.category || "Saved valuation"}
          icon="sparkles-outline"
          title={item.query}
        >
          <View style={styles.heroValueRow}>
            <View>
              <Text style={styles.heroValueLabel}>VALUATION MIDPOINT</Text>
              <Text style={styles.heroValue}>{money(item, item.median ?? undefined)}</Text>
            </View>
            <View style={styles.confidencePill}>
              <Ionicons color="#D9F4E7" name="shield-checkmark-outline" size={15} />
              <Text style={styles.confidenceText}>{item.confidenceLabel || "Estimate ready"}</Text>
            </View>
          </View>
        </PremiumHero>

        <View style={styles.headingWrap}>
          <Text style={styles.kicker}>VALUATION RANGE</Text>
          <Text style={styles.heading}>What the market evidence suggests</Text>
        </View>

        <View style={styles.rangeGrid}>
          <PremiumCard style={styles.rangeCard}>
            <Text style={styles.rangeLabel}>QUICK SALE</Text>
            <Text style={styles.rangeValue}>{money(item, item.low ?? undefined)}</Text>
            <Text style={styles.rangeHelp}>Lower end of the observed range</Text>
          </PremiumCard>
          <PremiumCard style={styles.rangeCardFeatured}>
            <Text style={styles.rangeLabelFeatured}>LIKELY MIDPOINT</Text>
            <Text style={styles.rangeValueFeatured}>{money(item, item.median ?? undefined)}</Text>
            <Text style={styles.rangeHelpFeatured}>Best central estimate</Text>
          </PremiumCard>
          <PremiumCard style={styles.rangeCard}>
            <Text style={styles.rangeLabel}>STRONG SALE</Text>
            <Text style={styles.rangeValue}>{money(item, item.high ?? undefined)}</Text>
            <Text style={styles.rangeHelp}>Possible with condition and patience</Text>
          </PremiumCard>
        </View>

        {confidenceReasons.length ? (
          <>
            <View style={styles.headingWrap}>
              <Text style={styles.kicker}>CONFIDENCE</Text>
              <Text style={styles.heading}>Why we reached this estimate</Text>
            </View>
            <PremiumCard style={styles.evidenceCard}>
              {confidenceReasons.map((reason, index) => (
                <View key={`${reason}-${index}`} style={[styles.evidenceRow, index === 0 && styles.firstRow]}>
                  <View style={styles.evidenceIcon}>
                    <Ionicons color={AppTheme.accent} name="checkmark" size={16} />
                  </View>
                  <Text style={styles.evidenceText}>{reason}</Text>
                </View>
              ))}
            </PremiumCard>
          </>
        ) : null}

        {comps.length ? (
          <>
            <View style={styles.headingWrap}>
              <Text style={styles.kicker}>MARKET EVIDENCE</Text>
              <Text style={styles.heading}>Comparable results</Text>
            </View>
            <View style={styles.compsList}>
              {comps.slice(0, 6).map((comp, index) => {
                const record = (comp && typeof comp === "object" ? comp : {}) as Record<string, unknown>;
                const title = textFromUnknown(record.title || record.name || comp) || `Comparable ${index + 1}`;
                const source = textFromUnknown(record.source || record.marketplace || record.site) || "Market listing";
                const numericPrice = typeof record.price === "number" ? record.price : undefined;
                const price = numericPrice !== undefined ? money(item, numericPrice) : textFromUnknown(record.price);
                return (
                  <PremiumCard key={`${title}-${index}`} style={styles.compCard}>
                    <View style={styles.compNumber}>
                      <Text style={styles.compNumberText}>{String(index + 1).padStart(2, "0")}</Text>
                    </View>
                    <View style={styles.compCopy}>
                      <Text numberOfLines={2} style={styles.compTitle}>{title}</Text>
                      <Text style={styles.compSource}>{source}</Text>
                    </View>
                    <Text style={styles.compPrice}>{price || "Evidence"}</Text>
                  </PremiumCard>
                );
              })}
            </View>
          </>
        ) : null}

        {recommendations.length ? (
          <>
            <View style={styles.headingWrap}>
              <Text style={styles.kicker}>SELLING GUIDANCE</Text>
              <Text style={styles.heading}>Practical next steps</Text>
            </View>
            <PremiumCard style={styles.guidanceCard}>
              {recommendations.map((recommendation, index) => (
                <View key={`${recommendation}-${index}`} style={styles.guidanceRow}>
                  <Text style={styles.guidanceNumber}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={styles.guidanceText}>{recommendation}</Text>
                </View>
              ))}
              {item.sellTime ? (
                <View style={styles.sellTimePill}>
                  <Ionicons color={AppTheme.accentDeep} name="time-outline" size={16} />
                  <Text style={styles.sellTimeText}>
                    Expected selling time: {typeof item.sellTime === "string" ? item.sellTime : item.sellTime?.text || "Varies by market"}
                  </Text>
                </View>
              ) : null}
            </PremiumCard>
          </>
        ) : null}

        {listingTitle || listingDescription ? (
          <>
            <View style={styles.headingWrap}>
              <Text style={styles.kicker}>LISTING ASSISTANT</Text>
              <Text style={styles.heading}>A stronger starting point</Text>
            </View>
            <PremiumCard style={styles.listingCard}>
              {listingTitle ? <Text style={styles.listingTitle}>{listingTitle}</Text> : null}
              {listingDescription ? <Text style={styles.listingBody}>{listingDescription}</Text> : null}
            </PremiumCard>
          </>
        ) : null}

        <PremiumCard style={styles.disclaimerCard}>
          <Ionicons color="#9FD8BF" name="information-circle-outline" size={21} />
          <View style={styles.disclaimerCopy}>
            <Text style={styles.disclaimerTitle}>A valuation, not a guarantee</Text>
            <Text style={styles.disclaimerBody}>Condition, authenticity, location, fees and buyer demand can all change the final selling price.</Text>
          </View>
        </PremiumCard>

        <PremiumButton label="Value another item" onPress={() => router.replace("/scan")} />
      </PremiumScreen>
    </>
  );
}

const styles = StyleSheet.create({
  stateScreen: {
    alignItems: "center",
    backgroundColor: AppTheme.bg,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  loadingMark: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 23,
    height: 70,
    justifyContent: "center",
    width: 70,
  },
  loadingLetter: {
    color: "#D9F4E7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 33,
    fontWeight: "800",
  },
  stateTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 21,
    fontWeight: "700",
  },
  notFoundContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  notFoundCard: {
    alignItems: "center",
    gap: 13,
    padding: 26,
  },
  notFoundTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
  },
  notFoundBody: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: AppTheme.surface,
    borderColor: AppTheme.cardBorder,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backText: {
    color: AppTheme.accentDeep,
    fontSize: 13,
    fontWeight: "800",
  },
  heroValueRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroValueLabel: {
    color: "#8AC7AA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroValue: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 28,
    fontWeight: "700",
    marginTop: 3,
  },
  confidencePill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    maxWidth: "46%",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  confidenceText: {
    color: "#D9F4E7",
    fontSize: 10,
    fontWeight: "800",
  },
  headingWrap: {
    gap: 4,
    paddingHorizontal: 3,
  },
  kicker: {
    color: AppTheme.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heading: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 29,
  },
  rangeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  rangeCard: {
    flexBasis: "30%",
    flexGrow: 1,
    gap: 5,
    minWidth: 105,
    padding: 14,
  },
  rangeCardFeatured: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    flexBasis: "30%",
    flexGrow: 1,
    gap: 5,
    minWidth: 105,
    padding: 14,
  },
  rangeLabel: {
    color: AppTheme.textSecondary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  rangeLabelFeatured: {
    color: "#8AC7AA",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  rangeValue: {
    color: AppTheme.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  rangeValueFeatured: {
    color: "#FFFDF7",
    fontSize: 18,
    fontWeight: "900",
  },
  rangeHelp: {
    color: AppTheme.textSecondary,
    fontSize: 9,
    lineHeight: 13,
  },
  rangeHelpFeatured: {
    color: "#BFD1C8",
    fontSize: 9,
    lineHeight: 13,
  },
  evidenceCard: {
    gap: 0,
  },
  evidenceRow: {
    alignItems: "flex-start",
    borderTopColor: AppTheme.cardBorder,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  firstRow: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  evidenceIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 11,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  evidenceText: {
    color: AppTheme.textPrimary,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 5,
  },
  compsList: {
    gap: 9,
  },
  compCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  compNumber: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 12,
    height: 37,
    justifyContent: "center",
    width: 37,
  },
  compNumberText: {
    color: AppTheme.accentDeep,
    fontSize: 9,
    fontWeight: "900",
  },
  compCopy: {
    flex: 1,
    gap: 2,
  },
  compTitle: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  compSource: {
    color: AppTheme.textSecondary,
    fontSize: 10,
  },
  compPrice: {
    color: AppTheme.accentDeep,
    fontSize: 14,
    fontWeight: "900",
  },
  guidanceCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 13,
  },
  guidanceRow: {
    alignItems: "flex-start",
    borderBottomColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    paddingBottom: 12,
  },
  guidanceNumber: {
    color: "#8AC7AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  guidanceText: {
    color: "#DDE9E3",
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  sellTimePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#DFF2E8",
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  sellTimeText: {
    color: AppTheme.accentDeep,
    fontSize: 10,
    fontWeight: "800",
  },
  listingCard: {
    gap: 9,
  },
  listingTitle: {
    color: AppTheme.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 23,
  },
  listingBody: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  disclaimerCard: {
    alignItems: "flex-start",
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 11,
  },
  disclaimerCopy: {
    flex: 1,
    gap: 4,
  },
  disclaimerTitle: {
    color: "#FFFDF7",
    fontSize: 13,
    fontWeight: "800",
  },
  disclaimerBody: {
    color: "#BFD1C8",
    fontSize: 11,
    lineHeight: 17,
  },
});
