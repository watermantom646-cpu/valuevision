import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PremiumButton,
  PremiumCard,
  PremiumHero,
  PremiumScreen,
} from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";

import CarCheckFlow from "./car-check-flow";

export default function CarModeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [started, setStarted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setStarted(false);
    }, []),
  );

  if (started) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.engineScreen}>
          <View style={[styles.engineBar, { paddingTop: Math.max(insets.top + 8, 18) }]}>
            <Pressable
              accessibilityLabel="Leave car check"
              accessibilityRole="button"
              onPress={() => setStarted(false)}
              style={({ pressed }) => [styles.engineBack, pressed && styles.pressed]}
            >
              <Ionicons color="#FFFDF7" name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.engineTitleWrap}>
              <Text style={styles.engineEyebrow}>CAR INTELLIGENCE</Text>
              <Text style={styles.engineTitle}>Vehicle search</Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Secure</Text>
            </View>
          </View>
          <View style={styles.engineBody}>
            <CarCheckFlow />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={AppTheme.accentDeep} name="arrow-back" size={19} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <PremiumHero
          description="Photograph a number plate or enter it manually. Start with useful vehicle facts, then unlock the history that matters before you buy."
          eyebrow="Mode 02 · UK vehicle intelligence"
          icon="car-sport-outline"
          title="Know the car behind the plate."
        >
          <View style={styles.heroPricing}>
            <View>
              <Text style={styles.priceEyebrow}>BASIC LOOKUP</Text>
              <Text style={styles.priceValue}>3 Value Credits</Text>
            </View>
            <View style={styles.heroDivider} />
            <View>
              <Text style={styles.priceEyebrow}>FULL CHECK</Text>
              <Text style={styles.priceValue}>£4.50</Text>
            </View>
          </View>
        </PremiumHero>

        <View style={styles.sectionHeading}>
          <Text style={styles.kicker}>START YOUR CHECK</Text>
          <Text style={styles.sectionTitle}>A registration is all you need</Text>
          <Text style={styles.sectionBody}>
            Use a clear plate photo for speed, or type the registration yourself when you do not have the car in front of you.
          </Text>
        </View>

        <PremiumCard style={styles.entryCard}>
          <View style={styles.plateVisual}>
            <View style={styles.gbStrip}>
              <Text style={styles.gbText}>UK</Text>
            </View>
            <Text style={styles.plateText}>AB12 CDE</Text>
          </View>
          <PremiumButton
            icon="scan-outline"
            label="Scan or enter a number plate"
            onPress={() =>
              router.push({ pathname: "/(tabs)/scan", params: { mode: "cars" } })
            }
          />
          <Text style={styles.entryNote}>You confirm the registration before any paid full check is requested.</Text>
        </PremiumCard>

        <View style={styles.sectionHeading}>
          <Text style={styles.kicker}>WHAT YOU RECEIVE</Text>
          <Text style={styles.sectionTitle}>Useful first. Detailed when needed.</Text>
        </View>

        <View style={styles.tierGrid}>
          <PremiumCard style={styles.tierCard}>
            <View style={styles.tierIcon}>
              <Ionicons color={AppTheme.accentDeep} name="information-circle-outline" size={23} />
            </View>
            <Text style={styles.tierLabel}>BASIC DETAILS</Text>
            <Text style={styles.tierTitle}>Identify and value</Text>
            <Text style={styles.tierBody}>Make, model, age, tax, MOT status and available valuation information.</Text>
            <View style={styles.includedPill}>
              <Text style={styles.includedText}>Included</Text>
            </View>
          </PremiumCard>

          <PremiumCard style={styles.fullTierCard}>
            <View style={styles.tierIconDark}>
              <Ionicons color="#D9F4E7" name="shield-checkmark-outline" size={23} />
            </View>
            <Text style={styles.fullTierLabel}>FULL CHECK · £4.50</Text>
            <Text style={styles.fullTierTitle}>Understand the history</Text>
            <Text style={styles.fullTierBody}>Available finance, stolen, write-off, mileage anomaly, ownership and risk records.</Text>
            <View style={styles.fullPill}>
              <Text style={styles.fullPillText}>Unlock only when you choose</Text>
            </View>
          </PremiumCard>
        </View>

        <PremiumCard style={styles.checklistCard}>
          <Text style={styles.checklistKicker}>BEFORE MONEY CHANGES HANDS</Text>
          <Text style={styles.checklistTitle}>The questions a full check helps answer</Text>
          {[
            ["cash-outline", "Is there outstanding finance recorded?"],
            ["warning-outline", "Has it been written off or salvaged?"],
            ["speedometer-outline", "Do recorded mileages show an anomaly?"],
            ["shield-outline", "Is there a stolen or high-risk marker?"],
          ].map(([icon, label], index) => (
            <View key={label} style={[styles.checkRow, index === 0 && styles.firstCheckRow]}>
              <View style={styles.checkIcon}>
                <Ionicons color={AppTheme.accent} name={icon as never} size={18} />
              </View>
              <Text style={styles.checkText}>{label}</Text>
              <Ionicons color={AppTheme.textSecondary} name="checkmark" size={17} />
            </View>
          ))}
        </PremiumCard>

        <PremiumCard style={styles.disclaimerCard}>
          <Ionicons color={AppTheme.warning} name="alert-circle-outline" size={21} />
          <Text style={styles.disclaimerText}>
            Vehicle data reflects the records available from providers at the time of the check. Always inspect the car and verify documents before purchase.
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
  heroPricing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 22,
  },
  priceEyebrow: {
    color: "#8AC7AA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  priceValue: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 22,
    fontWeight: "700",
    marginTop: 3,
  },
  heroDivider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 38,
    width: 1,
  },
  sectionHeading: {
    gap: 6,
    paddingHorizontal: 3,
  },
  kicker: {
    color: AppTheme.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  sectionTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 31,
  },
  sectionBody: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  entryCard: {
    gap: 15,
  },
  plateVisual: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#F7D95A",
    borderColor: "#D1B83E",
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    height: 76,
    overflow: "hidden",
    width: "100%",
  },
  gbStrip: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#17488E",
    justifyContent: "center",
    width: 45,
  },
  gbText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  plateText: {
    color: "#10120F",
    flex: 1,
    fontFamily: Platform.select({ ios: "Courier New", default: "monospace" }),
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 3,
    textAlign: "center",
  },
  entryNote: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  tierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
  },
  tierCard: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: 9,
    minWidth: 150,
  },
  fullTierCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    flexBasis: "47%",
    flexGrow: 1,
    gap: 9,
    minWidth: 150,
  },
  tierIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 15,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  tierIconDark: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 15,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  tierLabel: {
    color: AppTheme.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  fullTierLabel: {
    color: "#8AC7AA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  tierTitle: {
    color: AppTheme.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  fullTierTitle: {
    color: "#FFFDF7",
    fontSize: 17,
    fontWeight: "800",
  },
  tierBody: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  fullTierBody: {
    color: "#BFD1C8",
    fontSize: 12,
    lineHeight: 18,
  },
  includedPill: {
    alignSelf: "flex-start",
    backgroundColor: AppTheme.chip,
    borderRadius: 99,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  includedText: {
    color: AppTheme.accentDeep,
    fontSize: 10,
    fontWeight: "900",
  },
  fullPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 99,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fullPillText: {
    color: "#D9F4E7",
    fontSize: 10,
    fontWeight: "800",
  },
  checklistCard: {
    gap: 0,
  },
  checklistKicker: {
    color: AppTheme.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  checklistTitle: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 11,
    marginTop: 5,
  },
  checkRow: {
    alignItems: "center",
    borderTopColor: AppTheme.cardBorder,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
  },
  firstCheckRow: {
    borderTopWidth: 0,
  },
  checkIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  checkText: {
    color: AppTheme.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  disclaimerCard: {
    alignItems: "flex-start",
    backgroundColor: "#F7EAD5",
    borderColor: "#E4CFAB",
    flexDirection: "row",
    gap: 10,
  },
  disclaimerText: {
    color: "#6C532F",
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  engineScreen: {
    backgroundColor: AppTheme.bg,
    flex: 1,
  },
  engineBar: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 13,
    paddingHorizontal: 16,
  },
  engineBack: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  engineTitleWrap: {
    flex: 1,
  },
  engineEyebrow: {
    color: "#8AC7AA",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  engineTitle: {
    color: "#FFFDF7",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  livePill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    backgroundColor: "#6CD39F",
    borderRadius: 5,
    height: 7,
    width: 7,
  },
  liveText: {
    color: "#D9F4E7",
    fontSize: 10,
    fontWeight: "800",
  },
  engineBody: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
