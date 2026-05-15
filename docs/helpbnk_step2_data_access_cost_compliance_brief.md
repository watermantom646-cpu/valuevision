# ValueVision - Data Access, Cost, and Compliance Brief
**Date:** February 20, 2026

## Objective
Confirm data access for core integrations, estimate per-scan costs, and verify usage/licensing compliance for launch.

## Core Data Sources (Phase 1)
1. eBay API (market comps/pricing signals across categories)
2. Google Cloud Vision OCR (image text extraction)
3. UK vehicle status/history providers (DVLA + CheckCarDetails)

## Access Status
1. eBay developer access: active/in progress (confirm production scope + rate limits)
2. Vision OCR access: active
3. Vehicle status providers: active for UK checks

## Compliance & Allowed Use (Summary)
1. Use official APIs and follow provider terms
2. Do not expose restricted raw data outside allowed display terms
3. Store only required user data and follow privacy policy + consent
4. Maintain audit trail for source usage and request volumes

## Cost Model (Launch Assumption)
**Goal:** Keep data cost per active paying user within target ARPU.

Assumptions:
1. Plans tested: Free, Pro GBP 7, Pro+ GBP 12
2. Average scans per paying user/month: 30-60
3. API cost threshold target: <= 30-40% of paid revenue per user

## Unit Economics Check
For each provider track:
1. Cost per call
2. Calls per scan
3. Estimated cost per scan
4. Estimated cost per paying user/month

Decision rule:
If projected data cost > 40% of paid ARPU, reduce calls, add caching, or adjust limits/pricing.

## Risks and Mitigations
1. API rate limits -> queueing, retries, graceful fallbacks
2. Licensing constraints -> display policy review and legal check before scale
3. Cost spikes -> per-user limits, caching, confidence-tiered lookups
4. Data latency -> show checked-at timestamps and confidence labels

## 14-Day Actions
1. Finalize provider terms summary sheet
2. Log real call volume from pilot users
3. Produce first per-scan and per-user cost report
4. Confirm launch guardrails for usage and compliance

## Output / Completion Criteria
1. One-page provider matrix (access, limits, cost, compliance)
2. Per-scan and per-user cost estimate validated on pilot traffic
3. Clear go/no-go thresholds defined for sustainable launch economics
