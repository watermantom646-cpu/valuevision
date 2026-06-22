# Apple TestFlight and Payment Verification Checklist

Updated: 2026-06-22

Use this when App Store Connect is open. The local CLI can prove the EAS build finished, but Apple processing, TestFlight availability, and sandbox purchase behavior must be verified in App Store Connect and on a real iPhone.

## Current Candidate

- App: ValueVision
- App Store app id: 6759789496
- App Store Connect TestFlight: https://appstoreconnect.apple.com/apps/6759789496/testflight/ios
- Latest iOS candidate: `1.0.2 (27)`
- EAS build id: `3558785a-9dc5-4de2-98c3-b699f79c9527`
- EAS submission: https://expo.dev/accounts/watermantom/projects/ValueVision/submissions/bc14962f-755a-4136-af0b-7dbf98aa6095
- Fallback submitted build: `1.0.2 (26)`

## Go / No-Go

Go for the Mashtag demo if:

- Public web demo passes `npm run launch:mashtag`.
- App Store Connect shows build `1.0.2 (27)` available in TestFlight, or build `1.0.2 (26)` remains available as fallback.
- Payment is described honestly as "configured, pending final Apple sandbox verification" unless the sandbox purchase test below passes.
- Car checks are described honestly as paused until provider billing is reset.

No-go for claiming payments live if:

- TestFlight build `27` is still processing or missing.
- The subscription product does not load inside the iOS build.
- The sandbox purchase fails or entitlement is not granted.

## TestFlight Build Check

1. Open App Store Connect.
2. Open ValueVision.
3. Go to TestFlight.
4. Confirm build `1.0.2 (27)` appears.
5. If build `27` is still processing, use build `26` or the public web demo for the meeting.
6. Add yourself/internal tester to an internal testing group.
7. Install the build from TestFlight on a real iPhone.

Pass evidence to capture:

- Screenshot showing build `1.0.2 (27)` in TestFlight.
- Screenshot showing the installed TestFlight build on the device.

## Sandbox Payment Check

1. In App Store Connect, create or use a Sandbox Apple Account under Users and Access.
2. On the iPhone, sign into the sandbox account for App Store purchases. For In-App Purchases, Apple says this is done in the App Store sandbox account area rather than signing out of the device-level Apple Account.
3. Open the TestFlight build.
4. Open the ValueVision paywall.
5. Confirm the monthly product loads.
6. Start a sandbox purchase.
7. Confirm the app grants the expected access/entitlement after purchase.
8. Restore purchases and confirm the entitlement remains available.

Pass evidence to capture:

- Screenshot of paywall product loaded.
- Screenshot of sandbox purchase confirmation.
- Screenshot of entitlement/access enabled after purchase.
- Screenshot of restore purchase success.

## Exact Meeting Wording

Use this until the sandbox purchase test passes:

"The monthly product is configured in the iOS build. We are waiting on final Apple/TestFlight sandbox purchase verification before calling payments live."

Use this only after the sandbox purchase test passes:

"Payments are working in the Apple sandbox/TestFlight flow. Production release still depends on App Store approval."

## Official References

- Apple TestFlight overview: https://developer.apple.com/testflight/
- Apple internal testers help: https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- Apple sandbox account help: https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account/
- Apple sandbox IAP testing docs: https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox
