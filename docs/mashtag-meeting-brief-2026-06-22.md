# ValueVision Mashtag Meeting Brief

Updated: 2026-06-22

## Positioning

ValueVision is a scan-anything resale guidance app. It identifies the item, checks market evidence, returns a valuation range when confidence is strong, and asks for missing details when guessing would be risky.

Best one-liner:

"ValueVision turns a photo into fast resale guidance: item ID, price range, confidence, and what to do next."

## Best Demo Flow

1. Open the public demo: https://valuevision.expo.app
2. Tap Anything Mode.
3. Use a clean tech item first, ideally: Apple iPad 9th Generation 64GB Wi-Fi Space Grey.
4. Show the result: category, price range, confidence, comps, and listing/collection actions.
5. Use a specialist item second:
   Say: "For rare or condition-sensitive items, it asks for detail instead of faking confidence."
6. Open Car Mode:
   Say: "Cars are separate so normal scans stay simple. Car checks are paused while provider billing is reset."

## What Is Strong Today

- Public web demo is live.
- Production backend readiness is 14/14.
- One-command demo health check is available: `npm run launch:mashtag`.
- iPad live check returns a usable electronics valuation around GBP 142 with high confidence.
- Gold sovereign live check returns a high-value collectible valuation around GBP 999 with real sovereign comps.
- Raw Pokemon card checks withhold pricing and ask for grade, exact card, set, number, and condition.
- Anything Mode redirects vehicle-like scans to Car Mode instead of pricing cars as random objects.
- iOS build 27 is the latest candidate and has been scheduled/submitted through EAS Submit.

## What Not To Promise

- Do not say every item gets an exact price first time.
- Do not say payments are fully live until App Store/TestFlight purchase verification is confirmed.
- Do not say car checks are live today.
- Do not say it is a formal appraisal for guns, coins, cards, or antiques.

## Best Answers To Likely Questions

"Can it do Pokemon cards?"
Yes, but cards are condition and grade sensitive. It prices only when evidence is strong enough; raw/ungraded cards ask for details instead of guessing.

"Can it do old guns?"
It can identify firearm-like antiques and request specialist details, but it deliberately avoids pretending to appraise legal/safety-sensitive items without maker, proof marks, deactivation/legal status, age, and specialist review.

"Can people pay yet?"
The product and paywall are configured, but we should call payments live only after Apple/TestFlight sandbox purchase verification.

"What happens if it cannot price something?"
That is part of the product: it explains what detail is missing and routes the user to improve the valuation.

## Close

"The big opportunity is making resale feel instant and simple for normal people: scan, understand value, save it, and decide what to do next. The app is already useful, and the roadmap is making the confidence layer stronger across more categories."
