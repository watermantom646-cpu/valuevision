# ValueVision

ValueVision is an Expo app for fast resale valuation. It is optimized around item scanning first: collectibles, cards, coins, antiques, tools, tech, fashion, books, and home goods.

## Product Focus

- Anything Mode is the primary launch flow.
- Best meeting/demo categories: Pokemon cards, graded cards, coins, notes, antiques, vintage items, tools, electronics, fashion, and mixed resale finds.
- Car checks exist in the codebase but are currently paused when provider spend is not available.

## Local App Commands

```bash
npm install
npm run typecheck
npm run lint
npm run start
```

Useful launch helpers:

```bash
npm run launch:quick
npm run launch:status
npm run backend:start
npm run backend:stop
```

## Backend

The backend lives in `/Users/abbiemaytum/ValueVision/backend`.

Important endpoints used by the app:

- `/health`
- `/analyze`
- `/launch-readiness`
- `/provider-usage`
- `/valuation/accuracy-dashboard`

## Release Config

- Bundle ID: `com.abbiemaytum.valuevision`
- EAS project ID: `fa373526-256a-4166-a5b3-2f11e0dc9207`
- Production API base in `eas.json`: `https://valuevision-4kj3.onrender.com`
- App Store Connect app ID in `eas.json`: `6759789496`

## Current Launch Goal

Ship a clean item-first App Store build with working scan flows, working navigation, honest messaging about paused car checks, and a strong demo story around broad resale categories.
