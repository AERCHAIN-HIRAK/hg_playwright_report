# NSE — Pending Automation Scenarios: Build Progress

Tracks the 160 scenarios in `NSE - Pending Automation Scenarios - Sheet1.csv`
against what is actually committed and passing. Full suite mapping lives in
`AUTOMATION_PLAN.md`.

Status key: **DONE** = written + run green · **BUILT** = written, run pending ·
**TODO** = not started · **BLOCKED** = needs access/config we do not have

---

## Batch 1 — v3 Module Listings  → `tests/testSuiteModuleListings.spec.js`

New page objects: `pages/v3ListingLocators.js`, `pages/v3ListingActions.js`,
`pages/V3ListingData.json`

| # | Scenario | Status |
|---|---|---|
| 109 | Requisition listing (load, tabs, search, sort, filter, pagination, navigation) | **DONE** — 35/35 passing |
| 110 | Purchase Order listing | **DONE** |
| 111 | Invoice listing | **DONE** |
| 112 | GRN listing | **DONE** |
| 88 | MSME filter on Invoice listing | **TODO** — no MSME column exposed by default on the Invoice listing; needs the column enabled or a different entry point |

**134/134 passing** (Requisition 35, then PO + GRN + Invoice 99 — 11.8m). Zero failures, zero skips.

### Key finding
The v3 modules (Requisition / PO / GRN / Invoice) live on
`nse-capp-uat.aerchain.io` and are **MUI**, while the already-automated v4
modules (Intake / CXO / RFX) are on `nse-capp-v4-uat.aerchain.io` and are
**shadcn/radix**. The two need separate locator sets:

| | v4 (existing) | v3 (new) |
|---|---|---|
| Tabs | `button[data-slot="tabs-trigger"]` | `.MuiChip-root.view-type`, active = inline `background-color: rgb(51,136,235)` |
| Filter popup | radix portal `[data-radix-popper-content-wrapper]` | rendered **inline inside the `<th>`**; options are `.options-style > div` toggling `not-checked` ⇄ `checked-style` |
| Pagination | `Showing X – Y of Z entries` + Prev/Next | `.pagination-selection` / `.total-number`, arrows enabled via `.arrow-button` vs `.arrow-button-disabled` |
| Sort / filter | `<button>` in `<th>` | `img[alt="sort"]` / `img[alt="filter"]` in `<th>` |

---

## Batch 2 — Cross-module Documents + Reassign → `tests/testSuiteCrossModuleDocs.spec.js`

New page objects: `pages/v3DetailLocators.js`, `pages/v3DetailActions.js`

| # | Scenario | Status |
|---|---|---|
| 41 | Regenerate + download document — Requisition | **DONE** |
| 43 | Regenerate + download document — Purchase Order | **DONE** (regenerate); download SKIPS — PO menu has no download action |
| 44 | Regenerate + download document — GRN | **SKIPPED** — confirmed: the GRN "More" menu exposes *Reassign User* only |
| 45 | Regenerate + download document — Invoice | **DONE** |
| 46 | Reassign user — Requisition | **DONE** |
| 48 | Reassign user — Purchase Order | **DONE** |
| 49 | Reassign user — GRN | **DONE** |
| 50 | Reassign user — Invoice | **DONE** |
| 42 | Regenerate + download document — PRC | **TODO** — PRC has no listing; reachable only via a Requisition's conversion view |
| 47 | Reassign user — PRC | **TODO** — same |

### Key findings
- **Regenerate Document shows no toast.** It only fires
  `POST …/regenerate-document`. Asserting on a toast would produce a permanently
  flaky test, so the assertion targets that response instead.
- **The "More" menu differs per module** — verified live:
  - Requisition: Clone · Reassign User · Reassign Purchaser · Download · Regenerate Document
  - Purchase Order: Clone · Reassign User · Regenerate Document
  - GRN: Reassign User only
  - Invoice: Reassign Workflow Approver · Reassign User · Recall · Download Document · Regenerate Document
- **Download label differs**: "Download" (Requisition/PO) vs "Download Document" (Invoice).
- **Reassign User legitimately reports "No users are available"** on Completed
  transactions, so the tests seek an in-flight record first and treat the empty
  state as a documented outcome rather than a pass-by-accident.

---

### Framework fixes made while building these
- **`navigationTimeout: 15000` in `playwright.config.js` is too tight for the v3
  listings.** Every Purchase Order test failed at ~15-16s on `page.goto` alone
  (the PO listing carries charts + 20 rows + ~30 columns). The v3 page objects
  now pass an explicit `timeout: 60000` on their own navigations rather than
  loosening the global for the whole repo.
- **A hidden `li[role="menuitem"]` is permanently mounted on the PO detail page**
  (a second, non-visible MUI menu). An unscoped `li[role=menuitem]` therefore
  matched an invisible node, and `innerText` on it returns `''`. All menu reads
  are now scoped with `.locator('visible=true')`.
