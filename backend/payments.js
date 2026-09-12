"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const STORE_PATH = clean(process.env.PAYMENT_STORE_PATH) || path.join(__dirname, "data", "payment-entitlements.json");
const MONTHLY_SCAN_LIMIT = Math.max(1, Number(process.env.MONTHLY_SCAN_LIMIT || 25));
const STARTER_SCAN_LIMIT = Math.max(0, Number(process.env.STARTER_SCAN_LIMIT || 3));

const PRODUCT_CONFIG = {
  monthly: {
    kind: "subscription",
    stripePriceId: () => clean(process.env.STRIPE_MONTHLY_PRICE_ID),
    appleProductId: () => clean(process.env.APPLE_MONTHLY_PRODUCT_ID || "ValueVision10"),
  },
  car_check_1: {
    kind: "carChecks",
    quantity: 1,
    stripePriceId: () => clean(process.env.STRIPE_CAR_CHECK_1_PRICE_ID),
    appleProductId: () => clean(process.env.APPLE_CAR_CHECK_1_PRODUCT_ID || "valuevision_full_car_check_1"),
  },
  car_check_3: {
    kind: "carChecks",
    quantity: 3,
    stripePriceId: () => clean(process.env.STRIPE_CAR_CHECK_3_PRICE_ID),
    appleProductId: () => clean(process.env.APPLE_CAR_CHECK_3_PRODUCT_ID || "valuevision_full_car_check_3"),
  },
  valuation: {
    kind: "valuations",
    quantity: 1,
    stripePriceId: () => clean(process.env.STRIPE_VALUATION_PRICE_ID),
    appleProductId: () => clean(process.env.APPLE_VALUATION_PRODUCT_ID),
  },
};

function clean(value) {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function emptyStore() {
  return { version: 1, customers: {}, transactions: {}, freeUsage: {} };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      ...emptyStore(),
      ...parsed,
      customers: parsed.customers || {},
      transactions: parsed.transactions || {},
      freeUsage: parsed.freeUsage || {},
    };
  } catch {
    return emptyStore();
  }
}

let store = loadStore();

function saveStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const temporaryPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryPath, STORE_PATH);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function safeHashEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requestCustomerToken(req) {
  return clean(req.headers["x-valuevision-customer-token"]);
}

function findCustomerByToken(token) {
  if (!token) return null;
  const candidate = sha256(token);
  return Object.values(store.customers).find((customer) => safeHashEqual(customer.tokenHash, candidate)) || null;
}

function newCustomer() {
  const id = crypto.randomUUID();
  const customer = {
    id,
    tokenHash: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    subscription: null,
    balances: { carChecks: 0, valuations: 0 },
    scanPeriod: "",
    scansUsed: 0,
  };
  store.customers[id] = customer;
  return customer;
}

function issueToken(customer) {
  const token = randomToken();
  customer.tokenHash = sha256(token);
  customer.updatedAt = nowIso();
  return token;
}

function customerForTransaction(transactionKey, req) {
  const existingTransaction = store.transactions[transactionKey];
  const suppliedToken = req ? requestCustomerToken(req) : "";
  const authenticatedCustomer = findCustomerByToken(suppliedToken);
  let customer = existingTransaction ? store.customers[existingTransaction.customerId] : null;
  if (!customer && authenticatedCustomer) customer = authenticatedCustomer;
  if (!customer) customer = newCustomer();
  let accessToken = null;
  if (!authenticatedCustomer || authenticatedCustomer.id !== customer.id) accessToken = issueToken(customer);
  return { customer, accessToken };
}

function activeSubscription(customer) {
  const subscription = customer && customer.subscription;
  if (!subscription || !["active", "trialing"].includes(subscription.status)) return false;
  if (!subscription.expiresAt) return true;
  return Date.parse(subscription.expiresAt) > Date.now();
}

function scanPeriodKey() {
  return new Date().toISOString().slice(0, 7);
}

function resetScanPeriodIfNeeded(customer) {
  const period = scanPeriodKey();
  if (customer.scanPeriod !== period) {
    customer.scanPeriod = period;
    customer.scansUsed = 0;
  }
}

function entitlementSummary(customer) {
  resetScanPeriodIfNeeded(customer);
  const subscribed = activeSubscription(customer);
  return {
    customerId: customer.id,
    subscriptionActive: subscribed,
    subscription: customer.subscription,
    monthlyScanLimit: MONTHLY_SCAN_LIMIT,
    monthlyScansUsed: Number(customer.scansUsed || 0),
    monthlyScansRemaining: subscribed ? Math.max(0, MONTHLY_SCAN_LIMIT - Number(customer.scansUsed || 0)) : 0,
    carCheckCredits: Number(customer.balances?.carChecks || 0),
    valuationCredits: Number(customer.balances?.valuations || 0),
  };
}

