import * as FileSystem from "expo-file-system/legacy";

import { LaunchPricing } from "@/constants/pricing";
import { loadBillingState } from "@/lib/billing-state";

type StarterScanStore = {
  completedScans: number;
  updatedAt: string;
};

export type ScanAccess = {
  unlimited: boolean;
  used: number;
  remaining: number;
  canScan: boolean;
};

const STARTER_SCAN_FILE = `${FileSystem.documentDirectory || ""}valuevision-starter-scans.json`;
let writeQueue: Promise<ScanAccess> = Promise.resolve({
  unlimited: false,
  used: 0,
  remaining: LaunchPricing.freeStarterScans,
  canScan: true,
});

function normalizeStore(input: Partial<StarterScanStore> | null | undefined): StarterScanStore {
  return {
    completedScans: Math.max(0, Math.floor(Number(input?.completedScans || 0))),
    updatedAt: String(input?.updatedAt || new Date().toISOString()),
  };
}

async function loadStore(): Promise<StarterScanStore> {
  try {
    if (!FileSystem.documentDirectory) return normalizeStore(null);
    const info = await FileSystem.getInfoAsync(STARTER_SCAN_FILE);
    if (!info.exists) return normalizeStore(null);
    const raw = await FileSystem.readAsStringAsync(STARTER_SCAN_FILE);
    return normalizeStore(JSON.parse(raw));
  } catch {
    return normalizeStore(null);
  }
}

function resolveAccess(store: StarterScanStore, monthlyUnlocked: boolean): ScanAccess {
  const used = Math.min(store.completedScans, LaunchPricing.freeStarterScans);
  const remaining = Math.max(0, LaunchPricing.freeStarterScans - used);
  return {
    unlimited: monthlyUnlocked,
    used,
    remaining,
    canScan: monthlyUnlocked || remaining > 0,
  };
}

export async function loadScanAccess(): Promise<ScanAccess> {
  const [store, billingState] = await Promise.all([loadStore(), loadBillingState()]);
  return resolveAccess(store, billingState.monthlyUnlocked);
}

export async function recordCompletedStarterScan(): Promise<ScanAccess> {
  writeQueue = writeQueue.then(async () => {
    const [store, billingState] = await Promise.all([loadStore(), loadBillingState()]);
    if (billingState.monthlyUnlocked) return resolveAccess(store, true);

    const next = normalizeStore({
      completedScans: Math.min(store.completedScans + 1, LaunchPricing.freeStarterScans),
      updatedAt: new Date().toISOString(),
    });
    if (FileSystem.documentDirectory) {
      await FileSystem.writeAsStringAsync(STARTER_SCAN_FILE, JSON.stringify(next));
    }
    return resolveAccess(next, false);
  });
  return writeQueue;
}