- **`test.setTimeout()` called in a `describe` body did not raise the per-test
  budget** — a failing test still reported "Test timeout of 30000ms exceeded"
  despite `test.setTimeout(150000)`. New suites use
  `test.describe.configure({ timeout })`. Existing suites
  (`testSuiteIntakeListing`, `testSuiteIntakeNegative`, …) still use the
  `test.setTimeout()` form and may silently be running on the 30s default —
  worth a separate check.

## Requisition detail → `tests/testSuiteRequisition.spec.js`

| # | Scenario | Status |
|---|---|---|
| 52 | Award link opens the RFX award page | **DONE** — opens `/rfx/{id}/awards/{id}` in a new tab |
| 55 | CXO link opens the CXO | **DONE** |
| 53 | Intake link opens the Intake | **SKIPS** — an award-sourced PR exposes Awards/CXO only; needs an intake-sourced PR |
| 54 | Budget link opens the Budget | **SKIPS** — no Budget link on the sample PR |
| 56 | Search a line item in the line-item section | **TODO** — no search box renders on a single-line-item PR; needs a multi-line PR or the edit page |
| 59 | Item name click opens the item details panel | **BLOCKED-ish** — the Product cell IS an anchor but clicking it opens nothing (no dialog, drawer or navigation). Either the wrong entry point or an app defect |
| 60 | Back button returns to the PR listing | **DONE** — back is an icon-only `<p>` wrapping an `arrowLeft` svg, no accessible name |

Result: **5 passed, 3 skipped** (skips are the documented data-shape gaps above).

### Key findings
- Related-transaction links on the PR are **blue `<div>`s with `cursor:pointer`,
  not anchors** — `getByRole('link')` will never find them — and they open in a
  **new tab**.
- **The PR detail page contains zero `<table>` elements.** Line Items is
  **ag-Grid**, and ag-Grid renders every logical row once per column container
  (pinned-left / center / pinned-right), so a global `.ag-row` count is 3x the
  real row count. Count via `.ag-center-cols-container div.ag-row`; the Product
  column is pinned, so its link lives under `.ag-pinned-left-cols-container`.

## Intake — Transactions + action availability → `tests/testSuiteIntakeNegative.spec.js`

| # | Scenario | Status |
|---|---|---|
| 5 | Cancel disabled once the Intake is Processed | **DONE** |
| 9 | Transactions created from an Intake appear in its Transactions tab | **DONE** |
| 120 | Process button hidden after the Intake is fully processed | **DONE** |
| — | Baseline: a Released intake DOES offer Process + Cancel | **DONE** |

Result: **5 passed**.

### Key finding
Scenario 5's wording says "disabled", but on a Processed intake the Cancel
action is **removed from the More menu entirely** — unlike the CXO, where Cancel
stays visible with `aria-disabled="true"`. The tests assert the outcome (not
cancellable) and cover both mechanisms, and a companion baseline test proves a
Released intake really does offer Process + Cancel — otherwise "absent" would
pass even if the menu failed to render at all.

## Activity timeline → `tests/testSuiteActivityTimeline.spec.js`

| # | Scenario | Status |
|---|---|---|
| 38 | Download activities + comments — CXO | **DONE** |
| 39 | Download activities + comments — Intake | **DONE** |
| 40 | Download activities + comments — RFX | **DONE** |

Result: **13 passed**, plus 3 new known-bug tests that fail by design (below).

### Key findings
- The Activity Log is the same radix `[role=dialog]` sheet on all three v4
  modules, opened by an icon-only clock button.
- The download control is a **dropdown trigger**, not a direct download —
  clicking it only opens a two-item menu (*Download Activities* /
  *Download Comments*).
- The export is built **client-side** (Blob → `<a download>`) and fires **no
  network request**, so it can only be asserted via Playwright's `download`
  event. The response-watching approach used for v3 Regenerate Document would
  hang here.

### 🐞 BUG FOUND — Comments export filename
"Download Comments" names its file
`ActivityTimeline_undefined_<timestamp>.xlsx` on **CXO, Intake and RFX**, where
"Download Activities" correctly produces
`ActivityTimeline_Transaction Events_<timestamp>.xlsx`.
File contents are fine — only the export-type segment of the filename resolves
to the literal string `undefined`.

Tracked by `@KnownBug` tests (one per module) that assert the corrected filename
and **fail until the defect is fixed**, same convention as the CXO amend
audit-log bug.

## RFX Analysis tab → `tests/testSuiteRFXAnalysis.spec.js`

