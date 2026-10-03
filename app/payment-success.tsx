import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { claimStripeCheckout } from "@/lib/payment-entitlements";

type State = "checking" | "ready" | "error";

const SUPPORT_ROUTE = "/support" as Href;
const TERMS_ROUTE = "/terms" as Href;
const PRIVACY_ROUTE = "/privacy" as Href;

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("Confirming your secure payment...");
  useEffect(() => {
    const sessionId = String(params.session_id || "");
    if (!sessionId) {
      setState("error");
      setMessage("The checkout reference is missing. Your card has not been charged again.");
      return;
    }
    void claimStripeCheckout(sessionId).then(() => {
      setState("ready");
      setMessage("Your Value Vision access is active on this device.");
    }).catch((error) => {
      setState("error");
      setMessage(String(error?.message || "We could not link this payment yet. Please contact support."));
    });
  }, [params.session_id]);
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>VALUE VISION</Text>
        <Text style={styles.title}>{state === "ready" ? "Payment confirmed" : state === "error" ? "We need to help" : "Nearly there"}</Text>
        {state === "checking" ? <ActivityIndicator size="large" color="#e45d2a" /> : null}
        <Text style={styles.message}>{message}</Text>
        {state === "ready" ? <Pressable style={styles.primary} onPress={() => router.replace("/(tabs)/scan")}><Text style={styles.primaryText}>Start scanning</Text></Pressable> : null}
        {state === "error" ? <Pressable style={styles.primary} onPress={() => router.replace(SUPPORT_ROUTE)}><Text style={styles.primaryText}>Get payment support</Text></Pressable> : null}
        <View style={styles.links}><Link href={TERMS_ROUTE} style={styles.link}>Terms</Link><Link href={PRIVACY_ROUTE} style={styles.link}>Privacy</Link></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f3eadc" },
  card: { width: "100%", maxWidth: 560, padding: 30, gap: 20, borderRadius: 28, backgroundColor: "#fffaf0", borderWidth: 1, borderColor: "#d9c9b3" },
  eyebrow: { fontSize: 12, letterSpacing: 2.5, fontWeight: "800", color: "#a6401d" },
  title: { fontSize: 36, lineHeight: 40, fontWeight: "900", color: "#172b25" },
  message: { fontSize: 17, lineHeight: 26, color: "#46554f" },
  primary: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", backgroundColor: "#e45d2a" },
  primaryText: { color: "white", fontSize: 16, fontWeight: "800" },
  links: { flexDirection: "row", gap: 22 },
  link: { color: "#315f50", fontWeight: "700" },
});
