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
// ── THIS TEST IS EXPECTED TO FAIL UNTIL AN APP BUG IS FIXED ──────────────────
// Creating a SECOND invoice against a partially-consumed PO sends the FULL PO
// quantity instead of the remaining balance, and the app then refuses the
// submit SILENTLY: all three popups clear, the page stays on /invoices/new, and
// there is no error text anywhere in the DOM. Automation sees only
// submitInvoice()'s waitForURL timing out.
//
// Reported to the dev team 2026-08-20 and being fixed app-side. A test-side qty
// workaround is deliberately NOT added here — it would mask the very fix this
// scenario exists to prove. If invoice 2/3 dies on a waitForURL with a clean
// DOM, that is this bug and not a regression in the test.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const readFixture = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// Must sum to data.intake.itemQty for the PO to complete.
const SPLITS = [30, 30, 40];

test.use({ navigationTimeout: 60000, actionTimeout: 20000 });

test.describe('Partial-quantity matching across multiple invoices', () => {

    // The chain rewrites savedCxo / savedIntake / savedPurchaseOrder /
    // savedInvoice and advances invoice.invoiceNumber. Snapshot and restore so
    // the next suite inherits its own fixture, with the counter carried forward.
    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S123' }); });

    test('three invoices of 30/30/40 match one full-qty GRN and complete the PO @Invoice @GRN @Matching @S123', async ({ page }) => {
        test.setTimeout(4200000); // 70 min — full chain + GRN + 3 × (invoice, approvals, ack)

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // ── Steps 1–2: CXO → … → PO, then a GRN for the FULL PO quantity ─────
        // grnQty omitted ⇒ the builder asserts Received == PO qty rather than
        // typing a number, so a PO that was built at some other qty is caught
        // here instead of silently under-receiving.
        await buildToGrnViaCapp(a, data);

        const poCode = readFixture().savedPurchaseOrder?.code;
        const grnCode = readFixture().savedGrn?.code;
        expect(poCode, 'the PO code was not captured by the chain').toBeTruthy();
        console.log(`[S123] chain built PO ${poCode} with GRN ${grnCode} at full qty`);

        // ── Steps 3–5: three invoices against that one GRN ───────────────────
        const invoices = [];

        for (const [i, qty] of SPLITS.entries()) {
            const n = i + 1;
            console.log(`[S123] ── invoice ${n}/${SPLITS.length}, qty ${qty} ──`);

            await a.openSavedPurchaseOrder(data);
            await a.clickPoCreateInvoice();
            await a.submitSelectPoItemsForInvoice();
            await a.confirmInvoiceCreation();
            await a.uploadInvoiceDocument(data);
            // Bumps invoice.invoiceNumber, so each invoice carries a distinct
            // reference — three invoices sharing one would trip the duplicate
            // reference validation (scenario 126) rather than testing matching.
            await a.fillInvoiceDetails(data);
            await a.setInvoiceGeneralDetailsNo();

            await a.setInvoiceQty(qty);
            await a.matchGrnInItemMatching();
            // Item Matching pushes the GRN's matched qty back into the row, which
            // on a partial invoice would silently restore the FULL qty.
            await a.ensureInvoiceQty(qty);

            await a.submitInvoice();
            await a.saveInvoiceCode();
            const code = a.getSavedInvoiceCode();
            expect(code, `invoice ${n} produced no code`).toBeTruthy();

            // Clear the review gate EXPLICITLY rather than leaving it to the
            // approval loop, because from the 2nd invoice onward the GRN has to be
            // re-matched on the review form (QA, 2026-09-22) — and the loop's own
            // call cannot do that. Submitting the review unmatched is refused
            // silently: the page just stays on /invoices/<id>/edit with a clean
            // DOM, which cost invoice 2 a ~10 minute spin on the 2026-09-22 run.
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
        }

        // ── Step 6: all three hang off the SAME PO ───────────────────────────
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

        // ── Step 7: the PO is fully consumed, so it must be Completed ────────
        await a.openSavedPurchaseOrder(data);
        await a.assertCappDocStatus('Completed', 'S123');
        console.log(`[S123] PO ${poCode} is Completed after ${SPLITS.join(' + ')} = ${SPLITS.reduce((s, q) => s + q, 0)}`);
    });

    // ── Sheet scenario 128 ───────────────────────────────────────────────────
    // "Verify that an Invoice cannot exceed the remaining PO balance when
    //  multiple Invoices are created against the same PO."
    //
    // QA's steps (2026-09-22): an invoice for more than the PO qty, OR more than
    // the REMAINING qty, must show a validation. The test ends at the validation
    // — nothing is completed afterwards.
    //
    // Two cases off ONE chain, because the expensive part is the ~12 minute
    // build, not the assertions:
    //   A  101 against an untouched PO of 100        (over the PO qty)
    //   B   50 against a PO with 40 left             (over the REMAINING qty)
    //
    // Case B draws the balance down by taking invoice 1 all the way to Accounted
    // rather than merely submitting it. S123 above PROVES the balance moves that
    // way (30+30+40 completes the PO exactly); whether a merely-submitted invoice
    // also reserves quantity is unverified, and guessing it would put the whole
    // case on an unproven premise.
    //
    // A SILENT refusal still fails this test. The scenario is that a validation
    // is DISPLAYED, and this app has a documented habit of refusing submits with
    // an empty DOM — so "refused, but said nothing" is a real finding, not a pass.
    test('an invoice above the PO qty, and above the remaining qty, are both refused with a validation @Invoice @Validation @S128', async ({ page }) => {
        test.setTimeout(3000000); // 50 min — chain + GRN + one full invoice + two refusals

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await buildToGrnViaCapp(a, data);
        const poCode = readFixture().savedPurchaseOrder?.code;
        const poQty = Number(data.intake.itemQty);
        console.log(`[S128] chain built PO ${poCode} at qty ${poQty} with a full-qty GRN`);

        /** Fill a fresh invoice form on the saved PO up to (not including) Submit. */
        const openInvoiceFormAt = async (qty, tag) => {
            await a.openSavedPurchaseOrder(data);
            await a.clickPoCreateInvoice();
            await a.submitSelectPoItemsForInvoice();
            await a.confirmInvoiceCreation();
            await a.uploadInvoiceDocument(data);
            await a.fillInvoiceDetails(data);
            await a.setInvoiceGeneralDetailsNo();
            // If the grid REFUSES to hold an over-PO quantity, setInvoiceQty throws
            // — that is the UI clamping the value, which is itself the limit being
            // enforced, just at entry instead of at submit. The message says so.
            await a.setInvoiceQty(qty);
            await a.matchGrnInItemMatching();
            await a.ensureInvoiceQty(qty);
            console.log(`[S128] ${tag}: form filled at qty ${qty}`);
        };

        // ── Case A: 101 against an untouched PO of 100 ───────────────────────
        const over = poQty + 1;
        await openInvoiceFormAt(over, `case A (${over} vs PO ${poQty})`);
        const a1 = await a.submitInvoiceExpectingQtyRejection();
        console.log(`[S128] case A → ${JSON.stringify(a1)}`);
        expect(a1.refused, `an invoice for ${over} against a PO of ${poQty} was accepted`).toBeTruthy();
        expect(a1.silent,
            `the over-PO-qty invoice was refused but NO validation was displayed. `
            + `Error-shaped text found: ${JSON.stringify(a1.errish)}`)
            .toBeFalsy();

        // Assert the REAL wording, captured live 2026-09-22, not just "some error".
        // The message carries the app's own arithmetic, so it is also the clearest
        // proof that nothing had been invoiced yet.
        const msgA = a1.messages.join(' | ');
        expect(msgA, `unexpected validation wording: ${msgA}`)
            .toMatch(/Invoice quantity cannot exceed PO quantity/i);
        expect(msgA, `case A should report an untouched PO: ${msgA}`)
            .toMatch(new RegExp(`PO quantity:\\s*${poQty}[\\s\\S]*Already invoiced:\\s*0\\b`, 'i'));
        expect(msgA, `case A should report the attempted ${over}: ${msgA}`)
            .toMatch(new RegExp(`New invoice:\\s*${over}`, 'i'));

        // ── Draw the balance down to 40: one invoice of 60, taken to Accounted ─
        const consumed = 60;
        await openInvoiceFormAt(consumed, `balance draw-down (${consumed})`);
        await a.submitInvoice();
        await a.saveInvoiceCode();
        const firstCode = a.getSavedInvoiceCode();
        const cleared = await a.submitInvoiceReviewStage('S128', { rematchGrn: false, qty: consumed });
        expect(cleared, `${firstCode} could not clear the review stage`).toBeTruthy();
        await a.approveInvoiceUntilPendingSync('Approved by automation', { acceptSyncFailed: true });
        await a.assertInvoiceReadyForAck();
        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();
        const remaining = poQty - consumed;
        console.log(`[S128] ${firstCode} (qty ${consumed}) is Accounted — ${remaining} should remain on ${poCode}`);

        // ── Case B: 50 against a remaining balance of 40 ─────────────────────
        const overRemaining = remaining + 10;
        await openInvoiceFormAt(overRemaining, `case B (${overRemaining} vs remaining ${remaining})`);
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
        // invoice, i.e. the refusal is measured against the REMAINING balance and
        // not merely against the PO total — a check that would pass hollowly if
        // the app had simply compared 50 to 100.
        const msgB = b1.messages.join(' | ');
        expect(msgB, `unexpected validation wording: ${msgB}`)
            .toMatch(/Invoice quantity cannot exceed PO quantity/i);
        expect(msgB, `case B must count the ${consumed} already invoiced: ${msgB}`)
            .toMatch(new RegExp(`Already invoiced:\\s*${consumed}\\b`, 'i'));
        expect(msgB, `case B should total ${consumed + overRemaining}: ${msgB}`)
            .toMatch(new RegExp(`Total:\\s*${consumed + overRemaining}\\b`, 'i'));

        console.log(`[S128] both over-quantity invoices were refused with a validation on ${poCode}`);
    });
});
