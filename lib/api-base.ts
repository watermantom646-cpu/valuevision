import Constants from "expo-constants";

const DEV_DEFAULT_API_BASE = "http://127.0.0.1:5050";
const PRODUCTION_PLACEHOLDER_API_BASE = "https://api.valuevisionapp.com";

function extractHost(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const withScheme = raw.includes("://") ? raw : `http://${raw}`;
    const url = new URL(withScheme);
    return String(url.hostname || "").trim();
  } catch {
    return raw
      .replace(/^[a-zA-Z]+:\/\//, "")
      .split(/[/?#]/)[0]
      .replace(/:\d+$/, "")
      .trim();
  }
}

function normalizeApiBase(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const withScheme = raw.includes("://") ? raw : `http://${raw}`;
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function resolveFromExpoExtra(): string {
  const extraCandidates = [
    (Constants as any)?.expoConfig?.extra?.apiBase,
    (Constants as any)?.manifest2?.extra?.apiBase,
    (Constants as any)?.manifest?.extra?.apiBase,
  ];
  for (const candidate of extraCandidates) {
    const normalized = normalizeApiBase(candidate);
    if (normalized) return normalized;
  }
  return "";
}

export function looksLikeLocalApiBase(value: string): boolean {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes("127.0.0.1") ||
    raw.includes("localhost") ||
    raw.includes("0.0.0.0") ||
    raw.includes(":5050")
  );
}

export function isPlaceholderApiBase(value: string): boolean {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return raw.includes("api.valuevisionapp.com");
}

export function resolveApiBase(): string {
  const fromEnv = normalizeApiBase(process.env.EXPO_PUBLIC_API_BASE);
  if (fromEnv) return fromEnv;

  const fromExtra = resolveFromExpoExtra();
  if (fromExtra) return fromExtra;

  const hostUriCandidates = [
    (Constants as any)?.expoConfig?.hostUri,
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri,
    (Constants as any)?.manifest?.debuggerHost,
    (Constants as any)?.expoGoConfig?.debuggerHost,
  ];

  for (const candidate of hostUriCandidates) {
    const host = extractHost(candidate);
    if (!host) continue;
    return `http://${host}:5050`;
  }

  if (__DEV__) return DEV_DEFAULT_API_BASE;
  return PRODUCTION_PLACEHOLDER_API_BASE;
}
