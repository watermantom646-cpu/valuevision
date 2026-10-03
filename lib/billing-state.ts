import * as FileSystem from "expo-file-system/legacy";

import { LaunchPricing } from "@/constants/pricing";
import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

export type BillingState = {
  monthlyProductId: string;
  singleCheckProductId: string;
  bundleProductId: string;
  appleMonthlyUnlocked: boolean;
  foundingAccessExpiresAt: string | null;
  foundingReferralCode: string | null;
  monthlyUnlocked: boolean;
  vehicleChecksUnlocked: boolean;
  billingReady: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

const BILLING_STATE_FILE = `${FileSystem.documentDirectory || ""}valuevision-billing-state.json`;
const BILLING_STATE_KEY = "valuevision-billing-state";

function defaultBillingState(): BillingState {
  return {
    monthlyProductId: LaunchPricing.monthlySubscriptionProductId,
    singleCheckProductId: LaunchPricing.fullCarCheckSingleProductId,
    bundleProductId: LaunchPricing.fullCarCheckBundleProductId,
    appleMonthlyUnlocked: false,
    foundingAccessExpiresAt: null,
    foundingReferralCode: null,
    monthlyUnlocked: false,
    vehicleChecksUnlocked: false,
    billingReady: false,
    lastCheckedAt: null,
    lastError: "Billing status has not been checked on this device yet.",
  };
}

function normalizeBillingState(input: Partial<BillingState> | null | undefined): BillingState {
  const fallback = defaultBillingState();
  const foundingAccessExpiresAt = input?.foundingAccessExpiresAt
    ? String(input.foundingAccessExpiresAt)
    : null;
  const foundingAccessActive = Number.isFinite(Date.parse(String(foundingAccessExpiresAt || "")))
    && Date.parse(String(foundingAccessExpiresAt)) > Date.now();
  const appleMonthlyUnlocked = input?.appleMonthlyUnlocked === undefined
    ? Boolean(input?.monthlyUnlocked)
    : Boolean(input.appleMonthlyUnlocked);
  return {
    monthlyProductId: String(input?.monthlyProductId || fallback.monthlyProductId),
    singleCheckProductId: String(input?.singleCheckProductId || fallback.singleCheckProductId),
    bundleProductId: String(input?.bundleProductId || fallback.bundleProductId),
    appleMonthlyUnlocked,
    foundingAccessExpiresAt,
    foundingReferralCode: input?.foundingReferralCode ? String(input.foundingReferralCode) : null,
    monthlyUnlocked: appleMonthlyUnlocked || foundingAccessActive,
    vehicleChecksUnlocked: Boolean(input?.vehicleChecksUnlocked),
    billingReady: Boolean(input?.billingReady),
    lastCheckedAt: input?.lastCheckedAt ? String(input.lastCheckedAt) : null,
    lastError: input?.lastError ? String(input.lastError) : null,
  };
}

async function saveBillingState(state: BillingState) {
  await writePersistentString(BILLING_STATE_KEY, BILLING_STATE_FILE, JSON.stringify(state));
}

export async function persistBillingState(input: Partial<BillingState>): Promise<BillingState> {
  const current = await loadBillingState();
  const next = normalizeBillingState({
    ...current,
    ...input,
  });
  await saveBillingState(next);
  return next;
}

export async function loadBillingState(): Promise<BillingState> {
  try {
    const raw = await readPersistentString(BILLING_STATE_KEY, BILLING_STATE_FILE, "{}");
    return normalizeBillingState(JSON.parse(raw));
  } catch {
    return defaultBillingState();
  }
}

export async function refreshBillingState(args: {
  paidTokenPresent: boolean;
  tokenConfiguredOnServer: boolean;
}): Promise<BillingState> {
  const previous = await loadBillingState();
  const tokenUnlockAvailable = Boolean(args.paidTokenPresent && args.tokenConfiguredOnServer);
  const next = normalizeBillingState({
    ...previous,
    billingReady: previous.billingReady || tokenUnlockAvailable,
    monthlyUnlocked: previous.monthlyUnlocked,
    vehicleChecksUnlocked: previous.vehicleChecksUnlocked || tokenUnlockAvailable,
    lastCheckedAt: new Date().toISOString(),
    lastError: previous.billingReady
      ? previous.lastError
      : tokenUnlockAvailable
        ? null
        : "No active App Store purchase has been detected on this device.",
  });
  await saveBillingState(next);
  return next;
}
