import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getActiveSubscriptions,
  getAvailablePurchases,
  initConnection,
  isTransactionVerifiedIOS,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Product,
  type ProductSubscription,
  type Purchase,
} from "expo-iap";

import { LaunchPricing } from "@/constants/pricing";
import { addCarCheckCredits } from "@/lib/car-check-credits";
import { loadBillingState, persistBillingState, type BillingState } from "@/lib/billing-state";

type BillingSku = "monthly" | "single" | "bundle";
type BillingCatalogProduct = Product | ProductSubscription;

type BillingCatalog = {
  monthly: BillingCatalogProduct | null;
  single: BillingCatalogProduct | null;
  bundle: BillingCatalogProduct | null;
};

type BillingPurchaseState = {
  supported: boolean;
  connected: boolean;
  loading: boolean;
  restoring: boolean;
  purchasingSku: BillingSku | null;
  error: string | null;
  catalog: BillingCatalog;
  billingState: BillingState | null;
};

function emptyCatalog(): BillingCatalog {
  return { monthly: null, single: null, bundle: null };
}

function isNativeBillingPlatform() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

function productMatches(product: BillingCatalogProduct, productId: string) {
  const ids = [
    String((product as { id?: string }).id || ""),
    String((product as { productId?: string }).productId || ""),
  ].filter(Boolean);
  return ids.includes(productId);
}

