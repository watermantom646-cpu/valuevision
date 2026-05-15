# Go-Live Checklist (Tonight / Tomorrow)

Date: 8 May 2026

## Current State
- Code and benchmarks are green.
- Launch gate passes.
- Remaining blockers are production environment settings.

## Must-Do Before Public Launch
1. Set production env in backend `.env`:
- `NODE_ENV=production`
- `ALLOWED_ORIGINS=https://<your-production-domain>,https://<your-second-domain-if-any>`
- quick command: `npm run launch:set-prod -- 'https://<your-production-domain>,https://<your-second-domain-if-any>'`

2. Rotate exposed API keys:
- OpenAI key
- Service account key
- Any other key that was pasted in chat or screenshots
- runbook: `/Users/abbiemaytum/ValueVision/docs/key_rotation_runbook_2026-05-08.md`

3. Restart backend:
- `cd /Users/abbiemaytum/ValueVision/backend`
- `npm run daemon:stop && npm run daemon:start`

4. Run checks:
- `cd /Users/abbiemaytum/ValueVision`
- strict one-command decision: `npm run launch:go-no-go`
- `npm run launch:env-check`
- `npm run launch:preflight`
- `npm run launch:status`

5. Phone smoke test:
- `npm run phone:tunnel`
- Scan one car and one item end-to-end in Expo Go

## Go/No-Go Rule
- GO only if:
  - `launch:env-check` passes all required checks
  - `launch:preflight` passes
  - phone smoke test returns usable prices
