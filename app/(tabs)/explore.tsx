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

function money(item: ScanHistoryEntry | undefined, value: number) {
  return `${item?.currencySymbol || "£"}${Math.round(value).toLocaleString("en-GB")}`;
}

export default function ExploreScreen() {
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

  const valued = useMemo(() => items.filter((item) => typeof item.median === "number"), [items]);
  const highConfidence = useMemo(
    () => items.filter((item) => /high|strong/i.test(item.confidenceLabel || "")),
    [items],
  );
  const combinedMidpoint = useMemo(
    () => valued.reduce((sum, item) => sum + (item.median || 0), 0),
    [valued],
  );
  const strongest = useMemo(
    () => [...valued].sort((a, b) => (b.median || 0) - (a.median || 0)).slice(0, 3),
    [valued],
  );

  return (
    <PremiumScreen>
      <PremiumHero
        description="A calm overview of the value you have uncovered, the evidence you can trust and the finds worth revisiting."
        eyebrow="Collection intelligence"
        icon="analytics-outline"
        title="See the story behind your scans."
      >
        <View style={styles.heroStats}>
          <View>
            <Text style={styles.heroStatValue}>{items.length}</Text>
            <Text style={styles.heroStatLabel}>total finds</Text>
          </View>
          <View style={styles.heroDivider} />
          <View>
            <Text style={styles.heroStatValue}>{highConfidence.length}</Text>
            <Text style={styles.heroStatLabel}>strong confidence</Text>
          </View>
          <View style={styles.heroDivider} />
          <View>
            <Text style={styles.heroStatValue}>{money(valued[0], combinedMidpoint)}</Text>
            <Text style={styles.heroStatLabel}>combined midpoint</Text>
          </View>
        </View>
      </PremiumHero>

      <View style={styles.headingWrap}>
        <Text style={styles.kicker}>AT A GLANCE</Text>
        <Text style={styles.heading}>Your value dashboard</Text>
      </View>

      <View style={styles.metricGrid}>
        <PremiumCard style={styles.metricCard}>
          <View style={styles.metricIcon}>
            <Ionicons color={AppTheme.accentDeep} name="scan-outline" size={22} />
          </View>
          <Text style={styles.metricValue}>{items.length}</Text>
          <Text style={styles.metricLabel}>Scans saved</Text>
        </PremiumCard>
        <PremiumCard style={styles.metricCard}>
          <View style={styles.metricIcon}>
            <Ionicons color={AppTheme.accentDeep} name="checkmark-circle-outline" size={22} />
          </View>
          <Text style={styles.metricValue}>{valued.length}</Text>
          <Text style={styles.metricLabel}>With a value</Text>
        </PremiumCard>
        <PremiumCard style={styles.metricCard}>
          <View style={styles.metricIcon}>
            <Ionicons color={AppTheme.accentDeep} name="shield-checkmark-outline" size={22} />
          </View>
          <Text style={styles.metricValue}>{highConfidence.length}</Text>
          <Text style={styles.metricLabel}>Strong matches</Text>
        </PremiumCard>
        <PremiumCard style={styles.metricCard}>
          <View style={styles.metricIcon}>
            <Ionicons color={AppTheme.accentDeep} name="cash-outline" size={22} />
          </View>
          <Text numberOfLines={1} style={styles.metricValue}>{money(valued[0], combinedMidpoint)}</Text>
          <Text style={styles.metricLabel}>Collection value</Text>
        </PremiumCard>
      </View>

      <View style={styles.headingWrap}>
        <Text style={styles.kicker}>TOP FINDS</Text>
        <Text style={styles.heading}>Worth another look</Text>
      </View>

      {strongest.length ? (
        strongest.map((item, index) => (
          <PremiumCard
            key={item.id}
            onPress={() => router.push(`/item/${item.id}` as never)}
            style={styles.findCard}
          >
            <View style={styles.findRank}>
              <Text style={styles.findRankText}>{String(index + 1).padStart(2, "0")}</Text>
            </View>
            <View style={styles.findCopy}>
              <Text numberOfLines={2} style={styles.findTitle}>{item.query}</Text>
              <Text style={styles.findMeta}>{item.category || "Valued item"} · {item.confidenceLabel || "Estimate ready"}</Text>
            </View>
            <View style={styles.findValueWrap}>
              <Text style={styles.findValue}>{money(item, item.median || 0)}</Text>
              <Ionicons color={AppTheme.textSecondary} name="arrow-forward" size={17} />
            </View>
          </PremiumCard>
        ))
      ) : (
        <PremiumCard style={styles.emptyCard}>
          <Ionicons color={AppTheme.accent} name="sparkles-outline" size={30} />
          <Text style={styles.emptyTitle}>Your insights will grow with every scan</Text>
          <Text style={styles.emptyBody}>Value an item to begin building a clear picture of what your collection may be worth.</Text>
          <PremiumButton label="Start a valuation" onPress={() => router.push("/scan")} />
        </PremiumCard>
      )}

      <PremiumCard style={styles.actionCard}>
        <View style={styles.actionCopy}>
          <Text style={styles.actionKicker}>NEXT BEST ACTION</Text>
          <Text style={styles.actionTitle}>Turn information into a decision</Text>
          <Text style={styles.actionBody}>Review selling opportunities, revisit saved evidence or scan another find.</Text>
        </View>
        <View style={styles.actionButtons}>
          <PremiumButton label="Selling opportunities" onPress={() => router.push("/deals")} />
          <PremiumButton label="Open collection" onPress={() => router.push("/history")} variant="secondary" />
        </View>
      </PremiumCard>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  heroStats: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
  },
  heroStatValue: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 19,
    fontWeight: "700",
  },
  heroStatLabel: {
    color: "#AFC7BB",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  heroDivider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 35,
    width: 1,
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
    fontSize: 25,
    fontWeight: "700",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexBasis: "46%",
    flexGrow: 1,
    gap: 7,
    minWidth: 140,
  },
  metricIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  metricValue: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 24,
    fontWeight: "700",
  },
  metricLabel: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  findCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 15,
  },
  findRank: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 15,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  findRankText: {
    color: "#D9F4E7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  findCopy: {
    flex: 1,
    gap: 3,
  },
  findTitle: {
    color: AppTheme.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  findMeta: {
    color: AppTheme.textSecondary,
    fontSize: 10,
  },
  findValueWrap: {
    alignItems: "flex-end",
    gap: 5,
  },
  findValue: {
    color: AppTheme.accentDeep,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyCard: {
    alignItems: "center",
    gap: 12,
    padding: 25,
  },
  emptyTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  actionCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 17,
  },
  actionCopy: {
    gap: 6,
  },
  actionKicker: {
    color: "#8AC7AA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  actionTitle: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "700",
  },
  actionBody: {
    color: "#BFD1C8",
    fontSize: 12,
    lineHeight: 18,
  },
  actionButtons: {
    gap: 9,
  },
});
