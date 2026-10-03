import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  PremiumButton,
  PremiumCard,
  PremiumHero,
  PremiumScreen,
} from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";
import {
  clearHistory,
  loadHistory,
  removeHistoryEntry,
  type ScanHistoryEntry,
} from "@/lib/scan-history";

type Filter = "all" | "cars" | "items";

function isCar(item: ScanHistoryEntry) {
  const text = [item.category, item.query, item.detectedQuery].filter(Boolean).join(" ").toLowerCase();
  return /car|vehicle|van|motor|registration|number plate|vrm/.test(text);
}

function money(item: ScanHistoryEntry, value: number | undefined) {
  if (typeof value !== "number") return "Awaiting value";
  return `${item.currencySymbol || "£"}${Math.round(value).toLocaleString("en-GB")}`;
}

function friendlyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ScanHistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    setItems(await loadHistory());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const cars = useMemo(() => items.filter(isCar), [items]);
  const valued = useMemo(() => items.filter((item) => typeof item.median === "number"), [items]);
  const visible = useMemo(() => {
    if (filter === "cars") return cars;
    if (filter === "items") return items.filter((item) => !isCar(item));
    return items;
  }, [cars, filter, items]);

  const requestDelete = useCallback(
    (item: ScanHistoryEntry) => {
      Alert.alert("Remove saved result?", item.query, [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeHistoryEntry(item.id);
            await refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  const requestClear = useCallback(() => {
    if (!items.length) return;
    Alert.alert("Clear your collection?", "This removes every saved valuation from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: async () => {
          await clearHistory();
          await refresh();
        },
      },
    ]);
  }, [items.length, refresh]);

  return (
    <PremiumScreen>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>V</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>VALUEVISION</Text>
          <Text style={styles.brandTagline}>MY COLLECTION</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh collection"
          accessibilityRole="button"
          onPress={refresh}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          <Ionicons color={AppTheme.accentDeep} name="refresh" size={19} />
        </Pressable>
      </View>

      <PremiumHero
        description="Every item valuation and car check kept together, ready to revisit when you want to sell, compare or make a decision."
        eyebrow="Your saved intelligence"
        icon="bookmark-outline"
        title="Your finds, beautifully organised."
      >
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{items.length}</Text>
            <Text style={styles.heroStatLabel}>saved</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{cars.length}</Text>
            <Text style={styles.heroStatLabel}>vehicles</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{valued.length}</Text>
            <Text style={styles.heroStatLabel}>valued</Text>
          </View>
        </View>
      </PremiumHero>

      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>COLLECTION</Text>
          <Text style={styles.heading}>Saved results</Text>
          <Text style={styles.headingBody}>Tap to reopen. Hold a card to remove it.</Text>
        </View>
        {items.length ? (
          <Pressable accessibilityRole="button" onPress={requestClear} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterBar}>
        {(["all", "items", "cars"] as Filter[]).map((value) => {
          const active = filter === value;
          return (
            <Pressable
              accessibilityRole="button"
              key={value}
              onPress={() => setFilter(value)}
              style={({ pressed }) => [
                styles.filterButton,
                active && styles.filterButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {value === "all" ? "All" : value === "items" ? "Items" : "Cars"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visible.length ? (
        <View style={styles.resultsList}>
          {visible.map((item, index) => (
            <PremiumCard
              accessibilityLabel={`Open ${item.query}`}
              key={item.id}
              onPress={() => router.push(`/item/${item.id}` as never)}
              style={styles.resultCard}
            >
              <Pressable
                delayLongPress={500}
                onLongPress={() => requestDelete(item)}
                onPress={() => router.push(`/item/${item.id}` as never)}
                style={({ pressed }) => [styles.resultInner, pressed && styles.pressed]}
              >
                <View style={[styles.resultIcon, isCar(item) && styles.resultCarIcon]}>
                  <Ionicons
                    color={isCar(item) ? "#D9F4E7" : AppTheme.accentDeep}
                    name={isCar(item) ? "car-sport-outline" : "cube-outline"}
                    size={23}
                  />
                </View>
                <View style={styles.resultCopy}>
                  <View style={styles.resultTopline}>
                    <Text style={styles.resultNumber}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={styles.resultCategory}>{item.category || (isCar(item) ? "Vehicle" : "Valued item")}</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.resultTitle}>{item.query}</Text>
                  <Text style={styles.resultDate}>{friendlyDate(item.createdAt)}</Text>
                </View>
                <View style={styles.resultValueWrap}>
                  <Text style={styles.resultValueLabel}>MIDPOINT</Text>
                  <Text style={styles.resultValue}>{money(item, item.median ?? undefined)}</Text>
                  <Ionicons color={AppTheme.textSecondary} name="arrow-forward" size={17} />
                </View>
              </Pressable>
            </PremiumCard>
          ))}
        </View>
      ) : (
        <PremiumCard style={styles.emptyCard}>
          <View style={styles.emptyVisual}>
            <View style={styles.emptyRing}>
              <Ionicons color="#D9F4E7" name="bookmark-outline" size={31} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>
            {items.length ? "Nothing in this view yet" : "Your collection starts with one scan"}
          </Text>
          <Text style={styles.emptyBody}>
            {items.length
              ? "Choose another filter to see the results you have already saved."
              : "Value an item or check a vehicle and the result will be kept here automatically."}
          </Text>
          <View style={styles.emptyActions}>
            <PremiumButton label="Value an item" onPress={() => router.push("/scan")} />
            <PremiumButton label="Check a car" onPress={() => router.push("/car-mode")} variant="secondary" />
          </View>
        </PremiumCard>
      )}

      <PremiumCard style={styles.footerCard}>
        <Ionicons color="#9FD8BF" name="lock-closed-outline" size={21} />
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>Private to your account and device</Text>
          <Text style={styles.footerBody}>Use your saved results as a working collection, not as proof of a guaranteed selling price.</Text>
        </View>
      </PremiumCard>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    paddingHorizontal: 3,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 13,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  brandLetter: {
    color: "#D9F4E7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "800",
  },
  brandCopy: {
    flex: 1,
  },
  brandName: {
    color: AppTheme.textPrimary,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  brandTagline: {
    color: AppTheme.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.15,
    marginTop: 2,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: AppTheme.surface,
    borderColor: AppTheme.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  heroStats: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroStat: {
    flex: 1,
  },
  heroStatValue: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 24,
    fontWeight: "700",
  },
  heroStatLabel: {
    color: "#AFC7BB",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  heroDivider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 36,
    width: 1,
  },
  headingRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 3,
  },
  headingCopy: {
    flex: 1,
    gap: 4,
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
  },
  headingBody: {
    color: AppTheme.textSecondary,
    fontSize: 12,
  },
  clearButton: {
    backgroundColor: "#F7E4DF",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: {
    color: AppTheme.danger,
    fontSize: 11,
    fontWeight: "800",
  },
  filterBar: {
    backgroundColor: "#E4DED2",
    borderRadius: 17,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  filterButton: {
    alignItems: "center",
    borderRadius: 13,
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
  },
  filterButtonActive: {
    backgroundColor: AppTheme.accentDeep,
  },
  filterText: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  filterTextActive: {
    color: "#FFFDF7",
  },
  resultsList: {
    gap: 11,
  },
  resultCard: {
    padding: 0,
  },
  resultInner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    padding: 15,
  },
  resultIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 16,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  resultCarIcon: {
    backgroundColor: AppTheme.accentDeep,
  },
  resultCopy: {
    flex: 1,
    gap: 3,
  },
  resultTopline: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  resultNumber: {
    color: AppTheme.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  resultCategory: {
    color: AppTheme.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  resultTitle: {
    color: AppTheme.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  resultDate: {
    color: AppTheme.textSecondary,
    fontSize: 10,
  },
  resultValueWrap: {
    alignItems: "flex-end",
    gap: 3,
  },
  resultValueLabel: {
    color: AppTheme.textSecondary,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  resultValue: {
    color: AppTheme.accentDeep,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyCard: {
    alignItems: "center",
    gap: 13,
    padding: 24,
  },
  emptyVisual: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 24,
    height: 104,
    justifyContent: "center",
    marginBottom: 3,
    width: "100%",
  },
  emptyRing: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 30,
    borderWidth: 1,
    height: 68,
    justifyContent: "center",
    width: 68,
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
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyActions: {
    alignSelf: "stretch",
    gap: 9,
    marginTop: 3,
  },
  footerCard: {
    alignItems: "flex-start",
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 12,
  },
  footerCopy: {
    flex: 1,
    gap: 4,
  },
  footerTitle: {
    color: "#FFFDF7",
    fontSize: 14,
    fontWeight: "800",
  },
  footerBody: {
    color: "#BFD1C8",
    fontSize: 11,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
});
