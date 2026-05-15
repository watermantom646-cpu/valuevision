# ValueVision Launch Pricing Plan (GBP)

Date: 8 May 2026

## Recommended Public Pricing
- AI scan: £1.49
- Car valuation: from £2.99
- Full car check: £5.99
- Full car check bundle: 3 checks for £15.99

## Margin Assumptions (Full Car Check)
- Estimated variable API cost per full car check: £2.20
- App store fee assumption: 15%

## Estimated Gross Profit
- Single full car check at £5.99:
  - Net after 15% fee: £5.09
  - Estimated gross profit: £2.89
  - Gross margin: 48.3%
- Bundle (3 checks) at £15.99:
  - Net after 15% fee: £13.59
  - Estimated gross profit: £6.99 total
  - Estimated gross profit per check: £2.33

## Pricing Guardrails
- Do not sell full car check below £5.49 unless API costs drop.
- If average variable cost rises above £2.60, move single price to £6.49.
- Keep bundle price at 8% to 12% discount from single-check equivalent.

## Monitoring Steps
- Check usage and cost pressure at least every 2 to 3 hours on launch day.
- Endpoint: `GET /provider-usage`
- If soft limit pressure rises, keep customer mode full and reduce internal test volume.