| # | Scenario | Status |
|---|---|---|
| 23 | Prices shown in base currency after toggling | **DONE** (toggle + single-currency) — conversion itself NOT exercised, see below |
| 25 | Deleted line items via "Show deleted items" toggle | **DONE** |
| 26 | Supplier / view configuration shows configured data | **DONE** (view types + config controls) |
| 27 | All files downloadable from the Analysis tab | **DONE** — Analysis / Versions / Questionnaire download; Benchmarks is data-dependent (below) |
| 30 | Quote versions can be compared | **DONE** (Compare panel: Supplier / Version(s) / Field, max 2 versions) |
| 35 | Evaluations can be evaluated | **PARTIAL** — Add Evaluation asserted; running an evaluation needs a pre-award RFX |
| 36 | Deadline extendable after foreclose | **PARTIAL** — Extend Deadline asserted as available |
| 24 | Award justification long text hover | **TODO** |
| 28+29 | Prices sync in the Analysis tab | **TODO** |
| 31 | Parent intake reachable from Analysis | **TODO** — no intake link on the sample RFX |
| 32 | Auction reachable from Analysis | **TODO** — sample RFX has no auction |
| 33 | Negotiations | **TODO** — none on the sample RFX |
| 34 | Bulk supplier reminders | **TODO** — sample RFX is already Awarded |
| 37 | Buyer comments for other users | **TODO** |

### Coverage limit worth knowing (scenario 23)
The sample RFX is quoted in **INR, which is also the base currency**, so toggling
"Show in base currency" cannot change any figure. The tests assert the toggle
works and that amounts stay in a single currency; they deliberately do NOT assert
"values changed", which would be wrong here rather than stricter. **Proving the
conversion needs an RFX quoted in a foreign currency.**

### "Download Benchmarks" is data-dependent — NOT a bug
Clicking it fires
`POST /api/capp/v4/quote-requests/{id}/benchmarks/excel-download`, which returns

```
HTTP 400  {"success":0,"reason":"No benchmark fields configured for download"}
```

on an RFX with no benchmark fields — **and the app shows that exact text in a
toast**. Correct behaviour.

(An earlier note here claimed this failed silently. That was wrong: the manual
check used the wrong toast selector. Verified with a probe — the toast is present
within 500ms and persists for several seconds.)

The test therefore accepts either a real file or a clear message, and fails only
if the click does nothing at all.

### Scenario 35 — clarified, NOT a defect
An earlier note here called the Evaluations tab's empty state a bug because it
says *"Click on Create Evaluation button show here"* while rendering no such
button. **That was wrong.** Per QA (2026-08-31), an Evaluation must be **added
during the Intake → RFX conversion**; it then becomes visible in the Evaluations
tab **after the RFX is quoted**. The sample RFX had none added, so the empty
state is correct.

Full coverage of 35 needs: Intake → convert to RFX with an Evaluation → quote →
evaluate. That belongs with the procure-to-pay chain.

### Scenario 59 — resolved, NOT a defect
Also previously mis-called. The item details panel **does** open — it needs
**two clicks with roughly a second between them** (confirmed by QA and by
measurement: after one click the drawer paper sits off-screen at x=1800,
width=1, visibility:hidden; after the second it slides to x=1210, width=590,
visible). Two things had masked it:
- a hand-rolled visibility check using `offsetParent`, which is null for a
  position:fixed drawer, and
- a second, permanently-closed `MuiDrawer-paper` parked off-screen that a naive
  selector latches onto.

The test now performs the two-click gesture and matches the open drawer by its
`makeStyles` class. Passing.

## Remaining batches (not yet started)

| Batch | Scenarios | Target |
|---|---|---|
| CXO extensions | 2, 3, 4, 8, 107, 108, 154 | `testSuiteNsefCXOtest.spec.js` |
| Intake extensions | 5, 6, 9, 10, 20, 21, 86, 87, 120 | `testSuiteIntakeNegative.spec.js` |
| RFX / Sourcing | 7, 11, 23–37, 98 | `testSuiteRFXtests.spec.js` |
| Auction | 99, 100 | new `testSuiteAuction.spec.js` |
| Requisition detail | 19+57+58, 51, 52–55, 56, 59, 60, 150 | new `testSuiteRequisition.spec.js` |
| Purchase Order | 12, 62–69, 75, 76, 122 | new `testSuitePurchaseOrder.spec.js` |
| PRC + recovery | 151, 152+158+160 | new `testSuitePrcRecovery.spec.js` |
| GRN | 70+127, 71, 72, 130 | new `testSuiteGRN.spec.js` |
| Invoice — Disputed | 13, 73, 74 | `testSuiteInvoiceDisputed.spec.js` (empty stub today) |
| Invoice — workflow | 61, 135+155, 136, 137, 157+159 | new `testSuiteInvoiceWorkflow.spec.js` |
| Invoice — validation | 85, 115, 116, 128, 129, 131+148+149, 132, 133, 134, 153, 156 | new `testSuiteInvoiceValidation.spec.js` |
| Invoice — vendor/RPT | 77–84 | new `testSuiteInvoiceVendorRpt.spec.js` |
| Cross-module (rest) | 14–18, 38–40, 95, 105, 113, 119, 138+139 | new `testSuiteCrossModule.spec.js` |
| Supplier onboarding | 101–104, 140–147 | new `testSuiteSupplierOnboarding.spec.js` |
| Dashboard / reports | 22, 89, 92, 93, 117 | new `testSuiteDashboardReports.spec.js` |
| E2E extensions | 1, 90, 91, 106, 118 | happyPATHS / SupplierPortal / PO suites |

