# HelpBnk Step 2 - Data Connections, Limits, and Compliance Plan
**Date:** February 21, 2026

## Objective
Define the exact data stack for launch, with limits and compliance guardrails so the product is reliable and legally safe.

## Core Data Connections (Launch)
1. eBay API for sold/comps pricing signals across core resale categories
2. Google Cloud Vision OCR for scan text extraction
3. UK vehicle data providers for MOT/tax/history checks (DVLA + approved third-party source)

## API Limits and Technical Guardrails
1. Set request-per-minute caps per provider
2. Add retry/backoff for temporary failures
3. Add timeout ceilings and graceful fallback messaging
4. Use caching where permitted to reduce call volume/cost
5. Monitor spikes in usage, error rate, and cost per source

## Compliance Plan
1. Use only approved provider APIs and licensed feeds
2. Follow each provider's display/storage restrictions
3. Minimise personal data capture and retain only what is required
4. Publish Privacy Policy and Terms aligned with actual data usage
5. Keep an internal source register (provider, allowed use, limits, renewal date)

## Risk Controls
1. Licensing risk: review usage terms before public launch
2. Cost risk: cap free usage and tier calls by plan
3. Downtime risk: failover messaging and health checks
4. Accuracy risk: confidence labels + clear low-confidence warnings

## 30-Day Actions
1. Finalize provider matrix (access, limits, costs, legal)
2. Implement usage dashboards and alert thresholds
3. Validate fallback behavior across top user flows
4. Produce launch-readiness signoff for data/compliance

## Completion Criteria
1. Data stack is stable under pilot traffic
2. Limits and costs are understood and monitored
3. Compliance obligations are documented and operational
