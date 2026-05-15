# HelpBnk Step 16 - Ship the Alpha: Comps Pipeline, Scoring, and Simple UI
**Date:** February 21, 2026

## Objective
Ship a working alpha that takes a scan/query and returns a usable estimate with confidence and flags.

## Build Scope
1. Fetch sold comps from approved data sources.
2. Clean and normalize comp fields.
3. Compute estimate, confidence, and risk flags.
4. Show output in a simple result screen.

## Required User Flow
1. User scans or enters text query.
2. System fetches and scores relevant comps.
3. User sees low/median/high estimate + confidence.
4. User can rescan, adjust query, or continue.

## Implementation Checklist
1. Comps pipeline connected and returning data.
2. Scoring logic running with confidence output.
3. OCR/text input path working for scan use.
4. Results saved for learning and benchmarking.

## Completion Criteria
1. End-to-end scan to estimate flow works.
2. Output is clear and actionable for test users.
3. Error/fallback states are handled cleanly.
