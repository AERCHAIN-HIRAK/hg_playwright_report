# QA decisions on the 160 scenarios

Recorded from QA on 2026-09-01. This is the authority on what to build, what to
defer and what to drop — it overrides earlier guesses in AUTOMATION_PLAN.md.

## Dropped — do not automate
| # | Scenario | Note |
|---|---|---|
| 28 | Prices sync in the Analysis tab | ignore |
| 29 | Prices can be synced from the Analysis tab | ignore (duplicate of 28) |
| 44 | Regenerate + download document — GRN | ignore; the GRN has no such action |
| 56 | Search a line item in the line-item section | ignore |
| 69 | PO recall → Draft | ignore |

## On hold — revisit later
121 · 123 · 124 · 125 · 126 · 145 · 108 · 88 · 33 · 35 · 37

> Note for 108 when it comes off hold: the CXO **panel** (scenario 4) exposes a
> field called **"Reference Code"** — on the sample it equals the CXO code
> itself. That is very likely "the reference" the clone rule refers to, rather
> than the BRF I had guessed.

## Mailbox
Gmail `hirak.goswami@aerchain.io` (password in `.env`, gitignored).
Used by scenarios 94, 96, 97, 114 and 34.

## Clarified — how each one actually works

| # | How to do it |
|---|---|
| 4 | Open the CXO panel by clicking the CXO **row/line** on the listing — NOT the code link. Confirmed: a right-side panel (width 640) showing Subject, **Reference Code**, Supplier, Created On, plus Reject / Approve / Recall actions. |
| 23 | While **quoting** the RFX, pick a currency other than INR (system currency is INR); only then can base-currency conversion be observed. |
| 24 | When **awarding**, below the qty entry there is a **Justification section** — put long text in every field. After awarding, hovering each field must reveal the full text. |
| 31 | The Intake an RFX was converted from is reachable from the RFX's **Transactions tab**. |
| 32 | Quote the RFX → **foreclose** → More dropdown → **Convert to Auction**. The Auction link then appears in the RFX **Transactions tab**. |
| 34 | Once the RFX is **Released**, its **supplier section** has a **bulk reminder** button; it emails the suppliers (verify via the mailbox above). |
| 43 | The PO document download lives in the **General Details** section AND is reachable from the **More** dropdown. Present on every PO status **except Cancelled**. |
| 53 | Convert an **Intake directly to a PR**. That Requisition then carries an **Intake link** which opens the intake. |
| 54 | The Requisition/PR carries a **Budget link** — on our data it is named **"Don't touch"**. |
| 65, 66 | A PO can be **Short Closed** once a **partial-quantity GRN** and a **partial-quantity invoice** exist. |
| 96 | Log into Gmail, open the notification mail, click the link → the CXO opens. |
| 97 | Same, but in **mobile view** — open the mail in mobile view, click the link, the CXO must open in mobile view without error. |
| 114 | Two modules: **Reports** and **Admin Reports**, reachable from all modules. Open a report → generate for the **last 3 months** → **Download** (a file must download) → **Send email**. The **Email Report Logs** module records the activity; status **Completed** means it was sent. That log row also offers a **download**. Check the log status first, then the mailbox. |

## 2026-09-01 — findings from the walkthrough batch

**53 / 54 — Requisition raised from an Intake.** Both need a PR whose
`Source` column is `intakes`; a PR sourced from `awards` shows neither link.
Verified on `PR-NSEFN-26-121` (`/requisitions/1083`):
- Source value `intakes` is itself the link → opens `/intakes/2201/overview` in a new tab.
- The budget link sits under the field **`BRF - Description`** and reads
  `Dont Touch/HG Auomation PURPOSE`. It is an `<a>` with **no href**; it opens
  the right-side drawer **in place** (not a new tab), showing
  `Name: Dont Touch · Status: active · Actual budget ₹9,99,99,99,99,999`.

**114 — Reports.** `/admin-reports` returns **403** for the NSEF login;
QA confirmed admin reports are out of scope for this account. The Reports
module (`/reports`) is used instead.
- Generate → `GET /api/capp/reports/<slug>?startDate&endDate&isPivot=1`
- Send Mail → `GET /api/capp/reports/<slug>?startDate&endDate&sendEmailToUser=1`
- The send is recorded at **`/email-report-logs`** — columns
  `Serial No · Report Name · Start Date · End Date · Requested Date · Status · Report URL`.
  Status moves **`pending` → `success`** (~45s), and Report URL turns from empty
  into a **Download** link to S3. Older rows read **`Link Expired`**, so only a
  freshly-sent row is downloadable.
  Note the status word is `success`, not `completed`.
