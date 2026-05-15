import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { getHistoryEntry, loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";

export default function ItemDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [item, setItem] = useState<ScanHistoryEntry | null>(null);
  const [all, setAll] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    if (!params.id) return;
    getHistoryEntry(params.id).then((row) => setItem(row));
    loadHistory().then((rows) => setAll(rows));
  }, [params.id]);

  const trendPoints = useMemo(() => {
    const key = (item?.query || "").toLowerCase().trim();
    if (!key) return [];
    return all
      .filter((x) => x.query.toLowerCase().trim() === key && typeof x.median === "number")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-12);
  }, [all, item?.query]);
  const trendValues = trendPoints.map((x) => Number(x.median || 0));
  const maxTrend = trendValues.length ? Math.max(...trendValues) : 0;
  const minTrend = trendValues.length ? Math.min(...trendValues) : 0;

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Item not found.</Text>
      </View>
    );
  }

  const symbol = item.currencySymbol || (item.currency === "GBP" ? "£" : item.currency === "EUR" ? "€" : "$");
  const fmt = (n?: number | null) => (typeof n === "number" ? `${symbol}${n.toFixed(2)}` : "n/a");
  const confidence = String(item.confidenceLabel || "unknown").toLowerCase();
  const trustLabel =
    item.qualityGate?.status === "pass"
      ? "Ready to use"
      : item.qualityGate?.status === "caution"
        ? "Use caution"
        : item.qualityGate?.status === "hold"
          ? "Needs more detail"
          : "Unknown";

  return (
    <ScrollView contentContainerStyle={[styles.screen, isWide && styles.screenWide]}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>ITEM ANALYSIS</Text>
        <Text style={styles.title}>{item.query}</Text>
        <Text style={styles.metaHero}>{new Date(item.createdAt).toLocaleString()}</Text>
        <View style={styles.heroMetaRow}>
          <View
            style={[
              styles.confChip,
              confidence === "high" ? styles.confHigh : confidence === "medium" ? styles.confMid : styles.confLow,
            ]}>
            <Text style={styles.confText}>{item.confidenceLabel || "unknown"}</Text>
          </View>
          <View style={styles.trustPill}>
            <Text style={styles.trustPillText}>{trustLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Valuation</Text>
        <View style={styles.valueRow}>
          <View style={styles.valueTile}>
            <Text style={styles.valueLabel}>Low</Text>
            <Text style={styles.valueText}>{fmt(item.low)}</Text>
          </View>
          <View style={styles.valueTileFeatured}>
            <Text style={styles.valueLabel}>Median</Text>
            <Text style={styles.valueTextFeatured}>{fmt(item.median)}</Text>
          </View>
          <View style={styles.valueTile}>
            <Text style={styles.valueLabel}>High</Text>
            <Text style={styles.valueText}>{fmt(item.high)}</Text>
          </View>
        </View>
        {item.recommendedRetail ? (
          <Text style={styles.meta}>{`Retail New (est): ${fmt(item.recommendedRetail.median)}`}</Text>
        ) : null}
        <Text style={styles.meta}>{`Category: ${item.category || "general"}`}</Text>
        <Text style={styles.meta}>{`Confidence: ${item.confidenceLabel || "unknown"}`}</Text>
        {item.qualityGate ? (
          <Text style={styles.meta}>{`Quality gate: ${item.qualityGate.status} (${item.qualityGate.score}/100)`}</Text>
        ) : null}
      </View>

      {trendPoints.length >= 2 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price Trend</Text>
          <View style={styles.chartWrap}>
            {trendValues.map((v, i) => {
              const denom = Math.max(1, maxTrend - minTrend);
              const ratio = (v - minTrend) / denom;
              const h = 20 + ratio * 60;
              return <View key={`${v}-${i}`} style={[styles.bar, { height: h }]} />;
            })}
          </View>
          <Text style={styles.meta}>{`Low: ${fmt(minTrend)} | High: ${fmt(maxTrend)} | Points: ${trendPoints.length}`}</Text>
        </View>
      ) : null}

      {item.confidenceReasons?.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Confidence Notes</Text>
          {item.confidenceReasons.map((r, i) => (
            <Text key={`${r}-${i}`}>• {r}</Text>
          ))}
        </View>
      ) : null}

      {item.sellTime ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estimated Time to Sell</Text>
          <Text>{`${item.sellTime.text} (${item.sellTime.speed})`}</Text>
        </View>
      ) : null}

      {item.profit ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profit</Text>
          <Text>{`Buy price: ${fmt(item.profit.buyPrice)}`}</Text>
          <Text>{`Expected: ${fmt(item.profit.expectedProfit)}`}</Text>
          <Text>{`Conservative: ${fmt(item.profit.conservativeProfit)}`}</Text>
          <Text>{`Optimistic: ${fmt(item.profit.optimisticProfit)}`}</Text>
        </View>
      ) : null}

      {item.listingAssistant ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Listing Assistant</Text>
          <Text>{`Title: ${item.listingAssistant.suggestedTitle}`}</Text>
          <Text>{`Start: ${item.listingAssistant.suggestedStartPrice}`}</Text>
          <Text>{`Range: ${item.listingAssistant.suggestedRange}`}</Text>
          {item.listingAssistant.bulletPoints.map((b, i) => (
            <Text key={`${b}-${i}`}>• {b}</Text>
          ))}
          <Text>{`Tip: ${item.listingAssistant.listingTip}`}</Text>
        </View>
      ) : null}

      {item.recommendations?.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where to Sell</Text>
          {item.recommendations.map((r, i) => (
            <Text key={`${r.name}-${i}`}>• {r.name}: {r.reason}</Text>
          ))}
        </View>
      ) : null}

      {item.comps?.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Comparable Listings</Text>
          {item.comps.slice(0, 10).map((c, i) => (
            <Text key={`${c.title}-${i}`}>• {c.price || "n/a"} — {c.title}</Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppTheme.bg,
  },
  muted: {
    color: AppTheme.textSecondary,
  },
  screen: {
    padding: 18,
    gap: 12,
    backgroundColor: AppTheme.bg,
  },
  screenWide: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
  },
  hero: {
    backgroundColor: AppTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    padding: 16,
    gap: 6,
    shadowColor: "#101d38",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  kicker: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: AppTheme.textPrimary,
  },
  metaHero: {
    color: AppTheme.textSecondary,
    fontSize: 13,
  },
  heroMetaRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  confChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  trustPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 28,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    justifyContent: "center",
  },
  trustPillText: {
    color: AppTheme.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 13,
  },
  card: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 4,
    shadowColor: "#1a2744",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardTitle: {
    fontWeight: "800",
    fontSize: 14,
    color: AppTheme.textPrimary,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  valueTile: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  valueTileFeatured: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2db7a6",
    backgroundColor: "#e6fbf6",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  valueLabel: {
    color: AppTheme.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  valueText: {
    color: AppTheme.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  valueTextFeatured: {
    color: "#0b3f39",
    fontSize: 17,
    fontWeight: "900",
  },
  chartWrap: {
    marginTop: 6,
    height: 90,
    borderRadius: 10,
    backgroundColor: AppTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: AppTheme.accent,
    minHeight: 6,
  },
});
