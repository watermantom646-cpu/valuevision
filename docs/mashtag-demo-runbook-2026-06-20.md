# ValueVision Mashtag Demo Runbook

Updated: 2026-06-20

## Demo Links

- Public web demo: https://valuevision.expo.app
- Scanner direct link: https://valuevision.expo.app/scan?mode=items
- App Store Connect TestFlight: https://appstoreconnect.apple.com/apps/6759789496/testflight/ios
- App Store app id: 6759789496

## Current Truth

- The public web demo is live and tested.
- Anything Mode can scan non-car items and return an instant valuation when market evidence is strong enough.
- Car Mode exists as its own area, but paid car checks are paused while provider billing is being sorted.
- iOS build 24 has been uploaded to Apple through EAS Submit, but App Store/TestFlight processing and the subscription sandbox purchase still need App Store Connect verification.
- Do not promise guaranteed prices, formal appraisals, or that every obscure item will get an exact price first time.

## 90 Second Demo Script

1. Open https://valuevision.expo.app.
2. Say: "ValueVision is scan anything, instant resale guidance. It identifies the item, checks market evidence, and gives a valuation range plus next best action."
3. Tap Anything Mode.
4. Upload a clear item photo.
5. Show the result: item identity, category, valuation range, confidence, and saved collection behavior.
6. Tap Improve This Valuation and explain: "If the photo is unclear or the item is specialist, the app asks for the missing details instead of pretending."
7. Open Car Mode and say: "Cars are separated so the experience stays simple. Checks are paused for launch safety while provider billing is reset."
8. Close with: "The direction is one smooth scanner for Pokemon cards, coins, notes, tech, tools, fashion, antiques, and vehicles, with higher confidence when it has better evidence."

## Best Demo Items

- Use a clean tech item first. Current tested example: Apple iPad 9th Generation 64GB Wi-Fi Space Grey, median around GBP 142 in the live web test.
- Use a Pokemon card, coin, note, or antique as the second demo if the photo is clear and details are visible.
- For specialist items like old guns, rare coins, notes, or graded cards, position ValueVision honestly as "fast market guidance" and use Improve This Valuation for exact model, grade, year, mint mark, serial, or condition.

## Phrases To Use

- "Instant resale estimate, not a formal appraisal."
- "It gives a price when evidence is strong, and asks for more information when guessing would be risky."
- "Car checks are split into Car Mode so normal item scans stay clean."
- "The collection view turns random scans into a saved inventory."

## Phrases To Avoid

- "It appraises everything perfectly."
- "It can value any gun/coin/card with no details."
- "People can definitely pay in the App Store today."
- "Car checks are live today."

## If Something Goes Wrong

- If the App Store/TestFlight is not ready, use the public web demo.
- If a scan fails, use the iPad demo image or another clear item photo.
- If an obscure collectible gives low confidence, use that as a strength: the app asks for details instead of making up a confident number.
- If asked about payments, say: "The monthly product is configured in the app. We are waiting on final Apple/TestFlight purchase verification before calling payments live."

## Proof Captured Today

- Public URL loaded latest home UI with Anything Mode and Car Mode hub.
- Public scanner uploaded an iPad image successfully.
- Result returned: Apple iPad 9th Generation 64GB Wi-Fi Space Grey.
- Category returned: electronics.
- Median returned: GBP 142.05.
- Browser errors: none after backend CORS fix.
- Failed HTTP requests: none after backend CORS fix.

