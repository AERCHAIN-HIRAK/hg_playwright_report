import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE → DISPUTED.
//
// One test per route that lands an invoice in "Disputed" status. The rules are
// QA's, given 2026-09-08, verbatim:
//
//   13  "if GRN is 50 and invoice is for 100 qty then disputed"
//   69  "if GRN is created and during invoice creation if GRN is not matched
//        then disputed"
//   70  "if invoice is created without creating a GRN for the PO then Invoice
//        disputed"
//
// ── ONE PO, THREE SERIAL STEPS (merged 2026-11-24) ──────────────────────────
// These used to build a PO each. They need the PO's quantity intact at invoice
// time and DIFFERENT GRN states (none / partial), so the steps run in the order
// the GRN state grows, cancelling each Disputed invoice to give its quantity back:
//
//   1  S70  PO of 100, NO GRN → invoice 100 → Disputed → cancel → PO offers 100
//   2  S13  GRN for 50 → invoice 100 (unmatched) → Disputed → cancel → PO offers 100
//   3  S69  the 50 GRN is available → invoice 50, NOT matched → Disputed
//
// S69 invoices 50, not 100, so the ONLY thing wrong with it is the missing match
// — 100 against a 50 GRN would also be S13's over-receipt condition.
//
// Two facts make this safe, both checked 2026-11-24:
//   · a Disputed invoice offers a top-level Cancel (Invoice-FNSE-26-1029:
//     Cancel · Resolve · Credit / Debit · More);
//   · the old "2nd invoice sends the full PO qty" bug, which once made sharing a
//     PO unsafe here, is fixed on UAT.
// Whether cancelling a DISPUTED invoice gives its quantity back is ASSERTED after
// each cancel (assertPoQtyAvailableForInvoice), never assumed — if it does not,
// the failure names that step rather than surfacing later as a wrong status.
//
// SERIAL: a failed step skips the ones after it; a retry rebuilds the chain.
// Invoices are created from CAPP (PO -> Create -> Invoice), which is the flow
// that carries the Item Matching step these tests deliberately skip. Each test
// asserts Disputed on the invoice page, polling because the status is not
// necessarily set the instant the submit returns.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const readFixture = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
const PO_QTY = Number(data.intake.itemQty);   // 100
const GRN_QTY = 50;

test.use({ navigationTimeout: 60000, actionTimeout: 20000 });

test.describe.serial('Invoice → Disputed (S70 → S13 → S69 on one PO)', () => {

    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    // The chain rewrites savedCxo … savedGrn / savedInvoice, which other suites
    // read as fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'DISPUTED' }); });

    const newActions = async (page) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);
        return a;
    };

    /** PO -> Create -> Invoice -> fill the header -> Submit, WITHOUT matching a GRN.
     *  Returns the invoice code. `qty` is only set when it must differ from the
     *  form's default. */
    async function createInvoiceWithoutMatching(a, { qty = null, tag } = {}) {
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.fillInvoiceDetails(data);
        await a.setInvoiceGeneralDetailsNo();
        if (qty != null) await a.setInvoiceQty(String(qty));
        // Deliberately no FIX / Item Matching step — that is the point of 69 and
        // the reason 13's mismatch survives to submission.
        await a.submitInvoice();
        const code = await a.saveInvoiceCode?.().catch(() => null);
        console.log(`[${tag}] invoice submitted${code ? ` → ${code}` : ''} at ${a.page.url()}`);
        return code;
    }

    /** Cancel the Disputed invoice just created, then prove the PO offers its
     *  full quantity again — the precondition of the next step. */
    async function cancelAndReleaseQty(a, code, tag) {
        await a.openSavedInvoice(data);
        await a.cancelInvoice(`Cancelled by automation — ${tag} done, freeing the PO for the next step`);
        console.log(`[${tag}] ${code} cancelled`);
        await a.assertPoQtyAvailableForInvoice(PO_QTY, data);
        console.log(`[${tag}] the PO offers ${PO_QTY} for invoicing again`);
    }

    // ── 70 — no GRN at all ────────────────────────────────────────────────────
    test('an invoice raised against a PO with NO GRN is Disputed @Invoice @Disputed @S70',
        async ({ page }) => {
            test.setTimeout(2700000); // 45 min — the chain is most of it
            const a = await newActions(page);

            // Stops at the PO: no GRN is created.
            await buildToPoViaCapp(a, data);
            console.log(`[S70] PO ${readFixture().savedPurchaseOrder?.code} built with no GRN`);

            const code = await createInvoiceWithoutMatching(a, { tag: 'S70' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S70' });
            expect(status, 'an invoice with no GRN should be Disputed').toMatch(/disputed/i);

            await cancelAndReleaseQty(a, code, 'S70');
        });

    // ── 13 — GRN 50 vs invoice 100 ────────────────────────────────────────────
    test('an invoice for more than the GRN received quantity is Disputed @Invoice @Disputed @S13',
        async ({ page }) => {
            test.setTimeout(1800000); // 30 min — GRN approvals + invoice
            const a = await newActions(page);

            // Partial receipt: GRN 50 against the PO of 100.
            await a.openSavedPurchaseOrder(data);
            await a.clickPoCreateGrn();
            await a.submitSelectPoItemsPopup();
            await a.fillGrnGeneralDetails(data);
            await a.fillGrnDocumentDetails(data);
            await a.setGrnReceivedQty(GRN_QTY);
            await a.submitGrn();
            const grnCode = await a.saveGrnCode();
            await a.approveGrnUntilInwarded('Approved by automation');
            await a.assertGrnInwarded();
            console.log(`[S13] PO ${readFixture().savedPurchaseOrder?.code} with GRN ${grnCode} (received ${GRN_QTY})`);

            const code = await createInvoiceWithoutMatching(a, { qty: PO_QTY, tag: 'S13' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S13' });
            expect(status, `an invoice for ${PO_QTY} against a GRN of ${GRN_QTY} should be Disputed`)
                .toMatch(/disputed/i);

            await cancelAndReleaseQty(a, code, 'S13');
        });

    // ── 69 — a GRN exists but is not matched ──────────────────────────────────
    test('an invoice that does not match an available GRN is Disputed @Invoice @Disputed @S69',
        async ({ page }) => {
            test.setTimeout(1200000); // 20 min
            const a = await newActions(page);

            // The 50 GRN from step 2 is available; invoicing exactly 50 means the
            // ONLY thing wrong is that it is not matched.
            console.log(`[S69] GRN ${readFixture().savedGrn?.code} (${GRN_QTY}) is available — invoicing ${GRN_QTY} unmatched`);
            await createInvoiceWithoutMatching(a, { qty: GRN_QTY, tag: 'S69' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S69' });
            expect(status, 'an invoice that skips matching an available GRN should be Disputed')
                .toMatch(/disputed/i);
        });
});
