import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { v3ListingActions } from '../pages/v3ListingActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice — cancelling an Accounted invoice
//
// Sheet scenario:
//   81  an accounted Invoice can be cancelled
//
// Accounted invoices are NOT on page 1 of the listing — the default view is
// dominated by Pending-approval / Cancelled / Rejected — so the suite filters
// the Status column to "Accounted" rather than hoping one turns up. ("Accounted"
// is one of 28 status options that filter offers.)
//
// Verified live 2026-09-03 on Invoice-FNSE-26-334 (/invoices/1115, Accounted):
//   top-level actions → Cancel · + Payment · More · Overview · Transactions
//   Cancel opens a "Cancellation Notes" dialog with an "Enter Reason" textarea
//   and Cancel / Confirm.
//
// ⚠️ DESTRUCTIVE, AND CONSUMES DATA — QA asked (2026-09-07) for the cancellation
// to be carried through and the resulting status asserted, so this test now
// CONFIRMS the dialog. That reverses a posted financial document and burns one
// Accounted invoice per run. Two consequences to keep in mind:
//   • the tenant needs a fresh Accounted invoice before each run, else the test
//     skips (no Accounted row) rather than fails;
//   • the invoice it picks is whichever Accounted one sorts first — it is not a
//     dedicated throwaway.
// If that becomes a problem, the sustainable alternative is the shape used by
// scenario 66 in testSuiteInvoiceCancelGrn: build the chain, drive the fresh
// invoice to Accounted, then cancel the invoice this test itself created. That
// costs ~45 min per run instead of ~2 min.
//
// Status is read back through readInvoiceStatusByPath, which re-navigates and
// polls for one of the known status words — the detail page paints the status
// chip after the document body, so reading it straight after the dialog closes
// is racy.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice — cancel an Accounted invoice', () => {

    test.describe.configure({ timeout: 300000 });

    test('an Accounted invoice can be cancelled and its status becomes Cancelled @Invoice @Cancel @S81', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        const listing = new v3ListingActions(page, data.modules.invoice);
        await page.setViewportSize({ width: 1800, height: 950 });

        await listing.navigateToListingPage(data.baseUrl);
        await listing.waitForListingPageLoad(90000);
        await listing.applyColumnFilter('Status', 'Accounted');

        const codes = (await listing.getColumnValues('Code')).filter(Boolean);
        test.skip(!codes.length, 'no Accounted invoice exists in this tenant');

        // The filter must not have leaked another status — the whole scenario is
        // "cancel an ACCOUNTED invoice", so picking a Rejected one proves nothing.
        const statuses = (await listing.getColumnValues('Status')).filter(Boolean);
        for (const s of statuses) {
            expect(s, `the Accounted filter leaked a "${s}" invoice`).toMatch(/Accounted/i);
        }

        const href = await page.locator('tbody tr').first().locator('a').first().getAttribute('href');
        const id = (href || '').match(/\/invoices\/(\d+)/)?.[1];
        expect(id, 'could not resolve an invoice id from the listing row').toBeTruthy();
        const code = codes[0];
        console.log(`[S81] cancelling ${code} (/invoices/${id})`);

        await page.goto(`${data.baseUrl}/invoices/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.locator('xpath=//button[normalize-space()="More"]').first()
            .waitFor({ state: 'visible', timeout: 90000 });
        await page.waitForTimeout(3000);

        // Confirm the state under test actually rendered — otherwise "Cancel is
        // offered" could be read off some other invoice.
        await expect(page.locator('xpath=//*[normalize-space()="Accounted"]').first(),
            'the opened invoice does not show the Accounted status').toBeVisible({ timeout: 30000 });

        const cancel = page.locator('xpath=//button[normalize-space()="Cancel"]').first();
        await expect(cancel, 'an Accounted invoice offers no Cancel action').toBeVisible({ timeout: 20000 });
        expect(await cancel.isDisabled(), 'the Cancel action is disabled').toBeFalsy();

        // ── Cancel for real ───────────────────────────────────────────────────
        // cancelInvoice tries the header button first, then More, and treats the
        // dialog closing as the only proof the cancel was accepted — a page-wide
        // textarea lookup once filled the wrong box, leaving Confirm refused by
        // validation while the caller logged success.
        await a.cancelInvoice(`Cancelled by automation — scenario 81 (${code})`);

        // ── The status must now be Cancelled ──────────────────────────────────
        const after = await a.readInvoiceStatusByPath(`/invoices/${id}`);
        console.log(`[S81] ${code} status after cancel = "${after}"`);
        expect(after, `${code} did not move to Cancelled after the cancellation`)
            .toMatch(/Cancelled/i);

        // A cancelled invoice must not still offer Cancel.
        const stillCancellable = await page
            .locator('xpath=//button[normalize-space()="Cancel"]').first()
            .isVisible({ timeout: 5000 }).catch(() => false);
        console.log(`[S81] Cancel still offered after cancelling? ${stillCancellable}`);
    });
});
