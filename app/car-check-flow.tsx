import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { pushPublicRoute, replacePublicRoute } from "@/lib/public-navigation";

const CAPABILITIES = [
  ["Plate recognition", "Scan or enter a UK registration."],
  ["MOT and tax", "See status and important dates in one place."],
  ["Vehicle valuation", "Estimate a current used-market resale range."],
  ["Full history", "Finance, theft and write-off data with a paid full car check."],
] as const;

export default function CarModeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;

  return (
    <ScrollView contentContainerStyle={[styles.screen, isWide && styles.screenWide]}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>VALUEVISION CAR MODE</Text>
        <Text style={styles.title}>Everything car-related, in one clear place.</Text>
        <Text style={styles.subtitle}>
          Car Mode keeps vehicle valuations and history checks separate from item scans, so every journey stays simple and focused.
        </Text>
        <View style={[styles.status, FeatureFlags.carValuationsAvailable ? styles.statusReady : styles.statusPaused]}>
          <Text style={styles.statusTitle}>
            {FeatureFlags.carValuationsAvailable ? "Basic car valuations ready" : "Car valuations temporarily paused"}
          </Text>
          <Text style={styles.statusText}>
            {FeatureFlags.carValuationsAvailable
              ? "Enter a UK plate and mileage for current Brego trade, private-sale and retail estimates."
              : "No car valuation payment can be taken while the data provider is paused."}
          </Text>
        </View>
        <Pressable
          style={[styles.primaryButton, !FeatureFlags.carValuationsAvailable && styles.primaryButtonDisabled]}
          disabled={!FeatureFlags.carValuationsAvailable}
          onPress={() => pushPublicRoute(router, "/scan?mode=cars")}>
          <Text style={styles.primaryButtonText}>
            {FeatureFlags.carValuationsAvailable ? "Start Car Valuation" : "Valuations Temporarily Paused"}
          </Text>
        </Pressable>
        {FeatureFlags.fullCarChecksAvailable ? (
          <Pressable style={styles.fullCheckButton} onPress={() => pushPublicRoute(router, "/paywall")}>
            <Text style={styles.fullCheckButtonText}>
              {`Get a Full Vehicle Check - ${formatGbp(LaunchPricing.fullCarCheckSingleGbp)}`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What Car Mode includes</Text>
        <View style={styles.grid}>
          {CAPABILITIES.map(([title, detail]) => (
            <View key={title} style={styles.capabilityCard}>
              <Text style={styles.capabilityTitle}>{title}</Text>
              <Text style={styles.capabilityText}>{detail}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={() => pushPublicRoute(router, "/history")}>
          <Text style={styles.secondaryButtonText}>View Car Collection</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => replacePublicRoute(router, "/scan?mode=items")}>
          <Text style={styles.secondaryButtonText}>Value an item</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        {FeatureFlags.fullCarChecksAvailable
          ? "Basic vehicle details and valuations use 3 Value Credits. Full history checks unlock separately for £4.50."
          : "Basic vehicle details and valuations use 3 Value Credits. Full £4.50 history checks unlock as soon as secure payment and provider access are ready."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#eef3fa",
    padding: 18,
    gap: 14,
  },
  screenWide: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  hero: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#14365b",
    backgroundColor: "#071a30",
    padding: 20,
    gap: 12,
  },
  kicker: {
    color: "#8db8ff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#f8fbff",
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "900",
  },
  subtitle: {
    color: "#c1d2e9",
    fontSize: 15,
    lineHeight: 21,
  },
  status: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 4,
  },
  statusReady: {
    borderColor: "#5eead4",
    backgroundColor: "rgba(20, 184, 166, 0.15)",
  },
  statusPaused: {
    borderColor: "#fbbf24",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
  },
  statusTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  statusText: {
    color: "#dbe8f8",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#14b8a6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: "#314967",
  },
  primaryButtonText: {
    color: "#f8fbff",
    fontSize: 15,
    fontWeight: "900",
  },
  fullCheckButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#8db8ff",
    backgroundColor: "rgba(37, 99, 235, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  fullCheckButtonText: {
    color: "#e8f1ff",
    fontSize: 15,
    fontWeight: "900",
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: AppTheme.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  capabilityCard: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 94,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surfaceSoft,
    padding: 13,
    gap: 5,
  },
  capabilityTitle: {
    color: AppTheme.textPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  capabilityText: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#214c78",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#123052",
    fontSize: 14,
    fontWeight: "900",
  },
  note: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 10,
  },
});
