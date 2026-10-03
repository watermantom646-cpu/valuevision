export const LaunchPricing = {
  appDownloadGbp: 0,
  monthlySubscriptionGbp: 9.99,
  monthlySubscriptionName: "ValueVision Plus",
  monthlySubscriptionDescription: "100 Value Credits every 30 days for item, Treasure Hunt, or basic car valuations, plus market evidence, profit guidance, and listing drafts.",
  monthlySubscriptionProductId: "ValueVision10",
  monthlyItemScanAllowance: 100,
  itemValuationCredits: 1,
  treasureItemCredits: 1,
  basicCarValuationCredits: 3,
  valueCreditPack25ProductId: "valuevision_value_credits_25",
  valueCreditPack25Credits: 25,
  valueCreditPack25Gbp: 3.99,
  valueCreditPack75ProductId: "valuevision_value_credits_75",
  valueCreditPack75Credits: 75,
  valueCreditPack75Gbp: 8.99,
  carValuationProductId: "valuevision_car_valuation_1",
  fullCarCheckSingleProductId: "valuevision_full_car_check_1",
  fullCarCheckBundleProductId: "valuevision_full_car_check_3",
  aiScanFromGbp: 1.49,
  carValuationFromGbp: 0,
  fullCarCheckSingleGbp: 4.5,
  fullCarCheckBundleChecks: 3,
  fullCarCheckBundleGbp: 11.99,
  freeStarterScans: 3,
  freeTrialDays: 0,
} as const;

export function formatGbp(amount: number) {
  return `£${amount.toFixed(2)}`;
}