## Blocked — need access or config
| # | Scenario | Blocker |
|---|---|---|
| 94 | MSME validity email content | no mailbox automation |
| 96 | CXO from email — desktop | no mailbox automation |
| 97 | CXO from email — mobile | no mailbox + no mobile viewport strategy |
| 114 | Emailed report logged + downloadable | mailbox needed for the send half |
| 121 | No duplicate invoice rows **in DB** | needs DB access or an API/report proxy |
| 123–126 | Approver-configuration scenarios | admin rights to deactivate approvers / strip module access |
| 145 | Supplier "Sync Failed" | a way to force integration failure |

## 2026-09-02 — QA batch: 147, 36, 35

**147 — supplier block/unblock (PASSING).** Now exercised for real against the
throwaway `HG Automation SUPP` (`/suppliers/30458`). Registered → Block (reason)
→ **Blocked** → Unblock (reason) → **Registered**. The More menu is the
corroborating signal: `Block` is replaced by `Unblock` while blocked. The block
dialog shows `Alert: This supplier has 20 open POs` — informational only, it does
not gate Submit. A `finally` block restores the supplier if an assertion fails,
so a red run cannot leave it blocked for the PO/quote suites.

**36 — extend the deadline after foreclosure (PASSING).** The key finding is
that **quoting is gated on the deadline, not on the foreclosure**: RFX-26-233,
whose deadline was 2026-08-31, offered no quote action at all, and extending it
to 2026-09-25 brought `Update Quote` straight back. The test therefore picks an
RFX that is genuinely foreclosed (More offers *Convert to Auction* and no
*Foreclose*), extends both deadlines and asserts the header date changed and a
quote action is available again.

Two traps in that dialog:
- The **calendar opens on the current month** even when the deadline is months
  out, and every day from today on is selectable — including a date EARLIER than
  the deadline already set. That is what QA meant by "select the date prior to
  the selected date".
- The calendar renders in a Radix popper **over** the dialog. Leaving it open
  swallows the Update click and the whole change is lost silently. Escape after
  each pick.

The save posts to `/quote-requests/<id>/update-deadlines-for-quote` and returns
`success:1`. There is no toast, so that response is the only signal.

**35 — evaluate an Evaluation (stages 1–2 PASSING, scoring blocked).** New suite
`testSuiteRfxEvaluation.spec.js`, three serial stages that hand the RFX over
through `test-results/s35-state.json` (so a later stage can be re-run alone with
`S35_RFX=<url>`). A live run built RFX-26-235 from INT-FNSE-26-378 in 3.1 min.

- Stage 1 — Released intake → *Send For Sourcing* → fill → submit → approve →
  **add the Evaluation** (label · section *RFP T&C - Letter of Commitment* ·
  Rating · Any Approver · NSEF Support Admin) → assert it lands on the
  Evaluations tab. `POST /quote-requests/<id>/evaluation` → `success:1`.
- Stage 2 — quote it, **answering all four questionnaire questions**, submit,
  foreclose.
- Stage 3 — `test.fixme`. See below.

QA described adding the Evaluation **on the conversion page**. That control does
exist there — a button labelled **"Add evaluation"** (lower-case e, so a
case-sensitive XPath misses it) which appends a row to an **inline click-to-edit
grid**: *Evaluation Name* opens an input placeholdered `Label`, *Evaluation Type*
a combobox of Rating / Traffic Light / Yes/No, and so on. The RFX page offers the
same thing as a proper **Create Evaluation dialog** with four ordered comboboxes,
which is far less brittle, and adding it there is still before the RFX is quoted
— identical precondition. The dialog is what the suite drives.

**Scoring — solved (QA walked me through the gesture).** The flow is exactly:
expand → *Evaluate* → for EACH answer hover it, click the star, type a reason,
click **that answer's** tick → then the tick on the **header line beside the
evaluation name**, which is the one that submits. Full chain now passes: live
2026-09-02 it built RFX-26-242, rated all three answers 5/5 and finished
`Completed` with 3/3 answers green and the Activity Log entry *"Evaluation has
been submitted by NSEF Support Admin"*.

**The trap that made it look broken, and that a naive test will hit.** The
per-answer ticks save NOTHING to the server — every rating is held in the
browser and the header tick posts them in one request to
`/quote-requests/<id>/evaluations/<evalId>`. So:

- watching for a request after each answer is misleading, and
- **if one star click is swallowed, the header tick submits the rest anyway**.
  The evaluation then lands on **"Partially Completed"** with that answer left
  uncoloured, and nothing warns you. Reproduced for real on **RFX-26-235**:
  answer 1 was lost, answers 2 and 3 saved with the automation's own reasons.

