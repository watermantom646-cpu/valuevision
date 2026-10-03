import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";

import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

export type AcquisitionAttribution = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  referralCode: string;
  explicit: boolean;
  capturedAt: string;
};

const ACQUISITION_FILE = `${FileSystem.documentDirectory || ""}valuevision-acquisition.json`;
const ACQUISITION_KEY = "valuevision-acquisition";

function clean(value: unknown, fallback = "") {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || fallback).trim().slice(0, 80);
}

function directAttribution(): AcquisitionAttribution {
  return {
    source: "direct",
    medium: "none",
    campaign: "none",
    content: "none",
    referralCode: "",
    explicit: false,
    capturedAt: new Date().toISOString(),
  };
}

function normalize(input: Partial<AcquisitionAttribution> | null | undefined): AcquisitionAttribution {
  const fallback = directAttribution();
  return {
    source: clean(input?.source, fallback.source) || fallback.source,
    medium: clean(input?.medium, fallback.medium) || fallback.medium,
    campaign: clean(input?.campaign, fallback.campaign) || fallback.campaign,
    content: clean(input?.content, fallback.content) || fallback.content,
    referralCode: clean(input?.referralCode),
    explicit: Boolean(input?.explicit),
    capturedAt: String(input?.capturedAt || fallback.capturedAt),
  };
}

export async function getAcquisitionAttribution(): Promise<AcquisitionAttribution> {
  try {
    const raw = await readPersistentString(ACQUISITION_KEY, ACQUISITION_FILE, "{}");
    return normalize(JSON.parse(raw));
  } catch {
    return directAttribution();
  }
}

export async function captureAcquisitionAttribution(): Promise<AcquisitionAttribution> {
  const existing = await getAcquisitionAttribution();
  if (existing.explicit) return existing;

  const initialUrl = await Linking.getInitialURL().catch(() => null);
  if (!initialUrl) return existing;
  const parsed = Linking.parse(initialUrl);
  const query = parsed.queryParams || {};
  const source = clean(query.utm_source || query.source);
  const medium = clean(query.utm_medium);
  const campaign = clean(query.utm_campaign);
  const content = clean(query.utm_content);
  const referralCode = clean(query.ref || query.referral);
  const explicit = Boolean(source || medium || campaign || content || referralCode);
  if (!explicit) return existing;

  const next = normalize({
    source: source || (referralCode ? "referral" : "unknown"),
    medium: medium || (referralCode ? "referral" : "unknown"),
    campaign: campaign || "founding_beta",
    content: content || "unspecified",
    referralCode,
    explicit: true,
    capturedAt: new Date().toISOString(),
  });
  await writePersistentString(ACQUISITION_KEY, ACQUISITION_FILE, JSON.stringify(next));
  return next;
}
