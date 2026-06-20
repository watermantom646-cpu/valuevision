import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { clearHistory, loadHistory, removeHistoryEntry, type ScanHistoryEntry } from "@/lib/scan-history";

export default function HistoryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "cars" | "items">("all");
  const [refreshing, setRefreshing] = useState(false);
  const introAnim = useRef(new Animated.Value(0)).current;

  const reloadHistory = useCallback(async () => {
    const rows = await loadHistory();
    setItems(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      reloadHistory().then(() => {
        if (!mounted) return;
      });
      return () => {
        mounted = false;
      };
    }, [reloadHistory])
  );

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "cars") return items.filter((x) => (x.category || "").toLowerCase() === "vehicle");
    return items.filter((x) => (x.category || "").toLowerCase() !== "vehicle");
  }, [items, filter]);

  const stats = useMemo(() => {
    const total = items.length;
    const cars = items.filter((x) => (x.category || "").toLowerCase() === "vehicle").length;
    const withValue = items.filter((x) => typeof x.median === "number").length;
    return { total, cars, withValue };
  }, [items]);

  return (
    <ScrollView contentContainerStyle={[styles.screen, isWide && styles.screenWide]}>
      <Animated.View
        style={[
          styles.hero,
          { opacity: introAnim, transform: [{ translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}>
        <Text style={styles.kicker}>COLLECTION</Text>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>Every scan is saved. Tap any item for full valuation details.</Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.heroActionBtnPrimary} onPress={() => router.push("/(tabs)/scan?mode=items")}>
            <Text style={styles.heroActionTextPrimary}>Scan Now</Text>
          </Pressable>
          <Pressable
            style={[styles.heroActionBtn, !FeatureFlags.carChecksAvailable && styles.heroActionBtnDisabled]}
            disabled={!FeatureFlags.carChecksAvailable}
            onPress={() => router.push("/(tabs)/scan?mode=cars")}>
            <Text style={styles.heroActionText}>
              {FeatureFlags.carChecksAvailable ? "Car Scan" : "Car checks paused"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.heroActions}>
          <Pressable
            style={styles.heroActionBtn}
            onPress={async () => {
              setRefreshing(true);
              try {
                await reloadHistory();
              } finally {
                setRefreshing(false);
              }
            }}>
            <Text style={styles.heroActionText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
          {items.length ? (
            <Pressable
              style={styles.heroActionBtnDanger}
              onPress={() => {
                Alert.alert("Clear all history?", "This will remove all saved scans from this device.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                      await clearHistory();
                      await reloadHistory();
                    },
                  },
                ]);
              }}>
              <Text style={styles.heroActionTextDanger}>Clear all scans</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Cars</Text>
          <Text style={styles.statValue}>{stats.cars}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>With Value</Text>
          <Text style={styles.statValue}>{stats.withValue}</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Pressable style={[styles.filterChip, filter === "all" && styles.filterChipActive]} onPress={() => setFilter("all")}>
          <Text style={[styles.filterChipText, filter === "all" && styles.filterChipTextActive]}>All</Text>
        </Pressable>
        <Pressable style={[styles.filterChip, filter === "cars" && styles.filterChipActive]} onPress={() => setFilter("cars")}>
          <Text style={[styles.filterChipText, filter === "cars" && styles.filterChipTextActive]}>Cars</Text>
        </Pressable>
        <Pressable style={[styles.filterChip, filter === "items" && styles.filterChipActive]} onPress={() => setFilter("items")}>
          <Text style={[styles.filterChipText, filter === "items" && styles.filterChipTextActive]}>Items</Text>
        </Pressable>
      </View>
      <Text style={styles.sectionLabel}>{`Results (${filteredItems.length})`}</Text>

      {!filteredItems.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No scans in this view yet. Run a scan to add one.</Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroActionBtnPrimary} onPress={() => router.push("/(tabs)/scan?mode=items")}>
              <Text style={styles.heroActionTextPrimary}>Scan Now</Text>
            </Pressable>
            <Pressable
              style={[styles.heroActionBtn, !FeatureFlags.carChecksAvailable && styles.heroActionBtnDisabled]}
              disabled={!FeatureFlags.carChecksAvailable}
              onPress={() => router.push("/(tabs)/scan?mode=cars")}>
              <Text style={styles.heroActionText}>
                {FeatureFlags.carChecksAvailable ? "Car Scan" : "Car checks paused"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {filteredItems.map((item) => {
        const symbol = item.currencySymbol || (item.currency === "GBP" ? "£" : item.currency === "EUR" ? "€" : "$");
        const med = typeof item.median === "number" ? `${symbol}${item.median.toFixed(0)}` : "n/a";
        const confidence = (item.confidenceLabel || "unknown").toLowerCase();
        return (
          <Pressable
            key={item.id}
            style={styles.card}
            onPress={() => router.push(`/item/${item.id}`)}
            onLongPress={() => {
              Alert.alert("Delete this scan?", item.query, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    await removeHistoryEntry(item.id);
                    await reloadHistory();
                  },
                },
              ]);
            }}>
            <Text style={styles.query}>{item.query}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{med}</Text>
              <View
                style={[
                  styles.confChip,
                  confidence === "high" ? styles.confHigh : confidence === "medium" ? styles.confMid : styles.confLow,
                ]}>
                <Text style={styles.confText}>{item.confidenceLabel || "unknown"}</Text>
              </View>
            </View>
            <Text style={styles.meta}>{`Category: ${item.category || "general"}`}</Text>
            <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.hint}>Tap to open • Long-press to delete</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    borderRadius: 20,
    padding: 16,
    gap: 6,
    shadowColor: "#101d38",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kicker: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: AppTheme.textPrimary,
  },
  subtitle: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroActions: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroActionBtn: {
    flex: 1,
    minWidth: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionBtnDisabled: {
    opacity: 0.55,
  },
  heroActionBtnPrimary: {
    flex: 1,
    minWidth: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.accentDeep,
    backgroundColor: AppTheme.accent,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionText: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  heroActionTextPrimary: {
    color: "#04130f",
    fontWeight: "800",
    fontSize: 13,
  },
  heroActionBtnDanger: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dc2626",
    backgroundColor: "#fff1f2",
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionTextDanger: {
    color: "#991b1b",
    fontWeight: "800",
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    paddingVertical: 10,
    alignItems: "center",
  },
  statLabel: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  statValue: {
    color: AppTheme.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    paddingHorizontal: 13,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: AppTheme.accent,
    borderColor: AppTheme.accentDeep,
  },
  filterChipText: {
    color: AppTheme.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#04130f",
  },
  sectionLabel: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    shadowColor: "#0f172a",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  emptyText: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    backgroundColor: AppTheme.bgAlt,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    gap: 5,
    shadowColor: "#0f172a",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  query: {
    fontWeight: "700",
    color: AppTheme.textPrimary,
    fontSize: 15,
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    flexShrink: 1,
  },
  hint: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  detailsToggleBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailsToggleText: {
    color: AppTheme.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  confChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
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
});
