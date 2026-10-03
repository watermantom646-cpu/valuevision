# Brego launch handover

Value Vision is configured to treat Brego as the only active vehicle provider. The retired CheckCar route remains unreachable while `CAR_DATA_PROVIDER=brego`.

## Required Brego values

Set these only in the backend environment:

- `BREGO_API_KEY`
- `BREGO_VALUATION_URL_TEMPLATE`
- `BREGO_VEHICLE_URL_TEMPLATE` when vehicle identity is a separate endpoint
- `BREGO_FULL_CHECK_URL_TEMPLATE`
- `BREGO_API_KEY_HEADER`, normally `x-api-key`
- `BREGO_SANDBOX=0` for production

Templates may use `{registration}`, `{mileage}` and `{valuationDate}` placeholders. If Brego expects query parameters instead, Value Vision adds `vehicle_registration_mark`, `current_mileage` and `valuation_date` automatically.

## Customer offer

- Three free starter scans.
- Value Vision Plus: £9.99 per month for 25 item or basic car valuation scans.
- One full vehicle-history check: £4.50.
- Three full checks: £11.99.

Failed Brego responses use a non-success status so the payment layer returns the customer's scan or full-check credit. Basic valuations are cached for 24 hours to reduce provider costs. Full history reports are not cached and require a paid credit.

## Mandatory launch checks

1. Confirm the Brego agreement permits customer-facing display and caching.
2. Confirm every response field and update the normalizer if Brego's direct response differs from the documented sample.
3. Test one normal vehicle, one unusual vehicle, one invalid registration and one full report.
4. Confirm provider failure returns the customer's credit.
5. Replace every key previously pasted into chat.
6. Configure matching £4.50 and £11.99 products in Stripe and App Store Connect.
7. Set a Brego account-side spend limit as well as `BREGO_DAILY_HARD_CALL_LIMIT`.
