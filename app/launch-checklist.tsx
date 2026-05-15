import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { AppTheme } from "@/constants/app-theme";
import { formatGbp, LaunchPricing } from "@/constants/pricing";
import { getAnalyticsSnapshot } from "@/lib/analytics";
import { resolveApiBase } from "@/lib/api-base";
import { loadHistory } from "@/lib/scan-history";

export default function LaunchChecklistScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [loading, setLoading] = useState(true);
  const [healthOk, setHealthOk] = useState(false);
  const [readiness, setReadiness] = useState<any>(null);
  const [providerUsage, setProviderUsage] = useState<any>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState("");
  const apiBase = useMemo(() => resolveApiBase(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [hRes, rRes, pRes, hist, stats] = await Promise.all([
        fetch(`${apiBase}/health`).then((r) => r.json()).catch(() => null),
        fetch(`${apiBase}/launch-readiness`).then((r) => r.json()).catch(() => null),
        fetch(`${apiBase}/provider-usage`).then((r) => r.json()).catch(() => null),
        loadHistory(),
        getAnalyticsSnapshot(),
      ]);
      setHealthOk(Boolean(hRes?.ok));
      setReadiness(rRes?.ok ? rRes : null);
      setProviderUsage(pRes?.ok ? pRes : null);
      setHistoryCount(hist.length);
      setAnalytics(stats);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const checks = [
    { label: "Backend reachable", ok: healthOk },
    { label: "Production mode enabled", ok: Boolean(readiness?.checks?.nodeEnvProduction) },
    { label: "Allowed origins configured", ok: Boolean(readiness?.checks?.allowedOriginsConfigured) },
    { label: "SERP API configured", ok: Boolean(readiness?.checks?.serpApiConfigured) },
    { label: "Vehicle API configured", ok: Boolean(readiness?.checks?.dvlaConfigured) },
    { label: "Voice API configured", ok: Boolean(readiness?.checks?.openAiConfigured) },
    { label: "Monetization protection configured", ok: Boolean(readiness?.checks?.monetizationProtectionConfigured) },
    { label: "At least 5 scans captured", ok: historyCount >= 5 },
    { label: "At least 1 successful scan", ok: Number(analytics?.totals?.scan_success || 0) >= 1 },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const progressPct = Math.round((passed / checks.length) * 100);
  const failedChecks = checks.filter((c) => !c.ok).map((c) => c.label);
  const usage = providerUsage?.usage || {};
  const usageLimits = usage?.limits || {};
  const totalCalls = Number(usage?.total || 0);
  const softLimit = Number(usageLimits?.soft || 0);
  const hardLimit = Number(usageLimits?.hard || 0);
  const estimatedCostGbp = Number(providerUsage?.cost?.totalGbp || 0);
  const softPct = softLimit > 0 ? ((totalCalls / softLimit) * 100).toFixed(1) : "n/a";
  const hardPct = hardLimit > 0 ? ((totalCalls / hardLimit) * 100).toFixed(1) : "n/a";
  const paidAccessPolicy = providerUsage?.policy?.paidAccess || readiness?.monetization || {};
  const monetizationUsage = providerUsage?.monetizationUsage?.byType || {};
  const blockedVehiclePricing = Number(monetizationUsage?.blocked_vehicle_pricing || 0);
  const blockedFullCarCheck = Number(monetizationUsage?.blocked_fullcar_check || 0);
  const allowedVehiclePricing = Number(monetizationUsage?.allowed_vehicle_pricing || 0);
  const allowedFullCarCheck = Number(monetizationUsage?.allowed_fullcar_check || 0);

  return (
    <ScrollView contentContainerStyle={[styles.screen, isWide && styles.screenWide]}>
      <View style={styles.card}>
        <Text style={styles.kicker}>LAUNCH READINESS</Text>
        <Text style={styles.title}>Checklist</Text>
        <Text style={styles.subtitle}>{`Passed ${passed}/${checks.length} checks (${progressPct}%)`}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        {checks.map((c) => (
          <View key={c.label} style={[styles.row, styles.checkRow, c.ok ? styles.checkRowOk : styles.checkRowNo]}>
            <Text style={[styles.dot, c.ok ? styles.ok : styles.no]}>{c.ok ? "✓" : "•"}</Text>
            <Text style={styles.rowText}>{c.label}</Text>
          </View>
        ))}
      </View>

      {failedChecks.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Launch blockers</Text>
          {failedChecks.map((label) => (
            <Text key={label} style={styles.meta}>{`• ${label}`}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Scanner stats</Text>
        <Text style={styles.meta}>{`Successful scans: ${analytics?.totals?.scan_success || 0}`}</Text>
        <Text style={styles.meta}>{`Failed scans: ${analytics?.totals?.scan_failure || 0}`}</Text>
        <Text style={styles.meta}>{`Saved scans: ${historyCount}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Provider usage today</Text>
        <Text style={styles.meta}>{`Calls: ${totalCalls}`}</Text>
        <Text style={styles.meta}>
          {`Soft limit: ${softLimit > 0 ? `${totalCalls}/${softLimit} (${softPct}%)` : "disabled"}`}
        </Text>
        <Text style={styles.meta}>
          {`Hard limit: ${hardLimit > 0 ? `${totalCalls}/${hardLimit} (${hardPct}%)` : "disabled"}`}
        </Text>
        <Text style={styles.meta}>{`Estimated cost: £${estimatedCostGbp.toFixed(2)}`}</Text>
        <Text style={styles.meta}>{`Paid mode: ${String(paidAccessPolicy?.mode || "unknown")}`}</Text>
        <Text style={styles.meta}>{`Paid token set: ${paidAccessPolicy?.tokenConfigured ? "yes" : "no"}`}</Text>
        <Text style={styles.meta}>{`Vehicle paid guard: ${paidAccessPolicy?.enforceVehicleData ? "on" : "off"}`}</Text>
        <Text style={styles.meta}>{`Blocked vehicle pricing attempts: ${blockedVehiclePricing}`}</Text>
        <Text style={styles.meta}>{`Blocked full car checks: ${blockedFullCarCheck}`}</Text>
        <Text style={styles.meta}>{`Allowed vehicle pricing attempts: ${allowedVehiclePricing}`}</Text>
        <Text style={styles.meta}>{`Allowed full car checks: ${allowedFullCarCheck}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Security before launch</Text>
        <Text style={styles.meta}>1. Rotate any API keys shared in chat or screenshots.</Text>
        <Text style={styles.meta}>2. Set production env and origins (or run `npm run launch:set-prod -- https://origin1,https://origin2`).</Text>
        <Text style={styles.meta}>3. Update backend `.env` with new keys only.</Text>
        <Text style={styles.meta}>4. Restart backend and re-run launch checks.</Text>
      </View>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable style={[styles.btn, isWide && styles.btnWide]} onPress={load}>
          <Text style={styles.btnText}>{loading ? "Refreshing..." : "Refresh checks"}</Text>
        </Pressable>
        <Pressable style={[styles.btn, isWide && styles.btnWide]} onPress={() => router.push("/(tabs)/scan?mode=cars")}>
          <Text style={styles.btnText}>Run Cars Scan</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnAccent, isWide && styles.btnWide]} onPress={() => router.push("/(tabs)/scan?mode=fullcar")}>
          <Text style={styles.btnText}>{`Run Full Car Check (${formatGbp(LaunchPricing.fullCarCheckSingleGbp)})`}</Text>
        </Pressable>
        <Pressable style={[styles.btn, isWide && styles.btnWide]} onPress={() => router.push("/(tabs)/scan?mode=items")}>
          <Text style={styles.btnText}>Run Items Scan</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 18,
    gap: 12,
    backgroundColor: AppTheme.bg,
  },
  screenWide: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
    backgroundColor: AppTheme.surface,
    padding: 14,
    gap: 8,
    shadowColor: "#182845",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  kicker: {
    color: AppTheme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: AppTheme.textPrimary,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: AppTheme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: AppTheme.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  checkRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  checkRowOk: {
    borderColor: "#8ccfb2",
    backgroundColor: "#edf9f3",
  },
  checkRowNo: {
    borderColor: "#e5bf74",
    backgroundColor: "#fff9ec",
  },
  dot: {
    width: 18,
    textAlign: "center",
    fontWeight: "900",
  },
  ok: {
    color: "#0f8a5f",
  },
  no: {
    color: "#b45309",
  },
  rowText: {
    color: AppTheme.textPrimary,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  meta: {
    color: AppTheme.textSecondary,
    fontSize: 14,
  },
  error: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  progressTrack: {
    marginTop: 2,
    height: 10,
    borderRadius: 999,
    backgroundColor: AppTheme.surfaceSoft,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AppTheme.cardBorder,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: AppTheme.accent,
  },
  btn: {
    flexGrow: 1,
    minWidth: 200,
    borderRadius: 12,
    backgroundColor: AppTheme.accent,
    paddingVertical: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  btnWide: {
    minWidth: 280,
  },
  btnAccent: {
    backgroundColor: "#c87f1d",
  },
  btnText: {
    color: "#04130f",
    fontWeight: "800",
    fontSize: 14,
  },
});
