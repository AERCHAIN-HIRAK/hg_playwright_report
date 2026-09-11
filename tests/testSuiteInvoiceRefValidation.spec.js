import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice reference validation — CAPP only
//
// Sheet scenarios:
//   126  duplicate Invoice reference numbers are validated
//   127  the subject character limit (240) is validated
//
// QA (2026-09-07): the flow must be CAPP only — PO Invoice or CXO Invoice — NOT
// the supplier portal. There are two moments to check:
//   (a) AT CREATION  — entering an already-used reference is refused;
//   (b) AT THE REVIEW STAGE — create with a unique reference, then in review
//       (which is the invoice EDIT page) enter an already-used reference and it
//       is refused. 127 belongs to this same edit page.
//
// THIS FILE COVERS (a) ONLY. See the note on (b) at the bottom.
//
// Why the old blocker was wrong: it recorded "no invoice in this tenant can be
// edited" after looking for an Edit action and Draft/Parked invoices. The edit
// surface is reached through the REVIEW action, which that probe never tried.
//
// Reuses a PO that already has open quantity rather than building a fresh chain:
// the S68 run left PO-NSEFN-26-218 with 50 of 100 uninvoiced. The duplicate
// number is taken from NSEFoundationData.json's invoice.invoiceNumber — the
// number the previous run actually used, so it is a guaranteed collision rather
// than a hardcoded guess.
//
// Nothing is created: the submit is expected to be REFUSED. If it is ever
// accepted the test fails loudly, because that is the defect this looks for.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice — reference validation (CAPP)', () => {

    test('a duplicate Invoice reference is refused at creation @Invoice @Validation @S126', async ({ page }) => {
        test.setTimeout(600000);

        const a = new NSEFoundationActions(page);
        await a.openApp(data);

        const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
        const poCode = fresh.savedPurchaseOrder?.code;
        expect(poCode, 'no savedPurchaseOrder — run the S68 chain first to leave a PO with open qty').toBeTruthy();
        // Read the collision off the SAVED INVOICE itself, not the data file's
        // generated counter — see readSavedInvoiceNumber for why that counter lies.
        const duplicate = await a.readSavedInvoiceNumber(data);
        console.log(`[S126] using PO ${poCode}, deliberately re-using invoice number "${duplicate}"`);

        // Create a second invoice against that PO, from CAPP.
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);

        // Fill the header NORMALLY first — fillInvoiceDetails does the Invoice
        // Number *and* the mandatory Invoice Date. Setting only the number left
        // the date empty, and the submit was then refused for "Invoice Date is
        // Mandatory" (observed 2026-09-07) — a refusal that has nothing to do
        // with the duplicate reference and would have been scored as one.
        await a.fillInvoiceDetails(data);
        // Now overwrite the reference with a known collision. `duplicate` was read
        // BEFORE this call, because fillInvoiceDetails bumps the stored number.
        await a.fillInvoiceNumberExactly(duplicate);
        await a.setInvoiceGeneralDetailsNo();
        // The PO has 50 of 100 left; a 2nd invoice defaults to the FULL qty and is
        // then refused silently, which would be indistinguishable from the
        // duplicate-reference refusal this test is trying to observe.
        await a.setInvoiceQty('50');

        const result = await a.submitInvoiceExpectingDuplicateRejection();

        expect(result.refused, 'the duplicate reference was accepted').toBeTruthy();
        // A silent block is a real finding, not a pass: the scenario says a
        // VALIDATION is displayed, so name it rather than letting it slide.
        expect(result.silent,
            'the duplicate reference was refused SILENTLY — the invoice stayed on /invoices/new with no '
            + `validation message. Error-shaped text found: ${JSON.stringify(result.errish ?? [])}`)
            .toBeFalsy();
        // The message must name the invoice it collided with — that is what makes it
        // actionable, and it proves the app matched against the RIGHT invoice
        // rather than just rejecting on any duplicate-ish condition.
        expect(result.messages.join(' '),
            `the duplicate validation does not reference an existing invoice code: ${JSON.stringify(result.messages)}`)
            .toMatch(/Invoice-[A-Z]+-\d+-\d+/);
        console.log(`[S126] validation shown: ${JSON.stringify(result.messages)}`);
    });

    // ── (b) THE REVIEW-STAGE HALF — NOT YET AUTOMATED ────────────────────────
    //
    // 126(b) and 127 both need a CAPP invoice sitting in the REVIEW stage, whose
    // Review action opens /invoices/<id>/edit.
    //
    // Not written yet because the trigger is unconfirmed: the CAPP PO invoice this
    // repo builds goes straight to Pending Approval — verified 2026-09-07 on
    // Invoice-FNSE-26-367, whose approval loop reported "Pending Approval" and
    // never a review state. The only Pending-Review invoice found in the tenant
    // (Invoice-FNSE-26-361) is documented in SupplierPortalActions as the SAPP
    // route, which QA has ruled out for these scenarios.
    //
    // Sheet scenario 120 ("an Invoice is not auto-skipped from the Review stage")
    // suggests the Review stage EXISTS for CAPP invoices but auto-skips when the
    // assigned reviewer is the submitter — which is exactly the case for every
    // invoice this automation creates. Confirming that is the next step.
});
