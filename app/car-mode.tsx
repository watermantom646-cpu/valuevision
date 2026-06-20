import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { FeatureFlags } from "@/constants/feature-flags";
import { pushPublicRoute, replacePublicRoute } from "@/lib/public-navigation";

const CAPABILITIES = [
  ["Plate recognition", "Scan or enter a UK registration."],
  ["MOT and tax", "See status and important dates in one place."],
  ["Vehicle valuation", "Estimate a current used-market resale range."],
  ["Full history", "Finance, theft and write-off data when provider access returns."],
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
          Car Mode is separate from Anything Mode so item scans stay quick and vehicle checks stay focused.
        </Text>
        <View style={[styles.status, FeatureFlags.carChecksAvailable ? styles.statusReady : styles.statusPaused]}>
          <Text style={styles.statusTitle}>
            {FeatureFlags.carChecksAvailable ? "Car checks ready" : "Car checks temporarily paused"}
          </Text>
          <Text style={styles.statusText}>
            {FeatureFlags.carChecksAvailable
              ? "Plate, MOT, tax and valuation tools are available."
              : "No car-check payment can be taken while the data provider is paused."}
          </Text>
        </View>
        <Pressable
          style={[styles.primaryButton, !FeatureFlags.carChecksAvailable && styles.primaryButtonDisabled]}
          disabled={!FeatureFlags.carChecksAvailable}
          onPress={() => pushPublicRoute(router, "/scan?mode=cars")}>
          <Text style={styles.primaryButtonText}>
            {FeatureFlags.carChecksAvailable ? "Start Car Check" : "Checks Temporarily Paused"}
          </Text>
        </Pressable>
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
          <Text style={styles.secondaryButtonText}>Open Anything Mode</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        Existing car scans remain in your Collection. Car checks will be switched back on only after provider access is restored and tested.
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
