import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { loadHistory, type ScanHistoryEntry } from "@/lib/scan-history";

function symbolFor(item?: ScanHistoryEntry | null) {
  if (!item) return "£";
  if (item.currencySymbol) return item.currencySymbol;
  if (item.currency === "GBP") return "£";
  if (item.currency === "EUR") return "€";
  if (item.currency === "CAD") return "C$";
  if (item.currency === "AUD") return "A$";
  return "$";
}

function fmt(value: number | null | undefined, symbol: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${symbol}${value.toFixed(0)}`;
}

export default function DealsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    loadHistory().then(setItems);
  }, []);

  const ranked = useMemo(() => {
    return items
      .filter((x) => typeof x.profit?.expectedProfit === "number")
      .sort((a, b) => Number(b.profit?.expectedProfit || 0) - Number(a.profit?.expectedProfit || 0));
  }, [items]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>DEALS BOARD</Text>
        <Text style={styles.title}>Best Flip Opportunities</Text>
        <Text style={styles.subtitle}>Sorted by expected profit from your real scans.</Text>
      </View>

      {!ranked.length ? (
        <View style={styles.card}>
          <Text style={styles.meta}>No ranked deals yet. Scan items and enter buy price to build this board.</Text>
          <Pressable style={styles.button} onPress={() => router.push("/(tabs)/scan")}>
            <Text style={styles.buttonText}>Go Scan Items</Text>
          </Pressable>
        </View>
      ) : null}

      {ranked.slice(0, 30).map((item, idx) => {
        const symbol = symbolFor(item);
        return (
          <Pressable key={item.id} style={styles.card} onPress={() => router.push(`/item/${item.id}`)}>
            <Text style={styles.rank}>#{idx + 1}</Text>
            <Text style={styles.query}>{item.query}</Text>
            <Text style={styles.meta}>{`Expected profit: ${fmt(item.profit?.expectedProfit, symbol)}`}</Text>
            <Text style={styles.meta}>{`Median value: ${fmt(item.median, symbol)} | Confidence: ${item.confidenceLabel || "unknown"}`}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    gap: 10,
    backgroundColor: AppTheme.bg,
  },
  hero: {
    backgroundColor: AppTheme.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 4,
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
  card: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 3,
  },
  rank: {
    color: AppTheme.accent,
    fontWeight: "800",
  },
  query: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  button: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: AppTheme.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonText: {
    color: "#022421",
    fontWeight: "700",
  },
});
