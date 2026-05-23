export const LaunchPricing = {
  appDownloadGbp: 0,
  monthlySubscriptionGbp: 9.99,
  monthlySubscriptionName: "ValueVision Monthly Access",
  monthlySubscriptionDescription: "Monthly access to paid scans and valuation tools.",
  monthlySubscriptionProductId: "ValueVision10",
  carValuationProductId: "valuevision_car_valuation_1",
  fullCarCheckSingleProductId: "valuevision_full_car_check_1",
  fullCarCheckBundleProductId: "valuevision_full_car_check_3",
  aiScanFromGbp: 1.49,
  carValuationFromGbp: 2.99,
  fullCarCheckSingleGbp: 5.99,
  fullCarCheckBundleChecks: 3,
  fullCarCheckBundleGbp: 15.99,
  freeStarterScans: 3,
  freeTrialDays: 0,
} as const;

export function formatGbp(amount: number) {
  return `£${amount.toFixed(2)}`;
}
