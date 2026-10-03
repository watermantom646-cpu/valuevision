# ValueVision Founding Seller Checkout Runbook

Date: 10 July 2026

## Offer

- Product: ValueVision Founding Seller Beta
- Price: GBP 9.99 one time
- Access: 25 item scans during a 30-day allowance
- Capacity: first 20 paying UK resellers
- Promise: item identity, market evidence, resale range, profit guidance, listing drafts, and saved finds
- Car checks: paused and excluded from the offer

## 1. Create the Hosted Checkout

1. Create a one-time GBP 9.99 product in the payment provider.
2. Name it `ValueVision Founding Seller Beta - 30 Days`.
3. Require the buyer's email address.
4. Limit sales to 20 if the provider supports payment limits.
5. Make the refund and beta wording visible before payment.
6. Copy the HTTPS checkout link.
7. Set `EXPO_PUBLIC_FOUNDING_SELLER_CHECKOUT_URL` in the web build environment.
8. Rebuild and publish the Expo web app.

Do not place this external web checkout inside the iOS build. Apple purchases continue through StoreKit in the native app.

## 2. Generate Access Codes

Run:

```bash
cd /Users/abbiemaytum/ValueVision/backend
npm run founding:codes -- 20
```

Copy the comma-separated output into the production backend secret `FOUNDING_SELLER_CODES`. Store the separately generated value as `GROWTH_DASHBOARD_TOKEN`. Keep the customer fulfilment list in a private customer tracker, not in the repository.

Each code activates up to two browsers/devices and grants 30 days of seller-plan access. The backend stores only hashes of codes and device identifiers.

## 3. Fulfil Each Purchase

1. Confirm the payment in the provider dashboard.
2. Assign one unused code to the checkout email.
3. Send the buyer the public ValueVision paywall link and their private code.
4. Ask them to enter the code under `Already purchased the founding beta?`.
5. Mark the code as assigned in the private customer tracker.
6. Offer a 15-minute onboarding call or message exchange.
7. After activation, the customer can share a public referral link from the seller-plan screen. This link is separate from the private access code.

Suggested fulfilment message:

> Thanks for joining the ValueVision Founding Seller Beta. Open the ValueVision seller-plan page, enter your private access code below, and your 25-scan allowance will activate for 30 days. Reply directly if a result looks uncertain or you need help with your first scan.

## 4. Daily Commercial Metrics

- Targeted sellers contacted
- Checkout page visits
- Payments completed
- Codes activated
- First scans completed
- Customers returning within seven days
- API usage and estimated cost per completed scan
- Refunds or support issues
- Helpful and needs-review result feedback

Read the protected product metrics with:

```bash
cd /Users/abbiemaytum/ValueVision/backend
npm run growth:status
```

The dashboard counts access activations as a payment proxy. Reconcile the activation count against completed payments in the payment-provider dashboard before reporting paying customers.

## 5. First Milestone

The first milestone is 10 completed payments, 10 activated codes, at least 7 customers completing a scan, and at least 5 returning for another session. Do not increase paid acquisition until those signals and the API margin are healthy.
