# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install
npx playwright install

# Run all tests (auth setup + test suite)
npm test

# Run tests and send Slack notification on completion
npm run test:slack

# Full workflow: clean artifacts, run tests, copy report to docs/, commit, push, notify
npm run test:full

# Run a single test file
npx playwright test tests/testSuiteNSE.spec.js

# Run only the auth setup
npx playwright test tests/auth.setup.js

# Run tests in headed mode (already default per config)
npx playwright test --headed

# Run tests with UI mode
npx playwright test --ui

# Show last HTML report
npx playwright show-report
```

## Architecture

### Project Layout

```
tests/          # Spec files and auth setup
pages/          # Page Object Model: locators, actions, test data
utils/          # Report delivery (email + Slack)
docs/           # Published HTML report (committed to git, served via GitHub Pages)
playwright-report/  # Generated HTML report (gitignored)
test-results/       # Generated JSON results (gitignored)
auth.json           # Saved browser session state (reused by test projects)
```

### Test Execution Flow

Playwright is configured with two projects in `playwright.config.js`:

1. **`setup`** — Runs `auth.setup.js` first. Logs into `https://nse-capp-v4-uat.aerchain.io`, then saves session cookies/localStorage to `auth.json`.
2. **`tests`** — Runs `*.spec.js` files with `storageState: 'auth.json'`, so tests start pre-authenticated. `tests` depends on `setup`.

### Page Object Model

- **`pages/allLocators.js`** — All DOM locators (XPath + CSS selectors). Locators are exported as a plain object and imported into `actions.js`.
- **`pages/actions.js`** — `intakeCreateActions` class wraps the page and exposes one method per UI action (click, fill, select, assert). Methods import locators from `allLocators.js`.
- **`pages/IntakeCreateData.json`** — All test input values (titles, dropdowns, quantities, prices). Tests import this and pass values into action methods rather than hardcoding them.

### Reporting Pipeline

After tests complete, `utils/sendReports.js` reads `test-results/results.json`, parses pass/fail counts and failed test names, then:
- Sends an HTML report via Gmail (Nodemailer)
- Posts a formatted summary to a Slack channel via webhook (Axios)
- Links to the GitHub Pages report at `https://aerchain-hirak.github.io/hg_playwright_report/`

The `test:full` script automates the full cycle: delete old artifacts → run tests → copy report into `docs/` → `git commit && git push` → send notifications.

### Environment

- **Target app:** `https://nse-capp-v4-uat.aerchain.io` (UAT environment)
- **`.env`** file holds `SLACK_WEBHOOK` (gitignored). Required for `sendReports.js`.
- Tests run headed (`headless: false`) by default. Screenshots and videos are captured only on failure.
