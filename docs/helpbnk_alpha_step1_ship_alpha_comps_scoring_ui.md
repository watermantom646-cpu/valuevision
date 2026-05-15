# HelpBnk Alpha Step 1 - Ship Alpha (Comps Pipeline, Scoring, Simple UI)
**Date:** February 21, 2026

## Objective
Ship an end-to-end alpha where a user can scan/search an item and receive a usable estimate with confidence.

## Scope
1. Input: image scan or text query
2. Comps pipeline: fetch, normalize, score, filter
3. Output: low/median/high estimate + confidence label + key flags
4. Simple UI: clear result card, rescan path, manual correction path

## Required Alpha Features
1. Basic scan via text or image OCR
2. Confidence scoring and quality gate
3. Result history capture for later review
4. Error fallback with user guidance

## Definition of Done
1. User can complete scan -> result flow without blockers
2. Results are readable and actionable
3. Logs capture inputs, outputs, confidence, and errors