function productKeyForAppleProduct(productId) {
  return Object.entries(PRODUCT_CONFIG).find(([, product]) => product.appleProductId() === productId)?.[0] || "";
}

function grantProduct(customer, productKey, transactionKey, details = {}) {
  if (store.transactions[transactionKey]) return false;
  const product = PRODUCT_CONFIG[productKey];
  if (!product) throw new Error("Unknown payment product");
  if (product.kind === "subscription") {
    customer.subscription = {
      status: details.status || "active",
      source: details.source || "unknown",
      productId: details.productId || productKey,
      originalTransactionId: details.originalTransactionId || null,
      stripeSubscriptionId: details.stripeSubscriptionId || null,
      expiresAt: details.expiresAt || new Date(Date.now() + 31 * 86400000).toISOString(),
      updatedAt: nowIso(),
    };
  } else {
    customer.balances = customer.balances || { carChecks: 0, valuations: 0 };
    customer.balances[product.kind] = Number(customer.balances[product.kind] || 0) + Number(product.quantity || 1);
  }
  customer.updatedAt = nowIso();
  store.transactions[transactionKey] = {
    customerId: customer.id,
    productKey,
    provider: details.source || "unknown",
    createdAt: nowIso(),
  };
  saveStore();
  return true;
}

function paymentCors(req, res, next) {
  const origin = clean(req.headers.origin);
  const allowed = clean(process.env.ALLOWED_ORIGINS).split(",").map((entry) => entry.trim()).filter(Boolean);
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-ValueVision-Customer-Token, X-ValueVision-Installation-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

async function stripeRequest(pathname, options = {}) {
  const secret = clean(process.env.STRIPE_SECRET_KEY);
  if (!secret) throw new Error("Stripe is not configured");
  const response = await fetch(`https://api.stripe.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe request failed (${response.status})`);
  return payload;
}

function stripeProduct(productKey) {
  const product = PRODUCT_CONFIG[productKey];
  if (!product || !product.stripePriceId()) return null;
  return product;
}

function stripeSubscriptionExpiry(subscription) {
  const seconds = Number(subscription?.current_period_end || subscription?.items?.data?.[0]?.current_period_end || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date(Date.now() + 31 * 86400000).toISOString();
}

async function retrieveStripeSession(sessionId) {
  return stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
}

function fulfillStripeSession(session, req) {
  const productKey = clean(session?.metadata?.product_key);
  if (!PRODUCT_CONFIG[productKey]) throw new Error("Stripe session has no recognised product");
  if (!["paid", "no_payment_required"].includes(clean(session.payment_status))) throw new Error("Stripe payment is not complete");
  const transactionKey = `stripe:${session.id}`;
  const { customer, accessToken } = customerForTransaction(transactionKey, req);
  const subscription = typeof session.subscription === "object" ? session.subscription : null;
  grantProduct(customer, productKey, transactionKey, {
    source: "stripe",
    productId: stripeProduct(productKey)?.stripePriceId(),
    stripeSubscriptionId: subscription?.id || session.subscription || null,
    expiresAt: subscription ? stripeSubscriptionExpiry(subscription) : undefined,
  });
  if (accessToken) saveStore();
  return { customer, accessToken };
}

function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = clean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secret || !signatureHeader) return false;
  const parts = String(signatureHeader).split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((signature) => safeHashEqual(signature, expected));
}

