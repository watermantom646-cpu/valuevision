import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const memoryStore = new Map<string, string>();

function webStorage() {
  if (Platform.OS !== "web") return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export async function readPersistentString(
  key: string,
  nativePath: string,
  fallback: string
): Promise<string> {
  if (Platform.OS === "web") {
    const stored = webStorage()?.getItem(key) ?? memoryStore.get(key);
    return stored ?? fallback;
  }

  try {
    const info = await FileSystem.getInfoAsync(nativePath);
    if (!info.exists) return fallback;
    return await FileSystem.readAsStringAsync(nativePath);
  } catch {
    return fallback;
  }
}

export async function writePersistentString(
  key: string,
  nativePath: string,
  value: string
): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.set(key, value);
    webStorage()?.setItem(key, value);
    return;
  }

  await FileSystem.writeAsStringAsync(nativePath, value);
}
