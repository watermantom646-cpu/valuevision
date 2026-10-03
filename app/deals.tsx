import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PremiumButton, PremiumCard, PremiumHero, PremiumScreen } from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";
import { loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";

function profitFor(item: ScanHistoryEntry) {
  if (typeof item.profit === "number") return item.profit;
  if (typeof item.median === "number" && typeof item.low === "number") {
    return Math.max(0, item.median - item.low);
  }
  return 0;
}

function money(item: ScanHistoryEntry, value: number | undefined) {
  if (typeof value !== "number") return "Not valued";
  return `${item.currencySymbol || "£"}${Math.round(value).toLocaleString("en-GB")}`;
}

export default function DealsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    let active = true;
    loadHistory().then((saved) => {
      if (active) setItems(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const ranked = useMemo(
    () => [...items].filter((item) => typeof item.median === "number").sort((a, b) => profitFor(b) - profitFor(a)),
    [items],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={AppTheme.accentDeep} name="arrow-back" size={19} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <PremiumHero
          description="Your saved valuations, ranked by the strongest estimated resale opportunity."
          eyebrow="Opportunity finder"
          icon="trending-up-outline"
          title="The finds worth another look."
        >
          <View style={styles.heroStatRow}>
            <View>
              <Text style={styles.heroStatValue}>{ranked.length}</Text>
              <Text style={styles.heroStatLabel}>valued finds</Text>
            </View>
            <View style={styles.heroDivider} />
            <View>
              <Text style={styles.heroStatValue}>{ranked[0] ? money(ranked[0], profitFor(ranked[0])) : "£0"}</Text>
              <Text style={styles.heroStatLabel}>best potential upside</Text>
            </View>
          </View>
        </PremiumHero>

        <View style={styles.headingRow}>
          <View>
            <Text style={styles.kicker}>RANKED FOR YOU</Text>
            <Text style={styles.heading}>Best opportunities</Text>
          </View>
          <Ionicons color={AppTheme.accent} name="options-outline" size={22} />
        </View>

        {ranked.length ? (
          ranked.map((item, index) => (
            <PremiumCard
              accessibilityLabel={`Open ${item.query}`}
              key={item.id}
              onPress={() => router.push(`/item/${item.id}` as never)}
              style={styles.dealCard}
            >
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={styles.dealCopy}>
                <Text numberOfLines={2} style={styles.dealTitle}>{item.query}</Text>
                <Text style={styles.dealMeta}>{item.category || "Valued item"} · {item.confidenceLabel || "Estimate ready"}</Text>
                <View style={styles.priceRow}>
                  <View>
                    <Text style={styles.priceLabel}>Likely value</Text>
                    <Text style={styles.priceValue}>{money(item, item.median ?? undefined)}</Text>
                  </View>
                  <View style={styles.upsidePill}>
                    <Text style={styles.upsideLabel}>Potential upside</Text>
                    <Text style={styles.upsideValue}>{money(item, profitFor(item))}</Text>
                  </View>
                </View>
              </View>
              <Ionicons color={AppTheme.textSecondary} name="chevron-forward" size={20} />
            </PremiumCard>
          ))
        ) : (
          <PremiumCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons color={AppTheme.accent} name="diamond-outline" size={30} />
            </View>
            <Text style={styles.emptyTitle}>No opportunities ranked yet</Text>
            <Text style={styles.emptyBody}>
              Scan an item first. Once it has a value range, it will appear here automatically.
            </Text>
            <PremiumButton label="Start a valuation" onPress={() => router.push("/scan")} />
          </PremiumCard>
        )}

        <PremiumCard style={styles.noteCard}>
          <Ionicons color={AppTheme.accent} name="information-circle-outline" size={21} />
          <Text style={styles.noteText}>
            Opportunity figures are guidance, not guaranteed profit. Check condition, fees, postage and completed sales before buying to resell.
          </Text>
        </PremiumCard>
      </PremiumScreen>
    </>
  );
}

const styles = StyleSheet.create({
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
  heroStatRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
  },
  heroStatValue: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "700",
  },
  heroStatLabel: {
    color: "#AFC7BB",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  heroDivider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 38,
    width: 1,
  },
  headingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
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
    fontSize: 25,
    fontWeight: "700",
    marginTop: 4,
  },
  dealCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    padding: 16,
  },
  rankBadge: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  rankText: {
    color: "#D9F4E7",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  dealCopy: {
    flex: 1,
    gap: 4,
  },
  dealTitle: {
    color: AppTheme.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  dealMeta: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  priceRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 10,
  },
  priceLabel: {
    color: AppTheme.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  priceValue: {
    color: AppTheme.accentDeep,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  upsidePill: {
    backgroundColor: "#F7EAD5",
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  upsideLabel: {
    color: "#8C5B1F",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  upsideValue: {
    color: "#70420F",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1,
  },
  emptyCard: {
    alignItems: "center",
    gap: 13,
    padding: 26,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 22,
    height: 66,
    justifyContent: "center",
    width: 66,
  },
  emptyTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  noteCard: {
    alignItems: "flex-start",
    backgroundColor: "#E7EEE9",
    flexDirection: "row",
    gap: 10,
  },
  noteText: {
    color: AppTheme.textSecondary,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
