import * as FileSystem from "expo-file-system/legacy";

export type ScanHistoryEntry = {
  id: string;
  createdAt: string;
  query: string;
  detectedQuery?: string | null;
  category?: string;
  confidenceLabel?: string;
  confidenceScore?: number;
  currency?: string;
  currencySymbol?: string;
  low?: number | null;
  median?: number | null;
  high?: number | null;
  recommendedRetail?: {
    low: number;
    median: number;
    high: number;
    retentionRate: number;
    label: string;
    note: string;
  };
  confidenceReasons?: string[];
  qualityGate?: {
    status: "pass" | "caution" | "hold";
    score: number;
    metrics?: {
      compCount: number;
      sourceCount: number;
      avgMatchScore: number;
      spreadPct: number;
    };
    reasons?: string[];
  };
  comps?: Array<{ title: string; price: string; source: string; link: string }>;
  recommendations?: Array<{ name: string; reason: string; speed: string; fee: string }>;
  sellTime?: { speed: string; minDays: number; maxDays: number; text: string };
  profit?: {
    buyPrice: number;
    expectedProfit?: number | null;
    conservativeProfit?: number | null;
    optimisticProfit?: number | null;
    expectedMarginPct?: number | null;
  };
  listingAssistant?: {
    suggestedTitle: string;
    suggestedStartPrice: string;
    suggestedRange: string;
    bulletPoints: string[];
    listingTip: string;
  };
};

const HISTORY_FILE = `${FileSystem.documentDirectory || ""}valuevision-scan-history.json`;
let writeQueue: Promise<void> = Promise.resolve();

function normalizeEntry(entry: ScanHistoryEntry): ScanHistoryEntry {
  return {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    query: String(entry.query || "").trim() || "Unknown item",
    category: entry.category || "general",
  };
}

async function readFileRaw(): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(HISTORY_FILE);
  } catch {
    return "[]";
  }
}

export async function loadHistory(): Promise<ScanHistoryEntry[]> {
  const raw = await readFileRaw();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => normalizeEntry(x as ScanHistoryEntry));
  } catch {
    // Reset corrupt history file so future writes succeed.
    try {
      await FileSystem.writeAsStringAsync(HISTORY_FILE, "[]");
    } catch {}
    return [];
  }
}

export async function saveHistory(items: ScanHistoryEntry[]): Promise<void> {
  await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(items));
}

export async function addHistoryEntry(entry: ScanHistoryEntry): Promise<void> {
  const safeEntry = normalizeEntry(entry);
  writeQueue = writeQueue.then(async () => {
    const current = await loadHistory();
    const deduped = current.filter((x) => x.id !== safeEntry.id);
    const next = [safeEntry, ...deduped].slice(0, 200);
    await saveHistory(next);
  });
  await writeQueue;
}

export async function getHistoryEntry(id: string): Promise<ScanHistoryEntry | null> {
  const current = await loadHistory();
  return current.find((x) => x.id === id) || null;
}

export async function removeHistoryEntry(id: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const current = await loadHistory();
    const next = current.filter((x) => x.id !== id);
    await saveHistory(next);
  });
  await writeQueue;
}

export async function clearHistory(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await saveHistory([]);
  });
  await writeQueue;
}
