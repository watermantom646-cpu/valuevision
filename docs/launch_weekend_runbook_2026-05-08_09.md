# ValueVision Launch Weekend Runbook

Dates:
- Friday 8 May 2026
- Saturday 9 May 2026

## Objective
Launch publicly with stable pricing, controlled provider spend, and rapid issue response.

## Pre-Launch (Friday Morning)
0. Optional one-command preflight from repo root:
- `cd /Users/abbiemaytum/ValueVision && npm run launch:preflight`
1. `cd backend && npm run cost:full`
2. `cd backend && npm run daemon:stop && npm run daemon:start`
3. `cd backend && npm run launch:gate`
4. Confirm provider usage: `curl -s http://127.0.0.1:5050/provider-usage`

## Launch Window (Friday Afternoon/Evening)
1. Open public access.
2. Monitor every 30 to 60 minutes:
- `curl -s http://127.0.0.1:5050/health`
- `curl -s http://127.0.0.1:5050/launch-readiness`
- `curl -s http://127.0.0.1:5050/provider-usage`
- or summary output from repo root: `npm run launch:status`
  - If `launch:status` prints `recommendation=NO_GO`, pause public launch and fix listed blockers first.
3. Run fast confidence check every 2 to 3 hours:
- `cd backend && npm run launch:gate:quick`
- or from repo root: `npm run launch:quick`

## Saturday Stability Pass
1. Run full gates:
- `cd backend && npm run benchmark:uk-plates`
- `cd backend && npm run benchmark:items-uk`
2. Review error logs and top failed queries.
3. If provider spend is high, temporarily switch to lean test mode for internal QA only:
- `cd backend && npm run cost:lean`
- Return to full before customer usage:
- `cd backend && npm run cost:full`

## Incident Rules
1. If `/health` fails:
- Restart backend immediately.
2. If `/provider-usage` approaches hard limit:
- Keep core status calls on.
- Let enrichment skip automatically at soft limit.
3. If pricing drifts:
- Keep app live.
- Show `needs_details` for low-confidence cases and patch benchmark set.

## Rollback
1. Revert to last stable branch/commit.
2. Restart backend.
3. Verify `launch:gate:quick` is green before reopening traffic.
