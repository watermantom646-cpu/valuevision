# Value Vision payment launch setup

The application supports Stripe Checkout on web and server-verified Apple purchases on iPhone. No Stripe, Apple or provider secret belongs in the Expo application.

## Stripe

1. Create the monthly, one-car-check, three-car-check and valuation prices in Stripe.
2. Set `STRIPE_SECRET_KEY` and each matching `STRIPE_*_PRICE_ID` in the backend environment.
3. Set `PUBLIC_APP_URL` to the public web application origin without a trailing slash.
4. Create a webhook for `https://valuevision-4kj3.onrender.com/api/v1/payments/stripe-webhook`.
5. Subscribe it to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated` and `customer.subscription.deleted`.
6. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
7. Complete one test checkout, confirm the automatic `/payment-success` return and access after an app restart, then set `PAYMENT_SANDBOX_VERIFIED=1`.

## Apple

1. Confirm the App Store Connect IDs match `ValueVision10`, `valuevision_full_car_check_1` and `valuevision_full_car_check_3`.
2. Create an App Store Connect in-app purchase server API key.
3. Set `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` and `APPLE_BUNDLE_ID` on the backend.
4. Through TestFlight on a real device, buy the monthly plan and a car-check credit, relaunch, use Restore Purchases and confirm access remains.
5. Confirm a consumed car-check credit cannot be reused, then set `APPLE_SANDBOX_VERIFIED=1`.

## Go/no-go

Run `npm run launch:status` after deployment. Launch remains a no-go while either sandbox flag is zero, credentials are missing, production origins are missing, provider credentials are missing, or an API spending hard limit is disabled.

Do not change either sandbox flag merely to make the check green. It records a completed real payment test.
