# HelpBnk Step 17 - Benchmark Accuracy with a Held-Out Backtest Set
**Date:** February 21, 2026

## Objective
Prove pricing quality before wider rollout using a blind held-out benchmark.

## What To Do
1. Build a benchmark list of at least 50 items across target categories.
2. Keep this set separate from tuning data.
3. Run predictions without seeing expected sale outcomes first.
4. Compare predicted ranges vs expected ranges and actual sold signals.

## Metrics
1. Hit rate: estimate range contains expected price (%)
2. MAPE by category
3. Confidence calibration (high confidence should outperform low)
4. Miss reasons: wrong comps, bad match, stale data, OCR issue

## Output
1. One-page benchmark report
2. Error band by category
3. Top 5 fixes prioritized by impact
