import * as FileSystem from "expo-file-system/legacy";

import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

export type CarCheckCreditStore = {
  credits: number;
  transactions: string[];
  updatedAt: string;
};

const CREDIT_FILE = `${FileSystem.documentDirectory || ""}valuevision-car-check-credits.json`;
const CREDIT_KEY = "valuevision-car-check-credits";

function normalizeStore(input: Partial<CarCheckCreditStore> | null | undefined): CarCheckCreditStore {
  const credits = Math.max(0, Math.floor(Number(input?.credits || 0)));
  const transactions = Array.isArray(input?.transactions)
    ? input.transactions.map((x) => String(x)).filter(Boolean).slice(-100)
    : [];
  return {
    credits,
    transactions,
    updatedAt: String(input?.updatedAt || new Date().toISOString()),
  };
}

async function saveStore(store: CarCheckCreditStore) {
  await writePersistentString(CREDIT_KEY, CREDIT_FILE, JSON.stringify(store));
}

export async function loadCarCheckCredits(): Promise<CarCheckCreditStore> {
  try {
    const raw = await readPersistentString(CREDIT_KEY, CREDIT_FILE, "{}");
    return normalizeStore(JSON.parse(raw));
  } catch {
    return normalizeStore(null);
  }
}

export async function addCarCheckCredits(args: {
  productId: string;
  credits: number;
  transactionId?: string | null;
  platform?: string;
}): Promise<CarCheckCreditStore> {
  const creditCount = Math.max(0, Math.floor(Number(args.credits || 0)));
  const transactionKey = String(args.transactionId || "").trim();
  const current = await loadCarCheckCredits();
  if (transactionKey && current.transactions.includes(transactionKey)) return current;
  const next = normalizeStore({
    credits: current.credits + creditCount,
    transactions: transactionKey ? [...current.transactions, transactionKey].slice(-100) : current.transactions,
    updatedAt: new Date().toISOString(),
  });
  await saveStore(next);
  return next;
}

export async function consumeCarCheckCredit(): Promise<CarCheckCreditStore> {
  const current = await loadCarCheckCredits();
  if (current.credits <= 0) throw new Error("No full car check credits available.");
  const next = normalizeStore({
    ...current,
    credits: current.credits - 1,
    updatedAt: new Date().toISOString(),
  });
  await saveStore(next);
  return next;
}

export async function refundCarCheckCredit(): Promise<CarCheckCreditStore> {
  const current = await loadCarCheckCredits();
  const next = normalizeStore({
    ...current,
    credits: current.credits + 1,
    updatedAt: new Date().toISOString(),
  });
  await saveStore(next);
  return next;
}
