# HelpBnk Step 18 - Add Cost and Rate-Limit Guards (Cache, Dedupe, Backoff)
**Date:** February 21, 2026

## Objective
Prevent overspend and provider lockouts during scaling.

## What To Do
1. Implement request caching for repeat lookups where terms allow.
2. Dedupe identical requests within short windows.
3. Add retry with exponential backoff for transient failures.
4. Set strict timeout rules and user-safe fallback responses.
5. Cap per-user and per-plan call volume.

## Monitor Weekly
1. Cost per scan
2. Cost per active user
3. Cache hit rate
4. Timeout rate and rate-limit errors

## Output
1. Guardrail dashboard screenshot
2. Policy doc for limits/caching/retries
3. Confirmation that no unexpected lockouts occurred in tests
