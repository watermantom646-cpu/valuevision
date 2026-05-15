import * as FileSystem from "expo-file-system/legacy";

export type DefaultScanLane = "general" | "cars";

type UserPreferences = {
  defaultLane: DefaultScanLane;
  hasSeenHomeGuide: boolean;
  updatedAt: string;
};

const PREFS_FILE = `${FileSystem.documentDirectory || ""}valuevision-user-preferences.json`;
const DEFAULT_PREFS: UserPreferences = {
  defaultLane: "general",
  hasSeenHomeGuide: false,
  updatedAt: new Date(0).toISOString(),
};

function normalizePrefs(raw: unknown): UserPreferences {
  const lane = String((raw as any)?.defaultLane || "").toLowerCase();
  const laneMapped = lane === "antiques" || lane === "technology" || lane === "category" ? "general" : lane;
  const allowed = new Set<DefaultScanLane>(["general", "cars"]);
  return {
    defaultLane: allowed.has(laneMapped as DefaultScanLane) ? (laneMapped as DefaultScanLane) : DEFAULT_PREFS.defaultLane,
    hasSeenHomeGuide: Boolean((raw as any)?.hasSeenHomeGuide ?? DEFAULT_PREFS.hasSeenHomeGuide),
    updatedAt: String((raw as any)?.updatedAt || new Date().toISOString()),
  };
}

async function readPrefsRaw(): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(PREFS_FILE);
  } catch {
    return JSON.stringify(DEFAULT_PREFS);
  }
}

export async function loadUserPreferences(): Promise<UserPreferences> {
  try {
    const parsed = JSON.parse(await readPrefsRaw());
    return normalizePrefs(parsed);
  } catch {
    await saveUserPreferences(DEFAULT_PREFS);
    return DEFAULT_PREFS;
  }
}

export async function saveUserPreferences(next: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await loadUserPreferences();
  const merged = normalizePrefs({
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  });
  await FileSystem.writeAsStringAsync(PREFS_FILE, JSON.stringify(merged));
  return merged;
}

export async function setDefaultScanLane(defaultLane: DefaultScanLane): Promise<UserPreferences> {
  return saveUserPreferences({ defaultLane });
}

export async function setHomeGuideSeen(): Promise<UserPreferences> {
  return saveUserPreferences({ hasSeenHomeGuide: true });
}
