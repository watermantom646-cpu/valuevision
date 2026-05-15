# HelpBnk Alpha Step 2 - Benchmark Accuracy with Held-Out Backtest Set
**Date:** February 21, 2026

## Objective
Measure real estimation quality using a held-out benchmark set before scaling usage.

## Backtest Plan
1. Use representative queries across priority categories
2. Keep a held-out set not used for tuning
3. Compare predicted range vs expected market range

## Metrics
1. In-range hit rate
2. Median absolute percentage error (MAPE)
3. Confidence calibration (high/medium/low vs actual quality)
4. Failure reasons by category

## Review Process
1. Run baseline benchmark
2. Fix top failure patterns
3. Re-run benchmark and compare

## Definition of Done
1. Benchmark report completed
2. Accuracy baseline is documented
3. Clear improvement backlog created from evidence
