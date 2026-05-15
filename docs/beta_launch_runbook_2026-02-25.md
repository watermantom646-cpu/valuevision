# ValueVision Beta Launch Runbook (Feb 25, 2026)

## 1) Start services

```bash
cd /Users/abbiemaytum/ValueVision/backend
npm run daemon:stop
npm run daemon:start
npm run daemon:status
```

Expected:
- `Health check: OK`
- `Backend port 5050: listening`

## 2) Confirm API and readiness

```bash
curl -sS http://127.0.0.1:5050/health
curl -sS http://127.0.0.1:5050/launch-readiness
```

Expected in readiness checks:
- `serpApiConfigured: true`
- `dvlaConfigured: true`
- `betaStrictMode: true`

## 3) Start mobile app for testers (LAN)

```bash
cd /Users/abbiemaytum/ValueVision
npx expo start --lan --clear
```

Set iPhone backend URL in app to:
- `http://192.168.0.67:5050`

## 4) Beta tester instructions

Ask each tester to do:
1. Run 3 car scans and 2 item scans.
2. Save screenshot of any scan marked `needs details`.
3. Report if app freezes, times out, or shows wrong category.

## 5) Beta launch safety rules (enabled)

- Vehicle scans are in strict mode.
- Low-trust vehicle outputs are forced to `needs_details`.
- Scanner should never show hard crash errors to user.

## 6) Go / No-Go checks

Go if all true:
- Backend health OK
- Launch readiness >= 4/5 checks
- At least 5 successful local scans today
- No hard crash in last 20 scans

No-Go triggers:
- Backend health FAIL
- Repeated `Network request failed` across multiple testers
- Scanner returns HTML error page or JSON parse errors

## 7) During beta (today)

Every 2-3 hours:
```bash
cd /Users/abbiemaytum/ValueVision/backend
npm run daemon:status
```

If degraded:
```bash
npm run daemon:stop
npm run daemon:start
npm run daemon:status
```


## 8) One-command smoke check

```bash
/Users/abbiemaytum/ValueVision/scripts/beta-launch-smoke.sh
```
