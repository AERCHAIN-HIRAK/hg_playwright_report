import { test, expect } from '@playwright/test';
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
//   More              → Reassign User · Download Document · Regenerate Document
//   Cancel opens a "Cancellation Notes" dialog with an "Enter Reason" textarea
//   and Cancel / Confirm. Opening it fires ZERO write requests.
//
// ⚠️ COVERAGE LIMIT — the cancellation is NOT confirmed. Cancelling an
// ACCOUNTED invoice reverses a posted financial document, which is the most
// destructive action in this whole sheet; doing it on every CI run would chew
// through the tenant's accounted invoices. The test proves the action is
// offered AND actionable (the dialog opens with its reason field and Confirm),
// then backs out. Completing it needs a QA-designated throwaway invoice, the
// way 147 (block/unblock) and 98 (RFX cancel) were arranged.
//
// Enforced non-destructive: every non-GET request is aborted for the life of
// these tests and the test asserts none was attempted, so even a misclick on
// Confirm cannot post the cancellation.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice — cancel an Accounted invoice', () => {

    test.describe.configure({ timeout: 240000 });

    /** @type {v3ListingActions} */
    let listing;
    /** @type {string[]} */
    let attemptedWrites;

    test.beforeEach(async ({ page }) => {
        listing = new v3ListingActions(page, data.modules.invoice);
        await page.setViewportSize({ width: 1800, height: 950 });

        attemptedWrites = [];
        await page.route('**/*', route => {
            const req = route.request();
            if (req.method() === 'GET') return route.continue();
            attemptedWrites.push(`${req.method()} ${req.url()}`);
            return route.abort();
        });

        await listing.navigateToListingPage(data.baseUrl);
        await listing.waitForListingPageLoad(90000);
    });

    test('an Accounted invoice offers Cancel and opens the cancellation dialog @Invoice @Cancel @S81', async ({ page }) => {
        await listing.applyColumnFilter('Status', 'Accounted');

        const codes = (await listing.getColumnValues('Code')).filter(Boolean);
        test.skip(!codes.length, 'no Accounted invoice exists in this tenant');

        const statuses = (await listing.getColumnValues('Status')).filter(Boolean);
        for (const s of statuses) {
            expect(s, `the Accounted filter leaked a "${s}" invoice`).toMatch(/Accounted/i);
        }

        // Open the first Accounted invoice via its listing anchor.
        const href = await page.locator('tbody tr').first().locator('a').first().getAttribute('href');
        const id = (href || '').match(/\/invoices\/(\d+)/)?.[1];
        expect(id, 'could not resolve an invoice id from the listing row').toBeTruthy();
        console.log(`[S81] opening ${codes[0]} (/invoices/${id})`);

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

        // It must be genuinely actionable, not just a rendered button.
        await cancel.click();
        const dialog = page.locator('[class*="MuiDialog-root"]').first();
        await expect(dialog, 'Cancel did not open a cancellation dialog').toBeVisible({ timeout: 20000 });
        await expect(dialog).toContainText(/Cancellation Notes/i);
        await expect(dialog.locator('textarea[placeholder="Enter Reason"]').first(),
            'the cancellation dialog has no reason field').toBeVisible({ timeout: 10000 });
        await expect(dialog.locator('xpath=.//button[normalize-space()="Confirm"]').first(),
            'the cancellation dialog has no Confirm').toBeVisible({ timeout: 10000 });

        console.log('[S81] cancellation dialog is available — NOT confirmed (would reverse a posted invoice)');

        expect(attemptedWrites,
            'a write was attempted while only inspecting the cancel dialog').toEqual([]);
    });
});
