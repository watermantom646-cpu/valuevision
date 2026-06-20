import * as FileSystem from "expo-file-system/legacy";

import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

export type AnalyticsEventName =
  | "scan_success"
  | "scan_failure"
  | "scan_confidence_high"
  | "scan_confidence_medium"
  | "scan_confidence_low";

export type AnalyticsEvent = {
  id: string;
  at: string;
  name: AnalyticsEventName;
  payload?: Record<string, unknown>;
};

type AnalyticsStore = {
  totals: Record<AnalyticsEventName, number>;
  events: AnalyticsEvent[];
  updatedAt: string;
};

const ANALYTICS_FILE = `${FileSystem.documentDirectory || ""}valuevision-analytics.json`;
const ANALYTICS_KEY = "valuevision-analytics";
const MAX_EVENTS = 300;

const EMPTY_STORE: AnalyticsStore = {
  totals: {
    scan_success: 0,
    scan_failure: 0,
    scan_confidence_high: 0,
    scan_confidence_medium: 0,
    scan_confidence_low: 0,
  },
  events: [],
  updatedAt: new Date(0).toISOString(),
};

let writeQueue: Promise<void> = Promise.resolve();

async function loadStore(): Promise<AnalyticsStore> {
  try {
    const raw = await readPersistentString(ANALYTICS_KEY, ANALYTICS_FILE, "{}");
    const parsed = JSON.parse(raw);
    return {
      totals: { ...EMPTY_STORE.totals, ...(parsed?.totals || {}) },
      events: Array.isArray(parsed?.events) ? parsed.events.slice(0, MAX_EVENTS) : [],
      updatedAt: String(parsed?.updatedAt || new Date().toISOString()),
    };
  } catch {
    return { ...EMPTY_STORE, totals: { ...EMPTY_STORE.totals }, events: [] };
  }
}

async function saveStore(store: AnalyticsStore): Promise<void> {
  await writePersistentString(ANALYTICS_KEY, ANALYTICS_FILE, JSON.stringify(store));
}

export async function trackAnalyticsEvent(name: AnalyticsEventName, payload?: Record<string, unknown>): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    store.totals[name] = Number(store.totals[name] || 0) + 1;
    store.events = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        name,
        payload: payload || {},
      },
      ...store.events,
    ].slice(0, MAX_EVENTS);
    store.updatedAt = new Date().toISOString();
    await saveStore(store);
  });
  await writeQueue;
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsStore> {
  return loadStore();
}