Two detection traps behind that, both now encoded:

- a scored answer **still shows its answer text** ("Yes"), and
- hovering an **unscored** row renders **all five stars filled** — verified on
  RFX-26-235's unrated answer 1.

So neither the text nor the star fill can distinguish scored from unscored. The
only honest marker is the **`lucide-user-round-check` icon** (and the green cell,
`rgb(230,243,229)` on `rgb(3,135,0)` text) that the app adds to a scored answer.

The page object therefore: confirms each star click by waiting for the comment
popover to open (it opens only if the click registered), retries that answer up
to three times, and after submitting **reloads and re-reads from the server**,
re-rating anything that was dropped — up to three passes. The test asserts
`unscored == []`, `greenAnswers == totalAnswers` and `status == "Completed"`,
rather than trusting the status alone.

Also note the stars are rendered in an overlay **outside** the `<td>`, so they
are filtered to the hovered row by y-coordinate, and the comment popover
overlaps the row below — another reason not to count by text.

## 2026-09-02 — working through the remaining scenarios

Baseline taken by cross-referencing the 160-scenario sheet against the results
CSV and the specs: **85 scenarios genuinely untouched** (8 dropped, 12 on hold,
the rest covered). Working through them in batches.

**98 — cancel a foreclosed RFX (PASSING).** A foreclosed RFX keeps `Cancel` in
its More menu (`Audit Logs · Amend · Workflow Stages · Clone · Regenerate /
Download Document · Convert to Auction · Reassign User · Cancel` — `Foreclose`
is gone), and the cancel dialog reuses the Foreclose reason+Submit shape.
Verified live on RFX-26-239 → `Cancelled`.

Safety note: cancelling is terminal, so the test only ever picks an RFX whose
**Subject contains "HG Automation"** — it can never consume a record set up by
hand.

**77–84 — Vendor Type / RPT flag: BLOCKED, no such fields in this tenant.**
Probed by opening `/invoices/new`, uploading the document and rendering every
template with a supplier selected, enumerating the form's field ids each time:

| Template | Fields | Vendor/RPT match |
|---|---|---|
| PO Invoice NSEF | 49 | only `MSME vendor?` |
| NSEF Credit Note | 46 | only `MSME vendor?` |
| CXO Template (Dev) | 42 | only `MSME vendor?` |
| RC Invoice | 19 | none |

There is no **Vendor Type** and no **RPT / Related Party** field on any of them,
before or after choosing the supplier, and the supplier's own Onboarding tab
exposes neither — it offers only an empty "Onboarding Template" picker. So these
eight need the same thing scenario 108 needs: **the correct template / tenant
configuration**. Once QA says which template carries the two fields the work is
small and mechanical — all eight are the same two-field check from eight entry
points, and `reportNonPoAutoFilled()` already reads auto-filled fields by label.

---

## ⚠️ 2026-09-02 — the sheet was RENUMBERED

QA removed two scenarios from the sheet and asked for the rest to be renumbered
consecutively. The sheet is now **1–158**.

| Removed | Was | Why |
|---|---|---|
| old **68** | Cloning a PO shows Budget Exceeded | QA: not a bug — a PO is expected to clone without error |
| old **108** | Reference must change when cloning a Released/Processed CXO | QA: wrong template; never confirmable (no field labelled "Reference" exists on the CXO) |

**Mapping — old → new**

| Old range | New |
|---|---|
| 1 – 67 | unchanged |
| 69 – 107 | **minus 1** (69→68, 107→106) |
| 109 – 160 | **minus 2** (109→107, 160→158) |

Both CSVs and every `@S<n>` tag in `tests/` were remapped together, so code and
sheet agree. **Any scenario number written in prose EARLIER IN THIS FILE is an
OLD number** — convert it with the table above. Numbers written from this entry
onward are new numbers.

The two retired tests: the PO-clone assertions in `testSuitePurchaseOrder.spec.js`
lost their `@S68` tag but were kept (they still assert Clone availability and the
absence of Short Close / Recall for scenarios 65/66); the scenario-108 test in
`testSuiteCxoClone.spec.js` was removed outright, with its finding preserved as a
comment.

---

## ⚠️ 2026-09-02 (second renumbering) — sheet is now 1–155

QA removed three more scenarios: the **save → edit → submit** variants for RFX,
GRN and Invoice (old 16 / 17 / 18). Reason: **those create pages have no Save
control**, so there is no draft to reopen and edit. Probed live —

| Page | Save (lucide-save) buttons |
|---|---|
| RFX — intake → Send For Sourcing | 0 |
| GRN — `/pending-inwards/po/<id>/inward` | 0 |
| Invoice — `/invoices/new` | 0 (only Cancel / Submit) |

