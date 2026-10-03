import { Ionicons } from "@expo/vector-icons";
import { Href, Stack, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PremiumCard, PremiumHero, PremiumScreen } from "@/components/premium-screen";
import { AppTheme } from "@/constants/app-theme";

export type LegalSection = {
  title?: string;
  heading?: string;
  body?: string | string[];
  paragraphs?: string[];
  content?: string | string[];
};

type LegalPageProps = {
  title: string;
  updated?: string;
  lastUpdated?: string;
  subtitle?: string;
  sections: LegalSection[];
};

function sectionParagraphs(section: LegalSection) {
  const value = section.paragraphs ?? section.body ?? section.content ?? [];
  return Array.isArray(value) ? value : [value];
}

const links: { label: string; href: Href }[] = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
];

export function LegalPage({ title, updated, lastUpdated, subtitle, sections }: LegalPageProps) {
  const router = useRouter();
  const date = updated || lastUpdated || "Current version";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={AppTheme.accentDeep} name="arrow-back" size={19} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <PremiumHero
          description={subtitle || "Clear, straightforward information about how ValueVision works and how your data is handled."}
          eyebrow="ValueVision information"
          icon="document-text-outline"
          title={title}
        >
          <View style={styles.updatedRow}>
            <Ionicons color="#9FD8BF" name="checkmark-circle-outline" size={17} />
            <Text style={styles.updatedText}>Last updated {date}</Text>
          </View>
        </PremiumHero>

        <View style={styles.headingWrap}>
          <Text style={styles.kicker}>THE DETAILS</Text>
          <Text style={styles.heading}>Everything in plain English</Text>
        </View>

        {sections.map((section, sectionIndex) => (
          <PremiumCard key={`${section.title || section.heading || "section"}-${sectionIndex}`} style={styles.sectionCard}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>{String(sectionIndex + 1).padStart(2, "0")}</Text>
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{section.title || section.heading}</Text>
              {sectionParagraphs(section).map((paragraph, paragraphIndex) => (
                <Text key={`${sectionIndex}-${paragraphIndex}`} style={styles.paragraph}>{paragraph}</Text>
              ))}
            </View>
          </PremiumCard>
        ))}

        <PremiumCard style={styles.linksCard}>
          <Text style={styles.linksTitle}>More from ValueVision</Text>
          {links.map((link) => (
            <Pressable
              accessibilityRole="link"
              key={link.label}
              onPress={() => router.push(link.href)}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons color={AppTheme.accent} name="arrow-forward" size={17} />
            </Pressable>
          ))}
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
  updatedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  updatedText: {
    color: "#C6D7CF",
    fontSize: 12,
    fontWeight: "700",
  },
  headingWrap: {
    gap: 4,
    paddingHorizontal: 2,
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
    fontSize: 24,
    fontWeight: "700",
  },
  sectionCard: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
  },
  sectionNumber: {
    alignItems: "center",
    backgroundColor: AppTheme.chip,
    borderRadius: 13,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  sectionNumberText: {
    color: AppTheme.accentDeep,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionCopy: {
    flex: 1,
    gap: 9,
  },
  sectionTitle: {
    color: AppTheme.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  paragraph: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  linksCard: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 2,
  },
  linksTitle: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  linkRow: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
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
