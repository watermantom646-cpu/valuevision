import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { pushPublicRoute } from "@/lib/public-navigation";
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

export default function SellScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadHistory().then((rows) => {
        if (mounted) setItems(rows);
      });
      return () => {
        mounted = false;
      };
    }, [])
  );

  const latest = items[0] || null;
  const topProfit = useMemo(() => {
    return [...items]
      .filter((x) => typeof x.profit?.expectedProfit === "number")
      .sort((a, b) => Number(b.profit?.expectedProfit || 0) - Number(a.profit?.expectedProfit || 0))
      .slice(0, 5);
  }, [items]);

  const symbol = symbolFor(latest);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>SELL TOOLS</Text>
        <Text style={styles.title}>List Smarter</Text>
        <Text style={styles.subtitle}>Focus on sell speed, expected profit, and listing quality.</Text>
        <Pressable style={styles.heroButton} onPress={() => router.push("/deals")}>
          <Text style={styles.heroButtonText}>Open Deals Board</Text>
        </Pressable>
      </View>

      {!latest ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No scans yet</Text>
          <Text style={styles.meta}>Scan an item first, then use Sell Tools to choose price and marketplace.</Text>
          <Pressable style={styles.buttonPrimary} onPress={() => pushPublicRoute(router, "/scan")}>
            <Text style={styles.buttonPrimaryText}>Go to Scan</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Latest Item</Text>
            <Text style={styles.itemTitle}>{latest.query}</Text>
            <Text style={styles.meta}>{`Median: ${fmt(latest.median, symbol)} | Category: ${latest.category || "general"}`}</Text>
            {latest.recommendedRetail ? (
              <Text style={styles.meta}>{`Retail new est: ${fmt(latest.recommendedRetail.median, symbol)}`}</Text>
            ) : null}
            {latest.sellTime ? (
              <Text style={styles.meta}>{`Estimated sell time: ${latest.sellTime.text}`}</Text>
            ) : null}
            <Pressable style={styles.buttonSecondary} onPress={() => router.push(`/item/${latest.id}`)}>
              <Text style={styles.buttonSecondaryText}>Open Full Item Page</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profit Opportunities</Text>
            {!topProfit.length ? <Text style={styles.meta}>No profit data yet. Add buy price during scan.</Text> : null}
            {topProfit.map((item) => {
              const s = symbolFor(item);
              return (
                <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/item/${item.id}`)}>
                  <Text style={styles.rowTitle}>{item.query}</Text>
                  <Text style={styles.meta}>{`Expected profit: ${fmt(item.profit?.expectedProfit, s)}`}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
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
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    borderRadius: 16,
    padding: 15,
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
  heroButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroButtonText: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  card: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 6,
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
  itemTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  buttonPrimary: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: AppTheme.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonPrimaryText: {
    color: "#022421",
    fontWeight: "700",
  },
  buttonSecondary: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: AppTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonSecondaryText: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: AppTheme.cardBorder,
    paddingTop: 8,
    gap: 2,
  },
  rowTitle: {
    color: AppTheme.textPrimary,
    fontWeight: "700",
  },
});
