import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { captureAcquisitionAttribution } from '@/lib/acquisition';
import { bootstrapPaymentEntitlements } from '@/lib/payment-entitlements';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void captureAcquisitionAttribution();
    return bootstrapPaymentEntitlements();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ animation: "slide_from_right", gestureEnabled: true, contentStyle: { backgroundColor: "#F2EBDD" } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="car-mode" options={{ title: "Car Mode" }} />
        <Stack.Screen name="treasure-hunt" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ title: "ValueVision Plus" }} />
        <Stack.Screen name="payment-success" options={{ title: "Payment Confirmed" }} />
        <Stack.Screen name="terms" options={{ title: "Terms" }} />
        <Stack.Screen name="privacy" options={{ title: "Privacy" }} />
        <Stack.Screen name="support" options={{ title: "Support" }} />
        <Stack.Screen name="launch-checklist" options={{ title: "Launch Checklist" }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
