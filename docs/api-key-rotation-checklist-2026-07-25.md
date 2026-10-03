# ValueVision API Key Rotation Checklist

Date: 25 July 2026

Status: Redacted local audit complete. No keys were changed, printed, deployed, revoked, or tested against paid providers.

## Launch rule

Do not launch a build containing `EXPO_PUBLIC_PAID_ACCESS_TOKEN`. Every `EXPO_PUBLIC_*` value is compiled into the mobile application and must be treated as public.

Provider credentials must exist only in the backend runtime environment. The mobile application should receive a short-lived, server-issued entitlement after the backend verifies an Apple purchase.

## Audit findings

| Priority | Finding | Location | Required action |
| --- | --- | --- | --- |
| P0 | The mobile app can read `EXPO_PUBLIC_PAID_ACCESS_TOKEN`. Any supplied value would be extractable from the app bundle. | `app/(tabs)/scan.tsx:37` | Remove this production authentication path before App Store launch. Replace it with server-verified purchase entitlements. |
| P0 | A possible literal/default paid token exists in the LAN helper. | `scripts/phone-lan-paid.sh:18` | Remove the literal/default value. Require the token through a non-public local environment variable. |
| P1 | Five local environment backups contain set provider credentials. | `backend/.env.bak.1771852723`, `backend/.env.bak.1771863856`, `backend/.env.bak.1771866535`, `backend/.env.bak.1771874573`, `backend/.env.bak.1771878266` | Keep them out of source control, rotate every credential they may contain, then securely remove the backups after the new configuration is confirmed. |
| P1 | The active local backend environment contains live-looking provider credentials. | `backend/.env` | Rotate each credential and retain this file only as a local, ignored configuration file. Never copy it into EAS or the app bundle. |
| P1 | Some old backups reference a legacy `EBAY_APP_TOKEN`. | Environment backup files listed above | Revoke the legacy token in eBay if it remains valid, even if the current backend no longer uses it. |
| P2 | `backend/.env` and `backend/.env.bak*` are covered by ignore rules. | `.gitignore:35`, `.gitignore:36` | Keep these rules. Confirm the files were never uploaded to another repository, cloud drive, support ticket, or chat. |
| P2 | No matching Stripe live secret, Google API key, GitHub token, Slack token, AWS access key, or private-key block was detected in the scanned workspace. | Redacted scan of 157 relevant files | Still inspect hosting dashboards and account history because local pattern scanning cannot prove a credential never existed elsewhere. |

## Credential inventory

| Credential | Current local status | Rotation source | Production destination |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Set | OpenAI project settings | Render backend environment only |
| `SERPAPI_KEY` | Set | SerpAPI account | Render backend environment only |
| `DVLA_VEHICLE_API_KEY` | Set | DVLA developer account | Render backend environment only |
| `CHECKCAR_API_KEY` | Set | CheckCar/provider account | Render backend environment only |
| `CHECKCAR_*_URL_TEMPLATE` | Set | Rebuild from provider documentation | Render backend environment only; verify templates do not embed old credentials |
| `EBAY_CLIENT_ID` | Set | eBay developer account | Render backend environment only |
| `EBAY_CLIENT_SECRET` | Set | eBay developer account | Render backend environment only |
| `EBAY_FINDING_APP_ID` | Set | eBay developer account | Render backend environment only if still required |
| `EBAY_APP_TOKEN` | Present in old backups | eBay developer account | Revoke; do not restore unless the backend genuinely requires it |
| `PAID_ACCESS_TOKEN` | Set | Generate locally | Temporary backend-only credential; replace the mobile shared-token design before launch |
| `GROWTH_DASHBOARD_TOKEN` | Set | Generate locally | Render backend environment and authorised admin CLI only |

## Values that are public, not secrets

- `EXPO_PUBLIC_API_BASE`
- `EXPO_PUBLIC_CAR_CHECKS_AVAILABLE`
- App Store product identifiers such as `ValueVision10`
- App bundle identifier and EAS project identifier
- Hosted checkout URL, provided it contains no embedded token

Public values do not need secrecy, but changes still require a new build when compiled into the application.

## Exact rotation order

### 1. Fix the mobile entitlement boundary

- [ ] Stop sending a shared backend token from `app/(tabs)/scan.tsx`.
- [ ] Verify Apple transactions on the backend, not only on the device.
- [ ] Issue a short-lived entitlement or session token after successful server verification.
- [ ] Bind entitlements to the Apple transaction/account and apply replay protection.
- [ ] Keep provider API keys and the backend master token out of EAS `EXPO_PUBLIC_*` variables.
- [ ] Build a fresh TestFlight binary after removing the public-token path.