Save-as-draft exists only on CXO and Intake, which remain covered (14 / 15).

**Mapping — previous numbering → new**

| Was | Now |
|---|---|
| 1 – 15 | unchanged |
| 16, 17, 18 | **removed** |
| 19 – 158 | **minus 3** (19→16, 158→155) |

Applied to both CSVs and to every `@S<n>` tag in `tests/` in one pass (59 tags
shifted). Combined with the first renumbering, the original sheet maps to today's
numbers as: old ≤15 unchanged · old 16–67 −3 · old 69–107 −4 · old 109–160 −5,
with old 16/17/18 (then 19/20/21) plus old 68 and 108 gone.

---

## 2026-09-03 — PR edit page: line-item search + budget validation (53, 54, 55)

New suite `tests/testSuitePrEdit.spec.js`; new page objects
`pages/prEditLocators.js`, `pages/prEditActions.js`. **3 passed (2.1m), zero
skips.**

| # | Scenario | Status |
|---|---|---|
| 53 | Search any line item in the line-item section | **DONE** |
| 54 | Price increased during PR edit → budget exceeded | **DONE** |
| 55 | Quantity increased during PR edit → budget exceeded | **DONE** |
| ~~16~~ | ~~Qty↑ on an award-created PR → Budget Exceeded in Workflow Summary popup~~ | **RETIRED into 55** |

### Scenario 53 was NOT unautomatable — it was the wrong page
It had been logged as *"no search box renders on a single-line-item PR"*. Both
halves of that were wrong. The PR **view** page has no search control at all
(and a read-only grid); the search lives on the **edit** page, as an icon-only
button immediately left of *Add items in Bulk*. It has no accessible name and
its MUI `makeStyles-` classes are build-hashed, so the image alt text is the
only durable anchor:

```
//button[.//img[@alt="Search"]]
```

Clicking it **replaces the button with `input[placeholder="Search"]`** — the
toggle locator stops resolving afterwards, so it must never be re-queried (a
probe that did hung for the full 30s action timeout).

Filtering is client-side ag-Grid, so there is no request to wait on. Verified on
`/requisitions/903/edit` (3 line items): `Manpower` → 1 row · cleared → 3 rows ·
`XXXXXX_NONEXISTENT_99999` → 0 rows.

**Clearing the filter REORDERS the rows** — restored order was
`Payroll · Manpower · Marketing` against an original
`Manpower · Payroll · Marketing`. The test compares sorted sets; asserting order
would fail for the wrong reason.

### Budget Exceeded — where it actually surfaces (54, 55)
Increasing either quantity or price on the edit grid and submitting opens the
**Workflow Summary popup, titled "Approvers"**, carrying

```
Budget Amount is exceeded. Please Contact Budget User.
```

plus a mandatory **Budget Amend Request** block and a table of
*Consumption Budget Item / Approved Budget / Available Budget / Value /
Additional Value*. Corroborated by `POST /api/capp/budget-items/{id}/validate`
returning `{"validate": false}`.

### Four traps, all hit live
- **`offsetParent` is NULL for the MUI dialog.** A visibility filter written
  that way reported "no popup" while the popup was plainly on screen and fully
  legible in the screenshot — it cost a false negative on the first price probe.
  Same trap as the item-details drawer. Use `toBeVisible()`.
- **A draft PR carries six mandatory fields EMPTY** — Payment Terms, Expected
  Delivery Date, Effective from/to, Purchase Type and both Inward radios.
  Submitting without them only raises the toast *"Please fill mandatory
  fields"*; the budget check never runs. A test that skipped this step would go
  green having proved nothing, so `submitExpectingWorkflowSummary()` **throws**
  on that toast rather than treating it as a soft outcome.
- **Dates must be picked in the NEXT month, not the current one.** The calendar
  opens on the current month; picking a fixed day number there lands in the past
  once the month is far enough along, which the form then rejects as a
  mandatory-field error. The helper steps forward one month first.
- **`Control+a` does not select-all on macOS** — it moves the caret to line
  start and the typed digits get appended (`1002000` instead of `2000`). Use
  `ControlOrMeta+a`. Also, `.ag-cell-inline-editing input` never matched on this
  grid, so values are typed through the keyboard after a dblclick rather than
  filled into a located input.

### Why these are safe to re-run
An over-budget submit **stops at the popup** behind the mandatory Budget Amend
Request; the only requests that fire are `POST .../approvers` and
`POST .../budget-items/{id}/validate` — **no write to the requisition**. The
inflated qty/price lives only in the browser. Verified after the green run:
draft 952 still reads qty 100 / price 2000 / total 200000, Payment Terms and
Effective-from still empty, status still Pending. The tests also click
**Discard**, never the popup's Submit.

Safety rule carried over from the RFX cancel test: only drafts whose **Subject
contains "HG Automation"** are ever driven, so a run cannot consume a record set
up by hand.

