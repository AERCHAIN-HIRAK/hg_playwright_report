# Test Report — Intake Listing & CXO Test

**Date:** 2026-06-23
**App:** https://nse-capp-v4-uat.aerchain.io (UAT)
**Run mode:** sequential (`--workers=1 --trace on`)
**Source:** reconstructed from per-test artifacts in `test-results/` (the run was stopped during the later `NSEFhappyPATHS` suite, so Playwright's aggregate `results.json` / HTML report were not finalized — but both suites below ran to completion).

## Summary

| Suite | Total | Passed | Failed | Pass % |
|-------|------:|-------:|-------:|-------:|
| testSuiteIntakeListing | 70 | 65 | 5 | 92.9% |
| testSuiteNsefCXOtest   | 52 | 52 | 0 | 100% |
| **Combined**           | **122** | **117** | **5** | **95.9%** |

## CXO Test suite — ✅ all 52 passed

CXO create-validation (Positive / Negative / Edge) and CXO listing (Smoke / Tabs / Sort / Search / Filter / Pagination / Navigation / Create) — no failures.

## Intake Listing suite — 5 failures

All five are **timeouts waiting for the table/navigation**, not assertion mismatches — i.e. the listing table did not finish (re)loading within the timeout.

| # | Test | Tag | Error |
|---|------|-----|-------|
| 1 | sort Code column — second click still shows records | @Sort | `page.waitForFunction` timeout 30000ms — `waitForTableLoad` (utils/tableUtils.js:102) |
| 2 | sort Subject column — second click still shows records | @Sort | `page.waitForFunction` timeout 30000ms — `waitForTableLoad` |
| 3 | table shows correct rows on page 2 after sort | @Pagination | `page.waitForFunction` timeout 30000ms — `waitForTableLoad` |
| 4 | Next button is disabled on last page | @Pagination | `page.waitForFunction` timeout 30000ms — `waitForTableLoad` |
| 5 | browser back from create page returns to listing | @Create | `page.waitForURL` timeout 15000ms — navigation after browser-back |

### Observations
- Failures 1–4 share the same root cause: `waitForTableLoad` (utils/tableUtils.js:102) times out after a **sort + a follow-up action** (second sort click / page-2 fetch / last-page check). The table likely stays in a loading/spinner state or the network call is slow on UAT, so the "table settled" condition never becomes true within 30s.
- Failure 5 is a navigation timeout — after browser-back from the create page, the URL doesn't return to the listing route within 15s.
- These look like flaky/timing failures against the UAT environment rather than functional regressions; worth re-running to confirm and/or hardening `waitForTableLoad`.

## Artifacts
Per-test `trace.zip`, `video.webm`, `test-failed-1.png`, and `error-context.md` for each failed test are under `test-results/testSuiteIntakeListing-Aer-*`. Open a trace with:

```bash
npx playwright show-trace test-results/<failed-test-dir>/trace.zip
```
