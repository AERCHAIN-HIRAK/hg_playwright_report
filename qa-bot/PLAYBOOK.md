# QA Bot Playbook

Shared rules for every `/qa-*` command. Read this before you start testing.

## 1. Load context first
1. `qa-bot/knowledge/product-overview.md`: always.
2. `qa-bot/knowledge/environments.md`: always, before opening a browser.
3. `qa-bot/knowledge/modules/<module>.md` for each module involved. If it's missing, use
   `qa-bot/knowledge/source/customer-flow-document.txt` (grep the section) plus the module's
   `pages/*Actions.js` and spec files. Then tell the user the module hasn't been learned yet
   and suggest `/qa-learn <module>`.
4. `qa-bot/knowledge/learnings.md` and `hotfix-log.md`: grep for the module.

## 2. Drive the app like a manual tester
Use `playwright-cli` (see `.claude/skills/playwright-cli/SKILL.md`). Use one named session per run:
```bash
playwright-cli -s=qabot open https://nse-capp-v4-uat.aerchain.io
playwright-cli -s=qabot state-load auth.nsef.json
playwright-cli -s=qabot goto https://nse-capp-v4-uat.aerchain.io
playwright-cli -s=qabot snapshot          # read the page, get element refs
playwright-cli -s=qabot click e12
playwright-cli -s=qabot screenshot --filename=qa-bot/runs/<run>/step-03.png
playwright-cli -s=qabot console error     # check for JS errors after key steps
playwright-cli -s=qabot network           # check for 4xx/5xx after saves/submits
playwright-cli -s=qabot close
```
- Prefer `snapshot` for reading the page. Take a screenshot at each checkpoint (evidence) and on every failure.
- After every save, submit or approve, check **three things**: what the UI shows, console errors, and any API responses that failed.
- To find a working selector or flow fast, read how the suite does it in `pages/*Actions.js`.
- Multi-role flows (approve as another user, supplier quoting) need another session file
  (`playwright-cli -s=qabot-supplier ... state-load auth.supplier.json`).
- If the session expired, refresh it as `environments.md` describes. Never type a password.

## 3. Safety
- UAT only. Never act on the protected records listed in `environments.md`.
- Name every record you create `QA-BOT <yyyy-mm-dd> <scenario-id>` and write its code in the run report.
- Ask the user before anything that affects shared configuration: Org Settings, User Management,
  workflow config, department access, budget master data. If you must change it, restore it and say you did.
- Don't send real emails to external addresses, and don't hit the payment acknowledgement endpoint
  unless the scenario needs it and the user agreed.

## 4. Judge results honestly
Mark each check with one of:
- **PASS**: you observed the expected result.
- **FAIL**: you observed something different. Record expected vs actual, a screenshot, and the console/network evidence.
- **BLOCKED**: you couldn't reach the step (environment down, missing data, session problem). This is not a pass.
- **UNSURE**: the expected behavior isn't known. Ask the user, then save the answer to `learnings.md`.

Never mark something PASS because it "probably" works. If the expected behavior is ambiguous, ask.

## 5. Write it down
- Run report: `qa-bot/runs/<yyyy-mm-dd>-<slug>/report.md`, with screenshots in the same folder.
  Use `qa-bot/templates/run-report.md`.
- Put new product facts in `knowledge/learnings.md` (and the module file).
- Hotfix runs also add a row to `knowledge/hotfix-log.md`.
- When a scenario is worth automating, end the report with a "Suggested automation" section:
  the target spec file, the actions in `pages/` it can reuse, and a draft test.
