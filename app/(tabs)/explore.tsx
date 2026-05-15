import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { resolveApiBase } from "@/lib/api-base";
import { loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";

function symbolFor(item: ScanHistoryEntry) {
  if (item.currencySymbol) return item.currencySymbol;
  if (item.currency === "GBP") return "£";
  if (item.currency === "EUR") return "€";
  if (item.currency === "CAD") return "C$";
  if (item.currency === "AUD") return "A$";
  return "$";
}

export default function InsightsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);
  const [accuracy, setAccuracy] = useState<{
    mapePct: number | null;
    outcomesSamples: number;
    soldCompsCoverage: { total: number };
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadHistory().then((rows) => {
        if (mounted) setItems(rows);
      });
      fetch(`${resolveApiBase()}/valuation/accuracy-dashboard?days=30`)
        .then((r) => r.json())
        .then((j) => {
          if (!mounted || !j?.ok) return;
          setAccuracy(j.dashboard || null);
        })
        .catch(() => {});
      return () => {
        mounted = false;
      };
    }, [])
  );

  const stats = useMemo(() => {
    const total = items.length;
    const withMedian = items.filter((x) => typeof x.median === "number");
    const avgMedian = withMedian.length
      ? withMedian.reduce((s, x) => s + Number(x.median || 0), 0) / withMedian.length
      : null;
    const highConfidence = items.filter((x) => x.confidenceLabel === "high").length;
    const qualityPass = items.filter((x) => x.qualityGate?.status === "pass").length;
    return {
      total,
      avgMedian,
      highConfidence,
      qualityPass,
    };
  }, [items]);

  const recent = items.slice(0, 8);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>VALUEVISION INSIGHTS</Text>
        <Text style={styles.title}>Performance Dashboard</Text>
        <Text style={styles.subtitle}>Track scan quality, confidence trends, and your most valuable finds.</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Scans</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>High Confidence</Text>
          <Text style={styles.statValue}>{stats.highConfidence}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Quality Pass</Text>
          <Text style={styles.statValue}>{stats.qualityPass}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Avg Mid Price</Text>
          <Text style={styles.statValue}>{typeof stats.avgMedian === "number" ? `${stats.avgMedian.toFixed(0)}` : "n/a"}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>30d MAPE</Text>
          <Text style={styles.statValue}>{typeof accuracy?.mapePct === "number" ? `${accuracy.mapePct.toFixed(1)}%` : "n/a"}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sold Comps</Text>
          <Text style={styles.statValue}>{accuracy?.soldCompsCoverage?.total ?? "n/a"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent high-value scans</Text>
        {!recent.length ? <Text style={styles.muted}>Scan items to unlock insights.</Text> : null}
        {recent
          .filter((x) => typeof x.median === "number")
          .sort((a, b) => Number(b.median || 0) - Number(a.median || 0))
          .slice(0, 5)
          .map((item) => {
            const symbol = symbolFor(item);
            return (
              <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/item/${item.id}`)}>
                <Text style={styles.query}>{item.query}</Text>
                <Text style={styles.meta}>{`${symbol}${Number(item.median || 0).toFixed(0)} | ${item.confidenceLabel || "unknown"}`}</Text>
              </Pressable>
            );
          })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quality checklist</Text>
        <Text style={styles.listItem}>• Use Quick Scan first, then wait for refine pass.</Text>
        <Text style={styles.listItem}>• Add brand/model when confidence is low.</Text>
        <Text style={styles.listItem}>• Check confidence reasons before buying items.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 12,
    backgroundColor: AppTheme.bg,
  },
  hero: {
    backgroundColor: AppTheme.surface,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 6,
    shadowColor: "#170a2f",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  kicker: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: AppTheme.textPrimary,
    fontSize: 24,
    fontWeight: "900",
  },
  subtitle: {
    color: AppTheme.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 2,
    shadowColor: "#201141",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  statLabel: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  statValue: {
    color: AppTheme.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  card: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 9,
    shadowColor: "#201141",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 15,
  },
  muted: {
    color: AppTheme.textSecondary,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: AppTheme.cardBorder,
    paddingTop: 8,
    gap: 2,
  },
  query: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  listItem: {
    color: AppTheme.textSecondary,
  },
});
