import { expect } from '@playwright/test';
import { v3Listing_Locators as L } from './v3ListingLocators';
import { isAscending, isDescending, isDateAscending, isDateDescending } from '../utils/tableUtils';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// v3ListingActions
//
// One page object for all four v3 (MUI) listing pages — Requisition, Purchase
// Order, GRN/Inwards and Invoice. They render from the same table component, so
// the only per-module differences are the URL slug, the tab names and which
// columns exist. Those are injected via the `module` config rather than
// duplicating a near-identical class four times.
//
// Counterpart to intakeListingActions / cxoListingActions, which cover the v4
// (shadcn) listings on a different domain.
// ─────────────────────────────────────────────────────────────────────────────

export const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

export class v3ListingActions {

    /**
     * @param {import('@playwright/test').Page} page
     * @param {{slug:string, name:string, detailPath:string}} moduleCfg
     */
    constructor(page, moduleCfg) {
        this.page = page;
        this.module = moduleCfg;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    async takeScreenshot(name) {
        await this.page.screenshot({
            path: `screenshots/v3_${this.module.slug}_${name}_${Date.now()}.png`,
            fullPage: true,
        });
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async navigateToListingPage(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForListingPageLoad();
    }

    /**
     * The table streams in after the shell paints, so waiting on `load` is not
     * enough — wait for either a data row or an explicit empty-state before any
     * assertion runs.
     */
    async waitForListingPageLoad(timeout = 30000) {
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0
                || /No\s*(Data|Records?)/i.test(document.body.innerText),
            null,
            { timeout },
        );
        // Settle the row-level renders that follow the first paint.
        await this.page.waitForTimeout(600);
    }

    async assertOnListingPage() {
        await expect(this.page).toHaveURL(new RegExp(`/${this.module.slug}`));
        expect(await this.getVisibleRowCount()).toBeGreaterThan(0);
    }

    async navigateBackToListing() {
        await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForListingPageLoad();
    }

    // ── Rows / columns ────────────────────────────────────────────────────────

    async getVisibleRowCount() {
        return this.page.locator(L.tableRows).count();
    }

    async verifyRowCountGreaterThan(n) {
        expect(await this.getVisibleRowCount()).toBeGreaterThan(n);
    }

    /** 1-based index of a column by its header label, or -1 when absent. */
    async getColumnIndex(colName) {
        return this.page.evaluate((col) => {
            const ths = [...document.querySelectorAll('th')];
            const i = ths.findIndex(t => (t.textContent || '').trim().startsWith(col));
            return i === -1 ? -1 : i + 1;
        }, colName);
    }

    async getColumnValues(colName) {
        const idx = await this.getColumnIndex(colName);
        if (idx === -1) return [];
        const cells = this.page.locator(L.cellsInColumn(idx));
        const n = await cells.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await cells.nth(i).innerText()) || '').trim());
        return out;
    }

    async verifyColumnNotEmpty(colName) {
        const vals = await this.getColumnValues(colName);
        expect(vals.length).toBeGreaterThan(0);
        expect(vals.every(v => v.length > 0)).toBeTruthy();
    }

    async getFirstRowCodeText() {
        return ((await this.page.locator(L.firstRowCodeLink).first().innerText()) || '').trim();
    }

    // ── Tabs ──────────────────────────────────────────────────────────────────

    async getTabNames() {
        const tabs = this.page.locator(L.tabs);
        const n = await tabs.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await tabs.nth(i).innerText()) || '').trim());
        return out;
    }

    async clickTab(name) {
        await this.page.locator(L.tabByName(name)).first().click();
        await this.page.waitForTimeout(2500);
    }

    async getActiveTabName() {
        const active = this.page.locator(L.activeTab).first();
        if (await active.count() === 0) return '';
        return ((await active.innerText()) || '').trim();
    }

    async verifyTabIsActive(name) {
        expect(await this.getActiveTabName()).toBe(name);
    }

    async verifyAllTabsVisible(expected) {
        const actual = await this.getTabNames();
        for (const t of expected) expect(actual).toContain(t);
    }

    // ── Search ────────────────────────────────────────────────────────────────

    async typeInSearch(text) {
        const input = this.page.locator(L.searchInput).first();
        await input.click();
        await input.fill(text);
        // Listing is debounced server-side; give the request time to land.
        await this.page.waitForTimeout(3000);
    }

    async clearSearch() {
        const input = this.page.locator(L.searchInput).first();
        await input.click();
        await input.fill('');
        await this.page.waitForTimeout(3000);
    }

    async getSearchInputValue() {
        return this.page.locator(L.searchInput).first().inputValue();
    }

    /**
     * A no-result search must render an empty table or an explicit empty state —
     * never a blank page or a crash overlay.
     */
    async verifyNoResultsShown() {
        const rows = await this.getVisibleRowCount();
        if (rows === 0) return;
        // Some builds keep a single placeholder row with a colspan cell.
        const placeholder = await this.page.locator(L.noDataRow).count();
        expect(placeholder).toBeGreaterThan(0);
    }

    /** Page is still alive: table chrome present and no unhandled-error screen. */
    async verifyPageNotCrashed() {
        await expect(this.page.locator(L.searchInput).first()).toBeVisible();
        const body = await this.page.locator('body').innerText();
        expect(body).not.toMatch(/Something went wrong|Unhandled|Application error/i);
    }

    // ── Sorting ───────────────────────────────────────────────────────────────

    async hasSort(colName) {
        return (await this.page.locator(L.sortIcon(colName)).count()) > 0;
    }

    async clickSortButton(colName) {
        await this.page.locator(L.sortIcon(colName)).first().click();
        await this.page.waitForTimeout(2500);
    }

    async verifySortedInSomeDirection(colName) {
        const vals = (await this.getColumnValues(colName)).filter(Boolean);
        expect(vals.length).toBeGreaterThan(0);
        expect(isAscending(vals) || isDescending(vals)).toBeTruthy();
    }

    async verifyDateSortedInSomeDirection(colName = 'Date') {
        const vals = (await this.getColumnValues(colName)).filter(Boolean);
        expect(vals.length).toBeGreaterThan(0);
        expect(isDateAscending(vals) || isDateDescending(vals)).toBeTruthy();
    }

    // ── Filters ───────────────────────────────────────────────────────────────

    async hasFilter(colName) {
        return (await this.page.locator(L.filterIcon(colName)).count()) > 0;
    }

    async openColumnFilter(colName) {
        await this.page.locator(L.filterIcon(colName)).first().click();
        await expect(this.page.locator(L.filterPopup_OK)).toBeVisible({ timeout: 10000 });
    }

    async isFilterPopupOpen() {
        return (await this.page.locator(L.openFilterPopup).count()) > 0;
    }

    async verifyFilterPopupOpen() {
        expect(await this.isFilterPopupOpen()).toBeTruthy();
    }

    async searchInFilterPopup(text) {
        await this.page.locator(L.filterPopup_Search).first().fill(text);
        await this.page.waitForTimeout(800);
    }

    async getFilterOptionTexts() {
        const opts = this.page.locator(L.filterPopup_Options);
        const n = await opts.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await opts.nth(i).innerText()) || '').trim());
        return out;
    }

    async selectFilterOption(value) {
        await this.page.locator(L.filterPopup_OptionByText(value)).first().click();
    }

    async applyFilter() {
        await this.page.locator(L.filterPopup_OK).first().click();
        await this.page.waitForTimeout(3500);
    }

    async clearFilterSelection() {
        await this.page.locator(L.filterPopup_Clear).first().click();
        await this.page.waitForTimeout(500);
    }

    async closeFilterPopupIfOpen() {
        if (await this.isFilterPopupOpen()) {
            await this.page.keyboard.press('Escape');
            await this.page.mouse.click(5, 5);
            await this.page.waitForTimeout(500);
        }
    }

    /** Open → tick one value → OK. */
    async applyColumnFilter(colName, value) {
        await this.openColumnFilter(colName);
        await this.selectFilterOption(value);
        await this.applyFilter();
    }

    async verifyFilteredColumnContains(colName, expectedValue) {
        const vals = (await this.getColumnValues(colName)).filter(Boolean);
        expect(vals.length).toBeGreaterThan(0);
        for (const v of vals) expect(v).toContain(expectedValue);
    }

    // ── Pagination ────────────────────────────────────────────────────────────

    async getCurrentPage() {
        const t = await this.page.locator(L.pagination_Current).first().innerText();
        return parseInt((t || '').trim(), 10);
    }

    async getTotalPages() {
        const t = await this.page.locator(L.pagination_Total).first().innerText();
        return parseInt((t || '').trim(), 10);
    }

    async verifyPaginationVisible() {
        await expect(this.page.locator(L.pagination_Current).first()).toBeVisible();
        await expect(this.page.locator(L.pagination_Total).first()).toBeVisible();
    }

    async isNextPageEnabled() {
        const cls = await this.page.locator(L.pagination_NextWrapper).first()
            .getAttribute('class').catch(() => '');
        return !!cls && !cls.includes('arrow-button-disabled');
    }

    async isPrevPageEnabled() {
        const cls = await this.page.locator(L.pagination_PrevWrapper).first()
            .getAttribute('class').catch(() => '');
        return !!cls && !cls.includes('arrow-button-disabled');
    }

    async clickNextPage() {
        await this.page.locator(L.pagination_Next).first().click();
        await this.page.waitForTimeout(3000);
    }

    async clickPrevPage() {
        await this.page.locator(L.pagination_Prev).first().click();
        await this.page.waitForTimeout(3000);
    }

    async verifyOnFirstPage() {
        expect(await this.getCurrentPage()).toBe(1);
    }

    // ── Row navigation ────────────────────────────────────────────────────────

    async clickFirstRowCode() {
        const code = await this.getFirstRowCodeText();
        await this.page.locator(L.firstRowCodeLink).first().click();
        await this.page.waitForTimeout(4000);
        return code;
    }

    async verifyDetailPageOpened() {
        await expect(this.page).toHaveURL(new RegExp(`${this.module.detailPath}/\\d+`));
    }
}
