"use strict";

const fs = require("fs");
const path = require("path");

const USAGE_PATH = clean(process.env.BREGO_USAGE_PATH) || path.join(__dirname, "data", "brego-usage.json");
const cache = new Map();

function clean(value) {
  return String(value || "").trim();
}

function enabled() {
  return clean(process.env.CAR_DATA_PROVIDER || "brego").toLowerCase() === "brego";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage() {
  try {
    const value = JSON.parse(fs.readFileSync(USAGE_PATH, "utf8"));
    return value.date === today() ? value : { date: today(), calls: 0, byEndpoint: {} };
  } catch {
    return { date: today(), calls: 0, byEndpoint: {} };
  }
}

let usage = loadUsage();

function saveUsage() {
  fs.mkdirSync(path.dirname(USAGE_PATH), { recursive: true });
  const temporaryPath = `${USAGE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(usage, null, 2));
  fs.renameSync(temporaryPath, USAGE_PATH);
}

function reserveCall(endpoint) {
  if (usage.date !== today()) usage = { date: today(), calls: 0, byEndpoint: {} };
  const hardLimit = Math.max(1, Number(process.env.BREGO_DAILY_HARD_CALL_LIMIT || 50));
  if (usage.calls >= hardLimit) {
    const error = new Error("The daily Brego safety limit has been reached.");
    error.code = "BREGO_DAILY_LIMIT";
    error.status = 503;
    throw error;
  }
  usage.calls += 1;
  usage.byEndpoint[endpoint] = Number(usage.byEndpoint[endpoint] || 0) + 1;
  saveUsage();
}

function registration(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function mileage(value) {
  const parsed = Math.round(Number(value || 0));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2000000 ? parsed : 0;
}

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, encodeURIComponent(String(value))),
    template
  );
}

function appendQuery(urlValue, values) {
  const url = new URL(urlValue);
  for (const [key, value] of Object.entries(values)) {
    if (value !== "" && value !== null && value !== undefined && !url.searchParams.has(key)) {
      url.searchParams.set(key, String(value));
    }
  }
  if (clean(process.env.BREGO_SANDBOX) === "1" && !url.searchParams.has("sandbox")) {
    url.searchParams.set("sandbox", "1");
  }
  return url.toString();
}

function endpointTemplate(kind) {
  const configured = clean({
    full: process.env.BREGO_FULL_CHECK_URL_TEMPLATE,
    vehicle: process.env.BREGO_VEHICLE_URL_TEMPLATE,
    valuation: process.env.BREGO_VALUATION_URL_TEMPLATE,
    mot: process.env.BREGO_MOT_URL_TEMPLATE,
    tax: process.env.BREGO_TAX_URL_TEMPLATE,
  }[kind]);
  if (configured) return configured;
  if (kind === "full") return "https://api.brego.io/v1/vehicles/vrm/{vrm}/check";
  const base = clean(process.env.BREGO_API_BASE_URL).replace(/\/+$/, "");
  if (!base) return "";
  if (kind === "valuation") return `${base}/brego/valuationfromvrm`;
  return "";
}

function requestUrl(kind, plate, currentMileage) {
  const template = endpointTemplate(kind);
  if (!template) return "";
  const filled = fillTemplate(template, {
    registration: plate,
    registrationNumber: plate,
    vrm: plate,
    mileage: currentMileage,
    valuationDate: today(),
  });
  return appendQuery(filled, {
    countryCode: "gb",
    mileage: kind === "valuation" && currentMileage > 0 ? currentMileage : null,
  });
}

function providerError(message, code = "BREGO_UNAVAILABLE", status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function callBrego(kind, plate, currentMileage) {
  const key = clean(process.env.BREGO_API_KEY);
  const url = requestUrl(kind, plate, currentMileage);
  if (!key) throw providerError("Brego is awaiting its production API key.", "BREGO_KEY_MISSING");
  if (!url) throw providerError(`The Brego ${kind} endpoint is awaiting provider confirmation.`, "BREGO_ENDPOINT_MISSING");
  reserveCall(kind);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(process.env.BREGO_TIMEOUT_MS || 8000)));
  try {
    const headerName = clean(process.env.BREGO_API_KEY_HEADER || "x-api-key");
    const response = await fetch(url, {
      headers: { Accept: "application/json", [headerName]: key },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const result = payload?.result || payload?.data || payload;
    const resultError = clean(result?.error || payload?.error || payload?.message);
    if (!response.ok || payload?.success === false) {
      if (response.status === 401) {
        throw providerError("Brego authentication is not active yet.", "BREGO_AUTH_FAILED");
      }
      if (response.status === 403 && kind === "full") {
        throw providerError(
          "Brego Advanced Check is not enabled for this account yet.",
          "BREGO_FULL_CHECK_NOT_LICENSED"
        );
      }
      if (response.status === 403) {
        throw providerError("Brego has not granted permission for this vehicle endpoint.", "BREGO_PERMISSION_DENIED");
      }
      throw providerError(resultError || `Brego request failed (${response.status}).`);
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw providerError("Brego took too long to respond.", "BREGO_TIMEOUT", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function numberFrom(source, names) {
  for (const name of names) {
    const value = Number(source?.[name]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function textFrom(source, names) {
  for (const name of names) {
    const value = clean(source?.[name]);
    if (value) return value;
  }
  return null;
}

function booleanFrom(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === 0) return Boolean(value);
    const normalized = clean(value).toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }
  return null;
}

function normalizeValuation(result) {
  const root = firstObject(result?.data, result);
  const valuations = firstArray(root?.items, root?.valuations, root?.valuation?.valuations);
  const source = firstObject(valuations[0], root?.valuation, root?.values, root);
  const retail = firstObject(source?.retail, source?.retailValues);
  const trade = firstObject(source?.trade, source?.tradeValues);
  const retailLow = numberFrom(retail, ["low"]) ?? numberFrom(source, ["retail_low_valuation", "retailLowValuation", "retail_low", "retailLow"]);
  const retailAverage = numberFrom(retail, ["average", "avg"]) ?? numberFrom(source, ["retail_average_valuation", "retailAverageValuation", "retail_average", "retailAverage", "retail_value"]);
  const retailHigh = numberFrom(retail, ["high"]) ?? numberFrom(source, ["retail_high_valuation", "retailHighValuation", "retail_high", "retailHigh"]);
  const tradeLow = numberFrom(trade, ["low"]) ?? numberFrom(source, ["trade_low_valuation", "tradeLowValuation", "trade_low", "tradeLow"]);
  const tradeAverage = numberFrom(trade, ["average", "avg"]) ?? numberFrom(source, ["trade_average_valuation", "tradeAverageValuation", "trade_average", "tradeAverage", "trade_value"]);
  const tradeHigh = numberFrom(trade, ["high"]) ?? numberFrom(source, ["trade_high_valuation", "tradeHighValuation", "trade_high", "tradeHigh"]);
  const privateSaleEstimate = retailAverage !== null && tradeAverage !== null
    ? Math.round((retailAverage + tradeAverage) / 2)
    : retailAverage ?? tradeAverage ?? retailLow ?? tradeHigh ?? retailHigh ?? tradeLow;
  const expected = tradeAverage ?? tradeHigh ?? tradeLow ?? privateSaleEstimate;
  return {
    currency: (textFrom(root, ["currencyCode", "currency_code", "currency"]) || "GBP").toUpperCase(),
    retailLow,
    retailAverage,
    retailHigh,
    tradeLow,
    tradeAverage,
    tradeHigh,
    privateSaleEstimate,
    estimatedValue: expected,
    mileage: numberFrom(source, ["mileage", "currentMileage", "current_mileage"]),
    version: textFrom(source, ["version", "date", "valuation_date", "valuationDate"]),
  };
}

function normalizeVehicle(...results) {
  const source = firstObject(...results.map((result) => {
    const root = firstObject(result?.data, result);
    return firstObject(root?.vehicle, root?.vehicleData, root?.details, root);
  }));
  return {
    registration: textFrom(source, ["vrm", "registration", "registrationNumber"]),
    derivativeId: textFrom(source, ["derivativeId", "derivative_id"]),
    registrationDate: textFrom(source, ["registrationDate", "registration_date"]),
    make: textFrom(source, ["make", "manufacturer"]),
    model: textFrom(source, ["model", "model_name", "modelName"]),
    derivative: textFrom(source, ["derivative", "derivative_name", "derivativeName", "variant"]),
    year: numberFrom(source, ["year", "manufacture_year", "yearOfManufacture"]),
    fuelType: textFrom(source, ["fuel_type", "fuelType", "fuel"]),
    colour: textFrom(source, ["colour", "color"]),
    transmission: textFrom(source, ["transmission", "gearbox"]),
    engineSize: textFrom(source, ["engine_size", "engineSize", "engine_capacity"]),
  };
}

function normalizeHistory(result) {
  const root = firstObject(result?.data, result);
  const source = firstObject(root?.history, root?.checks, root);
  const financeRecords = firstArray(source?.financeRecords, source?.finance_records);
  const financeRecordCount = numberFrom(source, ["financeRecordCount", "finance_record_count"]) ?? financeRecords.length;
  const writeOffRecords = firstArray(source?.writeOffRecords, source?.write_off_records);
  const writeOffRecordCount = numberFrom(source, ["writeOffRecordCount", "write_off_record_count"]) ?? writeOffRecords.length;
  const stolenRecords = firstArray(source?.stolenRecords, source?.stolen_records);
  const stolenRecordCount = numberFrom(source, ["stolenRecordCount", "StolenRecordCount", "stolen_record_count"]) ?? stolenRecords.length;
  const mileageRecords = firstArray(source?.mileageRecords, source?.mileage_records);
  const mileageRecordCount = numberFrom(source, ["mileageRecordCount", "mileage_record_count"]) ?? mileageRecords.length;
  const highRiskRecords = firstArray(source?.highRiskRecords, source?.high_risk_records);
  const highRiskRecordCount = numberFrom(source, ["highRiskRecordCount", "high_risk_record_count"]) ?? highRiskRecords.length;
  const taxiRecords = firstArray(source?.taxiRecords, source?.taxi_records);
  const salvageRecords = firstArray(source?.salvageRecords, source?.salvage_records);
  const finance = booleanFrom(source, ["finance", "financeOutstanding", "finance_outstanding"])
    ?? financeRecordCount > 0;
  const writtenOff = booleanFrom(source, ["writtenOff", "written_off", "writeOff", "write_off"])
    ?? writeOffRecordCount > 0;
  const stolen = booleanFrom(source, ["stolen", "isStolen", "is_stolen"])
    ?? stolenRecordCount > 0;
  const mileageIssues = booleanFrom(source, ["mileageAnomalyDetected", "mileageIssues", "mileage_issues", "mileageDiscrepancy", "mileage_discrepancy"])
    ?? false;
  return {
    motStatus: textFrom(source, ["mot_status", "motStatus"]),
    taxStatus: textFrom(source, ["tax_status", "taxStatus"]),
    registrationDate: textFrom(source, ["registrationDate", "registration_date"]),
    scrapped: booleanFrom(source, ["scrapped"]),
    scrappedDate: textFrom(source, ["scrappedDate", "scrapped_date"]),
    finance,
    financeOutstanding: finance,
    financeRecordCount,
    financeRecords,
    previousOwnerCount: numberFrom(source, ["previousOwnerCount", "previous_owner_count"]),
    previousOwnerChangeDate: textFrom(source, ["previousOwnerChangeDate", "previous_owner_change_date"]),
    previousOwnerChanges: firstArray(source?.previousOwnerChanges, source?.previous_owner_changes),
    writtenOff,
    writeOffRecordCount,
    writeOffCategory: textFrom(source, ["writeOffCategory", "write_off_category"]),
    writeOffRecords,
    stolen,
    stolenStatus: textFrom(source, ["stolenStatus", "stolen_status"]),
    stolenDate: textFrom(source, ["stolenDate", "stolen_date"]),
    stolenPoliceForce: textFrom(source, ["stolenPoliceForce", "stolen_police_force"]),
    stolenRecordCount,
    stolenRecords,
    mileageIssues,
    mileageAnomalyDetected: mileageIssues,
    mileageRecordCount,
    mileageRecords,
    imported: booleanFrom(source, ["imported"]),
    importedNonEu: booleanFrom(source, ["importedNonEu", "imported_non_eu"]),
    importedUsedBefore: booleanFrom(source, ["importedUsedBefore", "imported_used_before"]),
    importedNi: booleanFrom(source, ["importedNi", "imported_ni"]),
    exported: booleanFrom(source, ["exported"]),
    exportedDate: textFrom(source, ["exportedDate", "exported_date"]),
    highRisk: highRiskRecordCount > 0,
    highRiskRecordCount,
    highRiskRecords,
    colour: textFrom(source, ["colour", "color"]),
    previousColour: textFrom(source, ["previousColour", "previousColor"]),
    colourChangeCount: numberFrom(source, ["colourChangeCount", "colorChangeCount"]),
    colourChangeRecords: firstArray(source?.colourChangeRecords, source?.colorChangeRecords),
    vicTested: booleanFrom(source, ["vicTested", "vic_tested"]),
    vicTestDate: textFrom(source, ["vicTestDate", "vic_test_date"]),
    vicTestResult: textFrom(source, ["vicTestResult", "vic_test_result"]),
    latestV5cIssuedDate: textFrom(source, ["latestV5cIssuedDate", "latest_v5c_issued_date"]),
    vinLast5: textFrom(source, ["vinLast5", "vin_last_5"]),
    vinMatch: booleanFrom(source, ["vinMatch", "vin_match"]),
    vrmChangeCount: numberFrom(source, ["vrmChangeCount", "vrm_change_count"]),
    vrmChanges: firstArray(source?.vrmChanges, source?.vrm_changes),
    v5RecordCount: numberFrom(source, ["v5RecordCount", "v5_record_count"]),
    v5Records: firstArray(source?.v5Records, source?.v5_records),
    previousSearchCount: numberFrom(source, ["previousSearchCount", "previous_search_count"]),
    previousSearchRecords: firstArray(source?.previousSearchRecords, source?.previous_search_records),
    isTaxi: booleanFrom(source, ["isTaxi", "taxi"]),
    taxiRecords,
    isSalvage: booleanFrom(source, ["isSalvage", "salvage"]),
    salvageRecords,
    motHistory: firstArray(source.mot_history, source.motHistory, result?.mot_history, result?.motHistory),
  };
}

function normalizeMot(result) {
  const root = firstObject(result?.data, result);
  const motHistory = firstArray(root?.items, root?.motHistory, root?.mot_history)
    .map((row) => ({
      testDate: textFrom(row, ["date", "testDate", "test_date"]),
      result: textFrom(row, ["result", "status"]),
      expiryDate: textFrom(row, ["expiryDate", "expiry_date"]),
      odometerMiles: numberFrom(row, ["mileage", "odometerMiles", "odometer_miles"]),
      advisories: firstArray(row?.rfrAndComments, row?.advisories),
      isValid: typeof row?.isValid === "boolean" ? row.isValid : null,
    }))
    .sort((a, b) => Date.parse(b.testDate || "") - Date.parse(a.testDate || ""));
  const latest = motHistory[0] || null;
  return {
    motStatus: textFrom(root, ["motStatus", "mot_status"]) || (latest?.isValid ? "Valid" : latest?.result || null),
    motExpiryDate: textFrom(root, ["nextTestDueDate", "motExpiry", "motExpiryDate"]) || latest?.expiryDate || null,
    motHistory,
    latestRecordedMileage: latest?.odometerMiles ?? null,
  };
}

function normalizeTax(result) {
  const root = firstObject(result?.data, result);
  return {
    taxStatus: textFrom(root, ["taxStatus", "tax_status"]),
    taxDueDate: textFrom(root, ["taxDue", "taxDueDate", "tax_due_date"]),
    motStatus: textFrom(root, ["motStatus", "mot_status"]),
    motExpiryDate: textFrom(root, ["motExpiry", "motExpiryDate", "mot_expiry_date"]),
    markedForExport: typeof root?.markedForExport === "boolean" ? root.markedForExport : null,
    lastV5CIssuedDate: textFrom(root, ["dateOfLastV5CIssued", "lastV5CIssuedDate"]),
  };
}

async function basicReport(plate, currentMileage) {
  const cacheKey = `${plate}:${currentMileage}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
  const valuationResult = await callBrego("valuation", plate, currentMileage);
  const vehicleUrl = endpointTemplate("vehicle");
  const vehicleResult = vehicleUrl ? await callBrego("vehicle", plate, currentMileage) : valuationResult;
  const [motResult, taxResult] = await Promise.all([
    endpointTemplate("mot") ? callBrego("mot", plate, currentMileage).catch(() => null) : null,
    endpointTemplate("tax") ? callBrego("tax", plate, currentMileage).catch(() => null) : null,
  ]);
  const vehicle = normalizeVehicle(vehicleResult, valuationResult);
  const valuation = normalizeValuation(valuationResult);
  const mot = normalizeMot(motResult);
  const tax = normalizeTax(taxResult);
  const latestMileage = mot.latestRecordedMileage ?? valuation.mileage ?? (currentMileage > 0 ? currentMileage : null);
  const value = {
    ok: true,
    source: "brego",
    registrationNumber: plate,
    fullCarCheck: false,
    vehicle,
    valuation,
    make: vehicle.make,
    model: vehicle.model || vehicle.derivative,
    colour: vehicle.colour,
    fuelType: vehicle.fuelType,
    yearOfManufacture: vehicle.year,
    registrationDate: vehicle.registrationDate,
    mileage: latestMileage === null ? null : {
      valueMiles: latestMileage,
      source: mot.latestRecordedMileage !== null ? "Brego MOT history" : currentMileage > 0 ? "Customer supplied" : "Brego valuation estimate",
    },
    motStatus: tax.motStatus || mot.motStatus,
    motExpiryDate: tax.motExpiryDate || mot.motExpiryDate,
    motHistory: mot.motHistory,
    taxStatus: tax.taxStatus,
    taxDueDate: tax.taxDueDate,
    markedForExport: tax.markedForExport,
    lastV5CIssuedDate: tax.lastV5CIssuedDate,
    cached: false,
  };
  cache.set(cacheKey, { value, expiresAt: Date.now() + Math.max(60000, Number(process.env.BREGO_BASIC_CACHE_TTL_MS || 86400000)) });
  return value;
}

async function fullReport(plate, currentMileage) {
  const result = await callBrego("full", plate, currentMileage);
  const basic = await basicReport(plate, currentMileage);
  const history = normalizeHistory(result);
  return {
    ...basic,
    fullCarCheck: true,
    registrationDate: basic.registrationDate || history.registrationDate,
    colour: basic.colour || history.colour,
    history,
    checks: history,
    cached: false,
  };
}

function readiness() {
  const mode = clean(process.env.BREGO_SANDBOX) === "1" ? "sandbox" : "production";
  return {
    provider: "brego",
    enabled: enabled(),
    mode,
    keyConfigured: Boolean(clean(process.env.BREGO_API_KEY)),
    valuationEndpointConfigured: Boolean(endpointTemplate("valuation")),
    vehicleEndpointConfigured: Boolean(endpointTemplate("vehicle")),
    motEndpointConfigured: Boolean(endpointTemplate("mot")),
    taxEndpointConfigured: Boolean(endpointTemplate("tax")),
    fullCheckEndpointConfigured: Boolean(endpointTemplate("full")),
    usage,
    hardDailyCallLimit: Math.max(1, Number(process.env.BREGO_DAILY_HARD_CALL_LIMIT || 50)),
  };
}

function registerBregoInfrastructure(app, express) {
  app.get("/api/v1/brego/readiness", (_req, res) => res.json(readiness()));
  app.post("/uk-vehicle-status", express.json({ limit: "1mb" }), async (req, res, next) => {
    if (!enabled()) return next();
    const plate = registration(req.body?.registrationNumber || req.body?.registration || req.body?.vrm);
    if (plate.length < 2 || plate.length > 8) {
      return res.status(400).json({ ok: false, code: "INVALID_REGISTRATION", error: "Enter a valid UK registration." });
    }
    const currentMileage = mileage(req.body?.mileage || req.body?.currentMileage || req.body?.current_mileage);
    try {
      const report = req.body?.fullCarCheck
        ? await fullReport(plate, currentMileage)
        : await basicReport(plate, currentMileage);
      return res.json(report);
    } catch (error) {
      return res.status(Number(error?.status || 503)).json({
        ok: false,
        provider: "brego",
        code: clean(error?.code || "BREGO_UNAVAILABLE"),
        error: clean(error?.message || "Brego is temporarily unavailable."),
      });
    }
  });
}

module.exports = { registerBregoInfrastructure };
