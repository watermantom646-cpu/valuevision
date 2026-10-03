# Value Vision API Setup - 10 August 2026

This checklist prepares production credentials without exposing them in source control, mobile builds, screenshots, chat, or backup environment files.

## Safety rules

1. Create each account using the Value Vision owner email and enable two-factor authentication.
2. Put server secrets directly into the Render environment dashboard. Do not paste secret values into chat.
3. Do not add new values to `.env.bak*` files.
4. Keep `PAID_ACCESS_MODE=locked` until a verified payment or controlled internal test authorises a premium call.
5. Keep the GBP limits enabled: £5 soft limit and £10 hard daily limit for launch.
6. Revoke old keys only after the replacement has completed one controlled request.

## Credentials to obtain

1. Gemini: `GEMINI_API_KEY`
2. eBay production keyset: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
3. DVSA MOT History: API key, OAuth client ID, client secret, token URL and scope
4. Existing DVLA VES key: `DVLA_VEHICLE_API_KEY` if the existing account remains authorised
5. Premium vehicle provider: `DEALERPRICING_API_KEY` or the final approved provider key
6. Stripe: secret key, publishable key and webhook signing secret
7. Optional capped fallback: `BRAVE_SEARCH_API_KEY`

## Controlled activation order

1. Start with sandbox credentials wherever the provider offers them.
2. Enable Gemini and make one item-identification request.
3. Enable eBay and make one comparable-listing request.
4. Enable DVLA or DVSA and make one known-registration request.
5. Enable the premium vehicle sandbox and inspect one known report.
6. Add live premium credit only after payment gating is active.
7. Make one live paid vehicle request, then confirm `/provider-usage` reports the expected call and cost.
8. Leave automatic enrichment disabled if the £5 soft limit is reached.

## Production budget settings

```text
CHECKCAR_DAILY_SOFT_LIMIT=10
CHECKCAR_DAILY_HARD_LIMIT=20
CHECKCAR_DAILY_SOFT_COST_LIMIT_GBP=5
CHECKCAR_DAILY_HARD_COST_LIMIT_GBP=10
CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT=1
CHECKCAR_ENFORCE_HARD_LIMIT=1
ITEM_ANALYZE_DAILY_HARD_LIMIT=50
ITEM_ANALYZE_PER_IP_DAILY_HARD_LIMIT=5
PAID_ACCESS_MODE=locked
ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA=1
```

## Launch rule

No customer-facing premium vehicle request should reach a paid provider until the backend has verified a successful payment entitlement. A client-supplied `paid=true` flag is not proof of payment.
