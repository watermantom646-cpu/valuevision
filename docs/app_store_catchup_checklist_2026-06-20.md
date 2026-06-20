# ValueVision App Store Catch-Up Checklist

Date: 2026-06-20

## Immediate Product Priorities

- Verify home, scan, collection, deals, and item detail buttons on device.
- Demo Anything Mode with at least:
  - Pokemon card
  - Coin or note
  - Antique or vintage item
  - Tool
  - Electronics item
- Keep car checks visibly paused unless provider budget is restored.

## Backend and Runtime

- Confirm production API responds at `https://valuevision-4kj3.onrender.com/health`
- Confirm `/analyze` works for non-vehicle item flows
- Confirm `/valuation/accuracy-dashboard` responds cleanly
- Re-run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run launch:status`

## App Store Submission Readiness

- Confirm production copy in app matches current product reality
- Confirm privacy policy and terms links/content are current:
  - `/Users/abbiemaytum/ValueVision/docs/privacy-policy.md`
  - `/Users/abbiemaytum/ValueVision/docs/terms-of-use.md`
- Capture fresh App Store screenshots for:
  - Home
  - Scan flow
  - Item result
  - Collection
- Review camera, photo library, and microphone permission wording in `app.config.js`
- Build production iOS binary with EAS
- Submit with EAS after final smoke test

## Suggested Submission Sequence

1. `eas build --platform ios --profile production`
2. Install and smoke test the produced build
3. `eas submit --platform ios --profile production`

## Meeting-Safe Positioning

- Lead with item valuation breadth, not vehicle checks
- Say the app handles cards, coins, collectibles, tech, tools, fashion, and general resale
- Only discuss car checks as a protected expansion path if asked
