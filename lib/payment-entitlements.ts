import * as FileSystem from "expo-file-system/legacy";
import { AppState, Platform } from "react-native";

import { readPersistentString, writePersistentString } from "@/lib/persistent-storage";

const API_BASE = String(process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE || "").replace(/\/+$/, "");
const TOKEN_KEY = "valuevision.customer-access-token.v1";
const ID_KEY = "valuevision.installation-id.v1";
const TOKEN_PATH = `${FileSystem.documentDirectory || ""}valuevision-customer-access-token.txt`;
const ID_PATH = `${FileSystem.documentDirectory || ""}valuevision-installation-id.txt`;
const APPLE_PRODUCTS = new Set([
  process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID || "ValueVision10",
  process.env.EXPO_PUBLIC_IOS_VALUE_CREDITS_25_PRODUCT_ID || "valuevision_value_credits_25",
  process.env.EXPO_PUBLIC_IOS_VALUE_CREDITS_75_PRODUCT_ID || "valuevision_value_credits_75",
  process.env.EXPO_PUBLIC_IOS_CAR_CHECK_1_PRODUCT_ID || "valuevision_full_car_check_1",
  process.env.EXPO_PUBLIC_IOS_CAR_CHECK_3_PRODUCT_ID || "valuevision_full_car_check_3",
]);

let installed = false;
let syncingApple = false;
const syncedTransactions = new Set<string>();
const appleClaimPromises = new Map<string, Promise<void>>();

function newInstallationId() {
  return `vv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export async function getCustomerAccessToken() {
  return readPersistentString(TOKEN_KEY, TOKEN_PATH, "");
}

export async function saveCustomerAccessToken(token: string) {
  if (token) await writePersistentString(TOKEN_KEY, TOKEN_PATH, token);
}

export async function getInstallationId() {
  const existing = await readPersistentString(ID_KEY, ID_PATH, "");
  if (existing) return existing;
  const created = newInstallationId();
  await writePersistentString(ID_KEY, ID_PATH, created);
  return created;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
  return typeof Request !== "undefined" && input instanceof Request ? input.url : "";
}

export function installValueVisionApiIdentity() {
  if (installed || !API_BASE || typeof globalThis.fetch !== "function") return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url.startsWith(API_BASE)) return originalFetch(input, init);
    const sourceHeaders = init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    const headers = new Headers(sourceHeaders);
    const [token, installationId] = await Promise.all([getCustomerAccessToken(), getInstallationId()]);
    headers.set("X-ValueVision-Installation-Id", installationId);
    if (token) headers.set("X-ValueVision-Customer-Token", token);
    return originalFetch(input, { ...init, headers });
  }) as typeof globalThis.fetch;
}

async function paymentPost(path: string, body: Record<string, unknown>) {
  if (!API_BASE) throw new Error("Value Vision API is not configured.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Payment verification failed.");
  if (payload.accessToken) await saveCustomerAccessToken(payload.accessToken);
  return payload;
}

export async function claimStripeCheckout(sessionId: string) {
  return paymentPost("/api/v1/payments/stripe/claim", { sessionId });
}

export async function verifyAppleTransaction(transactionId: string) {
  return paymentPost("/api/v1/payments/apple/verify", { transactionId });
}

export async function syncApplePurchase(purchase: any, options: { required?: boolean } = {}) {
  const productId = String(purchase?.productId || purchase?.productIds?.[0] || "");
  const transactionId = String(purchase?.transactionId || purchase?.originalTransactionIdentifierIOS || purchase?.originalTransactionId || "");
  if (!APPLE_PRODUCTS.has(productId)) return;
  if (!/^\d+$/.test(transactionId)) {
    if (options.required) throw new Error("Apple did not return a valid transaction identifier.");
    return;
  }
  if (syncedTransactions.has(transactionId)) return;
  const existingClaim = appleClaimPromises.get(transactionId);
  if (existingClaim) return existingClaim;
  const claim = verifyAppleTransaction(transactionId)
    .then(() => {
      syncedTransactions.add(transactionId);
    })
    .finally(() => {
      appleClaimPromises.delete(transactionId);
    });
  appleClaimPromises.set(transactionId, claim);
  return claim;
}

async function syncAvailableApplePurchases(iap?: any) {
  if (Platform.OS !== "ios" || syncingApple) return;
  syncingApple = true;
  try {
    const module = iap || (await import("expo-iap"));
    await module.initConnection();
    const purchases = await module.getAvailablePurchases();
    for (const purchase of purchases || []) await syncApplePurchase(purchase);
  } catch {
    // StoreKit can be unavailable in simulators and before App Store login.
  } finally {
    syncingApple = false;
  }
}

export function bootstrapPaymentEntitlements() {
  installValueVisionApiIdentity();
  if (Platform.OS !== "ios") return () => {};
  let purchaseListener: { remove?: () => void } | undefined;
  void import("expo-iap").then(async (iap: any) => {
    try {
      purchaseListener = iap.purchaseUpdatedListener((purchase: any) => {
        void syncApplePurchase(purchase).catch(() => {});
      });
      await syncAvailableApplePurchases(iap);
    } catch {
      // The paywall reports StoreKit errors to the customer.
    }
  });
  const appStateListener = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncAvailableApplePurchases();
  });
  const timer = setInterval(() => void syncAvailableApplePurchases(), 30000);
  return () => {
    clearInterval(timer);
    appStateListener.remove();
    purchaseListener?.remove?.();
  };
}