### Data-shape note
Every non-draft PR in this tenant is **Completed** and offers no Edit, so this
work can only run against the **Draft** tab (6 drafts, 2 of them ours). Draft
rows show the literal code `PR-DRAFT` — no code is assigned until submit — so a
draft is identifiable **only by the id in its anchor href**. The listing's
`Source` column ("awards" vs "intakes") is what distinguishes an award-created
PR from an intake-created one.

## 2026-09-03 — PRC / Requisition Conversion View (39, 44)

New suite `tests/testSuitePrcView.spec.js`; PRC navigation added to
`v3DetailActions` (`openPrcConversionView`, `openAnyPrcConversionView`) so the
existing MUI menu/dialog helpers are reused rather than duplicated.
**1 passed, 1 skipped (1.1m).**

| # | Scenario | Status |
|---|---|---|
| 44 | Reassign user for the PRC | **DONE** — dialog opens with 13 candidates |
| 39 | Regenerate + download document from the PRC view | **BLOCKED — confirmed app gap** |

Both had been parked as *"PRC has no listing; reachable only via a
Requisition's conversion view"*. That is accurate, and it is no longer a
blocker — the walk is PR → Transactions → Conversions → the `PRC-…` link.

### Three shape facts that make a PRC unlike every other v3 module
- **No listing and no URL of its own.** The conversion view renders **in
  place**, so `page.url()` still reads `/requisitions/{id}` once it is open. A
  PRC test cannot navigate by URL.
- **The header shows the PARENT PR's code** with a `Converted` chip, never the
  PRC code — so the PRC code must be captured off the link *before* clicking it.
  Asserting the PRC code in the header would always fail.
- **`//button[.//*[normalize-space()="More"]]` matches TWICE** on this view
  (nested elements at the same coordinates). Both resolve to the same menu, so
  `.first()` is correct, but a count-based assertion would be misleading.

### Scenario 39 — the PRC has no document actions at all
Its More menu holds **`Reassign User` only**. The header's two icon buttons are
`img[alt="Reload"]` and `img[alt="clock"]` (Activity Log) — and **Reload is a
plain refresh**: clicking it fires **zero non-GET requests**, so it is not a
disguised regenerate. Same shape as the GRN gap already recorded for scenario
41.

Rather than skip blind, the test **positively asserts the menu equals
`['Reassign User']`** before skipping, so it **flips to failing** the day the
actions are added — which is the signal worth having. Needs either the app
change or a QA decision to retire the scenario.

## 2026-09-03 — Supplier onboarding: mandatory IFSC (135, 136)

New suite `tests/testSuiteSupplierIfsc.spec.js`; IFSC helpers added to
`pages/supplierActions.js`. **2 passed (2.2m).**

| # | Scenario | Status |
|---|---|---|
| 135 | Blank IFSC blocks the onboarding submission | **DONE** |
| 136 | Clearing a stored IFSC while editing raises the same validation | **DONE** |

### Where IFSC actually lives — the earlier note was wrong
The suite header for `testSuiteSupplierOnboarding` recorded *"IFSC and GST are
NOT on this form, nor on the supplier's Onboarding tab… so those scenarios are
not covered here"*. The first half is right and the conclusion was wrong: IFSC
is on the **onboarding form at `/suppliers/{id}/update`**, which carries **two**
of them — **RTGS IFSC Code** and **NEFT IFSC Code**.

Verified live on supplier 30539: clearing both and submitting produces

```
RTGS IFSC Code is Mandatory
NEFT IFSC Code is Mandatory
Please fill mandatory fields
```

### Three traps, all encoded
- **The IFSC inputs carry NO mandatory marker** — no asterisk, no `required`,
  no `aria-required` — yet the form rejects them when blank. Deciding
  mandatoriness from the DOM marker (which was my first probe) concludes the
  exact opposite of the truth. The only reliable oracle on this form is
  submitting and reading the messages back, which is what
  `fillAndSubmitOnboardingForm` already does for its own purposes.
- **Field ids carry a random suffix** regenerated on every render
  (`RTGS IFSC Code-au1hzMh6hQKa`, `RTGS IFSC Code-4fwzT58o767P`,
  `RTGS IFSC Code-tInqnCgEIj5A` across three loads of the same supplier), so
  only the id PREFIX can ever be matched.
- **A REGISTERED supplier's `/update` REDIRECTS** to `/suppliers/{id}` and
  renders no form at all (verified on 30458, HG Automation SUPP). The form
  exists only pre-Registration, so the helper walks the listing for a supplier
  that actually yields one instead of trusting an id.

### Non-destructive twice over
The submit is blocked **entirely client-side** — zero non-GET requests are
attempted. On top of that the tests abort every non-GET request at the route
layer and assert `attemptedWrites === []`, so if the app ever regresses to
ACCEPTING a blank IFSC the abort prevents the mutation and the assertion reports
it, rather than the test quietly damaging a supplier's banking details.

