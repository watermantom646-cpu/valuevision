import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  PremiumButton,
  PremiumCard,
  PremiumHero,
  PremiumScreen,
} from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";
import { loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";

function money(item: ScanHistoryEntry | null, value: number | undefined) {
  if (!item || typeof value !== "number") return "Not valued yet";
  return `${item.currencySymbol || "£"}${Math.round(value).toLocaleString("en-GB")}`;
}

function expectedProfit(item: ScanHistoryEntry) {
  if (typeof item.profit === "number") return item.profit;
  if (typeof item.median === "number" && typeof item.low === "number") {
    return Math.max(0, item.median - item.low);
  }
  return 0;
}

export default function SellScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadHistory().then((saved) => {
        if (active) setItems(saved);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const latest = items[0] || null;
  const bestOpportunity = useMemo(
    () => [...items].sort((a, b) => expectedProfit(b) - expectedProfit(a))[0] || null,
    [items],
  );

  return (
    <PremiumScreen>
      <PremiumHero
        description="Turn a valuation into a confident listing with sensible pricing and clear next steps."
        eyebrow="Selling studio"
        icon="pricetag-outline"
        title="From found value to sold."
      >
        <View style={styles.heroActions}>
          <PremiumButton label="Scan something" onPress={() => router.push("/scan")} />
          <PremiumButton
            label="View best opportunities"
            onPress={() => router.push("/deals")}
            variant="secondary"
          />
        </View>
      </PremiumHero>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.kicker}>YOUR SELLING DESK</Text>
          <Text style={styles.sectionTitle}>Ready when you are</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{items.length} saved</Text>
        </View>
      </View>

      {latest ? (
        <PremiumCard
          accessibilityLabel={`Open ${latest.query}`}
          onPress={() => router.push(`/item/${latest.id}` as never)}
          style={styles.featureCard}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.iconTile}>
              <Ionicons color={AppTheme.accentDeep} name="sparkles-outline" size={22} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardEyebrow}>LATEST VALUATION</Text>
              <Text numberOfLines={2} style={styles.cardTitle}>{latest.query}</Text>
            </View>
            <Ionicons color={AppTheme.textSecondary} name="chevron-forward" size={20} />
          </View>
          <View style={styles.valueBand}>
            <View>
              <Text style={styles.valueLabel}>Suggested midpoint</Text>
              <Text style={styles.value}>{money(latest, latest.median ?? undefined)}</Text>
            </View>
            <View style={styles.confidencePill}>
              <Text style={styles.confidenceText}>{latest.confidenceLabel || "Review details"}</Text>
            </View>
          </View>
        </PremiumCard>
      ) : (
        <PremiumCard style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons color={AppTheme.accent} name="camera-outline" size={28} />
          </View>
          <Text style={styles.emptyTitle}>Your first find starts here</Text>
          <Text style={styles.emptyBody}>
            Photograph one clear item and ValueVision will identify it, estimate a range and help you decide where to sell.
          </Text>
          <PremiumButton label="Value an item" onPress={() => router.push("/scan")} />
        </PremiumCard>
      )}

      {bestOpportunity ? (
        <PremiumCard
          accessibilityLabel={`Open best opportunity ${bestOpportunity.query}`}
          onPress={() => router.push(`/item/${bestOpportunity.id}` as never)}
          style={styles.opportunityCard}
        >
          <View style={styles.opportunityHeader}>
            <View>
              <Text style={styles.cardEyebrow}>BEST OPPORTUNITY</Text>
              <Text numberOfLines={2} style={styles.cardTitle}>{bestOpportunity.query}</Text>
            </View>
            <View style={styles.profitPill}>
              <Text style={styles.profitLabel}>Potential upside</Text>
              <Text style={styles.profitValue}>{money(bestOpportunity, expectedProfit(bestOpportunity))}</Text>
            </View>
          </View>
          <Text style={styles.helperText}>
            Open the valuation for pricing guidance, listing notes and the evidence behind the estimate.
          </Text>
        </PremiumCard>
      ) : null}

      <PremiumCard style={styles.guideCard}>
        <View style={styles.guideHeader}>
          <Ionicons color="#D9F4E7" name="shield-checkmark-outline" size={22} />
          <Text style={styles.guideTitle}>A smarter way to list</Text>
        </View>
        <View style={styles.guideRow}>
          <Text style={styles.guideNumber}>01</Text>
          <Text style={styles.guideText}>Use a clear title with the exact model, size and condition.</Text>
        </View>
        <View style={styles.guideRow}>
          <Text style={styles.guideNumber}>02</Text>
          <Text style={styles.guideText}>Price within the evidence range, not from a single asking price.</Text>
        </View>
        <View style={styles.guideRow}>
          <Text style={styles.guideNumber}>03</Text>
          <Text style={styles.guideText}>Describe faults honestly and photograph anything a buyer should see.</Text>
        </View>
      </PremiumCard>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  heroActions: {
    gap: 10,
  },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  kicker: {
    color: AppTheme.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  sectionTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 25,
    fontWeight: "700",
    marginTop: 4,
  },
  countPill: {
    backgroundColor: AppTheme.chip,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countText: {
    color: AppTheme.accentDeep,
    fontSize: 12,
    fontWeight: "800",
  },
  featureCard: {
    gap: 18,
  },
  cardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  iconTile: {
    alignItems: "center",
    backgroundColor: AppTheme.purpleSoft,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  cardEyebrow: {
    color: AppTheme.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  cardTitle: {
    color: AppTheme.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
  },
  valueBand: {
    alignItems: "center",
    backgroundColor: "#F1F5F1",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  valueLabel: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  value: {
    color: AppTheme.accentDeep,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 26,
    fontWeight: "700",
    marginTop: 3,
  },
  confidencePill: {
    backgroundColor: "#DFF2E8",
    borderRadius: 99,
    maxWidth: "43%",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  confidenceText: {
    color: AppTheme.accentDeep,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyCard: {
    alignItems: "center",
    gap: 13,
    padding: 24,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 22,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  emptyTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 23,
    fontWeight: "700",
  },
  emptyBody: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  opportunityCard: {
    gap: 14,
  },
  opportunityHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  profitPill: {
    alignItems: "flex-end",
    backgroundColor: "#F7EAD5",
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  profitLabel: {
    color: "#8C5B1F",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  profitValue: {
    color: "#70420F",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  helperText: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  guideCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 14,
  },
  guideHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  guideTitle: {
    color: "#FFFDF7",
    fontSize: 17,
    fontWeight: "800",
  },
  guideRow: {
    alignItems: "flex-start",
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 13,
  },
  guideNumber: {
    color: "#8AC7AA",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  guideText: {
    color: "#D2E0D9",
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
