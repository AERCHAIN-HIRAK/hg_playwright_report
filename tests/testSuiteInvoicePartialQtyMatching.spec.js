import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToGrnViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Sheet scenario 123 — partial-quantity matching across MULTIPLE invoices
//
//   "Verify that partial quantity matching works correctly when multiple
//    Invoices are matched against the available GRN and PO quantity."
//
// QA's steps (2026-09-22): CXO → Intake → RFX → Quote → Foreclose → Award →
// edit-submit the PR → PO is auto-created → GRN for the FULL qty → three
// invoices of 30 / 30 / 40 all matched against that ONE GRN, each acknowledged
// through to Accounted → the PO must end Completed.
//
// 30 + 30 + 40 = 100 = data.intake.itemQty, so the split consumes the PO
// exactly. That exactness is the point: the PO can only reach Completed if
// every partial match landed on the right remaining balance.
//
// ── The "2nd invoice sends the full PO qty" bug (reported 2026-08-20) ────────
// That bug refused a SECOND invoice on a partially-consumed PO silently. It is
// FIXED on UAT: the 2026-11-24 run created and accounted all three invoices on
// PO-NSEFN-26-590. If invoice 2/3 ever dies on a waitForURL with a clean DOM
// again, suspect a regression of that bug before the test.
//
// ── MERGED WITH SCENARIO 128 (2026-11-24) ───────────────────────────────────
// S123 and S128 used to build a chain EACH (~15-20 min apiece). Both need the
// same thing - a PO of 100 with a full-qty GRN - and S128's checks are refusals
// that consume nothing, so they now interleave on ONE PO:
//
//   1  [S128 A]  build chain; 101 against the untouched PO        -> refused
//   2  [S123]    invoices 1 + 2 (30 + 30) taken to Accounted
//   3  [S128 B]  50 against the remaining 40 (60 already invoiced) -> refused
//   4  [S123]    invoice 3 (40) -> all three on the PO, PO Completed
//
// S128 B no longer needs its own 60-qty draw-down invoice: S123's first two
// invoices leave exactly 40 remaining. The group is SERIAL - a failure skips the
// later steps, and a retry rebuilds the chain from step 1.
//
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const readFixture = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// Must sum to data.intake.itemQty for the PO to complete.
const SPLITS = [30, 30, 40];

test.use({ navigationTimeout: 60000, actionTimeout: 20000 });

