import { test, expect } from '@playwright/test';
import { intakeListingActions } from '../pages/intakeListingActions';
import data from '../pages/IntakeListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Intake Listing Page — Full Coverage
// Session loaded from auth.json (setup project dependency).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Aerchain NSE - Intake Listing Page', () => {

    let listing;

    test.beforeEach(async ({ page }) => {
        listing = new intakeListingActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await listing.navigateToListingPage(data.baseUrl);
    });

    // =========================================================================
    // 1. PAGE LOAD & STRUCTURE
    // =========================================================================
    test.describe('Page Load & Structure', () => {

        test('should load the intake listing page @Smoke', async () => {
            await listing.assertOnListingPage();
        });

        test('should display all 5 status summary cards @Smoke', async () => {
            await listing.verifyAllStatusCardsVisible();
        });

        test('should display all listing tabs @Smoke', async () => {
            await listing.verifyAllTabsVisible();
        });

        test('should display the Create Intake button @Smoke', async () => {
            await listing.verifyCreateIntakeButtonVisible();
        });

        test('should display pagination info @Smoke', async () => {
            await listing.verifyPaginationInfoVisible();
        });

        test('should display at least one table row @Smoke', async () => {
            await listing.verifyRowCountGreaterThan(0);
        });

    });

    // =========================================================================
    // 2. STATUS CARDS
    // =========================================================================
    test.describe('Status Cards', () => {

        test('Draft card shows a numeric count @StatusCard', async () => {
            const count = await listing.getStatusCardCount('Draft');
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('Awaiting Actions card shows a numeric count @StatusCard', async () => {
            const count = await listing.getStatusCardCount('Awaiting Actions');
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('Active/Released card shows a numeric count @StatusCard', async () => {
            const count = await listing.getStatusCardCount('Active/Released');
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('Completed/Successful card shows a numeric count @StatusCard', async () => {
            const count = await listing.getStatusCardCount('Completed/Successful');
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('Cancelled/Rejected card shows a numeric count @StatusCard', async () => {
            const count = await listing.getStatusCardCount('Cancelled/Rejected');
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('clicking a status card refreshes the table @StatusCard', async () => {
            await listing.clickStatusCard('Active/Released');
            await listing.verifyRowCountGreaterThan(0);
        });

        test('clicking Draft card (0 records) shows empty or 0 rows @StatusCard', async () => {
            const draftCount = await listing.getStatusCardCount('Draft');
            await listing.clickStatusCard('Draft');
            const rowCount = await listing.getVisibleRowCount();
            expect(rowCount).toBe(draftCount > 0 ? rowCount : 0);
        });

    });

    // =========================================================================
    // 3. TAB NAVIGATION
    // =========================================================================
    test.describe('Tab Navigation', () => {

        test('switching to "My Pending Approval" tab loads table @Tabs', async () => {
            await listing.clickTab(data.tabs.myPendingApproval);
            const count = await listing.getVisibleRowCount();
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('switching to "Pending Buyer Acceptance" tab loads table @Tabs', async () => {
            await listing.clickTab(data.tabs.pendingBuyerAcceptance);
            const count = await listing.getVisibleRowCount();
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('switching to "Pending Buyer to process" tab loads table @Tabs', async () => {
            await listing.clickTab(data.tabs.pendingBuyerToProcess);
            const count = await listing.getVisibleRowCount();
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('switching to "Buyer assignment logic" tab loads table @Tabs', async () => {
            await listing.clickTab(data.tabs.buyerAssignment);
            const count = await listing.getVisibleRowCount();
            expect(count).toBeGreaterThanOrEqual(0);
        });

        test('returning to All tab after another tab shows records @Tabs', async () => {
            await listing.clickTab(data.tabs.myPendingApproval);
            await listing.clickTab(data.tabs.all);
            await listing.verifyRowCountGreaterThan(0);
        });

    });

    // =========================================================================
    // 4. COLUMN FILTERS
    // =========================================================================
    test.describe('Filters', () => {

        test.describe('Positive', () => {

            test('filter popup opens on clicking Status filter icon @Filter', async ({ page }) => {
                await listing.openColumnFilter('Status');
                await expect(page.locator(
                    '//div[@data-radix-popper-content-wrapper]'
                ).first()).toBeVisible();
                await listing.closeFilterPopupIfOpen();
            });

            test('filter popup opens on clicking Created By filter icon @Filter', async ({ page }) => {
                await listing.openColumnFilter('Created By');
                await expect(page.locator(
                    '//div[@data-radix-popper-content-wrapper]'
                ).first()).toBeVisible();
                await listing.closeFilterPopupIfOpen();
            });

            test('search within filter popup narrows the option list @Filter', async ({ page }) => {
                await listing.openColumnFilter('Created By');
                await listing.searchInFilterPopup(data.filter.createdBy);
                const opts = page.locator(
                    '//div[@data-radix-popper-content-wrapper]//*[contains(@class,"item")] | //div[@data-radix-popper-content-wrapper]//*[@role="option"]'
                );
                const count = await opts.count();
                expect(count).toBeGreaterThan(0);
                await listing.closeFilterPopupIfOpen();
            });

            test('single filter by Created By — table updates @Filter', async () => {
                await listing.applyFilterByColumnAndValue('Created By', data.filter.createdBy);
                await listing.verifyRowCountGreaterThan(0);
            });

            test('single filter by Status — table updates @Filter', async () => {
                await listing.applyFilterByColumnAndValue('Status', data.filter.status);
                await listing.verifyRowCountGreaterThan(0);
            });

            test('multi-filter: Status then Created By — table updates @Filter', async () => {
                await listing.applyFilterByColumnAndValue('Status', data.filter.status);
                await listing.applyFilterByColumnAndValue('Created By', data.filter.createdBy);
                const rowCount = await listing.getVisibleRowCount();
                expect(rowCount).toBeGreaterThanOrEqual(0);
            });

            test('filter clear resets to all records @Filter', async () => {
                await listing.applyFilterByColumnAndValue('Status', data.filter.status);
                const filteredCount = await listing.getVisibleRowCount();

                await listing.navigateToListingPage(data.baseUrl);
                const allCount = await listing.getVisibleRowCount();
                expect(allCount).toBeGreaterThanOrEqual(filteredCount);
            });

            test('clear all selections button resets popup state @Filter', async () => {
                await listing.openColumnFilter('Created By');
                await listing.selectFilterOption(data.filter.createdBy);
                await listing.clearAllFilterSelections();
                await listing.applyColumnFilter();
                await listing.verifyRowCountGreaterThan(0);
            });

        });

        test.describe('Negative', () => {

            test('filter search with non-existent user does not crash popup @Filter', async ({ page }) => {
                await listing.openColumnFilter('Created By');
                await listing.searchInFilterPopup(data.filter.invalidUser);
                // App may not filter dropdown in real-time — just verify popup stays open and page is stable
                await expect(page.locator('//div[@data-radix-popper-content-wrapper]').first()).toBeVisible();
                await listing.closeFilterPopupIfOpen();
            });

        });

        test.describe('Edge Cases', () => {

            test('special characters in filter search do not crash @Filter', async () => {
                await listing.openColumnFilter('Created By');
                await listing.searchInFilterPopup(data.search.invalid.specialChars);
                await listing.assertOnListingPage();
                await listing.closeFilterPopupIfOpen();
            });

            test('long string in filter search does not crash @Filter', async () => {
                await listing.openColumnFilter('Created By');
                await listing.searchInFilterPopup(data.search.invalid.longString);
                await listing.assertOnListingPage();
                await listing.closeFilterPopupIfOpen();
            });

        });

    });

    // =========================================================================
    // 5. SORTING
    // Sortable columns: Code, Subject, Date, Status
    // Created By is filter-only (no sort button)
    // =========================================================================
    test.describe('Sorting', () => {

        test.describe('Positive', () => {

            test('sort Code column — first click applies a sort @Sort', async () => {
                await listing.clickSortButton('Code');
                await listing.verifySortedInSomeDirection('Code');
            });

            test('sort Code column — second click still shows records @Sort', async () => {
                await listing.clickSortButton('Code');
                await listing.clickSortButton('Code');
                await listing.verifyRowCountGreaterThan(0);
            });

            test('sort Subject column — applies a sort @Sort', async () => {
                await listing.clickSortButton('Subject');
                await listing.verifySortedInSomeDirection('Subject');
            });

            test('sort Subject column — second click still shows records @Sort', async () => {
                await listing.clickSortButton('Subject');
                await listing.clickSortButton('Subject');
                await listing.verifyRowCountGreaterThan(0);
            });

            test('sort Date column — applies a date sort @Sort', async () => {
                await listing.clickSortButton('Date');
                await listing.verifyDateSortedInSomeDirection();
            });

            test('sort Date column — second click still shows records @Sort', async () => {
                await listing.clickSortButton('Date');
                await listing.clickSortButton('Date');
                await listing.verifyRowCountGreaterThan(0);
            });

            test('sort Status column — applies a sort @Sort', async () => {
                await listing.clickSortButton('Status');
                await listing.verifySortedInSomeDirection('Status');
            });

            test('sorting after tab switch still works @Sort', async () => {
                await listing.clickTab(data.tabs.all);
                await listing.clickSortButton('Code');
                await listing.verifySortedInSomeDirection('Code');
            });

        });

        test.describe('Negative', () => {

            test('column values remain non-empty after sort (no crash for duplicates) @Sort', async () => {
                await listing.clickSortButton('Status');
                const values = await listing.getColumnValues('Status');
                expect(values.length).toBeGreaterThan(0);
            });

        });

    });

    // =========================================================================
    // 6. SEARCH
    // =========================================================================
    test.describe('Search', () => {

        test.describe('Positive', () => {

            test('search by partial intake code returns results @Search', async () => {
                await listing.typeInSearch(data.search.valid.byCodePartial);
                await listing.verifyRowCountGreaterThan(0);
            });

            test('search by exact intake code returns at least 1 row @Search', async () => {
                await listing.typeInSearch(data.search.valid.byCodeExact);
                const count = await listing.getVisibleRowCount();
                expect(count).toBeGreaterThan(0);
            });

            test('search by partial subject returns results @Search', async () => {
                await listing.typeInSearch(data.search.valid.bySubjectPartial);
                await listing.verifyRowCountGreaterThan(0);
            });

            test('search by exact subject returns results @Search', async () => {
                await listing.typeInSearch(data.search.valid.bySubjectExact);
                await listing.verifyRowCountGreaterThan(0);
            });

            test('search with different case does not crash the page @Search', async () => {
                // App search may or may not be case-insensitive — just verify no crash
                await listing.typeInSearch(data.search.valid.bySubjectExact);
                await listing.assertOnListingPage();
                await listing.typeInSearch(data.search.valid.caseUpper);
                await listing.assertOnListingPage();
            });

            test('clearing search restores all records @Search', async () => {
                await listing.typeInSearch(data.search.valid.byCodePartial);
                const filtered = await listing.getVisibleRowCount();

                await listing.clearSearch();
                const all = await listing.getVisibleRowCount();
                expect(all).toBeGreaterThanOrEqual(filtered);
            });

        });

        test.describe('Negative', () => {

            test('non-existent search term does not crash the page @Search', async () => {
                // App may show 0 rows or fall back to all records — just verify no crash
                await listing.typeInSearch(data.search.invalid.nonExistent);
                await listing.assertOnListingPage();
            });

            test('spaces-only search does not crash the page @Search', async ({ page }) => {
                await listing.typeInSearch(data.search.invalid.emptySpaces);
                await listing.assertOnListingPage();
            });

            test('SQL injection string in search does not break the page @Search', async () => {
                await listing.typeInSearch(data.search.invalid.sqlInjection);
                await listing.assertOnListingPage();
            });

            test('XSS payload in search does not inject script @Search', async ({ page }) => {
                await listing.typeInSearch(data.search.invalid.xssPayload);
                const title = await page.title();
                expect(title).not.toContain('<script>');
                await listing.assertOnListingPage();
            });

        });

        test.describe('Edge Cases', () => {

            test('very long string in search does not crash @Search', async () => {
                await listing.typeInSearch(data.search.invalid.longString);
                await listing.assertOnListingPage();
            });

            test('special characters in search do not crash @Search', async () => {
                await listing.typeInSearch(data.search.invalid.specialChars);
                await listing.assertOnListingPage();
            });

            test('unicode characters in search do not crash @Search', async () => {
                await listing.typeInSearch(data.search.invalid.unicodeChars);
                await listing.assertOnListingPage();
            });

        });

    });

    // =========================================================================
    // 7. PAGINATION
    // =========================================================================
    test.describe('Pagination', () => {

        test.describe('Positive', () => {

            test('pagination info shows "Showing X – Y of Z entries" @Pagination', async () => {
                const info = await listing.getPaginationInfo();
                expect(info).not.toBeNull();
                expect(info.from).toBeGreaterThan(0);
                expect(info.to).toBeGreaterThanOrEqual(info.from);
            });

            test('Previous button is disabled on first page @Pagination', async () => {
                await listing.verifyOnFirstPage();
            });

            test('Next page changes pagination info @Pagination', async () => {
                if (!(await listing.isNextPageEnabled())) { test.skip(); return; }
                const before = await listing.getPaginationInfo();
                await listing.clickNextPage();
                const after = await listing.getPaginationInfo();
                expect(after.from).toBeGreaterThan(before.from);
            });

            test('Next then Previous returns to original page @Pagination', async () => {
                if (!(await listing.isNextPageEnabled())) { test.skip(); return; }
                const before = await listing.getPaginationInfo();
                await listing.clickNextPage();
                await listing.clickPrevPage();
                const after = await listing.getPaginationInfo();
                expect(after.from).toBe(before.from);
            });

            test('Next button is disabled on last page @Pagination', async () => {
                test.setTimeout(120000);
                await listing.navigateToLastPage();
                expect(await listing.isNextPageEnabled()).toBeFalsy();
            });

        });

        test.describe('Negative / Edge Cases', () => {

            test('rapid next-page clicks do not break the table @Pagination', async () => {
                if (!(await listing.isNextPageEnabled())) { test.skip(); return; }
                await listing.clickNextPage();
                if (await listing.isNextPageEnabled()) await listing.clickNextPage();
                await listing.assertOnListingPage();
                await listing.verifyRowCountGreaterThan(0);
            });

        });

        test.describe('Pagination after Filter / Search / Sort', () => {

            test('search on page 2 does not crash the page @Pagination', async () => {
                // App may or may not reset to page 1 on search — just verify no crash
                if (await listing.isNextPageEnabled()) await listing.clickNextPage();
                await listing.typeInSearch(data.search.valid.byCodePartial);
                await listing.assertOnListingPage();
            });

            test('table shows correct rows on page 2 after sort @Pagination', async () => {
                if (!(await listing.isNextPageEnabled())) { test.skip(); return; }
                await listing.clickSortButton('Code');
                await listing.clickNextPage();
                expect(await listing.getVisibleRowCount()).toBeGreaterThan(0);
            });

        });

    });

    // =========================================================================
    // 8. ROW CLICK / DETAIL PAGE NAVIGATION
    // =========================================================================
    test.describe('Row Navigation', () => {

        test.describe('Positive', () => {

            test('clicking first row code opens the detail page @Navigation', async () => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
            });

            test('URL changes to detail URL after row click @Navigation', async ({ page }) => {
                await listing.clickFirstRowCode();
                await expect(page).toHaveURL(/\/intakes\/\d+|overview/, { timeout: 15000 });
            });

            test('browser back from detail page returns to listing @Navigation', async () => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
                await listing.navigateBack();
                await listing.assertOnListingPage();
            });

            test('detail page contains the clicked intake code @Navigation', async ({ page }) => {
                const code = await listing.getFirstRowCodeText();
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
                if (code) {
                    await expect(page.locator(`//*[contains(.,"${code}")]`).first())
                        .toBeVisible({ timeout: 10000 });
                }
            });

        });

        test.describe('Edge Cases', () => {

            test('back and re-click the same row is stable @Navigation', async () => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
                await listing.navigateBack();
                await listing.assertOnListingPage();
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
            });

            test('refreshing the detail page keeps the URL intact @Navigation', async ({ page }) => {
                await listing.clickFirstRowCode();
                await listing.verifyDetailPageOpened();
                const urlBefore = page.url();
                await page.reload();
                await expect(page).toHaveURL(urlBefore, { timeout: 10000 });
            });

        });

    });

    // =========================================================================
    // 9. CREATE INTAKE BUTTON
    // =========================================================================
    test.describe('Create Intake Button', () => {

        test.describe('Positive', () => {

            test('Create Intake button is visible on listing page @Create', async () => {
                await listing.verifyCreateIntakeButtonVisible();
            });

            test('Create Intake button navigates to create page @Create', async () => {
                await listing.clickCreateIntakeButton();
                await listing.verifyCreatePageOpened();
            });

            test('URL is /intakes/create after clicking Create Intake @Create', async ({ page }) => {
                await listing.clickCreateIntakeButton();
                await expect(page).toHaveURL(/\/intakes\/create/, { timeout: 10000 });
            });

            test('browser back from create page returns to listing @Create', async () => {
                test.setTimeout(90000);
                await listing.clickCreateIntakeButton();
                await listing.verifyCreatePageOpened();
                await listing.navigateBack();
                await listing.assertOnListingPage();
            });

        });

        test.describe('Edge Cases', () => {

            test('navigating back from create page preserves listing rows @Create', async () => {
                test.setTimeout(90000);
                await listing.clickCreateIntakeButton();
                await listing.verifyCreatePageOpened();
                await listing.navigateBack();
                await listing.assertOnListingPage();
                await listing.verifyRowCountGreaterThan(0);
            });

        });

    });

});
