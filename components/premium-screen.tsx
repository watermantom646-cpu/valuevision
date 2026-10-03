import { Ionicons } from "@expo/vector-icons";
import React, { PropsWithChildren, useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppTheme } from "@/constants/app-theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type PremiumScreenProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function PremiumScreen({ children, contentContainerStyle, testID }: PremiumScreenProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 340,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      testID={testID}
      style={[styles.screen, { opacity, transform: [{ translateY }] }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom + 30, 42),
            paddingTop: Math.max(insets.top + 10, 24),
          },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

type PremiumHeroProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  icon?: IconName;
}>;

export function PremiumHero({ eyebrow, title, description, icon, children }: PremiumHeroProps) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroTopRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroDescription}>{description}</Text>
        </View>
        {icon ? (
          <View style={styles.heroIcon}>
            <Ionicons color="#D9F4E7" name={icon} size={26} />
          </View>
        ) : null}
      </View>
      {children ? <View style={styles.heroFooter}>{children}</View> : null}
    </View>
  );
}

type PremiumCardProps = PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>;

export function PremiumCard({ children, onPress, style, accessibilityLabel }: PremiumCardProps) {
  if (!onPress) {
    return <View style={[styles.card, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

type PremiumButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "dark";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PremiumButton({
  label,
  onPress,
  icon = "arrow-forward",
  variant = "primary",
  disabled,
  style,
}: PremiumButtonProps) {
  const isSecondary = variant === "secondary";
  const isDark = variant === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.buttonSecondary,
        isDark && styles.buttonDark,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          isSecondary && styles.buttonSecondaryText,
          isDark && styles.buttonDarkText,
        ]}
      >
        {label}
      </Text>
      <Ionicons
        color={isSecondary ? AppTheme.accentDeep : "#FFFDF7"}
        name={icon}
        size={18}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: AppTheme.bg,
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 42,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  hero: {
    backgroundColor: AppTheme.accentDeep,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 30,
    borderWidth: 1,
    overflow: "hidden",
    padding: 24,
    position: "relative",
    shadowColor: "#071813",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
  },
  heroGlow: {
    backgroundColor: "rgba(82, 190, 142, 0.16)",
    borderRadius: 120,
    height: 190,
    position: "absolute",
    right: -72,
    top: -92,
    width: 190,
  },
  heroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
  },
  heroCopy: {
    flex: 1,
    gap: 10,
  },
  eyebrow: {
    color: "#9FD8BF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#FFFDF7",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  heroDescription: {
    color: "#C6D7CF",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 560,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  heroFooter: {
    borderTopColor: "rgba(255,255,255,0.11)",
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 18,
  },
  card: {
    backgroundColor: AppTheme.surface,
    borderColor: AppTheme.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#173A30",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  button: {
    alignItems: "center",
    backgroundColor: AppTheme.accent,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18,
  },
  buttonSecondary: {
    backgroundColor: "#E4ECE7",
    borderColor: "#C8D7CF",
    borderWidth: 1,
  },
  buttonDark: {
    backgroundColor: AppTheme.accentDeep,
  },
  buttonText: {
    color: "#FFFDF7",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonSecondaryText: {
    color: AppTheme.accentDeep,
  },
  buttonDarkText: {
    color: "#FFFDF7",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
