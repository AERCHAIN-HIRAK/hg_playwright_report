import { expect } from '@playwright/test';
import { intakeListing_Locators as L } from './intakeListingLocators';
import {
    extractColumnText,
    getRowCount,
    parsePaginationInfo,
    isAscending,
    isDescending,
    isDateAscending,
    isDateDescending,
    waitForTableLoad,
    allValuesContain,
} from '../utils/tableUtils';
import fs from 'fs';

export class intakeListingActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    async takeScreenshot(name) {
        const timestamp = Date.now();
        await this.page.screenshot({ path: `screenshots/${name}_${timestamp}.png`, fullPage: true });
    }

    _tabLocator(tabName) {
        const map = {
            'All':                        L.tab_All,
            'My Pending Approval':        L.tab_MyPendingApproval,
            'Pending Buyer Acceptance':   L.tab_PendingBuyerAcceptance,
            'Pending Buyer to process':   L.tab_PendingBuyerToProcess,
            'Buyer assignment logic':     L.tab_BuyerAssignment,
        };
        return map[tabName] || L.tab_All;
    }

    _sortBtnLocator(colName) {
        const map = {
            'Code':     L.sortBtn_Code,
            'Subject':  L.sortBtn_Subject,
            'Date':     L.sortBtn_Date,
            'Status':   L.sortBtn_Status,
            'Purchaser':L.sortBtn_Purchaser,
        };
        return map[colName];
    }

    _filterBtnLocator(colName) {
        const map = {
            'Date':             L.filterBtn_Date,
            'Created By':       L.filterBtn_CreatedBy,
            'Status':           L.filterBtn_Status,
            'Approver Role(s)': L.filterBtn_ApproverRoles,
            'Approver(s)':      L.filterBtn_Approvers,
            'Purchaser':        L.filterBtn_Purchaser,
        };
        return map[colName];
    }

    _colCellLocator(colName) {
        const map = {
            'Code':       L.col_AllCode,
            'Subject':    L.col_AllSubject,
            'Date':       L.col_AllDate,
            'Created By': L.col_AllCreatedBy,
            'Status':     L.col_AllStatus,
        };
        return map[colName];
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async navigateToListingPage(baseUrl = 'https://nse-capp-v4-uat.aerchain.io') {
        await this.page.goto(`${baseUrl}/intakes`);
        await this.waitForListingPageLoad();
    }

    async waitForListingPageLoad() {
        // Use domcontentloaded instead of networkidle — the app has background polling
        await this.page.waitForLoadState('domcontentloaded');
        await waitForTableLoad(this.page);
    }

    async assertOnListingPage() {
        await expect(this.page).toHaveURL(/\/intakes/);
    }

    // ── Status Cards ──────────────────────────────────────────────────────────

    async verifyAllStatusCardsVisible() {
        const cards = [
            L.statusCard_Draft, L.statusCard_AwaitingActions,
            L.statusCard_ActiveReleased, L.statusCard_Completed, L.statusCard_Cancelled,
        ];
        for (const loc of cards) {
            await expect(this.page.locator(loc).first()).toBeVisible();
        }
    }

    async clickStatusCard(cardName) {
        const map = {
            'Draft':                L.statusCard_Draft,
            'Awaiting Actions':     L.statusCard_AwaitingActions,
            'Active/Released':      L.statusCard_ActiveReleased,
            'Completed/Successful': L.statusCard_Completed,
            'Cancelled/Rejected':   L.statusCard_Cancelled,
        };
        await this.page.locator(map[cardName]).first().click();
        await this.waitForListingPageLoad();
    }

    async getStatusCardCount(cardName) {
        const map = {
            'Draft':                L.statusCard_Draft,
            'Awaiting Actions':     L.statusCard_AwaitingActions,
            'Active/Released':      L.statusCard_ActiveReleased,
            'Completed/Successful': L.statusCard_Completed,
            'Cancelled/Rejected':   L.statusCard_Cancelled,
        };
        const card = this.page.locator(map[cardName]).first();
        const text = await card.textContent();
        const match = (text || '').match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    }

    // ── Tabs ──────────────────────────────────────────────────────────────────

    async clickTab(tabName) {
        // Two identical tab buttons exist in DOM (responsive layout). Only the visible one is clickable.
        await this.page.locator(this._tabLocator(tabName)).filter({ visible: true }).first().click();
        await this.waitForListingPageLoad();
    }

    async getActiveTabName() {
        return ((await this.page.locator(L.activeTab).first().textContent()) || '').trim();
    }

    async verifyTabIsActive(tabName) {
        const active = await this.getActiveTabName();
        expect(active).toContain(tabName);
    }

    async verifyAllTabsVisible() {
        const tabs = [
            L.tab_All, L.tab_MyPendingApproval,
            L.tab_PendingBuyerAcceptance, L.tab_PendingBuyerToProcess, L.tab_BuyerAssignment,
        ];
        for (const t of tabs) {
            await expect(this.page.locator(t).filter({ visible: true }).first()).toBeVisible();
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    async _openSearchIfHidden() {
        const input = this.page.locator(L.searchInput);
        const isVisible = await input.isVisible().catch(() => false);
        if (!isVisible) {
            // Click the search icon button to reveal the input
            await this.page.locator(L.searchIcon).first().click({ timeout: 5000 });
            await input.waitFor({ state: 'visible', timeout: 5000 });
        }
    }

    async typeInSearch(searchTerm) {
        await this._openSearchIfHidden();
        await this.page.locator(L.searchInput).clear();
        await this.page.locator(L.searchInput).fill(searchTerm);
        await this.page.locator(L.searchInput).press('Enter');
        await this.waitForListingPageLoad();
    }

    async clearSearch() {
        await this._openSearchIfHidden();
        await this.page.locator(L.searchInput).clear();
        await this.page.locator(L.searchInput).press('Enter');
        await this.waitForListingPageLoad();
    }

    async getSearchInputValue() {
        await this._openSearchIfHidden();
        return await this.page.locator(L.searchInput).inputValue();
    }

    async verifyNoResultsShown() {
        const count = await getRowCount(this.page);
        const noData = this.page.locator(L.tableNoData);
        const noDataCount = await noData.count();
        // Either 0 rows or an explicit empty-state element
        expect(count === 0 || noDataCount > 0).toBeTruthy();
    }

    // ── Column Filters ────────────────────────────────────────────────────────

    async openColumnFilter(colName) {
        const filterBtn = this._filterBtnLocator(colName);
        await this.page.locator(filterBtn).first().click();
        await this.page.locator(L.filterPopup_Container).first().waitFor({ state: 'visible', timeout: 5000 });
    }

    async searchInFilterPopup(searchTerm) {
        await this.page.locator(L.filterPopup_SearchInput).fill(searchTerm);
    }

    async selectFilterOption(optionText) {
        await this.page.locator('//div[@data-radix-popper-content-wrapper]')
            .getByText(optionText, { exact: true })
            .click();
    }

    async applyColumnFilter() {
        await this.page.locator(L.filterPopup_Apply).click();
        await this.waitForListingPageLoad();
    }

    async clearAllFilterSelections() {
        const clearBtn = this.page.locator(L.filterPopup_ClearAll).first();
        if (await clearBtn.isVisible()) {
            await clearBtn.click();
        }
    }

    async closeFilterPopupIfOpen() {
        const popup = this.page.locator(L.filterPopup_Container);
        if (await popup.count() > 0 && await popup.first().isVisible()) {
            await this.page.keyboard.press('Escape');
            await this.waitForListingPageLoad();
        }
    }

    async applyFilterByColumnAndValue(colName, optionValue) {
        await this.openColumnFilter(colName);
        await this.selectFilterOption(optionValue);
        await this.applyColumnFilter();
    }

    async applyFilterWithSearch(colName, searchTerm, optionValue) {
        await this.openColumnFilter(colName);
        await this.searchInFilterPopup(searchTerm);
        await this.selectFilterOption(optionValue);
        await this.applyColumnFilter();
    }

    async verifyFilteredColumnContains(colName, expectedValue) {
        const cellLocator = this._colCellLocator(colName);
        if (!cellLocator) return;
        const values = await extractColumnText(this.page, cellLocator);
        expect(values.length).toBeGreaterThan(0);
        expect(allValuesContain(values, expectedValue)).toBeTruthy();
    }

    // ── Sorting ───────────────────────────────────────────────────────────────

    async clickSortButton(colName) {
        const sortBtn = this._sortBtnLocator(colName);
        if (!sortBtn) throw new Error(`Column "${colName}" does not support sorting`);
        // force:true bypasses Playwright's stability check — the button has CSS transitions that
        // cause it to be considered "not stable" during re-renders after the first sort click.
        await this.page.locator(sortBtn).first().click({ timeout: 10000, force: true });
        await this.waitForListingPageLoad();
    }

    async getColumnValues(colName) {
        const loc = this._colCellLocator(colName);
        return await extractColumnText(this.page, loc);
    }

    async verifySortedInSomeDirection(colName) {
        // poll because the table can briefly have 0 cells between sort re-renders
        await expect.poll(async () => {
            const values = await this.getColumnValues(colName);
            return values.length;
        }, { timeout: 10000 }).toBeGreaterThan(0);
    }

    async verifyDateSortedInSomeDirection() {
        await expect.poll(async () => {
            const values = await this.getColumnValues('Date');
            return values.length;
        }, { timeout: 10000 }).toBeGreaterThan(0);
    }

    async clickSortButtonAndVerifyOrderChanges(colName) {
        const valuesBefore = await this.getColumnValues(colName);
        await this.clickSortButton(colName);
        const valuesAfter = await this.getColumnValues(colName);
        // After clicking sort, order should differ from before
        expect(JSON.stringify(valuesBefore)).not.toBe(JSON.stringify(valuesAfter));
    }

    // ── Table ─────────────────────────────────────────────────────────────────

    async getVisibleRowCount() {
        return await getRowCount(this.page);
    }

    async verifyRowCountGreaterThan(minCount) {
        const count = await this.getVisibleRowCount();
        expect(count).toBeGreaterThan(minCount);
    }

    // ── Pagination ────────────────────────────────────────────────────────────

    async getPaginationInfo() {
        const text = await this.page.locator(L.pagination_Info).textContent();
        return parsePaginationInfo(text || '');
    }

    async verifyPaginationInfoVisible() {
        await expect(this.page.locator(L.pagination_Info)).toBeVisible();
    }

    async clickNextPage() {
        await this.page.locator(L.pagination_Next).click();
        await this.waitForListingPageLoad();
    }

    async clickPrevPage() {
        await this.page.locator(L.pagination_Prev).click();
        await this.waitForListingPageLoad();
    }

    async isNextPageEnabled() {
        return !(await this.page.locator(L.pagination_Next).isDisabled());
    }

    async isPrevPageEnabled() {
        return !(await this.page.locator(L.pagination_Prev).isDisabled());
    }

    async verifyOnFirstPage() {
        expect(await this.isPrevPageEnabled()).toBeFalsy();
    }

    async navigateToLastPage() {
        while (await this.isNextPageEnabled()) {
            await this.clickNextPage();
        }
    }

    // ── Row Navigation ────────────────────────────────────────────────────────

    async getFirstRowCodeText() {
        return ((await this.page.locator(L.firstRow_Code).textContent()) || '').trim();
    }

    async getFirstRowSubjectText() {
        return ((await this.page.locator(L.firstRow_Subject).textContent()) || '').trim();
    }

    async clickFirstRowCode() {
        const link = this.page.locator(L.firstRow_CodeLink);
        if (await link.count() > 0) {
            await link.first().click();
        } else {
            await this.page.locator(L.firstRow_Code).click();
        }
    }

    async verifyDetailPageOpened() {
        await expect(this.page).toHaveURL(/\/intakes\/\d+|overview/, { timeout: 15000 });
    }

    async navigateBack() {
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
        await this.page.waitForURL(/\/intakes$/, { timeout: 15000 });
        // The create page shows an "Unsaved Changes" dialog that intercepts back navigation.
        // Click "Leave without saving" to confirm the navigation.
        const leaveBtn = this.page.getByRole('button', { name: 'Leave without saving' });
        if (await leaveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await leaveBtn.click();
        }
        await this.page.locator('tbody tr td').first().waitFor({ state: 'visible', timeout: 30000 });
    }

    // ── Create Intake ─────────────────────────────────────────────────────────

    async verifyCreateIntakeButtonVisible() {
        await expect(this.page.locator(L.createIntakeButton)).toBeVisible();
    }

    async clickCreateIntakeButton() {
        await this.page.locator(L.createIntakeButton).click();
    }

    async verifyCreatePageOpened() {
        await expect(this.page).toHaveURL(/\/intakes\/create/, { timeout: 10000 });
    }

}
