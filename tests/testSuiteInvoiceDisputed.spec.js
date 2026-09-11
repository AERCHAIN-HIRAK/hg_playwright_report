import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp, buildToGrnViaCapp } from '../pages/chainBuilders';
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
// WHY EACH TEST BUILDS ITS OWN PO. All three need a PO whose quantity is intact
// at invoice time, and they need DIFFERENT GRN states (none / full / partial).
// Sharing one PO would also walk straight into the known "2nd invoice sends the
// full PO qty" bug, whose symptom is a SILENT submit block — indistinguishable
// from the Disputed-or-not outcome these tests are measuring. Three chains is
// the honest cost.
//
// Invoices are created from CAPP (PO -> Create -> Invoice), which is the flow
// that carries the Item Matching step scenario 69 has to skip. Session: NSEF
// login (auth.nsef.json) via nsef-setup.
//
// Each test asserts Disputed on the invoice detail page, polling because the
// status is not necessarily set the instant the submit returns. If a run shows
// the invoice sitting at Pending Approval instead, the poll reports that exact
// status — which tells us whether Disputed is applied only after approval,
// rather than leaving us guessing.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
let dataSnapshot = null;

test.describe('Invoice → Disputed', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // Each chain rewrites savedCxo … savedGrn / savedInvoice, which other suites
    // read as fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => {
        restoreFixtures(dataSnapshot, { tag: 'DISPUTED' });
    });

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

    // ── 70 — no GRN at all ────────────────────────────────────────────────────
    test('an invoice raised against a PO with NO GRN is Disputed @Invoice @Disputed @S70',
        async ({ page }) => {
            test.setTimeout(2700000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // Stops at the PO: no GRN is created.
            await buildToPoViaCapp(a, data);
            const po = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedPurchaseOrder?.code;
            console.log(`[S70] PO ${po} built with no GRN`);

            await createInvoiceWithoutMatching(a, { tag: 'S70' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S70' });
            expect(status, 'an invoice with no GRN should be Disputed').toMatch(/disputed/i);
        });

    // ── 69 — a GRN exists but is not matched ──────────────────────────────────
    test('an invoice that does not match an available GRN is Disputed @Invoice @Disputed @S69',
        async ({ page }) => {
            test.setTimeout(2700000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // Full-quantity GRN, so the ONLY thing wrong is that it is not matched.
            await buildToGrnViaCapp(a, data);
            const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            console.log(`[S69] PO ${built.savedPurchaseOrder?.code} with GRN ${built.savedGrn?.code} (full qty)`);

            await createInvoiceWithoutMatching(a, { tag: 'S69' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S69' });
            expect(status, 'an invoice that skips matching an available GRN should be Disputed')
                .toMatch(/disputed/i);
        });

    // ── 13 — GRN 50 vs invoice 100 ────────────────────────────────────────────
    test('an invoice for more than the GRN received quantity is Disputed @Invoice @Disputed @S13',
        async ({ page }) => {
            test.setTimeout(2700000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // Partial receipt: GRN 50 against a PO of 100.
            await buildToGrnViaCapp(a, data, { grnQty: 50 });
            const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            console.log(`[S13] PO ${built.savedPurchaseOrder?.code} with GRN ${built.savedGrn?.code} (received 50)`);

            await createInvoiceWithoutMatching(a, { qty: 100, tag: 'S13' });
            const status = await a.waitForInvoiceStatus(/disputed/i, { tag: 'S13' });
            expect(status, 'an invoice for 100 against a GRN of 50 should be Disputed')
                .toMatch(/disputed/i);
        });
});
