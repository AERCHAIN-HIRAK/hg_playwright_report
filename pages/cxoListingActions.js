import { expect } from '@playwright/test';
import { cxoListing_Locators as L } from './cxoListingLocators';
import {
    extractColumnText,
    getRowCount,
    parsePaginationInfo,
    waitForTableLoad,
    allValuesContain,
} from '../utils/tableUtils';
import fs from 'fs';

// Page object for the CXO Listing page (/cxos). Mirrors intakeListingActions
// but adapted for CXO (no status cards; CXO tabs/columns).
export class cxoListingActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    async takeScreenshot(name) {
        const timestamp = Date.now();
        await this.page.screenshot({ path: `screenshots/${name}_${timestamp}.png`, fullPage: true });
    }

    // ── locator maps ───────────────────────────────────────────────────────────

    _tabLocator(tabName) {
        return {
            'All':                 L.tab_All,
            'My Pending Approval': L.tab_MyPendingApproval,
            'Draft':               L.tab_Draft,
        }[tabName] || L.tab_All;
    }

    _sortBtnLocator(colName) {
        return {
            'Code':    L.sortBtn_Code,
            'Subject': L.sortBtn_Subject,
            'Date':    L.sortBtn_Date,
            'Status':  L.sortBtn_Status,
        }[colName];
    }

    _filterBtnLocator(colName) {
        return {
            'Date':                  L.filterBtn_Date,
            'Created By':            L.filterBtn_CreatedBy,
            'Status':                L.filterBtn_Status,
            'Approver Role(s)':      L.filterBtn_ApproverRoles,
            'Approver(s)':           L.filterBtn_Approvers,
            'Assigned Purchaser(s)': L.filterBtn_AssignedPurchasers,
            'Purchaser':             L.filterBtn_Purchaser,
        }[colName];
    }

    _colCellLocator(colName) {
        return {
            'Code':       L.col_AllCode,
            'Subject':    L.col_AllSubject,
            'Date':       L.col_AllDate,
            'Created By': L.col_AllCreatedBy,
            'Status':     L.col_AllStatus,
        }[colName];
    }

    // ── Navigation ──────────────────────────────────────────────────────────────

    async navigateToListingPage(baseUrl = 'https://nse-capp-v4-uat.aerchain.io') {
        await this.page.goto(`${baseUrl}/cxos`);
        await this.waitForListingPageLoad();
    }

    async waitForListingPageLoad() {
        await this.page.waitForLoadState('domcontentloaded');
        await waitForTableLoad(this.page);
    }

    async assertOnListingPage() {
        await expect(this.page).toHaveURL(/\/cxos/);
    }

    // ── Tabs ──────────────────────────────────────────────────────────────────

    async clickTab(tabName) {
        await this.page.locator(this._tabLocator(tabName)).filter({ visible: true }).first().click();
        await this.waitForListingPageLoad();
    }

    async verifyTabIsActive(tabName) {
        await expect(
            this.page.locator(L.tabActiveState(tabName)).filter({ visible: true }).first()
        ).toHaveAttribute('data-state', 'active');
    }

    async verifyAllTabsVisible() {
        for (const t of [L.tab_All, L.tab_MyPendingApproval, L.tab_Draft]) {
            await expect(this.page.locator(t).filter({ visible: true }).first()).toBeVisible();
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    async _focusSearch() {
        // The collapsed search has an icon overlay that intercepts pointer clicks
        // on the input — click the icon to expand the box first.
        const icon = this.page.locator(L.searchIcon).first();
        if (await icon.isVisible({ timeout: 2000 }).catch(() => false)) {
            await icon.click();
            await this.page.waitForTimeout(400);
        }
        const input = this.page.locator(L.searchInput).first();
        await input.waitFor({ state: 'visible', timeout: 5000 });
        return input;   // fill() focuses without a pointer click, so the overlay can't block it
    }

    async typeInSearch(searchTerm) {
        const input = await this._focusSearch();
        await input.fill(searchTerm);
        await input.press('Enter');
        await this.waitForListingPageLoad();
    }

    async clearSearch() {
        const input = await this._focusSearch();
        await input.fill('');
        await input.press('Enter');
        await this.waitForListingPageLoad();
    }

    async getSearchInputValue() {
        return await this.page.locator(L.searchInput).first().inputValue();
    }

    async verifyNoResultsShown() {
        // The table re-renders to the "No Data" state slightly after the search
        // fires, so poll rather than reading once (old rows linger briefly).
        await expect.poll(async () => {
            if (await this.page.locator(L.tableNoData).count() > 0) return true;
            return (await getRowCount(this.page)) === 0;
        }, { timeout: 10000 }).toBeTruthy();
    }

    /** The page must still be functional (table container present) after a search. */
    async verifyPageNotCrashed() {
        await expect(this.page.locator('//table | //tbody').first()).toBeVisible({ timeout: 10000 });
    }

    // ── Column Filters ────────────────────────────────────────────────────────

    async openColumnFilter(colName) {
        await this.page.locator(this._filterBtnLocator(colName)).first().click();
        await this.page.locator(L.filterPopup_Container).first().waitFor({ state: 'visible', timeout: 5000 });
    }

    async searchInFilterPopup(searchTerm) {
        await this.page.locator(L.filterPopup_SearchInput).fill(searchTerm);
    }

    async selectFilterOption(optionText) {
        await this.page.locator(L.filterPopup_Option).first().waitFor({ state: 'visible', timeout: 10000 });
        await this.page.locator(L.filterPopup_Container).getByText(optionText, { exact: true }).first().click();
    }

    async applyColumnFilter() {
        await this.page.locator(L.filterPopup_Apply).click();
        await this.waitForListingPageLoad();
    }

    async closeFilterPopupIfOpen() {
        const popup = this.page.locator(L.filterPopup_Container);
        if (await popup.count() > 0 && await popup.first().isVisible()) {
            await this.page.keyboard.press('Escape');
        }
    }

    async verifyFilterPopupOpen() {
        await expect(this.page.locator(L.filterPopup_Container).first()).toBeVisible({ timeout: 8000 });
    }

    async applyFilterByColumnAndValue(colName, optionValue) {
        await this.openColumnFilter(colName);
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
        await this.page.locator(sortBtn).first().click({ timeout: 10000, force: true });
        await this.waitForListingPageLoad();
    }

    async getColumnValues(colName) {
        return await extractColumnText(this.page, this._colCellLocator(colName));
    }

    async verifyColumnNotEmpty(colName) {
        await expect.poll(async () => (await this.getColumnValues(colName)).length,
            { timeout: 10000 }).toBeGreaterThan(0);
    }

    // ── Table ─────────────────────────────────────────────────────────────────

    async getVisibleRowCount() {
        return await getRowCount(this.page);
    }

    async verifyRowCountGreaterThan(minCount) {
        expect(await this.getVisibleRowCount()).toBeGreaterThan(minCount);
    }

    // ── Pagination ──────────────────────────────────────────────────────────────

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
        let guard = 0;
        while (await this.isNextPageEnabled() && guard < 30) {
            await this.clickNextPage();
            guard++;
        }
    }

    // ── Row Navigation ────────────────────────────────────────────────────────

    async getFirstRowCodeText() {
        return ((await this.page.locator(L.firstRow_Code).textContent()) || '').trim();
    }

    async clickFirstRowCode() {
        const link = this.page.locator(L.firstRow_CodeLink);
        if (await link.count() > 0) await link.first().click();
        else await this.page.locator(L.firstRow_Code).click();
    }

    async verifyDetailPageOpened() {
        await expect(this.page).toHaveURL(/\/cxos\/\d+|overview/, { timeout: 15000 });
    }

    async navigateBackToListing() {
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
        await this.page.waitForURL(/\/cxos$/, { timeout: 15000 });
        await this.page.locator('tbody tr td').first().waitFor({ state: 'visible', timeout: 30000 });
    }

    // ── Create CXO ──────────────────────────────────────────────────────────────

    async verifyCreateCxoButtonVisible() {
        await expect(this.page.locator(L.createCxoButton)).toBeVisible();
    }

    async clickCreateCxoButton() {
        await this.page.locator(L.createCxoButton).click();
    }

    async verifyCreatePageOpened() {
        await expect(this.page).toHaveURL(/\/cxos\/create/, { timeout: 10000 });
    }
}
