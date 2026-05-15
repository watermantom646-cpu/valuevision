# Expo Go Phone Quickstart (ValueVision)

Date: 8 May 2026

## Start Backend
1. `cd /Users/abbiemaytum/ValueVision/backend`
2. `npm run daemon:start`
3. Confirm health: `curl -s http://127.0.0.1:5050/health`

Quick one-command option from repo root:
- `npm run phone:tunnel`

## Start App for Phone (Best First)
1. `cd /Users/abbiemaytum/ValueVision`
2. `npm run start:tunnel`
3. Scan the QR from Expo output in Expo Go.

Use tunnel first when local Wi-Fi is weak or devices are on different network segments.

## If Tunnel Is Slow, Try LAN
1. `npm run start:lan`
2. Ensure laptop and phone are on same Wi-Fi, no VPN.

## In-App Backend Address (only if needed)
- Open Scan screen -> optional/developer connection input.
- Set: `http://<your-laptop-ip>:5050`
- Example: `http://192.168.0.71:5050`

## Known Failure Fixes
- `Network request failed`:
  - Backend not running, wrong backend IP, VPN on, or isolated Wi-Fi guest network.
- App opens then scan fails:
  - Confirm camera permission and retry with one clear photo.
- Very slow scans:
  - Keep app open for at least 20 to 30 seconds for full vehicle checks.
