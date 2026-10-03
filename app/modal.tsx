import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PremiumCard, PremiumHero, PremiumScreen } from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";

export default function ModalScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons color={AppTheme.accentDeep} name="close" size={21} />
        </Pressable>

        <PremiumHero
          description="ValueVision combines visual identification, market evidence and specialist vehicle data in one simple experience."
          eyebrow="A clearer way to value"
          icon="eye-outline"
          title="Know what it is. Understand what it may be worth."
        />

        <PremiumCard style={styles.card}>
          <Text style={styles.kicker}>HOW IT WORKS</Text>
          <Text style={styles.title}>Three focused modes, one helpful app.</Text>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons color={AppTheme.accentDeep} name="camera-outline" size={21} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Value an item</Text>
              <Text style={styles.featureBody}>Photograph one item for identification, a value range and selling guidance.</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons color={AppTheme.accentDeep} name="car-sport-outline" size={21} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Check a vehicle</Text>
              <Text style={styles.featureBody}>Use a registration to understand specifications, valuation and available history data.</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons color={AppTheme.accentDeep} name="diamond-outline" size={21} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Explore a room</Text>
              <Text style={styles.featureBody}>Treasure Hunt helps prioritise visible objects that may deserve a closer scan.</Text>
            </View>
          </View>
        </PremiumCard>

        <PremiumCard style={styles.linksCard}>
          <Text style={styles.linksTitle}>Help and information</Text>
          {[
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
            ["Support", "/support"],
          ].map(([label, route]) => (
            <Pressable
              accessibilityRole="link"
              key={label}
              onPress={() => router.push(route as never)}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>{label}</Text>
              <Ionicons color={AppTheme.accent} name="arrow-forward" size={17} />
            </Pressable>
          ))}
        </PremiumCard>
      </PremiumScreen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 18,
  },
  closeButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: AppTheme.surface,
    borderColor: AppTheme.cardBorder,
    borderRadius: 99,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  card: {
    gap: 16,
  },
  kicker: {
    color: AppTheme.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: AppTheme.textPrimary,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 29,
  },
  featureRow: {
    alignItems: "flex-start",
    borderTopColor: AppTheme.cardBorder,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 15,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  featureCopy: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    color: AppTheme.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  featureBody: {
    color: AppTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  linksCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
  },
  linksTitle: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 8,
  },
  linkRow: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 49,
  },
  linkText: {
    color: "#DDE9E3",
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.65,
  },
});
