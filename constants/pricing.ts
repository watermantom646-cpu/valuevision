export const LaunchPricing = {
  aiScanFromGbp: 1.49,
  carValuationFromGbp: 2.99,
  fullCarCheckSingleGbp: 5.99,
  fullCarCheckBundleChecks: 3,
  fullCarCheckBundleGbp: 15.99,
} as const;

export function formatGbp(amount: number) {
  return `£${amount.toFixed(2)}`;
}
