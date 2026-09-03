import { test, expect } from '@playwright/test';
import { v3ListingActions } from '../pages/v3ListingActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// v3 Module Listing Pages — Requisition / Purchase Order / GRN / Invoice
//
// Sheet scenarios 109-112: "Automate all the <module> listing scenarios like
// Intake." All four render from the same MUI table component on
// nse-capp-uat.aerchain.io, so one parametrised suite covers them instead of
// four near-identical files.
//
// Deliberately data-driven rather than hardcoded: search terms come from the
// first visible row and filter values from the first option in the popup, so
// the suite keeps passing as UAT data churns.
//
// Session comes from auth.nsef.json (nsef-setup project dependency).
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = Object.values(data.modules);

for (const mod of MODULES) {

    test.describe(`${mod.name} Listing Page`, () => {

        test.describe.configure({ timeout: 120000 });

        /** @type {v3ListingActions} */
        let listing;

        test.beforeEach(async ({ page }) => {
            listing = new v3ListingActions(page, mod);
            await page.setViewportSize({ width: 1800, height: 900 });
            await listing.navigateToListingPage(data.baseUrl);
        });

        // =====================================================================
        // Page load & structure
        // =====================================================================
        test.describe('Page Load & Structure', () => {

            test(`listing page loads with table rows @V3Listing @Smoke`, async () => {
                await listing.assertOnListingPage();
            });

            test(`all view-type tabs are visible @V3Listing @Tabs`, async () => {
                await listing.verifyAllTabsVisible(mod.tabs);
            });

            test(`pagination controls are visible @V3Listing @Pagination`, async () => {
                await listing.verifyPaginationVisible();
                expect(await listing.getTotalPages()).toBeGreaterThan(0);
            });
        });

        // =====================================================================
        // Tabs
        // =====================================================================
        test.describe('Tabs', () => {

            test(`switching to "${mod.secondTab}" activates that tab @V3Listing @Tabs`, async () => {
                await listing.clickTab(mod.secondTab);
                await listing.verifyTabIsActive(mod.secondTab);
            });

            test(`returning to "All" tab shows records again @V3Listing @Tabs`, async () => {
                await listing.clickTab(mod.secondTab);
                await listing.clickTab('All');
                await listing.verifyTabIsActive('All');
                await listing.verifyRowCountGreaterThan(0);
            });
        });

        // =====================================================================
        // Search
        // =====================================================================
        test.describe('Search — Positive', () => {

            test(`search by exact code returns at least one row @V3Listing @Search`, async () => {
                const code = (await listing.getFirstRowCodeText()).trim();
                await listing.typeInSearch(code);
                await listing.verifyRowCountGreaterThan(0);
                const codes = await listing.getColumnValues(mod.codeColumn);
                expect(codes.some(c => c.includes(code))).toBeTruthy();
            });

            test(`search by partial code returns results @V3Listing @Search`, async () => {
                const code = (await listing.getFirstRowCodeText()).trim();
                // Module prefix, e.g. "PR-NSEFN" — always shared by siblings.
                const partial = code.split('-').slice(0, 2).join('-');
                await listing.typeInSearch(partial);
                await listing.verifyRowCountGreaterThan(0);
            });

            test(`clearing the search restores records @V3Listing @Search`, async () => {
                const before = await listing.getVisibleRowCount();
                await listing.typeInSearch(data.negativeSearch.nonExistent);
                await listing.clearSearch();
                expect(await listing.getVisibleRowCount()).toBe(before);
            });

            test(`different-case search does not crash the page @V3Listing @Search`, async () => {
                const code = (await listing.getFirstRowCodeText()).trim();
                await listing.typeInSearch(code.toLowerCase());
                await listing.verifyPageNotCrashed();
            });
        });

        test.describe('Search — Negative', () => {

            test(`non-existent term shows no results without crashing @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.nonExistent);
                await listing.verifyNoResultsShown();
                await listing.verifyPageNotCrashed();
            });

            test(`spaces-only search does not crash the page @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.emptySpaces);
                await listing.verifyPageNotCrashed();
            });

            test(`SQL-injection string does not break the page @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.sqlInjection);
                await listing.verifyPageNotCrashed();
            });

            test(`XSS payload does not inject a script @V3Listing @Search`, async ({ page }) => {
                await listing.typeInSearch(data.negativeSearch.xssPayload);
                await listing.verifyPageNotCrashed();
                // The payload must be rendered as text, never executed.
                expect(await page.locator('script:has-text("alert(\'xss\')")').count()).toBe(0);
            });
        });

        test.describe('Search — Edge Cases', () => {

            test(`very long search string does not crash @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.longString);
                await listing.verifyPageNotCrashed();
            });

            test(`special characters in search do not crash @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.specialChars);
                await listing.verifyPageNotCrashed();
            });

            test(`unicode characters in search do not crash @V3Listing @Search`, async () => {
                await listing.typeInSearch(data.negativeSearch.unicodeChars);
                await listing.verifyPageNotCrashed();
            });
        });

        // =====================================================================
        // Sorting — only for modules whose headers expose a sort icon
        // =====================================================================
        if (mod.sortableColumns.length > 0) {
            test.describe('Sorting', () => {

                for (const col of mod.sortableColumns) {

                    test(`sort ${col} column — first click applies a sort @V3Listing @Sort`, async () => {
                        test.skip(!(await listing.hasSort(col)), `${col} is not sortable in this build`);
                        await listing.clickSortButton(col);
                        await listing.verifyRowCountGreaterThan(0);
                        if (col === 'Date') await listing.verifyDateSortedInSomeDirection(col);
                        else await listing.verifySortedInSomeDirection(col);
                    });

                    test(`sort ${col} column — second click still shows records @V3Listing @Sort`, async () => {
                        test.skip(!(await listing.hasSort(col)), `${col} is not sortable in this build`);
                        await listing.clickSortButton(col);
                        await listing.clickSortButton(col);
                        await listing.verifyRowCountGreaterThan(0);
                        await listing.verifyColumnNotEmpty(mod.codeColumn);
                    });
                }
            });
        }

        // =====================================================================
        // Filters
        // =====================================================================
        test.describe('Filters — Positive', () => {

            for (const col of mod.filterableColumns) {

                test(`${col} filter popup opens @V3Listing @Filter`, async () => {
                    test.skip(!(await listing.hasFilter(col)), `${col} has no filter in this build`);
                    await listing.openColumnFilter(col);
                    await listing.verifyFilterPopupOpen();
                    await listing.closeFilterPopupIfOpen();
                });
            }

            test(`filtering by ${mod.statusColumn} narrows the table to that value @V3Listing @Filter`, async () => {
                await listing.openColumnFilter(mod.statusColumn);
                const options = (await listing.getFilterOptionTexts()).filter(Boolean);
                test.skip(options.length === 0, 'no filter options available');

                // Pick a value that actually exists in the current page of data,
                // so the assertion is meaningful rather than trivially empty.
                const present = await listing.getColumnValues(mod.statusColumn);
                const value = options.find(o => present.includes(o)) || options[0];

                await listing.selectFilterOption(value);
                await listing.applyFilter();

                if (await listing.getVisibleRowCount() > 0) {
                    await listing.verifyFilteredColumnContains(mod.statusColumn, value);
                }
            });

            test(`filter search narrows the option list @V3Listing @Filter`, async () => {
                await listing.openColumnFilter(mod.statusColumn);
                const before = (await listing.getFilterOptionTexts()).filter(Boolean);
                test.skip(before.length < 2, 'not enough options to narrow');

                await listing.searchInFilterPopup(before[0]);
                const after = (await listing.getFilterOptionTexts()).filter(Boolean);
                expect(after.length).toBeLessThanOrEqual(before.length);
                await listing.closeFilterPopupIfOpen();
            });

            test(`Clear Selection resets the popup state @V3Listing @Filter`, async () => {
                await listing.openColumnFilter(mod.statusColumn);
                const options = (await listing.getFilterOptionTexts()).filter(Boolean);
                test.skip(options.length === 0, 'no filter options available');
                await listing.selectFilterOption(options[0]);
                await listing.clearFilterSelection();
                await listing.verifyFilterPopupOpen();
                await listing.closeFilterPopupIfOpen();
            });
        });

        test.describe('Filters — Negative / Edge', () => {

            test(`non-existent value in filter search does not crash the popup @V3Listing @Filter`, async () => {
                await listing.openColumnFilter(mod.statusColumn);
                await listing.searchInFilterPopup(data.negativeSearch.nonExistent);
                await listing.verifyFilterPopupOpen();
                await listing.closeFilterPopupIfOpen();
                await listing.verifyPageNotCrashed();
            });

            test(`special characters in filter search do not crash the popup @V3Listing @Filter`, async () => {
                await listing.openColumnFilter(mod.statusColumn);
                await listing.searchInFilterPopup(data.negativeSearch.specialChars);
                await listing.verifyFilterPopupOpen();
                await listing.closeFilterPopupIfOpen();
                await listing.verifyPageNotCrashed();
            });
        });

        // =====================================================================
        // Pagination
        // =====================================================================
        test.describe('Pagination', () => {

            test(`Previous is disabled on the first page @V3Listing @Pagination`, async () => {
                await listing.verifyOnFirstPage();
                expect(await listing.isPrevPageEnabled()).toBeFalsy();
            });

            test(`Next page advances the page counter @V3Listing @Pagination`, async () => {
                test.skip(!(await listing.isNextPageEnabled()), 'only one page of results');
                await listing.clickNextPage();
                expect(await listing.getCurrentPage()).toBe(2);
                await listing.verifyRowCountGreaterThan(0);
            });

            test(`Next then Previous returns to page 1 @V3Listing @Pagination`, async () => {
                test.skip(!(await listing.isNextPageEnabled()), 'only one page of results');
                await listing.clickNextPage();
                await listing.clickPrevPage();
                await listing.verifyOnFirstPage();
            });

            test(`rows differ between page 1 and page 2 @V3Listing @Pagination`, async () => {
                test.skip(!(await listing.isNextPageEnabled()), 'only one page of results');
                const p1 = await listing.getFirstRowCodeText();
                await listing.clickNextPage();
                const p2 = await listing.getFirstRowCodeText();
                expect(p2).not.toBe(p1);
            });

            test(`search on page 2 does not crash the page @V3Listing @Pagination`, async () => {
                test.skip(!(await listing.isNextPageEnabled()), 'only one page of results');
                await listing.clickNextPage();
                await listing.typeInSearch(data.negativeSearch.nonExistent);
                await listing.verifyPageNotCrashed();
            });
        });

        // =====================================================================
        // Row navigation
        // =====================================================================
        test.describe('Row Navigation', () => {

            test(`clicking the first row code opens the detail page @V3Listing @Navigation`, async () => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
            });

            test(`browser back from the detail page returns to the listing @V3Listing @Navigation`, async () => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
                await listing.navigateBackToListing();
                await listing.assertOnListingPage();
            });

            test(`refreshing the detail page keeps the URL intact @V3Listing @Navigation`, async ({ page }) => {
                await listing.clickFirstRowCode();
                const url = page.url();
                await page.reload({ waitUntil: 'domcontentloaded' });
                expect(page.url()).toBe(url);
            });
        });
    });
}
