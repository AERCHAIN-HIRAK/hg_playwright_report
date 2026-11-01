# <Run title>

| | |
|---|---|
| Date | YYYY-MM-DD |
| Command | /qa-hotfix · /qa-explore · /qa-gaps … |
| Ticket | <Linear ID / link, or "pasted"> |
| Environment | UAT — <portal(s)> |
| Session(s) | auth.nsef.json … |
| Verdict | ✅ PASS · ❌ FAIL · ⚠️ BLOCKED/UNSURE items |

## What changed / what was tested
<one paragraph>

## Impact analysis
- Directly affected: …
- Neighbouring flows at risk: …
- Out of scope (and why): …

## Results
| # | Scenario | Type | Result | Evidence |
|---|---|---|---|---|
| 1 | … | Fix verification / Regression / Edge | PASS | step-03.png |

## Failures & observations
### <#> <title>
- Steps to reproduce: …
- Expected: …
- Actual: …
- Evidence: screenshot, console, network

## Records created
| Code | Type | Final state |
|---|---|---|

## Questions for the QA owner
- …

## Suggested automation
- Spec: `tests/testSuite….spec.js` · Reuse: `pages/…Actions.js#method`
