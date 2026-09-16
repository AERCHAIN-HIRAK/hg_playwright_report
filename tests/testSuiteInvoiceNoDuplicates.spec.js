import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToGrnViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 116 — multiple Invoice reject-edits must not create duplicate
// Invoice entries in the DB.
//
// SHAPE (QA, 2026-09-15): PO → GRN at the FULL PO qty → ONE Invoice for the
// FULL PO qty, matched against that GRN. That single invoice is then
// reject → edit → submit'd SEVERAL TIMES. Nothing else is created.
//
// WHAT A DUPLICATE WOULD LOOK LIKE. Each reject-edit must UPDATE the existing
// invoice, not insert another row. So there are two independent checks:
//
//   1. IDENTITY — after every resubmit the invoice's id AND code are unchanged.
//      A new /invoices/<id> is a new DB row, caught the cycle it happens in.
//   2. COUNT — the PO's Transactions tab ends with exactly ONE invoice row.
//      Catches a duplicate that identity misses (e.g. a shadow row that the
//      edit form never navigates to).
//
// The invoice is deliberately LEFT IN APPROVAL after the final resubmit rather
// than driven to Accounted: the transaction tab lists an invoice from submit
// onwards, which is all this scenario measures.
//
// TRAPS, all paid for on 2026-09-15:
//
//  a. REJECT NAVIGATES AWAY from the invoice. After "Reject submitted" the
//     browser sat on the PRC page, so the header pencil opened the PRC's edit
//     form and the (rightly absent) FIX button read as a bad locator. The reject
//     here routinely takes the approver-reassign recovery, which is what moves
//     the page. editInvoiceResubmitSameQty re-opens the invoice first.
//
//  b. The FIX / re-match control is NOT always present on a rejected invoice's
//     edit form — observed present in one run and absent in the next, same code.
//     Its absence is tolerated and logged, never assumed.
//
//  c. Item Matching can push the GRN's matched qty back into the row, so the qty
//     is re-asserted AFTER the match.
//
// Session: NSEF login (auth.nsef.json) via nsef-setup.
// Long runs: prefix PW_LIGHT=1 to drop video/trace — they buffer for the whole
// test and OOM-killed a 25-minute run on this machine.
// ─────────────────────────────────────────────────────────────────────────────

// "Multiple times" — three cycles by default, overridable. Three is enough for a
// duplicate to show up while keeping the run short; the identity check fires on
// the FIRST bad cycle regardless of how many are configured.
const REJECT_EDIT_CYCLES = Number(process.env.S116_CYCLES || 3);

// The invoice is raised for the whole PO, which is the intake's line-item qty.
const FULL_QTY = String(data.intake.itemQty);

// DEBUG KNOBS — the real run uses neither. The chain build costs ~14 min before
// the first invoice exists, which is a brutal price for debugging a later step.
//   S116_PO_ID=1101 S116_GRN_CODE=INW-NSEFN-26-132 \
//     npx playwright test tests/testSuiteInvoiceNoDuplicates.spec.js --project=nsef-tests
// A RESUMED run cannot produce a valid scenario result: the reused PO already
// carries invoices from the run that built it, so the "exactly one row"
// assertion would be counting those too. Loop mechanics only.
const RESUME_PO_ID = process.env.S116_PO_ID || null;
const RESUME_GRN_CODE = process.env.S116_GRN_CODE || null;
const RESUMING = Boolean(RESUME_PO_ID && RESUME_GRN_CODE);

let dataSnapshot = null;