### Worth raising with QA
135 and 136 reduce to the same assertion from the same form; 136 only adds the
precondition that the values were stored first. They look like the same merge
candidate 16/55 turned out to be — **QA's call**.

### 2026-09-03 — scenario 100 (supplier matching %): CONFIRMED GAP
Added to `testSuiteSupplierIfsc.spec.js`. **Skipped, guarded.** No matching
percentage is rendered anywhere in this tenant. Checked all three plausible
homes before concluding:

| Where | Result |
|---|---|
| Supplier view page (30458 / 30480 / 30539) | zero `%` text nodes, zero "match" mentions |
| Supplier Onboarding tab | zero `%` text nodes |
| Create Supplier form, typing a COLLIDING name | nothing — and this is the strong signal: "HG Automation" collides with the real supplier "HG Automation SUPP", so a duplicate-matching feature would have fired |

The test asserts the absence **positively** (and first proves the page rendered,
so it cannot pass on a blank page), then skips — so it flips to failing the day
the feature ships.

## 2026-09-03 — GRN Cancel vs invoice matching (67, 68)

New suite `tests/testSuiteGrnCancel.spec.js`; GRN match-state helpers added to
`v3DetailActions`. **1 passed, 1 skipped (45s).**

| # | Scenario | Status |
|---|---|---|
| 67 | Cancel unavailable once a GRN is FULLY matched | **DONE** |
| 68 | Cancel unavailable once a GRN is PARTIALLY matched | **BLOCKED — needs data** |

### The "Matched" column is an ICON with no text
```html
<span class="progress-completed">   fully matched
<span class="progress-pending">     not matched
```
Reading it with `innerText` returns `''` for every row — which is precisely why
a first pass concluded *"no GRN is matched to an invoice"* while **12 of 20**
rows were. Match state must come from the icon class.

### The listing's INV Code column is empty even when matched
Every row reads `-` while 12 carried the matched icon. The invoice linkage is
only visible on the GRN's **own** page, so `readGrnActions` collects `INV-`
codes from there. A first version of the test required the listing value and
skipped every time.

### An unmatched GRN does NOT necessarily offer Cancel
`/inwards/565` (INW-NSEFN-26-107, unmatched) offers no Cancel either. So
"Cancel is absent on a matched GRN" is **not evidence on its own** — the test
first DISCOVERS a live baseline (an unmatched GRN that really does offer Cancel)
and skips rather than passing hollowly if none exists. Live baseline was
INW-NSEFN-26-108: `New Reversal · Cancel · More`.

Result: INW-NSEFN-26-106, matched to **INV-AUTO-001**, offers only
`More · Overview · Transactions` — no Cancel. Cancel is a **top-level button**
on a GRN, never a More-menu item (that menu holds `Reassign User` only).

### A blind wait cost a false skip — fixed
`listGrnsWithMatchState` originally waited a flat 10s and returned **zero rows
on one run of two** (this listing carries charts and ~19 columns). An empty read
looks exactly like "no matched GRN exists", so the test skipped for the wrong
reason and looked green. It now waits for `tbody tr` to be visible.

### Scenario 68 needs purpose-built data
There is no partial state in the Matched column, so a partially-matched GRN
cannot be identified from the listing. The test is written and will run as soon
as a GRN exists that is matched to an invoice for **less than its full
quantity**.

## 2026-09-03 — Invoice MSME filter (84)

New suite `tests/testSuiteInvoiceMsme.spec.js`, reusing the existing
`v3ListingActions` filter machinery (`hasFilter` / `applyColumnFilter` /
`getColumnValues`) — no new page object needed. **3 passed (39s).**

### The earlier note was wrong — the column IS there
Batch 1 recorded *"no MSME column exposed by default on the Invoice listing;
needs the column enabled or a different entry point"*. Re-probed live: the
Invoice listing carries an **MSME column at index 16** with `Yes`/`No` cells and
a working `img[alt="filter"]` in its `<th>` offering exactly those two options.

### The oracle had to be chosen carefully
All 20 rows on page 1 read `No`, and the tenant holds **no MSME invoice at all**.
So "the Yes filter returns rows" is the wrong assertion — it would fail on
correct behaviour. The suite asserts instead:

- `MSME = No` **must** return rows, and every one must read `No` → 20 rows, all `No`.
- `MSME = Yes` must never return a row reading `No` — **purity**, whether the
  result is populated or empty → 0 rows, clean empty result, page not crashed.

That holds however much MSME data the tenant has.

### ⚠️ Coverage limit worth reporting to QA
Because no MSME invoice exists here, the scenario's **positive** claim — *"all
Invoices related to MSME Vendor are displayed"* — is **not proven with data**.
What is proven is the filter's mechanics and that it never leaks a non-MSME
invoice. Closing the gap needs at least one invoice raised against an
MSME-registered vendor; the tests will then assert the matches without any code
change.
