const carValuationsAvailable = String(
  process.env.EXPO_PUBLIC_CAR_VALUATIONS_AVAILABLE || "1"
).trim() === "1";

const fullCarChecksAvailable = String(
  process.env.EXPO_PUBLIC_FULL_CAR_CHECKS_AVAILABLE ||
  process.env.EXPO_PUBLIC_CAR_CHECKS_AVAILABLE ||
  "0"
).trim() === "1";

export const FeatureFlags = {
  carValuationsAvailable,
  fullCarChecksAvailable,
  carValuationsStatusLabel: carValuationsAvailable
    ? "Basic car valuations are available."
    : "Basic car valuations are temporarily unavailable.",
  fullCarChecksStatusLabel: fullCarChecksAvailable
    ? "Finance, stolen and write-off checks are available."
    : "Paid finance, stolen and write-off checks are awaiting Brego verification.",
} as const;