function purchaseProductIds(purchase: Purchase): string[] {
  const anyPurchase = purchase as Purchase & {
    productId?: string;
    productIds?: string[];
    ids?: string[];
  };
  const ids = [
    ...(Array.isArray(anyPurchase.productIds) ? anyPurchase.productIds : []),
    ...(Array.isArray(anyPurchase.ids) ? anyPurchase.ids : []),
    anyPurchase.productId ? [anyPurchase.productId] : [],
  ].map((value) => String(value).trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

async function applyPurchaseToState(purchase: Purchase) {
  const ids = purchaseProductIds(purchase);
  if (!ids.length) return;
  if (purchase.purchaseState !== "purchased") {
    throw new Error("The App Store purchase is not complete yet.");
  }
  if (Platform.OS === "ios") {
    const verified = await Promise.all(ids.map((productId) => isTransactionVerifiedIOS(productId)));
    if (verified.some((isVerified) => !isVerified)) {
      throw new Error("Apple could not verify this purchase.");
    }
  }
  const currentBillingState = await loadBillingState();

  const includesMonthly = ids.includes(LaunchPricing.monthlySubscriptionProductId);
  const includesSingle = ids.includes(LaunchPricing.fullCarCheckSingleProductId);
  const includesBundle = ids.includes(LaunchPricing.fullCarCheckBundleProductId);
  const transactionId = String(
    (purchase as { transactionId?: string | null }).transactionId ||
      purchase.purchaseToken ||
      purchase.id ||
      ids.join("|")
  );

  if (includesSingle) {
    await addCarCheckCredits({
      productId: LaunchPricing.fullCarCheckSingleProductId,
      credits: 1,
      transactionId,
      platform: Platform.OS,
    });
  }

  if (includesBundle) {
    await addCarCheckCredits({
      productId: LaunchPricing.fullCarCheckBundleProductId,
      credits: LaunchPricing.fullCarCheckBundleChecks,
      transactionId,
      platform: Platform.OS,
    });
  }

  await persistBillingState({
    monthlyUnlocked: currentBillingState.monthlyUnlocked || includesMonthly,
    vehicleChecksUnlocked:
      currentBillingState.vehicleChecksUnlocked || includesSingle || includesBundle,
    billingReady: true,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
  });

  await finishTransaction({
    purchase,
    isConsumable: includesSingle || includesBundle,
  });
}

async function reconcileMonthlyEntitlement() {
  const activeSubscriptions = await getActiveSubscriptions([
    LaunchPricing.monthlySubscriptionProductId,
  ]);
  const monthlyUnlocked = activeSubscriptions.some(
    (subscription) =>
      subscription.isActive &&
      subscription.productId === LaunchPricing.monthlySubscriptionProductId
  );
  return persistBillingState({
    monthlyUnlocked,
    billingReady: true,
    lastCheckedAt: new Date().toISOString(),
    lastError: monthlyUnlocked ? null : "No active monthly subscription was found.",
  });
}

export function useValueVisionBilling() {
  const [state, setState] = useState<BillingPurchaseState>({
    supported: isNativeBillingPlatform(),
    connected: false,
    loading: false,
    restoring: false,
    purchasingSku: null,
    error: null,
    catalog: emptyCatalog(),
    billingState: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isNativeBillingPlatform()) {
      void loadBillingState().then((billingState) => {
        if (!mountedRef.current) return;
        setState((current) => ({ ...current, billingState }));
      });
      return;
    }

    let closed = false;
    const purchaseUpdateSub = purchaseUpdatedListener((purchase) => {
      void applyPurchaseToState(purchase)
        .then(() => loadBillingState())
        .then((billingState) => {
          if (closed || !mountedRef.current) return;
          setState((current) => ({
            ...current,
            billingState,
            purchasingSku: null,
            error: null,
          }));
        })
        .catch((error: unknown) => {
          if (closed || !mountedRef.current) return;
          setState((current) => ({
            ...current,
            purchasingSku: null,
            error: String((error as { message?: string })?.message || error || "Purchase update failed."),
          }));
        });
    });

    const purchaseErrorSub = purchaseErrorListener((error) => {
      if (closed || !mountedRef.current) return;
      setState((current) => ({
        ...current,
        purchasingSku: null,
        error: String(error?.message || "Purchase failed."),
      }));
    });

    async function initialize() {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        await initConnection();
        const [inAppProducts, subscriptionProducts, available, billingState] = await Promise.all([
          fetchProducts({
            skus: [
              LaunchPricing.fullCarCheckSingleProductId,
              LaunchPricing.fullCarCheckBundleProductId,
            ],
            type: "in-app",
          }),
          fetchProducts({
            skus: [LaunchPricing.monthlySubscriptionProductId],
            type: "subs",
          }),
          getAvailablePurchases(),
          loadBillingState(),
        ]);

        for (const purchase of available || []) {
          await applyPurchaseToState(purchase);
        }

        const refreshedState = await reconcileMonthlyEntitlement();
        if (closed || !mountedRef.current) return;
        const allProducts = [...(inAppProducts || []), ...(subscriptionProducts || [])];
        setState((current) => ({
          ...current,
          connected: true,
          loading: false,
          catalog: {
            monthly: allProducts.find((product) => productMatches(product, LaunchPricing.monthlySubscriptionProductId)) || null,
            single: allProducts.find((product) => productMatches(product, LaunchPricing.fullCarCheckSingleProductId)) || null,
            bundle: allProducts.find((product) => productMatches(product, LaunchPricing.fullCarCheckBundleProductId)) || null,
          },
          billingState: refreshedState || billingState,
          error: null,
        }));
      } catch (error: unknown) {
        const message = String((error as { message?: string })?.message || error || "Billing failed to start.");
        const billingState = await persistBillingState({
          billingReady: false,
          lastCheckedAt: new Date().toISOString(),
          lastError: message,
        });
        if (closed || !mountedRef.current) return;
        setState((current) => ({
          ...current,
          connected: false,
          loading: false,
          billingState,
          error: message,
        }));
      }
    }

    void initialize();

    return () => {
      closed = true;
      purchaseUpdateSub.remove();
      purchaseErrorSub.remove();
      void endConnection().catch(() => {});
    };
  }, []);

  const actions = useMemo(() => ({
    async restore() {
      if (!isNativeBillingPlatform()) return;
      setState((current) => ({ ...current, restoring: true, error: null }));
      try {
        await restorePurchases();
        const available = await getAvailablePurchases();
        for (const purchase of available || []) {
          await applyPurchaseToState(purchase);
        }
        const billingState = await reconcileMonthlyEntitlement();
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          restoring: false,
          billingState,
          error: null,
        }));
      } catch (error: unknown) {
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          restoring: false,
          error: String((error as { message?: string })?.message || error || "Restore failed."),
        }));
      }
    },
    async purchase(sku: BillingSku) {
      if (!isNativeBillingPlatform()) return;
      const selectedProduct = state.catalog[sku];
      if (!state.connected || !selectedProduct) {
        setState((current) => ({
          ...current,
          error: "This App Store product is not available yet. Refresh or try again later.",
        }));
        return;
      }
      const productId =
        sku === "monthly"
          ? LaunchPricing.monthlySubscriptionProductId
          : sku === "single"
            ? LaunchPricing.fullCarCheckSingleProductId
            : LaunchPricing.fullCarCheckBundleProductId;
      setState((current) => ({ ...current, purchasingSku: sku, error: null }));
      try {
        await requestPurchase({
          request: {
            apple: { sku: productId },
            google: { skus: [productId] },
          },
          type: sku === "monthly" ? "subs" : "in-app",
        });
      } catch (error: unknown) {
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          purchasingSku: null,
          error: String((error as { message?: string })?.message || error || "Purchase could not start."),
        }));
      }
    },
  }), [state.catalog, state.connected]);

  return {
    ...state,
    restorePurchases: actions.restore,
    purchaseSku: actions.purchase,
  };
}