- QA (2026-09-01): 114 must check **both** the log status and that the mail arrived.

**Scenario 4 flakiness (fixed).** The CXO listing mounts rows before their
cells fill. Reading the code too early returned `""`, which both made the row
click land on an unrendered cell and silently defanged the `toContainText`
assertion. Now waits for a non-empty code, and retries the click only after
waiting for the panel (clicking again while it opens hits the backdrop and
toggles it shut).

**BLOCKER — Gmail 2FA.** `hirak.goswami@aerchain.io` sign-in reaches
2-Step Verification and offers only *"Tap Yes on your phone or tablet"* — no
backup codes, no SMS. Password automation cannot get past it. This blocks the
mailbox half of 94, 96, 97, 114 and the verification step of 34.

**32 — Convert to Auction (PASSING).** The option is gated on foreclosure:
`RFX-26-233` (Quoted, not foreclosed) offers Foreclose and no auction option;
`RFX-26-222` (quoted then foreclosed) offers Convert to Auction and no
Foreclose. The auction is linked from the **Transactions** tab (route
`/quote-requests/<id>/transactions` — clicking the tab button alone does not
switch the view), not the Analysis tab as the sheet wording suggests.

The conversion drawer's confirm button is DISABLED until line items are
selected. **A self-inflicted bug cost several runs here:** the selection loop
clicked a checkbox with Playwright and then "fell back" to a DOM click, which
toggled it straight back off, so the confirm never enabled and it looked like
the control was broken. Tick each box at most once, and only fall back when it
is still unchecked. The app is fine.

QA suggested (2026-09-01) building this as a self-contained flow instead —
clone an RFX, add a second supplier, quote from both, foreclose, then convert —
so the test does not depend on a pre-foreclosed RFX existing. Worth doing: the
current test SKIPS if no quoted-and-foreclosed RFX is on the first listing page.

## 2026-09-01 — Reports module (scenario 93)

QA: **do not generate all 37 reports** — a sample of 3–4 is enough. The suite
now covers Invoice Register, PO Register, GRN Report and PR Ageing Report,
chosen to span different source modules.

A one-off full sweep of all 37 was run before trimming. Two reports did not
render; only ONE of them is a defect:

- **GRN Custom Table Report (id 493) — CANDIDATE DEFECT.** Reproduced by hand:
  the page pre-selects the template "Default GRN - Value", and Generate issues
  `GET /api/capp/reports/grn-custom-table-report-nse?…&isPivot=1&reportId=493&templateId=445`
  which returns **HTTP 404**. No grid renders at all. Worth a dev look — a
  listed report whose default template 404s.
- **Vendor Onboarding Report (id 272) — NOT A BUG.** The page states
  *"Template selection is mandatory"* and no template is pre-selected, so
  Generate correctly does nothing. This was a gap in the test, not the app.

**Testing trap worth remembering:** the report grid is **WebDataRocks**
(`.wdr-grid-layout`, `.wdr-cell`, `.wdr-header`) — not a `<table>` and not
ag-Grid. An early version counted document-wide `th` / `tbody tr`, which picks
up the DATE PICKER's calendar (Su/Mo/Tu headers, week rows). Every report then
reported an identical "14 headers / 12 rows" and the check would have passed on
a completely broken report. Always scope to `.wdr-` selectors.

## 2026-09-02 — QA decision batch

### Dropped / ignore (do not chase, not defects)
| # | Scenario | QA ruling |
|---|---|---|
| 44 | Regenerate + download document — GRN | the feature does not exist |
| 64 | Advance payment against a PO, deducted from the invoice | not needed now |
| 68 | Cloning a PO shows "Budget Exceeded" | **not a bug** — a PO is *expected* to clone without error; the scenario's premise is wrong |
| 69 | PO recall → Draft | not a defect: **Recall appears in the PO More dropdown only while the PO status is Pending Approval** |
| 76 | Advance requested from SAPP, processed through CAPP | not needed now |
| 92 / 138 / 139 | Cancelled CXO **26-90** still listed under My Pending Approvals | ignore this one record — known stale row, not a fault in the counts/cancel logic being tested |

### On hold — automate later
| # | Scenario | Why held |
|---|---|---|
| 34 | Bulk supplier reminder for quoting | later (also mailbox-blocked) |
| 108 | Reference must change when cloning a Released/Processed CXO | we are not using the correct template yet |
| 114 | Emailed report logged + downloadable | later (also mailbox-blocked) |

