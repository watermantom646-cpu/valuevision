# API Key Rotation Runbook (Pre-Launch)

Date: 8 May 2026

Use this when any key has been pasted in chat or shown in screenshots.

## Keys to Rotate
1. OpenAI API key(s)
2. CheckCar / DVLA related API key(s)
3. Any other provider key used by backend

## Steps
1. Create new keys in each provider dashboard.
2. Update backend `.env` values with new keys only.
3. Remove old keys from `.env` and password managers.
4. Revoke old keys in provider dashboards.
5. Restart backend:
- `cd /Users/abbiemaytum/ValueVision/backend`
- `npm run daemon:stop && npm run daemon:start`
6. Verify:
- `cd /Users/abbiemaytum/ValueVision`
- `npm run launch:env-check`
- `npm run launch:quick`
- `npm run launch:status`

## Success Criteria
- `launch:env-check` has zero required failures.
- `launch:quick` passes.
- `launch:status` shows healthy.
