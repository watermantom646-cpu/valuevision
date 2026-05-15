import * as FileSystem from "expo-file-system/legacy";

export type WatchlistEntry = {
  id: string;
  createdAt: string;
  query: string;
  category: string;
  currency?: string;
  currencySymbol?: string;
  lastMedian?: number | null;
  alertEnabled?: boolean;
  alertPrice?: number | null;
  alertTriggered?: boolean;
};

const WATCHLIST_FILE = `${FileSystem.documentDirectory || ""}valuevision-watchlist.json`;
let writeQueue: Promise<void> = Promise.resolve();

function normalizeEntry(entry: WatchlistEntry): WatchlistEntry {
  return {
    ...entry,
    id: String(entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    createdAt: entry.createdAt || new Date().toISOString(),
    query: String(entry.query || "").trim() || "Unknown item",
    category: String(entry.category || "general").toLowerCase(),
    alertEnabled: Boolean(entry.alertEnabled),
    alertPrice: typeof entry.alertPrice === "number" ? entry.alertPrice : null,
    alertTriggered: Boolean(entry.alertTriggered),
  };
}

async function readFileRaw(): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(WATCHLIST_FILE);
  } catch {
    return "[]";
  }
}

export async function loadWatchlist(): Promise<WatchlistEntry[]> {
  const raw = await readFileRaw();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => normalizeEntry(x as WatchlistEntry));
  } catch {
    try {
      await FileSystem.writeAsStringAsync(WATCHLIST_FILE, "[]");
    } catch {}
    return [];
  }
}

async function saveWatchlist(items: WatchlistEntry[]): Promise<void> {
  await FileSystem.writeAsStringAsync(WATCHLIST_FILE, JSON.stringify(items));
}

export async function upsertWatchlistEntry(entry: WatchlistEntry): Promise<void> {
  const safe = normalizeEntry(entry);
  writeQueue = writeQueue.then(async () => {
    const current = await loadWatchlist();
    const key = `${safe.query.toLowerCase()}|${safe.category.toLowerCase()}`;
    const filtered = current.filter((x) => `${x.query.toLowerCase()}|${x.category.toLowerCase()}` !== key && x.id !== safe.id);
    const next = [safe, ...filtered].slice(0, 300);
    await saveWatchlist(next);
  });
  await writeQueue;
}

export async function removeWatchlistEntry(id: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const current = await loadWatchlist();
    const next = current.filter((x) => x.id !== id);
    await saveWatchlist(next);
  });
  await writeQueue;
}

export async function toggleWatchlistAlert(id: string, enabled: boolean): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const current = await loadWatchlist();
    const next = current.map((x) => (x.id === id ? normalizeEntry({ ...x, alertEnabled: enabled }) : x));
    await saveWatchlist(next);
  });
  await writeQueue;
}