### Now specified — build these
**147 — block / unblock a supplier.** All Modules → Supplier → search
`HG Automation supp` → open the supplier view page → More → **Block** → reason →
Submit → assert status is **Blocked** → More → **Unblock** → reason → Submit →
assert the status reverts to **Registered**. This supersedes the earlier
"non-destructive, do not actually block" note: `HG Automation supp` is the
designated throwaway supplier, so the action is now exercised for real.

**35 — evaluate an Evaluation on the RFX.** The Evaluation has to be created
during the Intake → RFX conversion:
1. On the RFX conversion page click **Add Evaluation**.
2. Evaluation name → section **RFP T&C - Letter of Commitment** →
   Evaluation Type **Rating** → Approval Type **Any** → Evaluator
   **NSEF Support Admin**.
3. Fill the rest of the conversion exactly as the normal RFX conversion does.
4. While **quoting**, answer the questions in the *RFP T&C - Letter of
   Commitment* section.
5. Submit the quote → **foreclose**.
6. **Evaluations tab** → expand the evaluation → **Evaluate** → hover an answer →
   pick the rating → add a reason → click the tick → click the tick again to
   submit the evaluation.
7. Assert the answers turn **green**, and that **"evaluation submitted"** is
   captured in the **Activity Timeline**.

**36 — extend the deadline after foreclosure.** Once the RFX is quoted and
foreclosed the supplier can no longer quote. From the top of the RFX view page
click **Extend Deadline**, pick a date *earlier than* the currently selected
one, submit with a reason — the supplier must then be able to quote again.

### 2026-09-02 (later) — 35 resolved

QA confirmed the scoring gesture: rate **each** answer (star → reason → that
answer's tick), then the tick on the evaluation's **header line**. Automated and
passing end to end.

Worth flagging to dev: the per-answer ticks are browser-side only, and the
header tick submits whatever is complete — so a single lost star click yields a
silent **"Partially Completed"** evaluation with one answer uncoloured. Seen on
**RFX-26-235**. The suite now self-heals (reload, re-read, re-rate) and asserts
every answer is green, but the app giving no warning is a real usability risk.

### 2026-09-02 — 92 / 138 / 139 unblocked

QA: *"fix 92, 138, 139 because that one cancelled cxo will be present in the
pending approvals tab"*. **CXO-FNSE-26-90 is expected to stay** in My Pending
Approval — it is not a live defect to chase.

The three tests now exempt exactly that code via a `KNOWN_STALE_PENDING`
allowlist in `testSuiteDashboard.spec.js`, kept deliberately narrow so the
scenarios still do their job:

- only that one code is forgiven — **any other terminal row still fails**;
- it is logged on every run, so it never vanishes from view;
- the exemption is **self-expiring**: if the row is ever cleaned up the tests
  keep passing and the log prints that the allowlist is unused, which is the cue
  to delete it.

For 92 the count comparison discounts exactly the exempt rows rather than being
loosened: dashboard 47 vs listing 48 → adjusted 47, an exact match.

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

## 2026-09-03 — scenario 16 retired into 55 (QA)

QA: *"16 and 55 are same test case so remove 1."*

| Removed | Kept |
|---|---|
| **16** — qty increased during Edit & Submit of an auto-created PR **from an Award** → Budget Exceeded in the **Workflow Summary popup** | **55** — qty increased during PR edit → budget exceed error displayed |

**Why 55 was the one kept.** 16's only distinguishing claims were (a) the PR
being award-created and (b) the error appearing in the Workflow Summary popup.
(b) is not a difference at all — that popup is the *only* place this app ever
shows the error, so 55's test asserts it either way. (a) is preserved in code:
`pickSafeDraft({ preferSource: 'awards' })` drives an **award-sourced** draft
when one is editable and falls back to an intake-sourced one, since the
assertion is identical. Keeping 55 also leaves it symmetric with 54, its
price-increase sibling, in the same suite.

**Numbering left ALONE — there is now a gap at 16.** The two earlier removals
were renumbered because QA explicitly asked for consecutive numbering; that was
not asked for here. Renumbering silently would invalidate every scenario number
already in QA's sheet and in previously delivered reports, and it costs ~60 tag
edits to do or undo. A gap is trivially closed later. **Sheet is now 154 rows,
numbered 1–155 with 16 missing.** Say the word to renumber consecutively.

Scenario 16 was never separately automated, so no test was deleted — its intent
lives in `testSuitePrEdit.spec.js` › *"quantity increased during edit raises
Budget Exceeded in the Workflow Summary popup @S55"*.
