# ValueVision Go-Live Plan (10 Days)

Date: 2026-05-03
Target Go-Live Date: 2026-05-13

## Goal
Ship a stable production backend and a reachable customer-facing app flow with analytics, alerting, and a controlled beta rollout.

## Day-by-Day

1. Day 1 (2026-05-03): Stabilize runtime
- Lock backend startup and health checks (`/health`, `/launch-readiness`).
- Set production env vars from `backend/.env.example`.
- Confirm local smoke test: backend + web app both reachable.

2. Day 2 (2026-05-04): Deploy backend to production host
- Choose host (Render, Railway, Fly.io, or VPS).
- Deploy backend Docker image.
- Validate HTTPS endpoint and `/health` from external internet.

3. Day 3 (2026-05-05): Domain + CORS + secrets hygiene
- Set production domain for API.
- Configure `ALLOWED_ORIGINS`.
- Rotate and store API keys in host secrets manager.

4. Day 4 (2026-05-06): Frontend production build path
- Decide release surface: mobile-first (Expo build) vs web landing + app entry.
- Wire frontend to production API base URL.
- Verify scan/analyze and valuation critical flows.

5. Day 5 (2026-05-07): Observability + incident readiness
- Add uptime monitor on `/health`.
- Add error log review routine (2 times/day).
- Create rollback checklist.

6. Day 6 (2026-05-08): Performance + rate-limit guardrails
- Load test key endpoints (`/analyze`, `/uk-vehicle-status`, `/marketplace/*`).
- Tune rate limits and timeouts.
- Confirm memory/CPU headroom.

7. Day 7 (2026-05-09): Beta QA cycle
- Run end-to-end tests with 5 to 10 representative user scenarios.
- Log and fix blocker bugs only.
- Freeze non-critical features.

8. Day 8 (2026-05-10): Soft launch
- Invite small beta group.
- Monitor conversion, errors, response latency.
- Patch only high-severity issues.

9. Day 9 (2026-05-11): Launch prep
- Final legal/policy links check.
- Confirm support and escalation workflow.
- Confirm billing/paywall behavior if enabled.

10. Day 10 (2026-05-12): Public go-live execution
- Roll out to wider audience.
- Monitor live metrics every 2 to 4 hours.
- Publish known issues and first patch window.

## Daily KPIs (Track Every Day)
- API uptime (%)
- p95 latency for `/analyze`
- error rate (% 5xx)
- successful analyze completions/day
- beta user retention (D1)

## Release Gate (Must Be Green)
- `/health` and `/launch-readiness` pass
- all required env vars set
- CORS locked to known origins
- secrets not committed in git
- fallback plan tested