test.describe('Invoice reject-edit creates no duplicate entries (116)', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // The chain rewrites savedCxo … savedGrn / savedInvoice, which other suites
    // read as fixtures. Restore them; the UAT records themselves remain.
    // restoreFixtures carries invoice.invoiceNumber FORWARD — it is a monotonic
    // counter and this run burns one on the server.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S116' }); });

    test('one full-qty invoice reject-edited repeatedly stays a single entry @S116 @Invoice', async ({ page }) => {
        // ~14 min build + ~2 min invoice + ~1 min per cycle.
        test.setTimeout(3_600_000);

        const a = new NSEFoundationActions(page);
        await a.openApp(data);
        const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
        const readFixture = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

        if (RESUMING) {
            const f = readFixture();
            f.savedPurchaseOrder = {
                code: `PO(resumed ${RESUME_PO_ID})`,
                id: RESUME_PO_ID,
                url: `https://nse-capp-uat.aerchain.io/purchase-orders/${RESUME_PO_ID}`,
            };
            f.savedGrn = { ...(f.savedGrn ?? {}), code: RESUME_GRN_CODE };
            fs.writeFileSync(DATA_PATH, JSON.stringify(f, null, 4), 'utf-8');
            console.log(`[S116] RESUMING on PO ${RESUME_PO_ID} / GRN ${RESUME_GRN_CODE} — `
                + 'chain build skipped, so the tab count is NOT a valid scenario result.');
        } else {
            // CXO → Intake → RFX → award → PR → PRC → PO, then the GRN. No grnQty
            // override: the default asserts Received == PO Quantity, i.e. the FULL
            // qty this scenario needs.
            await buildToGrnViaCapp(a, data);
            await a.takeScreenshot('s116_chain_po_grn_ready');
        }

        // ── ONE invoice, FULL PO qty, matched to that GRN ─────────────────────
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.fillInvoiceDetails(data);       // fresh invoice number + today's date
        await a.setInvoiceGeneralDetailsNo();   // period-based / extra billing → No
        // No setInvoiceQty: the create form already carries the full PO qty, and
        // this invoice is meant to consume all of it.
        await a.matchGrnInItemMatching();
        await a.ensureInvoiceQty(FULL_QTY);     // trap c
        await a.submitInvoice();

        const code = await a.saveInvoiceCode();
        const id = readFixture().savedInvoice?.id;
        expect(code, 'no Invoice code was captured after the initial submit').toBeTruthy();
        expect(id, 'no Invoice id was captured after the initial submit').toBeTruthy();
        console.log(`[S116] invoice created: ${code} (id ${id}) at qty ${FULL_QTY}`);
        await a.takeScreenshot('s116_invoice_created');

        // ── reject → edit → submit, repeatedly, on THAT SAME invoice ──────────
        for (let cycle = 1; cycle <= REJECT_EDIT_CYCLES; cycle++) {
            console.log(`\n[S116] ══ reject-edit cycle ${cycle}/${REJECT_EDIT_CYCLES} on ${code} ══`);

            await a.openSavedInvoice(data);                       // trap a
            await a.rejectCappDoc(`Rejected by automation (S116 cycle ${cycle})`, 'INV');
            await a.editInvoiceResubmitSameQty(FULL_QTY, data);   // traps a, b, c

            // CHECK 1 — identity. saveInvoiceCode re-reads from the page the
            // resubmit landed on, so a new row shows up as a changed id here,
            // naming the cycle that created it.
            const codeNow = await a.saveInvoiceCode();
            const idNow = readFixture().savedInvoice?.id;
            expect(codeNow, `cycle ${cycle}: the reject-edit produced a NEW invoice code `
                + `(${code} → ${codeNow}) — that is a duplicate entry`).toBe(code);
            expect(idNow, `cycle ${cycle}: the reject-edit produced a NEW invoice id `
                + `(${id} → ${idNow}) — that is a duplicate entry`).toBe(id);
            console.log(`[S116] cycle ${cycle}/${REJECT_EDIT_CYCLES} done — still ${codeNow} (id ${idNow})`);
        }

        await a.takeScreenshot('s116_all_cycles_done');

        // ── CHECK 2 — the PO carries exactly ONE invoice ──────────────────────
        await a.openSavedPurchaseOrder(data);
        await a.openPoTransactionsTab();
        const listed = await a.readPoTransactionInvoiceCodes();
        await a.takeScreenshot('s116_po_transactions_tab');

        expect(listed,
            `after ${REJECT_EDIT_CYCLES} reject-edits the PO Transactions tab should list `
            + `exactly one invoice (${code}) — found ${JSON.stringify(listed)}`)
            .toEqual([code]);

        console.log(`[S116] PASS — ${code} survived ${REJECT_EDIT_CYCLES} reject-edits `
            + 'as a single entry, listed once on the PO');
    });
});
