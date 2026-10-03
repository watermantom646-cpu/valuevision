import * as FileSystem from "expo-file-system/legacy";

import { resolveApiBase } from "@/lib/api-base";
import { getAcquisitionAttribution } from "@/lib/acquisition";
import { persistBillingState } from "@/lib/billing-state";
import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

type FoundingAccessResponse = {
  ok: boolean;
  expiresAt: string;
  referralCode: string;
  error?: string;
};

const DEVICE_FILE = `${FileSystem.documentDirectory || ""}valuevision-founding-device.json`;
const DEVICE_KEY = "valuevision-founding-device";

function createDeviceId() {
  return `vv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getFoundingDeviceId() {
  try {
    const raw = await readPersistentString(DEVICE_KEY, DEVICE_FILE, "{}");
    const parsed = JSON.parse(raw);
    const existing = String(parsed?.deviceId || "").trim();
    if (existing) return existing;
  } catch {}
  const deviceId = createDeviceId();
  await writePersistentString(DEVICE_KEY, DEVICE_FILE, JSON.stringify({ deviceId }));
  return deviceId;
}

export async function activateFoundingSellerAccess(code: string): Promise<FoundingAccessResponse> {
  const [deviceId, attribution] = await Promise.all([
    getFoundingDeviceId(),
    getAcquisitionAttribution(),
  ]);
  const response = await fetch(`${resolveApiBase()}/founding-access/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: String(code || "").trim(), deviceId, attribution }),
  });
  const payload = await response.json().catch(() => null) as FoundingAccessResponse | null;
  if (!response.ok || !payload?.ok || !payload.expiresAt) {
    throw new Error(String(payload?.error || "This founding access code could not be activated."));
  }
  await persistBillingState({
    foundingAccessExpiresAt: payload.expiresAt,
    foundingReferralCode: payload.referralCode || null,
    billingReady: true,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
  });
  return payload;
}
