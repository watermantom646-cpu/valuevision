import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
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

import ScanFlow from "./scan-flow";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [started, setStarted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setStarted(false);
    }, []),
  );

  if (started) {
    return (
      <View style={styles.engineScreen}>
          <View style={[styles.engineBar, { paddingTop: Math.max(insets.top + 8, 18) }]}>
          <Pressable
            accessibilityLabel="Leave item valuation"
            accessibilityRole="button"
            onPress={() => setStarted(false)}
            style={({ pressed }) => [styles.engineBack, pressed && styles.pressed]}
          >
            <Ionicons color="#FFFDF7" name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.engineTitleWrap}>
            <Text style={styles.engineEyebrow}>VALUE AN ITEM</Text>
            <Text style={styles.engineTitle}>One clear photo</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Ready</Text>
          </View>
        </View>
        <View style={styles.engineBody}>
          <ScanFlow />
        </View>
      </View>
    );
  }

  return (
    <PremiumScreen>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>V</Text>
        </View>
        <View>
          <Text style={styles.brandName}>VALUEVISION</Text>
          <Text style={styles.brandTagline}>KNOW WHAT IT&apos;S WORTH</Text>
        </View>
      </View>

      <PremiumHero
        description="Take one focused photo. We identify the item, look for current market evidence and explain a realistic selling range."
        eyebrow="Mode 01 · Item intelligence"
        icon="camera-outline"
        title="One item. One clear answer."
      >
        <View style={styles.heroProof}>
          <View style={styles.proofItem}>
            <Ionicons color="#9FD8BF" name="scan-outline" size={18} />
            <Text style={styles.proofText}>Visual identification</Text>
          </View>
          <View style={styles.proofItem}>
            <Ionicons color="#9FD8BF" name="analytics-outline" size={18} />
            <Text style={styles.proofText}>Market evidence</Text>
          </View>
          <View style={styles.proofItem}>
            <Ionicons color="#9FD8BF" name="pricetag-outline" size={18} />
            <Text style={styles.proofText}>Selling guidance</Text>
          </View>
        </View>
      </PremiumHero>

      <View style={styles.sectionHeading}>
        <Text style={styles.kicker}>YOUR VALUATION</Text>
        <Text style={styles.sectionTitle}>Start with the strongest photo</Text>
        <Text style={styles.sectionBody}>
          Keep one item in frame. Labels, signatures and model numbers help us narrow the result.
        </Text>
      </View>

      <PremiumCard style={styles.startCard}>
        <View style={styles.startVisual}>
          <View style={styles.focusCornerTopLeft} />
          <View style={styles.focusCornerTopRight} />
          <View style={styles.focusCornerBottomLeft} />
          <View style={styles.focusCornerBottomRight} />
          <View style={styles.cameraDisc}>
            <Ionicons color="#D9F4E7" name="camera" size={31} />
          </View>
          <Text style={styles.startVisualTitle}>Fill the frame with one item</Text>
          <Text style={styles.startVisualBody}>You can take a new photo or choose one from your library in the next step.</Text>
        </View>
        <PremiumButton
          icon="arrow-forward"
          label="Begin item valuation"
          onPress={() => setStarted(true)}
        />
      </PremiumCard>

      <View style={styles.stepsGrid}>
        <PremiumCard style={styles.stepCard}>
          <Text style={styles.stepNumber}>01</Text>
          <Ionicons color={AppTheme.accent} name="camera-outline" size={22} />
          <Text style={styles.stepTitle}>Photograph</Text>
          <Text style={styles.stepBody}>Use natural light and show the whole item.</Text>
        </PremiumCard>
        <PremiumCard style={styles.stepCard}>
          <Text style={styles.stepNumber}>02</Text>
          <Ionicons color={AppTheme.accent} name="sparkles-outline" size={22} />
          <Text style={styles.stepTitle}>Identify</Text>
          <Text style={styles.stepBody}>We examine brand, model, materials and condition.</Text>
        </PremiumCard>
        <PremiumCard style={styles.stepCard}>
          <Text style={styles.stepNumber}>03</Text>
          <Ionicons color={AppTheme.accent} name="cash-outline" size={22} />
          <Text style={styles.stepTitle}>Understand</Text>
          <Text style={styles.stepBody}>See a range, confidence and practical selling advice.</Text>
        </PremiumCard>
      </View>

      <PremiumCard style={styles.promiseCard}>
        <View style={styles.promiseIcon}>
          <Ionicons color="#D9F4E7" name="shield-checkmark-outline" size={24} />
        </View>
        <View style={styles.promiseCopy}>
          <Text style={styles.promiseTitle}>Honest when certainty is limited</Text>
          <Text style={styles.promiseBody}>
            If the picture does not reveal enough, we ask for a better angle or more detail rather than inventing a precise price.
          </Text>
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
  heroProof: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  proofItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  proofText: {
    color: "#D2E0D9",
    fontSize: 11,
    fontWeight: "700",
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
  startCard: {
    gap: 16,
    padding: 14,
  },
  startVisual: {
    alignItems: "center",
    backgroundColor: AppTheme.accentDeep,
    borderRadius: 20,
    gap: 8,
    minHeight: 230,
    justifyContent: "center",
    overflow: "hidden",
    padding: 28,
    position: "relative",
  },
  cameraDisc: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 25,
    borderWidth: 1,
    height: 74,
    justifyContent: "center",
    marginBottom: 5,
    width: 74,
  },
  startVisualTitle: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  startVisualBody: {
    color: "#BFD1C8",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 270,
    textAlign: "center",
  },
  focusCornerTopLeft: {
    borderLeftColor: "#7BC39F",
    borderLeftWidth: 2,
    borderTopColor: "#7BC39F",
    borderTopLeftRadius: 7,
    borderTopWidth: 2,
    height: 28,
    left: 18,
    position: "absolute",
    top: 18,
    width: 28,
  },
  focusCornerTopRight: {
    borderRightColor: "#7BC39F",
    borderRightWidth: 2,
    borderTopColor: "#7BC39F",
    borderTopRightRadius: 7,
    borderTopWidth: 2,
    height: 28,
    position: "absolute",
    right: 18,
    top: 18,
    width: 28,
  },
  focusCornerBottomLeft: {
    borderBottomColor: "#7BC39F",
    borderBottomLeftRadius: 7,
    borderBottomWidth: 2,
    borderLeftColor: "#7BC39F",
    borderLeftWidth: 2,
    bottom: 18,
    height: 28,
    left: 18,
    position: "absolute",
    width: 28,
  },
  focusCornerBottomRight: {
    borderBottomColor: "#7BC39F",
    borderBottomRightRadius: 7,
    borderBottomWidth: 2,
    borderRightColor: "#7BC39F",
    borderRightWidth: 2,
    bottom: 18,
    height: 28,
    position: "absolute",
    right: 18,
    width: 28,
  },
  stepsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stepCard: {
    flexBasis: "30%",
    flexGrow: 1,
    gap: 8,
    minWidth: 106,
    padding: 15,
  },
  stepNumber: {
    color: AppTheme.textSecondary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  stepTitle: {
    color: AppTheme.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  stepBody: {
    color: AppTheme.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  promiseCard: {
    alignItems: "flex-start",
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 13,
  },
  promiseIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  promiseCopy: {
    flex: 1,
    gap: 5,
  },
  promiseTitle: {
    color: "#FFFDF7",
    fontSize: 15,
    fontWeight: "800",
  },
  promiseBody: {
    color: "#C6D7CF",
    fontSize: 12,
    lineHeight: 18,
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
