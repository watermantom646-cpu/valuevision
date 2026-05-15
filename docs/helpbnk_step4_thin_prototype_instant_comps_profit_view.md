# HelpBnk Step 4 - Thin Prototype for Instant Comps and Profit View
**Date:** February 20, 2026

## Objective
Ship a narrow, testable prototype that returns useful comps and profit insight from real user queries.

## Scope (Thin Slice)
Input:
1. Scan/photo or manual search query

Processing:
1. Pull recent comps from approved data sources
2. Normalize fields
3. Filter low-quality comps
4. Generate estimate + confidence

Output:
1. Low/median/high estimate
2. Fees/shipping/profit range
3. Confidence label (high/medium/low)

## Required Features
1. Connect data sources and fetch sample comps
2. Normalize and filter low-quality matches
3. Show estimate + fees + shipping + profit range
4. Log inputs/outputs for accuracy review

## Data Logging Requirements
Capture:
1. Query or detected item
2. Comps used
3. Output estimate
4. Confidence band
5. User action (accepted/rejected/edit)

## Quality Targets
1. End-to-end response fast enough for practical use
2. No stale results shown between scans
3. Clear fallback message when confidence is low

## 14-Day Execution
1. Build thin prototype flow
2. Run 20+ real test queries across target categories
3. Fix top 3 failure patterns
4. Document baseline accuracy and confidence behavior

## Output / Completion Criteria
1. Working demo using live queries
2. Accuracy review sheet populated from logs
3. Clear list of next improvements before broader rollout
