import { test, expect } from '@playwright/test';
import { v3ListingActions } from '../pages/v3ListingActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice listing — MSME filter
//
// Sheet scenario:
//   84  all Invoices related to an MSME vendor are displayed after applying the
//       MSME filter from the listing page
//
// This was parked in the Batch-1 notes as *"no MSME column exposed by default on
// the Invoice listing; needs the column enabled or a different entry point"*.
// That is no longer true (re-probed live 2026-09-03): the Invoice listing
// carries an **MSME** column at index 16 whose cells read "Yes"/"No", and its
// <th> holds a working `img[alt="filter"]` offering exactly those two values.
//
// Every one of the 20 rows on page 1 reads "No", so the honest oracle is not
// "the Yes filter returns rows" — it may legitimately return none. Instead:
//   · filtering "No"  MUST return rows, and every one must read "No"
//   · filtering "Yes" must return NO row reading "No" — whether it returns
//     matching rows or an empty result, it must never leak a non-MSME invoice
// That holds regardless of how much MSME data the tenant happens to have.
//
// Read-only.
// ─────────────────────────────────────────────────────────────────────────────

const MSME = 'MSME';

test.describe('Invoice listing — MSME filter', () => {

    test.describe.configure({ timeout: 240000 });

    /** @type {v3ListingActions} */
    let listing;

    test.beforeEach(async ({ page }) => {
        listing = new v3ListingActions(page, data.modules.invoice);
        await page.setViewportSize({ width: 1800, height: 950 });
        await listing.navigateToListingPage(data.baseUrl);
        await listing.waitForListingPageLoad(90000);
    });

    test('the MSME column is present and filterable @Invoice @MSME @S84', async () => {
        const idx = await listing.getColumnIndex(MSME);
        expect(idx, 'the Invoice listing exposes no MSME column').toBeGreaterThan(-1);

        expect(await listing.hasFilter(MSME),
            'the MSME column has no filter affordance').toBeTruthy();

        await listing.openColumnFilter(MSME);
        const options = [...new Set(await listing.getFilterOptionTexts())];
        console.log(`[S84] MSME filter options: ${JSON.stringify(options)}`);
        expect(options, 'MSME filter does not offer Yes').toContain('Yes');
        expect(options, 'MSME filter does not offer No').toContain('No');
        await listing.closeFilterPopupIfOpen();
    });

    test('filtering MSME = No returns only non-MSME invoices @Invoice @MSME @S84', async () => {
        const before = (await listing.getColumnValues(MSME)).filter(Boolean);
        console.log(`[S84] unfiltered MSME values: ${JSON.stringify([...new Set(before)])}`);

        await listing.applyColumnFilter(MSME, 'No');

        const after = (await listing.getColumnValues(MSME)).filter(Boolean);
        expect(after.length, 'filtering MSME = No returned no rows at all').toBeGreaterThan(0);
        for (const v of after) {
            expect(v, `a row reading "${v}" survived the MSME = No filter`).toBe('No');
        }
        console.log(`[S84] MSME = No → ${after.length} row(s), all "No"`);
    });

    test('filtering MSME = Yes never leaks a non-MSME invoice @Invoice @MSME @S84', async () => {
        await listing.applyColumnFilter(MSME, 'Yes');

        const after = (await listing.getColumnValues(MSME)).filter(Boolean);
        console.log(`[S84] MSME = Yes → ${after.length} row(s): ${JSON.stringify([...new Set(after)])}`);

        // An empty result is legitimate — this tenant may hold no MSME invoice —
        // so the assertion is about PURITY, not about finding matches. Asserting
        // "rows > 0" would fail on correct behaviour, and asserting nothing would
        // pass on a broken filter.
        for (const v of after) {
            expect(v, `MSME = Yes leaked a row reading "${v}"`).toBe('Yes');
        }

        if (!after.length) {
            // Prove the page is a real empty result rather than a crash.
            await listing.verifyPageNotCrashed();
            console.log('[S84] no MSME invoice exists in this tenant — filter returned a clean empty result');
        }
    });
});
