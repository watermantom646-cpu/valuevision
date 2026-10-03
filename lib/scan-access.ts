import * as FileSystem from "expo-file-system/legacy";

import { LaunchPricing } from "@/constants/pricing";
import { loadBillingState } from "@/lib/billing-state";
import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

type ScanUsageStore = {
  completedScans: number;
  monthlyCompletedScans: number;
  monthlyCycleStartedAt: string | null;
  purchasedCredits: number;
  creditedTransactions: string[];
  updatedAt: string;
};

export type ScanAccess = {
  planActive: boolean;
  tier: "starter" | "monthly";
  limit: number;
  used: number;
  remaining: number;
  purchasedCredits: number;
  canScan: boolean;
  resetsAt: string | null;
};

const STARTER_SCAN_FILE = `${FileSystem.documentDirectory || ""}valuevision-starter-scans.json`;
const STARTER_SCAN_KEY = "valuevision-starter-scans";
let writeQueue: Promise<ScanAccess> = Promise.resolve({
  planActive: false,
  tier: "starter",
  limit: LaunchPricing.freeStarterScans,
  used: 0,
  remaining: LaunchPricing.freeStarterScans,
  purchasedCredits: 0,
  canScan: true,
  resetsAt: null,
});

const MONTHLY_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeStore(input: Partial<ScanUsageStore> | null | undefined): ScanUsageStore {
  return {
    completedScans: Math.max(0, Math.floor(Number(input?.completedScans || 0))),
    monthlyCompletedScans: Math.max(0, Math.floor(Number(input?.monthlyCompletedScans || 0))),
    monthlyCycleStartedAt: input?.monthlyCycleStartedAt ? String(input.monthlyCycleStartedAt) : null,
    purchasedCredits: Math.max(0, Math.floor(Number(input?.purchasedCredits || 0))),
    creditedTransactions: Array.from(new Set(Array.isArray(input?.creditedTransactions) ? input.creditedTransactions.map(String).filter(Boolean) : [])).slice(-250),
    updatedAt: String(input?.updatedAt || new Date().toISOString()),
  };
}

async function loadStore(): Promise<ScanUsageStore> {
  try {
    const raw = await readPersistentString(STARTER_SCAN_KEY, STARTER_SCAN_FILE, "{}");
    return normalizeStore(JSON.parse(raw));
  } catch {
    return normalizeStore(null);
  }
}

function prepareMonthlyCycle(store: ScanUsageStore, monthlyUnlocked: boolean): ScanUsageStore {
  if (!monthlyUnlocked) return store;
  const startedAtMs = Date.parse(String(store.monthlyCycleStartedAt || ""));
  const cycleExpired = !Number.isFinite(startedAtMs) || Date.now() - startedAtMs >= MONTHLY_CYCLE_MS;
  if (!cycleExpired) return store;
  return normalizeStore({
    ...store,
    monthlyCompletedScans: 0,
    monthlyCycleStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function resolveAccess(store: ScanUsageStore, monthlyUnlocked: boolean): ScanAccess {
  if (monthlyUnlocked) {
    const includedLimit = LaunchPricing.monthlyItemScanAllowance;
    const used = Math.min(store.monthlyCompletedScans, includedLimit);
    const includedRemaining = Math.max(0, includedLimit - used);
    const remaining = includedRemaining + store.purchasedCredits;
    const startedAtMs = Date.parse(String(store.monthlyCycleStartedAt || ""));
    return {
      planActive: true,
      tier: "monthly",
      limit: includedLimit + store.purchasedCredits,
      used,
      remaining,
      purchasedCredits: store.purchasedCredits,
      canScan: remaining > 0,
      resetsAt: Number.isFinite(startedAtMs)
        ? new Date(startedAtMs + MONTHLY_CYCLE_MS).toISOString()
        : null,
    };
  }
  const used = Math.min(store.completedScans, LaunchPricing.freeStarterScans);
  const remaining = Math.max(0, LaunchPricing.freeStarterScans - used) + store.purchasedCredits;
  return {
    planActive: false,
    tier: "starter",
    limit: LaunchPricing.freeStarterScans + store.purchasedCredits,
    used,
    remaining,
    purchasedCredits: store.purchasedCredits,
    canScan: remaining > 0,
    resetsAt: null,
  };
}

export async function loadScanAccess(): Promise<ScanAccess> {
  const [stored, billingState] = await Promise.all([loadStore(), loadBillingState()]);
  const store = prepareMonthlyCycle(stored, billingState.monthlyUnlocked);
  if (store.monthlyCycleStartedAt !== stored.monthlyCycleStartedAt) {
    await writePersistentString(STARTER_SCAN_KEY, STARTER_SCAN_FILE, JSON.stringify(store));
  }
  return resolveAccess(store, billingState.monthlyUnlocked);
}

export async function recordCompletedItemScan(creditCost = 1): Promise<ScanAccess> {
  writeQueue = writeQueue.then(async () => {
    const [stored, billingState] = await Promise.all([loadStore(), loadBillingState()]);
    const store = prepareMonthlyCycle(stored, billingState.monthlyUnlocked);
    const creditsToUse = Math.max(1, Math.floor(Number(creditCost || 1)));
    const includedAvailable = billingState.monthlyUnlocked
      ? Math.max(0, LaunchPricing.monthlyItemScanAllowance - store.monthlyCompletedScans)
      : Math.max(0, LaunchPricing.freeStarterScans - store.completedScans);
    const totalAvailable = includedAvailable + store.purchasedCredits;
    if (totalAvailable < creditsToUse) {
      return resolveAccess(store, billingState.monthlyUnlocked);
    }
    const includedToUse = Math.min(creditsToUse, includedAvailable);
    const purchasedToUse = Math.max(0, creditsToUse - includedToUse);
    const next = normalizeStore({
      ...store,
      completedScans: billingState.monthlyUnlocked
        ? store.completedScans
        : Math.min(store.completedScans + includedToUse, LaunchPricing.freeStarterScans),
      monthlyCompletedScans: billingState.monthlyUnlocked
        ? Math.min(store.monthlyCompletedScans + includedToUse, LaunchPricing.monthlyItemScanAllowance)
        : store.monthlyCompletedScans,
      purchasedCredits: Math.max(0, store.purchasedCredits - purchasedToUse),
      updatedAt: new Date().toISOString(),
    });
    await writePersistentString(STARTER_SCAN_KEY, STARTER_SCAN_FILE, JSON.stringify(next));
    return resolveAccess(next, billingState.monthlyUnlocked);
  });
  return writeQueue;
}

export async function addValueCredits(input: {
  productId: string;
  credits: number;
  transactionId: string;
}): Promise<ScanAccess> {
  writeQueue = writeQueue.then(async () => {
    const [stored, billingState] = await Promise.all([loadStore(), loadBillingState()]);
    const store = prepareMonthlyCycle(stored, billingState.monthlyUnlocked);
    const transactionId = String(input.transactionId || "").trim();
    if (!transactionId || store.creditedTransactions.includes(transactionId)) {
      return resolveAccess(store, billingState.monthlyUnlocked);
    }
    const next = normalizeStore({
      ...store,
      purchasedCredits: store.purchasedCredits + Math.max(0, Math.floor(Number(input.credits || 0))),
      creditedTransactions: [...store.creditedTransactions, transactionId],
      updatedAt: new Date().toISOString(),
    });
    await writePersistentString(STARTER_SCAN_KEY, STARTER_SCAN_FILE, JSON.stringify(next));
    return resolveAccess(next, billingState.monthlyUnlocked);
  });
  return writeQueue;
}
