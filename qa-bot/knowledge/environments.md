# Environments, users & sessions

**The bot only tests UAT.** Never point it at production. If a URL doesn't contain `-uat`, stop and ask.

## Logged-in sessions (reuse, don't log in by hand)
The suite's setup projects log in and save the session. The bot loads these files:

| Session file | User / role | Portals | Refresh command |
|---|---|---|---|
| `auth.nsef.json` | `nsefsupport@demo.com` — NSE Foundation admin/buyer (most flows) | CAPP | `npx playwright test --project=nsef-setup` |
| `auth.json` | `nsesupport@aerchain.io` — NSEIL user | CAPP | `npx playwright test --project=setup` |
| `auth.supplier.json` | Supplier user | CAPP + SAPP | `npx playwright test --project=supplier-setup` |

If a page redirects to `nse-auth-uat…/login`, the session expired: run the refresh
command above, then `playwright-cli state-load <file>` again. The bot never types a password itself.

## Data the bot must NOT touch
The automated suite depends on specific saved records. Acting on them (approve, cancel,
invoice, short-close, amend…) breaks the suite's next run.
- Every `saved*` entry in `pages/NSEFoundationData.json` (savedCxo, savedIntake, savedPurchaseOrder, savedGrn, savedInvoice, …)
- `RESERVED_CODES` in `pages/reservedRecords.js`
- Auction state files `.auction-*-state.json`, `.s*-state.json`

The bot creates its **own** records for manual testing, tags titles with `QA-BOT <yyyy-mm-dd>`,
and logs every code it creates in the run report.

## Other environments
<!-- Add staging/other entity URLs and roles here as you learn them. -->
