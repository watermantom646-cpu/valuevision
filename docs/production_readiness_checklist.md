# ValueVision Production Readiness Checklist

Target window: Friday 8 May 2026 to Saturday 9 May 2026

## Launch Gate Commands
- [ ] Backend running: `cd backend && npm run daemon:status`
- [ ] Quick gate passes: `cd backend && npm run launch:gate:quick`
- [ ] Full gate passes (includes car + item benchmarks): `cd backend && npm run launch:gate`
- [ ] Live status summary is healthy: `cd /Users/abbiemaytum/ValueVision && npm run launch:status`
- [ ] Expo phone demo starts with paid-check header wired: `cd /Users/abbiemaytum/ValueVision && npm run phone:lan:paid`

## Runtime and API Health
- [ ] `GET /health` returns `200` and `{ ok: true }`
- [ ] `GET /launch-readiness` shows green checks and acceptable score
- [ ] `GET /provider-usage` returns daily usage and limits
- [ ] Backend restart is clean (`daemon:stop` then `daemon:start`)

## Cost and Provider Safety
- [ ] Cost mode intentionally set for launch: `cd backend && npm run cost:full`
- [ ] Daily provider limits configured in env (`CHECKCAR_DAILY_SOFT_LIMIT`, `CHECKCAR_DAILY_HARD_LIMIT`)
- [ ] Enrichment skip on soft limit enabled (`CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT=1`)
- [ ] Hard stop on hard limit enabled (`CHECKCAR_ENFORCE_HARD_LIMIT=1`)
- [ ] Paid vehicle data guard enabled (`ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA=1`)
- [ ] Paid access mode set for production (`PAID_ACCESS_MODE=token` or `locked`)
- [ ] If `PAID_ACCESS_MODE=token`, token configured (`PAID_ACCESS_TOKEN`) and managed in secret storage
- [ ] Usage file path is valid (`CHECKCAR_USAGE_FILE`)

## Security and Config
- [ ] `npm run launch:env-check` passes required checks
- [ ] If needed, set prod env quickly: `npm run launch:set-prod -- 'https://<prod-origin-1>,https://<prod-origin-2>'`
- [ ] `ALLOWED_ORIGINS` set to production origins only
- [ ] `NODE_ENV=production` set
- [ ] Secrets are not committed and are managed in deployment secret manager
- [ ] Rotate any exposed keys before public launch

## Product Functionality
- [ ] UK vehicle scan -> plate -> MOT/tax/history -> pricing works end-to-end
- [ ] Random item scan returns usable valuation and confidence messaging
- [ ] Low-trust valuations ask for better image/details instead of false precision
- [ ] Voice path responds and can trigger scan flow reliably

## Operations for Launch Weekend
- [ ] Assign on-call owner for Friday/Saturday launch window
- [ ] Prepare rollback command list
- [ ] Define triage rhythm (every 30 to 60 min during launch day)
- [ ] Record top 5 known issues and mitigation notes