function updateStripeSubscription(subscription) {
  const customer = Object.values(store.customers).find((entry) => entry.subscription?.stripeSubscriptionId === subscription.id);
  if (!customer) return;
  customer.subscription = {
    ...customer.subscription,
    status: subscription.status === "canceled" ? "canceled" : subscription.status,
    expiresAt: stripeSubscriptionExpiry(subscription),
    updatedAt: nowIso(),
  };
  customer.updatedAt = nowIso();
  saveStore();
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function appleServerJwt() {
  const issuerId = clean(process.env.APPLE_ISSUER_ID);
  const keyId = clean(process.env.APPLE_KEY_ID);
  const bundleId = clean(process.env.APPLE_BUNDLE_ID);
  const privateKey = clean(process.env.APPLE_PRIVATE_KEY).replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !bundleId || !privateKey) throw new Error("Apple server verification is not configured");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = base64urlJson({ iss: issuerId, iat: issuedAt, exp: issuedAt + 300, aud: "appstoreconnect-v1", bid: bundleId });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

function decodeJwsPayload(jws) {
  const payload = String(jws || "").split(".")[1];
  if (!payload) throw new Error("Apple returned an invalid signed transaction");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function appleTransaction(transactionId) {
  const token = appleServerJwt();
  const request = async (host) => {
    const response = await fetch(`https://${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
  let result = await request("api.storekit.itunes.apple.com");
  if (!result.response.ok) result = await request("api.storekit-sandbox.itunes.apple.com");
  if (!result.response.ok) throw new Error(`Apple transaction verification failed (${result.response.status})`);
  return decodeJwsPayload(result.body.signedTransactionInfo);
}

function paymentReadiness() {
  const stripe = {
    secretKey: Boolean(clean(process.env.STRIPE_SECRET_KEY)),
    webhookSecret: Boolean(clean(process.env.STRIPE_WEBHOOK_SECRET)),
    monthlyPrice: Boolean(PRODUCT_CONFIG.monthly.stripePriceId()),
  };
  const apple = {
    issuerId: Boolean(clean(process.env.APPLE_ISSUER_ID)),
    keyId: Boolean(clean(process.env.APPLE_KEY_ID)),
    privateKey: Boolean(clean(process.env.APPLE_PRIVATE_KEY)),
    bundleId: Boolean(clean(process.env.APPLE_BUNDLE_ID)),
    monthlyProduct: Boolean(PRODUCT_CONFIG.monthly.appleProductId()),
  };
  const internalToken = Boolean(clean(process.env.PAID_ACCESS_TOKEN));
  const iosReady = Object.values(apple).every(Boolean) && internalToken;
  const webReady = Object.values(stripe).every(Boolean) && internalToken;
  return {
    ready: iosReady,
    iosReady,
    webReady,
    stripe,
    apple,
    internalPaidAccessToken: internalToken,
    sandboxVerified: clean(process.env.PAYMENT_SANDBOX_VERIFIED) === "1",
    appleSandboxVerified: clean(process.env.APPLE_SANDBOX_VERIFIED) === "1",
  };
}

function injectInternalPaidAccess(req) {
  const token = clean(process.env.PAID_ACCESS_TOKEN);
  if (!token) return;
  req.headers.authorization = `Bearer ${token}`;
  req.headers["x-paid-access-token"] = token;
  req.headers["x-valuevision-paid-token"] = token;
  req.headers["x-valuevision-paid-access-token"] = token;
  if (req.body && typeof req.body === "object") req.body.paidAccessToken = token;
}

function reservePaidUsage(req, res, next) {
  const requestPath = String(req.path || "");
  const isItemAnalysis = requestPath === "/analyze";
  const isFullCarCheck = requestPath === "/uk-vehicle-status" && Boolean(req.body?.fullCarCheck);
  const isBasicCarValuation = requestPath === "/uk-vehicle-status" && !isFullCarCheck;
  const consumesScan = isItemAnalysis || isBasicCarValuation;
  if (!consumesScan && !isFullCarCheck) return next();
  const customer = findCustomerByToken(requestCustomerToken(req));
  let refund = null;
  if (isFullCarCheck) {
    if (!customer || Number(customer.balances?.carChecks || 0) < 1) {
      return res.status(402).json({ ok: false, code: "CAR_CHECK_CREDIT_REQUIRED", error: "A full car-check credit is required." });
    }
    customer.balances.carChecks -= 1;
    injectInternalPaidAccess(req);
    refund = () => {
      customer.balances.carChecks += 1;
      saveStore();
    };
  }
  if (consumesScan) {
    if (customer && activeSubscription(customer)) {
      resetScanPeriodIfNeeded(customer);
      if (Number(customer.scansUsed || 0) >= MONTHLY_SCAN_LIMIT) {
        return res.status(402).json({ ok: false, code: "MONTHLY_SCAN_LIMIT_REACHED", error: "Monthly scan allowance used." });
      }
      customer.scansUsed = Number(customer.scansUsed || 0) + 1;
      refund = () => {
        customer.scansUsed = Math.max(0, Number(customer.scansUsed || 0) - 1);
        saveStore();
      };
    } else {
      const installationId = clean(req.headers["x-valuevision-installation-id"]);
      const fallbackId = sha256(`${req.ip || "unknown"}:${clean(req.headers["user-agent"])}`).slice(0, 32);
      const usageKey = installationId || fallbackId;
      const usage = store.freeUsage[usageKey] || { count: 0, updatedAt: nowIso() };
      if (Number(usage.count || 0) >= STARTER_SCAN_LIMIT) {
        return res.status(402).json({ ok: false, code: "STARTER_SCANS_USED", error: "Starter scans used. Choose a plan to continue." });
      }
      usage.count = Number(usage.count || 0) + 1;
      usage.updatedAt = nowIso();
      store.freeUsage[usageKey] = usage;
      refund = () => {
        usage.count = Math.max(0, Number(usage.count || 0) - 1);
        saveStore();
      };
    }
  }
  saveStore();
  res.once("finish", () => {
    if (res.statusCode >= 400 && refund) refund();
  });
  next();
}

function registerPaymentInfrastructure(app, express) {
  app.use("/api/v1/payments", paymentCors);
  app.post("/api/v1/payments/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"])) return res.status(400).json({ ok: false, error: "Invalid Stripe signature" });
    try {
      const event = JSON.parse(rawBody);
      if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) fulfillStripeSession(event.data.object, null);
      if (["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) updateStripeSubscription(event.data.object);
      return res.json({ received: true });
    } catch (error) {
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  });
  app.get("/api/v1/payments/readiness", (_req, res) => res.json(paymentReadiness()));
  app.get("/api/v1/payments/web-checkout", async (req, res) => {
    try {
      const productKey = clean(req.query.product || "monthly");
      const product = stripeProduct(productKey);
      if (!product) return res.status(503).json({ ok: false, error: "This checkout product is not configured." });
      const publicAppUrl = clean(process.env.PUBLIC_APP_URL).replace(/\/+$/, "");
      if (!publicAppUrl) return res.status(503).json({ ok: false, error: "PUBLIC_APP_URL is not configured." });
      const params = new URLSearchParams();
      params.set("mode", product.kind === "subscription" ? "subscription" : "payment");
      params.set("line_items[0][price]", product.stripePriceId());
      params.set("line_items[0][quantity]", "1");
      params.set("metadata[product_key]", productKey);
      params.set("success_url", `${publicAppUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`);
      params.set("cancel_url", `${publicAppUrl}/paywall?checkout=cancelled`);
      params.set("allow_promotion_codes", "true");
      const session = await stripeRequest("/v1/checkout/sessions", { method: "POST", body: params });
      return res.redirect(303, session.url);
    } catch (error) {
      return res.status(503).json({ ok: false, error: String(error?.message || error) });
    }
  });
  app.post("/api/v1/payments/stripe/claim", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const sessionId = clean(req.body?.sessionId);
      if (!sessionId.startsWith("cs_")) return res.status(400).json({ ok: false, error: "Invalid checkout session." });
      const session = await retrieveStripeSession(sessionId);
      const { customer, accessToken } = fulfillStripeSession(session, req);
      return res.json({ ok: true, accessToken, entitlement: entitlementSummary(customer) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  });
  app.post("/api/v1/payments/apple/verify", express.json({ limit: "32kb" }), async (req, res) => {
    try {
      const transactionId = clean(req.body?.transactionId);
      if (!/^\d+$/.test(transactionId)) return res.status(400).json({ ok: false, error: "Invalid Apple transaction." });
      const payload = await appleTransaction(transactionId);
      if (payload.bundleId !== clean(process.env.APPLE_BUNDLE_ID)) throw new Error("Apple bundle identifier mismatch");
      if (payload.revocationDate) throw new Error("This Apple transaction has been revoked");
      const productKey = productKeyForAppleProduct(payload.productId);
      if (!productKey) throw new Error("Apple product is not configured in Value Vision");
      const verifiedTransactionId = clean(payload.transactionId || transactionId);
      const transactionKey = `apple:${verifiedTransactionId}`;
      const { customer, accessToken } = customerForTransaction(transactionKey, req);
      grantProduct(customer, productKey, transactionKey, {
        source: "apple",
        productId: payload.productId,
        originalTransactionId: payload.originalTransactionId,
        expiresAt: Number(payload.expiresDate || 0) > 0 ? new Date(Number(payload.expiresDate)).toISOString() : undefined,
      });
      if (accessToken) saveStore();
      return res.json({ ok: true, accessToken, entitlement: entitlementSummary(customer) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
  });
  app.get("/api/v1/payments/entitlement", (req, res) => {
    const customer = findCustomerByToken(requestCustomerToken(req));
    if (!customer) return res.status(401).json({ ok: false, error: "Payment access is not linked on this device." });
    return res.json({ ok: true, entitlement: entitlementSummary(customer) });
  });
  app.use(["/analyze", "/uk-vehicle-status"], express.json({ limit: "50mb" }), reservePaidUsage);
}

module.exports = { registerPaymentInfrastructure };
