# ValueVision Payment Gap Audit

Date: 2026-06-20

## Current State

- `expo-iap` is installed in `package.json`
- `expo-iap` plugin is enabled in `app.config.js`
- Product IDs are defined in `/Users/abbiemaytum/ValueVision/constants/pricing.ts`
- Backend paid-access protection is enabled
- Production backend reports monetization mode `token`
- App UI mentions monthly access and one-off paid checks
- Native billing state is now surfaced in:
  - `/Users/abbiemaytum/ValueVision/app/paywall.tsx`
  - `/Users/abbiemaytum/ValueVision/lib/use-valuevision-billing.ts`
  - `/Users/abbiemaytum/ValueVision/lib/billing-state.ts`
- App can now:
  - initialize store connection on native builds
  - fetch configured monthly and one-off products
  - start purchase requests
  - restore purchases
  - persist local entitlement/credit state after purchase updates

## Confirmed Gaps

- No verified end-to-end Apple sandbox/TestFlight payment has been confirmed yet
- No backend receipt verification service exists yet
- No secure server-issued entitlement token is minted after verified purchase
- No user-facing proof that App Store products are approved/live in App Store Connect yet
- No purchase analytics events
- No sandbox/TestFlight purchase verification path in app code

## Risk

The app now has native billing scaffolding, but it still cannot be described as fully proven for taking money from real users until App Store products, purchase verification, and entitlement unlock have been tested end-to-end.

## Recommended Build Order

1. Add backend receipt verification and secure entitlement minting
2. Use verified entitlement to unlock paid vehicle data on the backend
3. Add analytics events for paywall open, purchase start, purchase success, purchase failure, restore success
4. Test monthly, single-check, and bundle purchases in Apple sandbox / TestFlight
5. Confirm real App Store Connect product availability and metadata

## Important Note

Until verified purchase, restore, and unlock have all been tested end-to-end, ValueVision should not be described as having a finished working Apple payment flow.
