# HelpBnk Step 4 - Simple Money Model (Revenue, Data Costs, Margin)
**Date:** February 21, 2026

## Objective
Build a simple unit-economics model to ensure pricing can support data usage and sustainable margins.

## Revenue Assumptions
1. Free plan for acquisition
2. Pro plan at GBP 7/month
3. Pro+ plan at GBP 12/month

## Cost Inputs
Track:
1. API/data cost per call
2. Calls per scan
3. Average scans per active user per month
4. Infrastructure cost per active user

## Unit Economics Template
For each paid tier:
1. Monthly revenue per user
2. Variable data/API costs per user
3. Infra/service costs per user
4. Gross margin per user

## Target Economics
1. Data/API costs should remain within a controlled % of monthly paid revenue
2. Free usage must be capped to avoid loss-making behavior
3. Paid plans should improve margin with higher usage efficiency

## Monitoring Plan
1. Weekly cost-per-user report
2. Weekly margin check by plan
3. Alert on sudden API spend spikes

## Decision Rules
1. If margin is too low -> reduce included scans or improve caching
2. If usage exceeds assumptions -> optimize calls before scaling acquisition
3. If conversion is strong -> test next pricing step carefully

## Completion Criteria
1. One-page money model with clear assumptions
2. Break-even path visible for first paid cohorts
3. Documented pricing/cost guardrails for launch