Do this before rotating `PAID_ACCESS_TOKEN`; otherwise a newly rotated token could immediately be exposed in a new mobile bundle.

### 2. Prepare provider accounts

- [ ] Confirm the owner email and recovery method for OpenAI, SerpAPI, DVLA, CheckCar, eBay, Render, Expo/EAS, and App Store Connect.
- [ ] Enable multi-factor authentication wherever available.
- [ ] Record current spending caps and alert thresholds without copying keys into the record.
- [ ] Create a separate production credential where the provider supports overlapping old and new keys.
- [ ] Use least-privilege scopes and restrict keys by service, endpoint, IP, domain, or application where supported.
- [ ] Do not revoke the old credential until the replacement deployment has passed its checks.

### 3. Rotate server credentials one provider at a time

- [ ] OpenAI: create a production project key, set a low monthly budget and alerts, update Render, redeploy, perform one controlled request, then revoke the old key.
- [ ] SerpAPI: create/reset the key, confirm plan limits, update Render, redeploy, perform one controlled search, then revoke the old key.
- [ ] DVLA: issue a replacement key, update Render, redeploy, test one known registration, then revoke the old key if the provider supports revocation.
- [ ] CheckCar: replace the API key and rebuild every URL template, apply hard daily limits, update Render, redeploy, test the cheapest endpoint first, then test valuation/history only with explicit spend approval.
- [ ] eBay: rotate the client secret and any active application token, update Render, redeploy, confirm OAuth/token creation and one read-only lookup, then revoke the old credentials.
- [ ] Internal tokens: generate new `PAID_ACCESS_TOKEN` and `GROWTH_DASHBOARD_TOKEN`, update Render and authorised local admin configuration, redeploy, then invalidate the previous values.

### 4. Update environments safely

- [ ] Put server credentials in the Render service environment, never in `eas.json` as `EXPO_PUBLIC_*` values.
- [ ] Update `backend/.env` locally without printing the values in terminal logs or screenshots.
- [ ] Keep `backend/.env.example` empty or placeholder-only.
- [ ] Do not paste credentials into source files, documentation, commits, issues, chat, or support messages.
- [ ] Confirm production logs redact request headers, tokens, provider URLs containing credentials, and upstream error bodies.

### 5. Deploy and verify before revocation

- [ ] Run TypeScript, lint, backend syntax, payment-readiness, and production-environment checks.
- [ ] Confirm `/health` responds without calling a paid provider.
- [ ] Confirm unauthorised paid endpoints return `401` or `403`.
- [ ] Confirm an authorised entitlement can access only the purchased feature.
- [ ] Test each provider once with a fixed low spend ceiling and record only success/failure, latency, and provider request ID.
- [ ] Complete one Apple sandbox subscription purchase and one restore on a real TestFlight device.
- [ ] Search the final mobile bundle for old-key fingerprints and secret-like prefixes without printing any matching value.
- [ ] Check Render logs for authentication failures or accidental credential disclosure.

### 6. Revoke and clean up

- [ ] Revoke every superseded provider credential.
- [ ] Revoke the legacy `EBAY_APP_TOKEN` if it is still active.
- [ ] Delete the five `backend/.env.bak.*` files only after confirming the new local and Render configurations work.
- [ ] Remove any old credentials from password-manager notes, shell history, exported environment files, cloud backups, and screenshots.
- [ ] If any secret was ever committed, rotate it even if the file is now ignored or removed; deleting history alone does not make the secret safe.
- [ ] Record rotation date, owner, provider, and next review date without recording the secret value.

## External credentials to check manually

The local scan cannot inspect provider dashboards. Check these separately before launch:

- [ ] Render account token, deploy hooks, and environment access
- [ ] Expo/EAS personal access tokens and organisation members
- [ ] App Store Connect API keys and signing access
- [ ] Apple distribution certificates and provisioning access
- [ ] Domain registrar and DNS account
- [ ] Email account used for provider recovery
- [ ] Hosted checkout and webhook credentials, if checkout is enabled
- [ ] Analytics, crash-reporting, support, and marketing integrations added outside this repository

## Rollback rule

If a replacement key fails, restore the previous Render environment value only while that previous key is still active, redeploy, and investigate. Never place a provider key in the mobile app as a shortcut. Revoke the previous key only after the replacement has passed its controlled smoke test.

## Launch security gate

Launch is blocked until all of these are true:

- [ ] No shared backend credential is compiled into the mobile bundle.
- [ ] Apple purchases are verified server-side and produce scoped entitlements.
- [ ] All provider and internal credentials have been rotated.
- [ ] Old environment backups and superseded credentials have been removed or revoked.
- [ ] Provider budgets, hard limits, and alerts are active.
- [ ] TestFlight purchase, restore, entitlement, and unauthorised-access checks pass.

