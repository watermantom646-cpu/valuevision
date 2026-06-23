# ValueVision Mashtag Live Cue Card

Updated: 2026-06-23

## Open First

- Public demo: https://valuevision.expo.app
- Direct scanner: https://valuevision.expo.app/scan?mode=items
- App Store Connect TestFlight: https://appstoreconnect.apple.com/apps/6759789496/testflight/ios

## 20 Second Pitch

"ValueVision turns a photo into fast resale guidance: what the item is, a current resale estimate when the evidence is strong, confidence, and what to do next. If guessing would be risky, it asks for the missing details instead of pretending."

## Best Demo Flow

1. Open the public demo.
2. Tap Anything Mode.
3. Start with a clear, normal resale item such as an iPad, tool, fashion item, or tech item.
4. Show the result: item name, low/median/high range, confidence, matched comps, and Collection.
5. Then explain specialist items: Pokemon cards, coins, notes, antiques, and old guns need exact details when condition, grade, legal status, or maker changes value.
6. Open Car Mode and say car checks are separated from item scans so the app stays simple.

## Say This

- "It gives a price when evidence is strong."
- "If the item is specialist or condition-sensitive, it asks for more information."
- "This is resale guidance, not a formal appraisal."
- "Cars have their own mode so normal scans stay clean."
- "The monthly product is configured in the iOS build, but we are waiting on final Apple/TestFlight sandbox purchase verification before calling payments live."
- "Car checks are paused while provider billing is reset."

## Do Not Say

- "It values everything perfectly first time."
- "Every Pokemon card, gun, coin, or note gets an exact price from one photo."
- "Payments are live in the App Store today."
- "Car checks are live today."
- "This is a formal appraisal."

## Verified Today

- `npm run launch:mashtag` passed against production.
- Public web demo loaded successfully.
- Production backend readiness returned `14/14` with no blockers.
- Full `npm run launch:preflight` passed.
- iOS build `1.0.2 (27)` is finished in EAS and is the App Store/TestFlight candidate.
- Build `28` is canceled and should be ignored.

## Next External Checks

- Confirm build `1.0.2 (27)` appears in App Store Connect/TestFlight.
- Install it on a real iPhone.
- Verify the monthly subscription product loads.
- Complete one sandbox purchase.
- Confirm access unlocks after purchase.
- Confirm Restore Purchase works.