test.describe.serial('Partial-quantity matching across multiple invoices (S123 + S128 on one PO)', () => {

    // The chain rewrites savedCxo / savedIntake / savedPurchaseOrder /
    // savedInvoice and advances invoice.invoiceNumber. Snapshot and restore so
    // the next suite inherits its own fixture, with the counter carried forward.
    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S123+S128' }); });

    // Shared across the serial steps (same worker, same order).
    let poCode = null;
    const poQty = Number(data.intake.itemQty);
    const invoices = [];

    const newActions = async (page) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);
        return a;
    };

    /** Fill a fresh invoice form on the saved PO up to (not including) Submit. */
    const openInvoiceFormAt = async (a, qty, tag) => {
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        // Bumps invoice.invoiceNumber, so each invoice carries a distinct
        // reference — invoices sharing one would trip the duplicate reference
        // validation (scenario 126) rather than testing matching.
        await a.fillInvoiceDetails(data);
        await a.setInvoiceGeneralDetailsNo();
        // If the grid REFUSES to hold an over-PO quantity, setInvoiceQty throws
        // — that is the UI clamping the value, which is itself the limit being
        // enforced, just at entry instead of at submit. The message says so.
        await a.setInvoiceQty(qty);
        await a.matchGrnInItemMatching();
        // Item Matching pushes the GRN's matched qty back into the row, which
        // on a partial invoice would silently restore the FULL qty.
        await a.ensureInvoiceQty(qty);
        console.log(`${tag}: form filled at qty ${qty}`);
    };

    /** One S123 invoice of `qty`, taken all the way to Accounted. */
    const invoiceToAccounted = async (a, n, qty) => {
        console.log(`[S123] ── invoice ${n}/${SPLITS.length}, qty ${qty} ──`);
        await openInvoiceFormAt(a, qty, `[S123] invoice ${n}`);
        await a.submitInvoice();
        await a.saveInvoiceCode();
        const code = a.getSavedInvoiceCode();
        expect(code, `invoice ${n} produced no code`).toBeTruthy();

        // Clear the review gate EXPLICITLY rather than leaving it to the
        // approval loop, because from the 2nd invoice onward the GRN has to be
        // re-matched on the review form (QA, 2026-09-22) — and the loop's own
        // call cannot do that. Submitting the review unmatched is refused
        // silently: the page just stays on /invoices/<id>/edit with a clean DOM.
        const rematchGrn = n > 1;
        const cleared = await a.submitInvoiceReviewStage('S123', { rematchGrn, qty });
        console.log(`[S123] invoice ${n} review cleared=${cleared} (rematchGrn=${rematchGrn})`);
        expect(cleared,
            `invoice ${n} (${code}) could not clear the review stage`
            + (rematchGrn ? ' even after re-matching the GRN' : ''))
            .toBeTruthy();

        await a.approveInvoiceUntilPendingSync('Approved by automation', { acceptSyncFailed: true });
        await a.assertInvoiceReadyForAck();

        // Reads the CURRENT invoice.invoiceNumber, so each invoice has to be
        // acknowledged before the next one is created — the counter has moved
        // on by then and the reference would no longer match.
        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();

        invoices.push({ n, qty, code });
        console.log(`[S123] invoice ${n}/${SPLITS.length} — ${code} (qty ${qty}) is Accounted`);
    };

    // ── Scenario 128 ─────────────────────────────────────────────────────────
    // "Verify that an Invoice cannot exceed the remaining PO balance when
    //  multiple Invoices are created against the same PO."
    // QA (2026-09-22): an invoice for more than the PO qty, OR more than the
    // REMAINING qty, must show a validation. A SILENT refusal still fails: this
    // app has a documented habit of refusing submits with an empty DOM, so
    // "refused, but said nothing" is a real finding, not a pass.

    test('build PO + full GRN, then an invoice above the PO qty is refused with a validation @Invoice @Validation @S128', async ({ page }) => {
        test.setTimeout(2700000); // 45 min — chain + GRN + one refusal

        const a = await newActions(page);

        // grnQty omitted ⇒ the builder asserts Received == PO qty rather than
        // typing a number, so a PO built at some other qty is caught here.
        await buildToGrnViaCapp(a, data);
        poCode = readFixture().savedPurchaseOrder?.code;
        expect(poCode, 'the PO code was not captured by the chain').toBeTruthy();
        console.log(`[S123+S128] chain built PO ${poCode} at qty ${poQty} with GRN ${readFixture().savedGrn?.code} at full qty`);

        // ── Case A: 101 against an untouched PO of 100 ───────────────────────
        const over = poQty + 1;
        await openInvoiceFormAt(a, over, `[S128] case A (${over} vs PO ${poQty})`);
        const a1 = await a.submitInvoiceExpectingQtyRejection();
        console.log(`[S128] case A → ${JSON.stringify(a1)}`);
        expect(a1.refused, `an invoice for ${over} against a PO of ${poQty} was accepted`).toBeTruthy();
        expect(a1.silent,
            `the over-PO-qty invoice was refused but NO validation was displayed. `
            + `Error-shaped text found: ${JSON.stringify(a1.errish)}`)
            .toBeFalsy();

        // Assert the REAL wording, captured live 2026-09-22, not just "some error".
        const msgA = a1.messages.join(' | ');
        expect(msgA, `unexpected validation wording: ${msgA}`)
            .toMatch(/Invoice quantity cannot exceed PO quantity/i);
        expect(msgA, `case A should report an untouched PO: ${msgA}`)
            .toMatch(new RegExp(`PO quantity:\\s*${poQty}[\\s\\S]*Already invoiced:\\s*0\\b`, 'i'));
        expect(msgA, `case A should report the attempted ${over}: ${msgA}`)
            .toMatch(new RegExp(`New invoice:\\s*${over}`, 'i'));
    });

    test('invoices 1 and 2 (30 + 30) match the full-qty GRN and reach Accounted @Invoice @GRN @Matching @S123', async ({ page }) => {
        test.setTimeout(2700000); // 45 min — 2 × (invoice, approvals, ack)
        const a = await newActions(page);
        for (const [i, qty] of SPLITS.slice(0, 2).entries()) await invoiceToAccounted(a, i + 1, qty);
    });

    test('an invoice above the REMAINING qty is refused, counting what is already invoiced @Invoice @Validation @S128', async ({ page }) => {
        test.setTimeout(900000); // 15 min — one refusal
        const a = await newActions(page);

        const consumed = invoices.reduce((s, i) => s + i.qty, 0);
        const remaining = poQty - consumed;
        const overRemaining = remaining + 10;
        await openInvoiceFormAt(a, overRemaining,
            `[S128] case B (${overRemaining} vs remaining ${remaining})`);
        const b1 = await a.submitInvoiceExpectingQtyRejection();
        console.log(`[S128] case B → ${JSON.stringify(b1)}`);
        expect(b1.refused,
            `an invoice for ${overRemaining} against a remaining balance of ${remaining} was accepted`)
            .toBeTruthy();
        expect(b1.silent,
            `the over-remaining-qty invoice was refused but NO validation was displayed. `
            + `Error-shaped text found: ${JSON.stringify(b1.errish)}`)
            .toBeFalsy();

        // THE POINT OF THE SCENARIO. "Already invoiced" must reflect the Accounted
        // invoices, i.e. the refusal is measured against the REMAINING balance and
        // not merely against the PO total.
        const msgB = b1.messages.join(' | ');
        expect(msgB, `unexpected validation wording: ${msgB}`)
            .toMatch(/Invoice quantity cannot exceed PO quantity/i);
        expect(msgB, `case B must count the ${consumed} already invoiced: ${msgB}`)
            .toMatch(new RegExp(`Already invoiced:\\s*${consumed}\\b`, 'i'));
        expect(msgB, `case B should total ${consumed + overRemaining}: ${msgB}`)
            .toMatch(new RegExp(`Total:\\s*${consumed + overRemaining}\\b`, 'i'));
        console.log(`[S128] both over-quantity invoices were refused with a validation on ${poCode}`);
    });

    test('invoice 3 (40) completes the PO, with all three invoices listed on it @Invoice @GRN @Matching @S123', async ({ page }) => {
        test.setTimeout(1800000); // 30 min — invoice, approvals, ack, checks
        const a = await newActions(page);

        await invoiceToAccounted(a, 3, SPLITS[2]);

        // ── All three hang off the SAME PO ───────────────────────────────────
        await a.openSavedPurchaseOrder(data);
        // readPoTransactionInvoiceCodes reads the OPEN Transactions tab — without
        // this it silently returns [] from the overview tab (2026-09-22 run).
        await a.openPoTransactionsTab();
        const listed = await a.readPoTransactionInvoiceCodes();
        console.log(`[S123] PO ${poCode} transactions list: ${JSON.stringify(listed)}`);
        for (const { code, qty } of invoices) {
            expect(listed.join(' '),
                `${code} (qty ${qty}) is Accounted but is not listed on PO ${poCode}`)
                .toContain(code);
        }

        // ── The PO is fully consumed, so it must be Completed ────────────────
        await a.openSavedPurchaseOrder(data);
        await a.assertCappDocStatus('Completed', 'S123');
        console.log(`[S123] PO ${poCode} is Completed after ${SPLITS.join(' + ')} = ${SPLITS.reduce((s, q) => s + q, 0)}`);
    });
});
