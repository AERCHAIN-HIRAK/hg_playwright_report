import { expect } from '@playwright/test';
import {
    extractColumnText,
    getRowCount,
    parsePaginationInfo,
    waitForTableLoad,
    allValuesContain,
} from '../utils/tableUtils';
import fs from 'fs';

// Page object for the RFX / Quote Request listing page (/quote-requests).
// Mirrors cxoListingActions but adapted for the RFX listing: a single "All" tab,
// columns Code / Subject / Date / Created By / Status / Approver Role(s) /
// Approver(s) / Quotes, and no "Create" button (RFXs come from sourcing).
// Verified live against nse-capp-v4-uat.aerchain.io/quote-requests.
const L = {
    // Toolbar search — a single text input (data-slot="input"); unlike the CXO
    // listing it is not collapsed behind an icon, so fill() works directly.
    searchInput: '//input[@data-slot="input" or contains(@placeholder,"Search")]',
    // Empty-state / "no rows" markers.
    tableNoData: '//tbody//*[contains(normalize-space(.),"No Data")] | //tbody/tr/td[@colspan] | //*[contains(normalize-space(.),"No results")] | //*[contains(normalize-space(.),"No records")]',
    // Column header buttons: first button = filter, last button = sort.
    filterBtn: (col) => `//th[normalize-space()="${col}"]//button[1]`,
    sortBtn:   (col) => `//th[normalize-space()="${col}"]//button[last()]`,
    // Radix popover used by the column filter.
    filterPopup:       '//div[@data-radix-popper-content-wrapper]',
    filterPopupSearch: '//div[@data-radix-popper-content-wrapper]//input',
    // Column cells (Code=1 Subject=2 Date=3 Created By=4 Status=5).
    col: (n) => `//tbody/tr/td[${n}]`,
    firstRowCodeLink: '(//tbody/tr)[1]/td[1]//a',
    firstRowCode:     '(//tbody/tr)[1]/td[1]',
    // Pagination (shared component).
    paginationInfo: '//p[contains(.,"Showing") and contains(.,"entries")]',
    paginationNext: '//nav[@aria-label="pagination"]//button[contains(.,"Next")]',
    paginationPrev: '//nav[@aria-label="pagination"]//button[contains(.,"Previous")]',
};

const COL_INDEX = {
    'Code': 1, 'Subject': 2, 'Date': 3, 'Created By': 4, 'Status': 5,
    'Approver Role(s)': 6, 'Approver(s)': 7, 'Quotes': 8,
};

export class rfxListingActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    async takeScreenshot(name) {
        await this.page.screenshot({ path: `screenshots/${name}_${Date.now()}.png`, fullPage: true });
    }

    // ── Navigation ───────────────────────────────────────────────────────────
    async navigateToListingPage(baseUrl = 'https://nse-capp-v4-uat.aerchain.io') {
        await this.page.goto(`${baseUrl}/quote-requests`);
        await this.waitForListingPageLoad();
    }

    async waitForListingPageLoad() {
        await this.page.waitForLoadState('domcontentloaded');
        // The listing shows a "Checking permissions..." loader before the table.
        await this.page.locator('table').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
        await waitForTableLoad(this.page).catch(() => {});
    }

    async assertOnListingPage() {
        await expect(this.page).toHaveURL(/\/quote-requests/);
    }

    // ── Search ───────────────────────────────────────────────────────────────
    _search() {
        return this.page.locator(`xpath=${L.searchInput}`).first();
    }

    async typeInSearch(term) {
        const input = this._search();
        await input.waitFor({ state: 'visible', timeout: 15000 });
        await input.fill(term);
        await input.press('Enter');
        await this.waitForListingPageLoad();
    }

    async clearSearch() {
        const input = this._search();
        await input.fill('');
        await input.press('Enter');
        await this.waitForListingPageLoad();
    }

    async verifyNoResultsShown() {
        await expect.poll(async () => {
            if (await this.page.locator(`xpath=${L.tableNoData}`).count() > 0) return true;
            return (await getRowCount(this.page)) === 0;
        }, { timeout: 10000 }).toBeTruthy();
    }

    /** The page must still be functional (table container present) after a search. */
    async verifyPageNotCrashed() {
        await expect(this.page.locator('//table | //tbody').first()).toBeVisible({ timeout: 10000 });
    }

    // ── Table ────────────────────────────────────────────────────────────────
    async getVisibleRowCount() {
        return await getRowCount(this.page);
    }

    async verifyRowCountGreaterThan(minCount) {
        expect(await this.getVisibleRowCount()).toBeGreaterThan(minCount);
    }

    async getColumnValues(colName) {
        return await extractColumnText(this.page, L.col(COL_INDEX[colName]));
    }

    async verifyColumnNotEmpty(colName) {
        await expect.poll(async () => (await this.getColumnValues(colName)).length,
            { timeout: 10000 }).toBeGreaterThan(0);
    }

    // ── Sorting ──────────────────────────────────────────────────────────────
    async clickSortButton(colName) {
        await this.page.locator(`xpath=${L.sortBtn(colName)}`).first().click({ timeout: 10000, force: true });
        await this.waitForListingPageLoad();
    }

    // ── Column Filters ───────────────────────────────────────────────────────
    async openColumnFilter(colName) {
        await this.page.locator(`xpath=${L.filterBtn(colName)}`).first().click();
        await this.page.locator(`xpath=${L.filterPopup}`).first().waitFor({ state: 'visible', timeout: 5000 });
    }

    async searchInFilterPopup(term) {
        await this.page.locator(`xpath=${L.filterPopupSearch}`).first().fill(term);
        await this.page.waitForTimeout(500);
    }

    async verifyFilterPopupOpen() {
        await expect(this.page.locator(`xpath=${L.filterPopup}`).first()).toBeVisible({ timeout: 8000 });
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    async hasPaginationInfo() {
        return (await this.page.locator(`xpath=${L.paginationInfo}`).count()) > 0;
    }

    async getPaginationInfo() {
        const text = await this.page.locator(`xpath=${L.paginationInfo}`).first().textContent();
        return parsePaginationInfo(text || '');
    }

    async isNextPageEnabled() {
        const next = this.page.locator(`xpath=${L.paginationNext}`).first();
        if (!(await next.count())) return false;
        return !(await next.isDisabled());
    }

    async isPrevPageEnabled() {
        const prev = this.page.locator(`xpath=${L.paginationPrev}`).first();
        if (!(await prev.count())) return false;
        return !(await prev.isDisabled());
    }

    async clickNextPage() {
        await this.page.locator(`xpath=${L.paginationNext}`).first().click();
        await this.waitForListingPageLoad();
    }

    // ── Row Navigation ───────────────────────────────────────────────────────
    async clickFirstRowCode() {
        const link = this.page.locator(`xpath=${L.firstRowCodeLink}`);
        if (await link.count() > 0) await link.first().click();
        else await this.page.locator(`xpath=${L.firstRowCode}`).first().click();
    }

    async verifyDetailPageOpened() {
        await expect(this.page).toHaveURL(/\/quote-requests\/[^\/]+/, { timeout: 15000 });
    }

    async navigateBackToListing() {
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
        await this.page.waitForURL(/\/quote-requests$/, { timeout: 15000 });
        await this.waitForListingPageLoad();
    }
}
