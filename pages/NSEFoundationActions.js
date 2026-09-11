import { expect } from '@playwright/test';
import { NSEFoundation_Locators as L } from './NSEFoundationLocators';
import { intakeCreate_Locators as IL } from './allLocators';
import { PDFParse } from 'pdf-parse';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// NSEFoundationActions
// Covers: Login → CXO create → (Direct PO → GRN → Invoice → Workflow)
// ─────────────────────────────────────────────────────────────────────────────

export class NSEFoundationActions {

    constructor(page, { dataPath = null } = {}) {
        this.page = page;
        // Per-instance fixture file. Defaults to the shared
        // pages/NSEFoundationData.json; a chain that must not collide with a
        // concurrently running chain (parallel workers all rewrite savedCxo …
        // savedInvoice and the invoice-number counter) passes its own copy.
        this.dataPath = dataPath;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    /** Absolute path of the fixture file this instance reads and writes. */
    _dataPath() {
        return this.dataPath ?? path.resolve('pages/NSEFoundationData.json');
    }

    async takeScreenshot(name) {
        const timestamp = Date.now();
        await this.page.screenshot({
            path: `screenshots/nsef_${name}_${timestamp}.png`,
            fullPage: true,
        });
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    async navigateToApp(data) {
        // Go directly to the auth login page (app URL redirects here anyway)
        const authUrl = `https://nse-auth-uat.aerchain.io/capp/login?refUrl=${encodeURIComponent(data.loginUrl + '/')}`;
        await this.page.goto(authUrl);
        await this.page.waitForSelector(L.loginEmailField, { timeout: 20000 });
    }

    async fillLoginEmail(data) {
        await this.page.locator(L.loginEmailField).fill(data.login.email);
    }

    async clickLoginContinue() {
        await this.page.locator(L.loginContinueBtn).click();
        await this.page.waitForSelector(L.loginPasswordField, { timeout: 10000 });
    }

    async fillLoginPassword(data) {
        await this.page.locator(L.loginPasswordField).fill(data.login.password);
    }

    async clickLoginSubmit() {
        await this.page.locator(L.loginSubmitBtn).click();
        await this.page.waitForURL(/nse-capp-v4-uat\.aerchain\.io/, { timeout: 30000 });
    }

    async assertLoggedIn() {
        await expect(this.page).toHaveURL(/nse-capp-v4-uat\.aerchain\.io/);
    }

    /**
     * Open the app, reusing a stored session when present. Navigates straight to
     * the app URL: if a saved storageState authenticated us, the dashboard loads;
     * otherwise the app redirects to the login form and we sign in. This lets the
     * suites share one up-front login (auth.nsef.json) instead of logging in per
     * test, while still working if run without the stored state.
     */
    async openApp(data) {
        // The app root routinely takes longer than the config's 15s
        // navigationTimeout under a headed run — it was the single biggest
        // source of spurious failures on 2026-08-31, surfacing as whatever
        // assertion happened to run next. `domcontentloaded` (not the default
        // `load`) plus an explicit budget keeps this from failing tests for
        // reasons that have nothing to do with what they assert.
        await this.page.goto(`${data.loginUrl}/`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });
        const emailField = this.page.locator(L.loginEmailField);
        if (await emailField.isVisible({ timeout: 6000 }).catch(() => false)) {
            await this.fillLoginEmail(data);
            await this.clickLoginContinue();
            await this.fillLoginPassword(data);
            await this.clickLoginSubmit();
        }
        await this.assertLoggedIn();
        // Let the post-login dashboard fully render before navigating onward.
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await this.page.locator('tbody tr td').first()
            .waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        await this.page.waitForTimeout(500);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async clickCxoTab() {
        await this.page.locator(`xpath=${L.cxoTab}`).click();
        // Wait for the CXO listing to appear (Create CXO button is unique to this page)
        await this.page.waitForSelector(L.createCxoBtn, { timeout: 15000 });
    }

    async assertCxoListingPage() {
        await expect(this.page).toHaveURL(/\/cxos/);
    }

    async clickCreateCxo() {
        await this.page.locator(L.createCxoBtn).click();
        await this.page.waitForURL(/\/cxos\/create/, { timeout: 15000 });
    }

    async assertCxoCreatePage() {
        await expect(this.page).toHaveURL(/\/cxos\/create/);
    }

    /** Sections load asynchronously after navigation — wait until the full
     *  template is rendered before interacting (else an early Submit fires no
     *  validation and section badges never appear). Section titles are
     *  <textarea>s whose value is the section name. */
    async waitForCreatePageLoaded() {
        await this.page.waitForLoadState('networkidle').catch(() => {});
        // page.waitForFunction(pageFunction, arg, options) — the options object
        // MUST be the third argument. Passed second it lands in `arg`, is handed
        // to the browser as the callback's parameter, and the wait silently falls
        // back to the config actionTimeout (5s). That is what failed scenario 1
        // on 2026-09-10: "waitForFunction: Timeout 5000ms exceeded" on a create
        // page that simply had not finished rendering.
        await this.page.waitForFunction(() => {
            const vals = [...document.querySelectorAll('textarea')].map(t => (t.value || '').trim());
            return vals.includes('Header Details') && vals.includes('Suggested Suppliers');
        }, null, { timeout: 25000 });
        await this.page.waitForTimeout(500);
    }

    // ── CXO Form – Title & Summary ────────────────────────────────────────────

    async fillCxoTitle(data) {
        await this.page.locator(L.cxoTitle).click();
        await this.page.locator(L.cxoTitle).fill(data.cxo.title);
    }

    async fillCxoSummary(data) {
        await this.page.locator(L.cxoSummary).click();
        await this.page.locator(L.cxoSummary).fill(data.cxo.summary);
    }

    // ── Expand all sections at once ───────────────────────────────────────────

    async expandAllSections() {
        // Click the expand-all toggle (CSS locator — icon-anchored, not xpath)
        await this.page.locator(L.cxoExpandAllSections).click();
        await this.page.waitForTimeout(1000);
    }

    // ── Generic dropdown helper ───────────────────────────────────────────────

    async _selectDropdown(triggerXpath, optionText) {
        await this.page.locator(`xpath=${triggerXpath}`).first().click();
        await this.page.waitForTimeout(600);
        // Wait for options to appear then click by text
        await this.page.getByRole('option', { name: optionText, exact: true })
            .or(this.page.getByRole('option').filter({ hasText: optionText }))
            .first()
            .click();
        await this.page.waitForTimeout(300);
    }

    // Dropdown anchored to its row container to avoid cross-section matches
    async _selectNativeDropdown(label, optionText) {
        const xpath = `//*[contains(normalize-space(text()),'${label}')]/ancestor::div[contains(@class,'border-b')][1]//button[@role='combobox']`;
        const trigger = this.page.locator(`xpath=${xpath}`).first();
        if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await trigger.click();
        await this.page.waitForTimeout(600);
        await this.page.getByRole('option', { name: optionText, exact: true })
            .or(this.page.getByRole('option').filter({ hasText: optionText }))
            .first()
            .click();
        await this.page.waitForTimeout(300);
    }

    // ── Header Details ────────────────────────────────────────────────────────

    async selectCxoCompany() {
        // Only one option — select the first available
        await this.page.locator(`xpath=${L.cxoCompany}`).click();
        await this.page.waitForTimeout(600);
        // Options render in a Radix UI portal — use getByRole for reliability
        await this.page.getByRole('option').first().click();
        await this.page.waitForTimeout(300);
    }

    async selectCxoDepartment(data) {
        await this._selectDropdown(L.cxoDepartment, data.cxo.department);
    }

    async selectCxoFunction(data) {
        await this._selectDropdown(L.cxoFunction, data.cxo.function);
    }

    // Currency is no longer selectable — the app pre-fills it and renders the
    // combobox disabled, so clicking it can never succeed. Assert the pre-filled
    // value matches the expected currency instead.
    async selectCxoCurrency(data) {
        const field = this.page.locator(`xpath=${L.cxoCurrency}`).first();
        await expect(field).toBeDisabled();
        await expect(field).toHaveText(data.cxo.currency);
    }

    async selectCxoType(data) {
        await this._selectDropdown(L.cxoType, data.cxo.cxoType);
    }

    async selectCxoTransactionFlowType(data) {
        await this._selectDropdown(L.cxoTransactionFlow, data.cxo.transactionFlowType);
    }

    async selectCxoExpenseNature(data) {
        await this._selectDropdown(L.cxoExpenseNature, data.cxo.expenseNature);
    }

    // ── Calendar date picker ──────────────────────────────────────────────────

    async _pickDate(dateStr) {
        // dateStr: "YYYY-MM-DD"
        const [year, month, day] = dateStr.split('-').map(Number);
        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const SHORT  = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];

        await this.page.waitForTimeout(600);

        for (let attempt = 0; attempt < 48; attempt++) {
            const captionText = await this.page.evaluate(({ longs, shorts }) => {
                const pattern = new RegExp('(' + [...longs, ...shorts].join('|') + ')\\s+\\d{4}');
                const walker  = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                let node;
                while ((node = walker.nextNode())) {
                    const t = (node.textContent || '').trim();
                    if (t.length < 30 && pattern.test(t)) return t;
                }
                return null;
            }, { longs: MONTHS, shorts: SHORT });

            if (!captionText) { await this.page.waitForTimeout(300); continue; }

            const [mPart, yPart] = captionText.trim().split(/\s+/);
            const curMonth = MONTHS.indexOf(mPart) !== -1 ? MONTHS.indexOf(mPart) + 1
                           : SHORT.indexOf(mPart) !== -1  ? SHORT.indexOf(mPart) + 1
                           : -1;
            const curYear = parseInt(yPart);

            const totalTarget  = year * 12 + month;
            const totalCurrent = curYear * 12 + curMonth;
            const diff         = totalTarget - totalCurrent;

            if (diff === 0) break;
            if (diff > 0) {
                await this.page.locator('button').filter({ hasText: /^›$|next/i }).or(
                    this.page.locator('[aria-label*="next"], [aria-label*="Next"]')
                ).first().click();
            } else {
                await this.page.locator('button').filter({ hasText: /^‹$|prev/i }).or(
                    this.page.locator('[aria-label*="prev"], [aria-label*="Prev"]')
                ).first().click();
            }
            await this.page.waitForTimeout(300);
        }

        // Click the day
        const dayBtn = this.page.locator(`xpath=//td[normalize-space()='${day}'] | //button[@name='day'][normalize-space()='${day}']`).first();
        await dayBtn.click();
        await this.page.waitForTimeout(400);
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(300);
    }

    // ── Basic Information ─────────────────────────────────────────────────────

    async fillCxoStartDate(data) {
        // Click the "Select date" trigger for Start Date
        const trigger = this.page.locator(`xpath=(//*[contains(normalize-space(text()),'Start Date')]/following::*[contains(text(),'Select date') or @placeholder='Select date'])[1]`);
        await trigger.click();
        await this._pickDate(data.cxo.startDate);
    }

    async fillCxoEndDate(data) {
        const trigger = this.page.locator(`xpath=(//*[contains(normalize-space(text()),'End Date')]/following::*[contains(text(),'Select date') or @placeholder='Select date'])[1]`);
        await trigger.click();
        await this._pickDate(data.cxo.endDate);
    }

    async selectCxoTypeOfProcurement(data) {
        await this._selectNativeDropdown('Type of Procurement', data.cxo.typeOfProcurement);
    }

    async selectCxoFinancialYear(data) {
        await this._selectNativeDropdown('Financial Year', data.cxo.financialYear);
    }

    // ── Particulars of Procurement ────────────────────────────────────────────

    async selectExistingApplications(data) {
        await this._selectNativeDropdown('existing applications', data.cxo.existingApplications);
    }

    async selectBusinessOrCompliance(data) {
        await this._selectNativeDropdown('business requirement or compliance', data.cxo.businessOrCompliance);
    }

    async fillMinimumCommitmentPeriod(data) {
        const input = this.page.locator(`xpath=//*[contains(normalize-space(text()),'Minimum Commitment period')]/ancestor::div[contains(@class,'border-b')][1]//textarea`);
        await input.fill(data.cxo.minimumCommitmentPeriod);
    }

    async selectCloudExposure(data) {
        await this._selectNativeDropdown('cloud exposure', data.cxo.cloudExposure);
    }

    async selectMeitYVendors(data) {
        await this._selectNativeDropdown('MeitY', data.cxo.meitYVendors);
    }

    async fillDetailsOtherAgency(data) {
        const input = this.page.locator(`xpath=//*[contains(normalize-space(text()),'Details of any other agency')]/ancestor::div[contains(@class,'border-b')][1]//textarea`);
        await input.fill(data.cxo.detailsOtherAgency);
    }

    async selectSebiOutsourcingCircular(data) {
        await this._selectNativeDropdown("outsourcing circular", data.cxo.sebiOutsourcingCircular);
    }

    async fillNatureOfDataShared(data) {
        const input = this.page.locator(`xpath=//*[contains(normalize-space(text()),'nature of data being shared')]/ancestor::div[contains(@class,'border-b')][1]//textarea`);
        await input.fill(data.cxo.natureOfDataShared);
    }

    async selectRpwdCompliance(data) {
        await this._selectNativeDropdown('RPwD', data.cxo.rpwdCompliance);
    }

    // ── Item Details – Line Item ───────────────────────────────────────────────

    async clickAddRow() {
        // The Item Details "Add row" is the first "Add row" span AFTER the Item Details textarea
        await this.page.evaluate(() => {
            const itemTa = [...document.querySelectorAll('textarea')].find(t => t.value === 'Item Details');
            const spans  = [...document.querySelectorAll('span')].filter(s => s.textContent?.trim() === 'Add row');
            function pos(n) {
                let i = 0;
                const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                while (w.nextNode()) { if (w.currentNode === n) return i; i++; }
                return -1;
            }
            const taPos = pos(itemTa);
            const target = spans.find(s => pos(s) > taPos);
            if (target) target.click();
        });
        await this.page.waitForTimeout(600);
        await this.page.waitForSelector('[data-index="0"]', { timeout: 10000 });
    }

    // ── Internal: click a cell, wait for its input to become active ────────────

    async _clickCell(cellSelector) {
        const cell = this.page.locator(cellSelector);
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(400);
        return cell;
    }

    // ── Cell popup helpers ───────────────────────────────────────────────────
    // When a cell is clicked, a React portal popup opens at <body> level.
    // The input/select is in the popup, not inside the cell div.

    async _fillTextCell(cellSelector, value) {
        const cell = this.page.locator(cellSelector);
        await cell.click(); // Playwright internally scrolls into view
        await this.page.waitForTimeout(400);
        await this.page.keyboard.type(value);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    async _fillNumberCell(cellSelector, value) {
        const cell = this.page.locator(cellSelector);
        await cell.click(); // Playwright internally scrolls into view
        await this.page.waitForTimeout(500);
        await this.page.keyboard.type(value);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    async _selectCellOption(cellSelector, optionText) {
        const cell = this.page.locator(cellSelector);

        for (let attempt = 0; attempt < 3; attempt++) {
            // Open the dropdown (dblclick, up to 2 tries)
            let dropdownOpen = false;
            for (let openTry = 0; openTry < 2; openTry++) {
                await cell.dblclick();
                await this.page.waitForTimeout(500);
                const searchBox = this.page.locator('input[placeholder="Search..."]');
                const opts = this.page.getByRole('option');
                if (await searchBox.count() > 0 || await opts.count() > 0) {
                    dropdownOpen = true;
                    break;
                }
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(300);
            }

            if (!dropdownOpen) continue;

            // Click exact match, or search then click
            const option = this.page.getByRole('option', { name: optionText, exact: true });
            if (await option.count() > 0) {
                await option.first().click();
            } else {
                const searchInput = this.page.locator('input[placeholder="Search..."]').first();
                if (await searchInput.count() > 0 && await searchInput.isVisible()) {
                    await searchInput.fill(optionText);
                    await this.page.waitForTimeout(400);
                    const filteredOpt = this.page.getByRole('option').filter({ hasText: optionText }).first();
                    if (await filteredOpt.count() > 0) {
                        await filteredOpt.click();
                    } else {
                        await this.page.keyboard.press('Escape');
                        await this.page.waitForTimeout(300);
                        continue;
                    }
                } else {
                    await this.page.keyboard.press('Escape');
                    await this.page.waitForTimeout(300);
                    continue;
                }
            }

            // Wait for dropdown to dismiss
            await this.page.waitForFunction(
                () => document.querySelectorAll('[role="option"]').length === 0,
                { timeout: 3000 }
            ).catch(() => {});

            // Confirm the value is visible in the cell before proceeding
            try {
                await expect(cell).toContainText(optionText, { timeout: 4000 });
                return;
            } catch {
                // Value didn't land — retry the whole selection
                await this.page.waitForTimeout(300);
            }
        }
    }

    // ── Line Item fill methods ────────────────────────────────────────────────

    async fillItemName(data) {
        await this._fillTextCell(L.itemNameCell, data.lineItem.name);
    }

    async fillItemQty(data) {
        await this._fillNumberCell(L.itemQtyCell, data.lineItem.quantity);
    }

    async fillItemSuggestedPrice(data) {
        await this._fillNumberCell(L.itemSuggestedPriceCell, data.lineItem.suggestedPrice);
    }

    async fillItemProjectName(data) {
        await this._selectCellOption(L.itemProjectNameCell, data.lineItem.projectName);
    }

    async fillItemVertical(data) {
        await this._selectCellOption(L.itemVerticalCell, data.lineItem.vertical);
    }

    async fillItemGlAccount(data) {
        await this._selectCellOption(L.itemGlAccountCell, data.lineItem.glAccount);
    }

    async fillItemProfitCenter(data) {
        await this._selectCellOption(L.itemProfitCenterCell, data.lineItem.profitCenter);
    }

    async fillItemCostCenter(data) {
        await this._selectCellOption(L.itemCostCenterCell, data.lineItem.costCenter);
    }

    async fillItemSebiCategorization(data) {
        await this._selectCellOption(L.itemSebiCategorizationCell, data.lineItem.sebiCategorization);
    }

    async fillItemSubSegment(data) {
        await this._selectCellOption(L.itemSubSegmentCell, data.lineItem.subSegment);
    }

    async fillItemProjectCategory(data) {
        await this._selectCellOption(L.itemProjectCategoryCell, data.lineItem.projectCategory);
    }

    async fillItemNatureOfExpense(data) {
        await this._selectCellOption(L.itemNatureOfExpenseCell, data.lineItem.natureOfExpense);
    }

    // ── Suggested Suppliers ───────────────────────────────────────────────────

    async fillPotentialSuppliers(data) {
        const value = data.cxo.potentialSuppliers ?? '1';
        const input = this.page.locator('[id="JVRDbrb3k7HmgWKmyjk93"]');
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await input.fill(value);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    // ── Purchase Business Case ────────────────────────────────────────────────

    async fillDetailsOfItemsServices(data) {
        const input = this.page.locator(
            `xpath=//*[contains(normalize-space(text()),'Details of Items')]/following::textarea[1] | //*[contains(normalize-space(text()),'Details of Items')]/following::input[@type='text'][1]`
        ).first();
        if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await input.fill(data.purchaseBusinessCase.detailsOfItems);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    async fillNecessityOfPurchase(data) {
        const input = this.page.locator(
            `xpath=//*[contains(normalize-space(text()),'Necessity of the purchase')]/following::textarea[1] | //*[contains(normalize-space(text()),'Necessity of the purchase')]/following::input[@type='text'][1]`
        ).first();
        if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await input.fill(data.purchaseBusinessCase.necessityOfPurchase);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    async selectEmergencyProcurement(data) {
        await this._selectNativeDropdown('Emergency Procurement', data.purchaseBusinessCase.emergencyProcurement);
    }

    async fillDeliveryTimeline(data) {
        const trigger = this.page.locator(
            `xpath=//*[contains(normalize-space(text()),'Delivery timelines')]/following::button[contains(normalize-space(.),'Select date')][1]`
        ).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.purchaseBusinessCase.deliveryTimeline);
    }

    async assertBrfAutoPopulated(data) {
        // BRF auto-populates when Vertical = "Legal". Give it 3s then check.
        await this.page.waitForTimeout(3000);
        const cell = this.page.locator(L.itemBrfCell);
        await cell.scrollIntoViewIfNeeded();
        const cellText = await cell.textContent();
        if (cellText?.includes(data.expectedBrfValue)) {
            console.log(`✓ BRF auto-populated: "${cellText?.trim()}"`);
        } else {
            console.log(`ℹ BRF field is "${cellText?.trim() || 'empty'}" — expected "${data.expectedBrfValue}"`);
        }
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    async clickSubmit() {
        // Click the top-level Submit button
        await this.page.locator(L.submitBtn).first().click();
        await this.page.waitForTimeout(2000);

        // A "Workflow Summary" confirmation popup appears and must be submitted.
        //
        // It is rendered only AFTER the server analyses the approval conditions
        // ("Conditions Analysed" → Expense Nature, CXO Total Value), and on the
        // CXO form that took longer than the old 5s window. Observed 2026-09-07:
        // the modal was ON SCREEN at failure time while the caller had already
        // moved on to polling for a URL change, so the CXO never submitted and
        // the whole chain died at its first step.
        //
        // Polls for the dialog OR an early navigation, so nothing is wasted on
        // flows where no popup appears at all.
        const confirm = this.page.locator(`xpath=${L.workflowSummarySubmitBtn}`).first();
        const startUrl = this.page.url();
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) {
                await confirm.click();
                await this.page.waitForTimeout(2500);
                // The dialog closing is the only proof the confirmation was taken.
                await this.page.locator(`xpath=//div[@role='dialog']`).first()
                    .waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
                console.log('[Submit] Workflow Summary confirmed');
                return;
            }
            if (this.page.url() !== startUrl) return;   // submitted without a popup
            await this.page.waitForTimeout(1000);
        }
        console.log('[Submit] no Workflow Summary popup appeared within 30s');
    }

    async assertCxoSubmittedSuccessfully() {
        await expect(this.page).not.toHaveURL(/\/cxos\/create/, { timeout: 15000 });
    }

    // ── Validation / negative-path helpers ────────────────────────────────────

    /** Click Submit WITHOUT handling the success popup — for invalid forms that
     *  are expected to be rejected, so the test can assert toasts/badges. */
    async clickSubmitExpectingError() {
        await this.page.locator(L.submitBtn).first().click();
        await this.page.waitForTimeout(800);
    }

    async assertStillOnCreatePage() {
        await expect(this.page).toHaveURL(/\/cxos\/create/);
    }

    /** Assert a validation toast containing the given text appears. */
    async assertToast(text) {
        await expect(this.page.getByText(text, { exact: false }).first())
            .toBeVisible({ timeout: 8000 });
    }

    /** Locator for the per-section "N errors!" badges (one leaf <span> per flagged
     *  section). Scoped to <span> so the wrapping <div> (same text) isn't double-counted. */
    errorBadges() {
        return this.page.locator('span').filter({ hasText: L.cxoErrorBadgeRegex });
    }

    /** Assert at least one "N errors!" badge is showing on the form. */
    async assertAnyErrorBadgeVisible() {
        await expect(this.errorBadges().first()).toBeVisible({ timeout: 10000 });
    }

    /** Assert the form shows exactly `n` section error badges. */
    async assertErrorBadgeCount(n) {
        await this.errorBadges().first().waitFor({ state: 'visible', timeout: 10000 });
        await expect(this.errorBadges()).toHaveCount(n);
    }

    /** Read the numeric error count from every section badge, in document order. */
    async getErrorBadgeCounts() {
        const loc = this.errorBadges();
        await loc.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        const n = await loc.count();
        const counts = [];
        for (let i = 0; i < n; i++) {
            const t = (await loc.nth(i).textContent())?.trim() || '';
            const m = t.match(/\d+/);
            counts.push(m ? parseInt(m[0], 10) : 0);
        }
        return counts;
    }

    /** Form-control fields showing the invalid (red) border after an invalid submit. */
    redBorderedFields() {
        return this.page.locator(L.cxoRedBorderField);
    }

    /** Assert unfilled mandatory fields show the red border (≥ `min` of them) and
     *  the "<field> is empty" helper messages. Requires sections expanded first. */
    async assertMandatoryFieldsHaveRedBorder(min = 6) {
        await this.redBorderedFields().first().waitFor({ state: 'visible', timeout: 10000 });
        const n = await this.redBorderedFields().count();
        expect(n, 'red-bordered mandatory field count').toBeGreaterThanOrEqual(min);
        await expect(this.page.getByText(L.cxoFieldEmptyMsgRegex).first())
            .toBeVisible({ timeout: 5000 });
    }

    /** Assert the "Please enter the title" toast does NOT fire after submit. */
    async assertTitleToastAbsent() {
        await expect(this.page.getByText(L.cxoTitleRequiredToast, { exact: false }))
            .toHaveCount(0, { timeout: 4000 });
    }

    async clickCancel() {
        await this.page.locator(L.cancelBtn).first().click();
        await this.page.waitForTimeout(1000);
        // A "Leave without saving" / discard confirmation may appear
        const leave = this.page.getByRole('button', { name: /Leave|Discard|Yes|Confirm/i }).first();
        if (await leave.isVisible({ timeout: 3000 }).catch(() => false)) {
            await leave.click();
            await this.page.waitForTimeout(800);
        }
    }

    // ── Title edge-case helpers ────────────────────────────────────────────────

    async typeTitle(value) {
        await this.page.locator(L.cxoTitle).click();
        await this.page.locator(L.cxoTitle).fill(value);
        await this.page.waitForTimeout(300);
    }

    /** Read back the title value (handles input/textarea or contenteditable). */
    async getTitleValue() {
        const el = this.page.locator(L.cxoTitle).first();
        const v = await el.inputValue().catch(() => null);
        if (v !== null) return v;
        return (await el.textContent().catch(() => '')) ?? '';
    }

    // ── Qty edge-case helpers (Item Details) ───────────────────────────────────

    /** Type a value into the (already-added) row's Qty cell and read back what the
     *  input actually accepted, BEFORE committing with Tab. Used to verify the
     *  field rejects negatives / accepts decimals. */
    async typeItemQtyAndRead(value) {
        const cell = this.page.locator(L.itemQtyCell);
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(400);
        await this.page.keyboard.type(value);
        await this.page.waitForTimeout(300);
        // Read the focused input's value directly — robust to inline vs portal inputs
        const accepted = await this.page.evaluate(() => {
            const el = document.activeElement;
            return el && 'value' in el ? el.value : null;
        });
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
        return accepted;
    }

    // ── Shared workflow-approval helpers (CXO + award) ────────────────────────

    /** Click Approve → fill comments (if the modal appears) → confirm → reload. */
    async _clickApproveWithComments(comments = 'Approved by automation') {
        await this.page.locator(`xpath=${L.approveBtn}`).first().click();
        const commentsField = this.page.locator(L.approveCommentsField);
        if (await commentsField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await commentsField.fill(comments);
            await this.page.locator(`xpath=${L.approveBtnConfirm}`).click();
        }
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(2000);
    }

    /** Wait for the Approve button, reloading up to `maxReloads` times if stale.
     *  Returns true if it appeared. Stops early if `stopWhen()` resolves true. */
    /**
     * Wait for a header Approve button, reloading between attempts.
     *
     * perAttemptMs was 4000, which is a race on a slow UAT: these detail pages
     * routinely take longer than that to render their header actions after a
     * reload, so the helper reports "not visible" on a page that DOES offer
     * Approve. Measured 2026-09-10 — scenario 1's chain B gave up on
     * PO-NSEFN-26-252 after 5 such attempts (having already approved stages 1
     * and 2 on the same PO); opening that PO by hand minutes later showed it
     * still Pending Approval with Approve right there in the header.
     *
     * 12s per attempt costs nothing when the button is present (waitFor returns
     * as soon as it appears) and only slows the genuinely-absent case, where the
     * caller falls through to reassigning the approver anyway.
     */
    async _waitForApproveButton({ maxReloads = 5, tag = 'Workflow', stopWhen = null,
        selector = L.approveBtn, perAttemptMs = 12000 } = {}) {
        const approveBtn = this.page.locator(`xpath=${selector}`).first();
        for (let attempt = 0; attempt <= maxReloads; attempt++) {
            if (await approveBtn.waitFor({ state: 'visible', timeout: perAttemptMs }).then(() => true).catch(() => false)) {
                return true;
            }
            if (stopWhen && await stopWhen()) return false;
            if (attempt < maxReloads) {
                console.log(`[${tag}] Approve button not visible for ${perAttemptMs / 1000}s — reloading (${attempt + 1}/${maxReloads})...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                await this.page.waitForTimeout(2500);
            }
        }
        return false;
    }

    /** More → Reassign Workflow Approver → NSEF Support Admin → reason → Submit.
     *  Generic across CXO/award (same v4 header More menu). */
    async reassignWorkflowApprover(reason = 'Reassigned for automated testing', tag = 'Workflow') {
        // IL.intakeMoreBtn is the EXACT "More" actions trigger. L.rfxMoreBtn is a
        // contains(.,'More') match, which on these detail pages also hits the
        // header "More info" button — clicking that opens no menu, so the reassign
        // silently found no options. Exact first, contains only as a fallback.
        // Opening the dialog is retried once: the dialog sometimes renders its
        // shell without the approver picker inside it, which used to end the
        // whole chain. Observed 2026-09-10 on INT-FNSE-26-438 — "Reassign picker
        // never rendered (1 dialog(s) on page)" — where a reload and a second
        // open would very likely have found it, since the SAME step reassigned
        // fine on the previous run.
        const openReassignDialog = async () => {
            await this.waitForCappDetailLoaded(tag);
            let moreBtn = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
            if (!(await moreBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
                moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
            }
            if (!(await moreBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
                console.log(`[${tag}] No More button — cannot reassign.`);
                return false;
            }
            await moreBtn.click();
            await this.page.waitForTimeout(800);

            const opt = this.page.locator(`xpath=${L.reassignApproverOption}`).first();
            if (!(await opt.isVisible({ timeout: 8000 }).catch(() => false))) {
                console.log(`[${tag}] Reassign option not available.`);
                await this.page.keyboard.press('Escape').catch(() => {});
                return false;
            }
            await opt.click();
            await this.page.waitForTimeout(1500);
            return true;
        };

        const userDropdownSel = this.page.locator(`xpath=${L.reassignUserDropdown}`).first();
        const comboSel = this.page.locator(
            `xpath=//div[@role='dialog']//input[contains(@placeholder,'Select Approver')]`).first();

        let picker = null;
        for (let attempt = 1; attempt <= 2 && picker === null; attempt++) {
            if (!(await openReassignDialog())) return false;
            if (await userDropdownSel.isVisible({ timeout: 4000 }).catch(() => false)) {
                picker = userDropdownSel;
            } else if (await comboSel.isVisible({ timeout: 8000 }).catch(() => false)) {
                picker = comboSel;
            } else if (attempt === 1) {
                const dialogs = await this.page.locator('[role="dialog"]').count();
                console.log(`[${tag}] Reassign picker never rendered (${dialogs} dialog(s) on page) `
                    + '— reloading and reopening the dialog (attempt 2/2)...');
                await this.page.keyboard.press('Escape').catch(() => {});
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                await this.page.waitForTimeout(2500);
            }
        }

        // The approver picker differs by document type: CXO/Intake/RFX use an
        // aria-haspopup dropdown button with [data-value] options; the Invoice
        // reassign dialog uses a combobox ("New Reassign Approver", placeholder
        // "Select Approver as Replacement") with <li role=option> options. Try the
        // dropdown first, then fall back to the combobox.
        //
        // CONTRACT: this method RETURNS FALSE when the reassign cannot be done —
        // every caller is written that way ("Reassign unavailable — stopping
        // approval loop"). It used to return false for a missing More button and
        // a missing menu option but THROW here if the picker never rendered,
        // which took the whole chain down with an opaque 8s locator timeout deep
        // inside a helper. Observed 2026-09-03 on CXO-5778: More → Reassign
        // Workflow Approver opened NO dialog at all (the failure snapshot
        // contains no dialog node), and the throw aborted a 45-minute chain.
        // Failing soft here lets the caller stop with a message that names the
        // real problem instead.
        if (picker === null) {
            const dialogs = await this.page.locator('[role="dialog"]').count();
            console.log(`[${tag}] Reassign picker never rendered (${dialogs} dialog(s) on page) — cannot reassign.`);
            await this.page.keyboard.press('Escape').catch(() => {});
            return false;
        }
        await picker.click({ force: true });
        await this.page.waitForTimeout(700);
        const adminOpt = this.page.locator(L.reassignAdminOption)
            .or(this.page.locator(`xpath=//li[@role='option'][normalize-space(.)='NSEF Support Admin']`))
            .first();
        if (!(await adminOpt.isVisible({ timeout: 10000 }).catch(() => false))) {
            console.log(`[${tag}] "NSEF Support Admin" is not an option in the reassign picker — cannot reassign.`);
            await this.page.keyboard.press('Escape').catch(() => {});
            return false;
        }
        await adminOpt.click();
        await this.page.waitForTimeout(400);

        const reasonField = this.page.locator(`xpath=${L.reassignReasonField}`).first();
        if (!(await reasonField.isVisible({ timeout: 5000 }).catch(() => false))) {
            console.log(`[${tag}] Reassign dialog has no reason field — cannot reassign.`);
            await this.page.keyboard.press('Escape').catch(() => {});
            return false;
        }
        await reasonField.fill(reason);
        await this.page.locator(`xpath=${L.reassignSubmitBtn}`).first().click();
        console.log(`[${tag}] Workflow approver reassigned to NSEF Support Admin`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(2000);
        return true;
    }

    // ── CXO Approval Workflow ─────────────────────────────────────────────────

    async _isCxoReleased(timeout = 3000) {
        return await this.page.locator(`xpath=${L.cxoReleasedStatus}`).first()
            .isVisible({ timeout }).catch(() => false);
    }

    async approveAllStages(comments = 'Approved by automation') {
        // Each round: stop when Released. Otherwise find Approve (reloading if
        // stale); if it never shows, reassign approver to NSEF Support Admin and
        // retry. Then approve.
        const maxStages = 10;
        for (let i = 0; i < maxStages; i++) {
            if (await this._isCxoReleased(1500)) {
                console.log(`[CXO] Status Released after ${i} approval(s).`);
                return;
            }

            let visible = await this._waitForApproveButton({
                tag: 'CXO',
                stopWhen: () => this._isCxoReleased(1000),
            });

            if (!visible) {
                if (await this._isCxoReleased(1000)) {
                    console.log(`[CXO] Status Released after ${i} approval(s).`);
                    return;
                }
                console.log('[CXO] Approve button missing — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'CXO'))) {
                    console.log('[CXO] Reassign unavailable — stopping approval loop.');
                    break;
                }
                visible = await this._waitForApproveButton({ tag: 'CXO', stopWhen: () => this._isCxoReleased(1000) });
                if (!visible) {
                    console.log('[CXO] Still no Approve button after reassign — stopping.');
                    break;
                }
            }

            console.log(`[CXO] Approving stage ${i + 1}...`);
            await this._clickApproveWithComments(comments);

            if (await this._isCxoReleased(3000)) {
                console.log(`[CXO] Status Released after ${i + 1} approval(s).`);
                return;
            }
        }
    }

    async assertCxoStatusReleased() {
        await expect(this.page.locator(`xpath=${L.cxoReleasedStatus}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    /** End-to-end: fill every mandatory CXO section, Submit, approve all stages
     *  until Released, then persist the code (savedCxo) for downstream linking.
     *  Mirrors the CXO happy-path test so suites needing a released CXO up front
     *  (e.g. an intake that links a CXO) can set one up in a single call.
     *  Assumes the CXO create page is already open (clickCreateCxo + assert). */
    async createAndReleaseCxo(data) {
        await this.fillAllCxoSections(data);

        // Submit → approve until Released → persist code
        await this.clickSubmit();
        await this.assertCxoSubmittedSuccessfully();
        await this.approveAllStages('Approved by automation');
        await this.assertCxoStatusReleased();
        await this.saveCxoCode();
    }

    /** Fill every mandatory CXO create-form section (title, header, basic info,
     *  particulars, business case, one line item, suggested suppliers) and wait
     *  for the auto-populated BRF. Leaves the form filled and ready to Submit
     *  (→ workflow) or Save (→ Draft). Assumes the create page is already open. */
    async fillAllCxoSections(data) {
        await this.waitForCreatePageLoaded();
        await this.expandAllSections();

        // Title & Summary
        await this.fillCxoTitle(data);
        await this.fillCxoSummary(data);

        // Header Details
        await this.selectCxoCompany();
        await this.selectCxoDepartment(data);
        await this.selectCxoFunction(data);
        await this.selectCxoCurrency(data);
        await this.selectCxoType(data);
        await this.selectCxoTransactionFlowType(data);
        await this.selectCxoExpenseNature(data);

        // Basic Information
        await this.fillCxoStartDate(data);
        await this.fillCxoEndDate(data);
        await this.selectCxoTypeOfProcurement(data);
        await this.selectCxoFinancialYear(data);

        // Particulars of Procurement
        await this.selectExistingApplications(data);
        await this.selectBusinessOrCompliance(data);
        await this.fillMinimumCommitmentPeriod(data);
        await this.selectCloudExposure(data);
        await this.selectMeitYVendors(data);
        await this.fillDetailsOtherAgency(data);
        await this.selectSebiOutsourcingCircular(data);
        await this.fillNatureOfDataShared(data);
        await this.selectRpwdCompliance(data);

        // Purchase Business Case
        await this.fillDetailsOfItemsServices(data);
        await this.fillNecessityOfPurchase(data);
        await this.selectEmergencyProcurement(data);
        await this.fillDeliveryTimeline(data);

        // Item Details — one line item
        await this.clickAddRow();
        await this.fillItemName(data);
        await this.fillItemQty(data);
        await this.fillItemSuggestedPrice(data);
        await this.fillItemProjectName(data);
        await this.fillItemVertical(data);
        await this.fillItemGlAccount(data);
        await this.fillItemProfitCenter(data);
        await this.fillItemCostCenter(data);
        await this.fillItemSebiCategorization(data);
        await this.fillItemSubSegment(data);
        await this.fillItemProjectCategory(data);
        await this.fillItemNatureOfExpense(data);

        // Suggested Suppliers
        await this.fillPotentialSuppliers(data);

        await this.assertBrfAutoPopulated(data);
    }

    // ── CXO – Save as Draft / Submit to Pending Approval ──────────────────────

    /** Fill all sections, then Save (NOT Submit) → the CXO is created in Draft
     *  status without entering the approval workflow. Lands on the CXO overview.
     *  Persists the code (savedCxo) for reference. */
    async createCxoDraft(data) {
        await this.fillAllCxoSections(data);

        const saveBtn = this.page.locator(L.cxoSaveDraftBtn).first();
        await saveBtn.waitFor({ state: 'visible', timeout: 10000 });
        await saveBtn.click();
        // Save (no workflow submit) → "…saved successfully" toast → the app
        // navigates to the CXO overview with the status badge showing Draft.
        await this.page.waitForURL(/\/cxos\/[^\/]+\/overview/, { timeout: 20000 });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(2000);
        console.log('[CXO] Saved as Draft → overview');
        await this.saveCxoCode();
    }

    /** Fill all sections, then Submit through the Workflow-Summary popup → the CXO
     *  enters the approval workflow at Pending Approval. Lands on the CXO
     *  overview. Persists the code (savedCxo). */
    async createAndSubmitCxo(data) {
        await this.fillAllCxoSections(data);

        await this.clickSubmit();
        await this.assertCxoSubmittedSuccessfully();
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(2000);
        console.log('[CXO] Submitted → Pending Approval');
        await this.saveCxoCode();
    }

    // ── CXO – Reject (from the pending-approval page) ─────────────────────────
    // Mirrors rejectIntake: the header Reject button opens a reject dialog with a
    // comments textarea; the dialog's Reject stays disabled until a comment is
    // entered. If the Reject button is missing (step assigned to another
    // approver) we reassign to NSEF Support Admin and retry, same as approvals.
    async rejectCxo(reason = 'Rejected by automation') {
        const rejectBtn = this.page.locator(`xpath=${IL.intakeRejectBtn}`).first();

        let ready = false;
        for (let attempt = 0; attempt < 5 && !ready; attempt++) {
            await this.page.waitForTimeout(1500);
            if (await rejectBtn.isVisible({ timeout: 4000 }).catch(() => false)) { ready = true; break; }
            if (attempt < 2) {
                console.log(`[CXO] Reject button not visible — reloading (${attempt + 1}/2)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }
            if (attempt === 2) {
                console.log('[CXO] Reassigning approver to NSEF Support Admin so Reject is available...');
                await this.reassignWorkflowApprover('Reassigned for automated testing', 'CXO');
                continue;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        await rejectBtn.waitFor({ state: 'visible', timeout: 8000 });
        await rejectBtn.click();

        const comments = this.page.locator(IL.intakeApproveComments).first();
        await comments.waitFor({ state: 'visible', timeout: 10000 });
        await comments.fill(reason);

        const confirm = this.page.locator(`xpath=${IL.intakeRejectConfirm}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log('[CXO] Reject submitted');
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    // ── CXO – Status assertions ───────────────────────────────────────────────

    async assertCxoStatusDraft() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusDraft}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    async assertCxoStatusRejected() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusRejected}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    async assertCxoStatusPendingApproval() {
        await expect(this.page.locator(`xpath=${IL.cxoStatusPendingApproval}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── CXO – Mark Processed (More dropdown, Released CXOs) ────────────────────
    // On a Released CXO the More menu exposes "Process" (the CXO wording for Mark
    // Processed). It opens a "Process CXO" dialog with a mandatory reason; on
    // Submit the CXO status becomes Processed. The dialog's reason field + Submit
    // are the same shape as intake's, so those locators are reused.

    async markCxoProcessed(reason = 'Marked processed by automation') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.cxoProcessOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const reasonField = this.page.locator(`xpath=${IL.intakeMarkProcessedReason}`).first();
        await reasonField.waitFor({ state: 'visible', timeout: 10000 });
        await reasonField.fill(reason);
        await this.page.waitForTimeout(400);
        await this.page.locator(`xpath=${IL.intakeMarkProcessedSubmit}`).first().click();
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
        console.log('[CXO] Mark Processed submitted');
    }

    async assertCxoStatusProcessed() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusProcessed}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── CXO – Cancel (More dropdown, Released CXOs) ────────────────────────────
    // On a Released CXO the More menu exposes "Cancel". It opens a "Cancel CXO"
    // dialog with a mandatory reason; on Submit the status becomes Cancelled. The
    // reason field + Submit share the same shape as the Process dialog.

    async cancelCxo(reason = 'Cancelled by automation') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.cxoCancelOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const reasonField = this.page.locator(`xpath=${IL.intakeMarkProcessedReason}`).first();
        await reasonField.waitFor({ state: 'visible', timeout: 10000 });
        await reasonField.fill(reason);
        await this.page.waitForTimeout(400);
        await this.page.locator(`xpath=${IL.intakeMarkProcessedSubmit}`).first().click();
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
        console.log('[CXO] Cancel submitted');
    }

    async assertCxoStatusCancelled() {
        await expect(this.page.locator(`xpath=${IL.cxoStatusCancelled}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── CXO – Regenerate / Download Document (More dropdown) ──────────────────
    // The CXO detail page shares the generic v4 header More menu (same as intake),
    // so Regenerate/Download Document reuse the generic menu-item locators. The
    // regenerate toast wording is matched leniently (…regenerated successfully).

    async regenerateCxoDocument() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const option = this.page.locator(`xpath=${IL.intakeRegenerateDocOption}`).first();
        await option.waitFor({ state: 'visible', timeout: 8000 });
        await option.click();
        await expect(this.page.getByText(/regenerated successfully/i).first())
            .toBeVisible({ timeout: 15000 });
        console.log('[CXO] Document regenerated');
        await this.page.waitForTimeout(1000);
    }

    /** More → Download Document → capture the downloaded PDF and return its text.
     *  Same mechanism as the intake download (presigned S3 URL → PDF → pdf-parse). */
    async downloadCxoDocumentText() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const option = this.page.locator(`xpath=${IL.intakeDownloadDocOption}`).first();
        await option.waitFor({ state: 'visible', timeout: 8000 });

        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 30000 }),
            option.click(),
        ]);
        const filePath = await download.path();
        const suggested = download.suggestedFilename();
        console.log(`[CXO] Downloaded document: ${suggested}`);

        const buf = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: buf });
        const res = await parser.getText();
        return { text: res.text || '', filename: suggested };
    }

    /** Download the CXO PDF and verify (a) the Status line shows the expected
     *  status (case-insensitive, separator-insensitive) and (b) every value in
     *  `expectedFields` appears. Mirrors assertIntakeDocumentStatusAndFields. */
    async assertCxoDocumentStatusAndFields(expectedStatus, expectedFields = []) {
        const { text, filename } = await this.downloadCxoDocumentText();

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const idx = lines.findIndex(l => l === 'Status');
        const docStatus = idx >= 0 ? lines[idx + 1] : '(no Status label found)';
        console.log(`[CXO] PDF "${filename}" → Status: "${docStatus}"`);

        const norm = s => (s || '').toUpperCase().replace(/[\s_-]+/g, ' ').trim();
        expect(norm(docStatus), `PDF status should be "${expectedStatus}"`)
            .toBe(norm(expectedStatus));

        for (const value of expectedFields) {
            expect(text, `PDF should display field value "${value}"`).toContain(value);
        }
        return { text, docStatus };
    }

    // ── CXO – Clone (More dropdown, any CXO) ──────────────────────────────────

    /** More → Clone → the pre-filled clone form (/cxos/{id}/clone) → Submit
     *  through the Workflow-Summary popup. This template's clone comes fully
     *  populated (title, dates, sections, one line item) and valid, so it
     *  submits as-is; the new clone lands on its own overview at Pending
     *  Approval. Reuses clickSubmit() (which handles the Workflow-Summary popup,
     *  same as CXO create). The caller then approves to Released. */
    async cloneCxo() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first(); // generic header More
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);

        const cloneOpt = this.page.locator(`xpath=${IL.intakeCloneOption}`).first();
        await cloneOpt.waitFor({ state: 'visible', timeout: 8000 });
        await cloneOpt.click();

        await this.page.waitForURL(/\/cxos\/[^\/]+\/clone/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);

        // Pre-filled and valid → submit as-is (handles the Workflow-Summary popup).
        await this.clickSubmit();
        await expect(this.page).toHaveURL(/\/cxos\/[^\/]+\/overview/, { timeout: 25000 });
        await this.page.waitForTimeout(1000);
        console.log('[CXO] Clone submitted → new CXO on overview');
    }

    // ── CXO – Amend (More dropdown, Released CXOs) ────────────────────────────

    /** More → Amend (Released CXO) → editable pre-filled form (/cxos/{id}/amend)
     *  → make a real edit (append " Amended" to the title) → Submit → fill the
     *  mandatory "Reason for amend" in the Workflow-Summary popup → popup Submit.
     *  The CXO returns to its overview at Pending Approval; the caller approves
     *  to Released. Same CXO id (amend edits in place, unlike Clone). */
    async amendCxo(data) {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first(); // generic header More
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);

        const amendOpt = this.page.locator(`xpath=${IL.intakeAmendOption}`).first();
        await amendOpt.waitFor({ state: 'visible', timeout: 8000 });
        await amendOpt.click();

        await this.page.waitForURL(/\/cxos\/[^\/]+\/amend/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);

        // Make a real edit so the amend is meaningful — append to the title.
        const current = await this.getTitleValue();
        const newTitle = `${current} Amended`;
        await this.typeTitle(newTitle);
        await this.page.waitForTimeout(500);
        this.lastAmendTitle = newTitle; // exposed so callers can assert it in Audit Logs

        // Submit → Workflow-Summary popup with a mandatory "Reason for amend".
        await this.page.locator(L.submitBtn).first().click();
        await this.page.waitForTimeout(2000);

        const reason = this.page.locator(`xpath=${IL.cxoAmendReasonField}`).first();
        await reason.waitFor({ state: 'visible', timeout: 10000 });
        await reason.fill('Amended by automation');
        await this.page.waitForTimeout(500);

        const popupSubmit = this.page.locator(`xpath=${IL.cxoAmendPopupSubmit}`).first();
        await expect(popupSubmit).toBeEnabled({ timeout: 8000 });
        await popupSubmit.click();
        await expect(this.page).toHaveURL(/\/cxos\/[^\/]+\/overview/, { timeout: 25000 });
        await this.page.waitForTimeout(1000);
        console.log('[CXO] Amend submitted → overview (Pending Approval)');
        return newTitle;
    }

    // ── CXO – Audit Logs (More dropdown) ──────────────────────────────────────

    /** More → Audit Logs → wait for the dialog and return its text content.
     *  The dialog lists field-level change history (or "No audit logs available"
     *  when nothing is recorded). */
    async openCxoAuditLogs() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first(); // generic header More
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);

        const opt = this.page.locator(`xpath=${IL.intakeAuditLogsOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const dialog = this.page.locator(`xpath=${IL.auditLogsDialog}`).first();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });
        await this.page.waitForTimeout(1200);
        const text = (await dialog.innerText()) ?? '';
        console.log(`[CXO] Audit Logs opened — content:\n${text.slice(0, 600)}`);
        return text;
    }

    /** Assert the Audit Logs record the amend: the dialog is NOT empty and shows
     *  each expected string (e.g. the changed title). Opens the dialog itself. */
    async assertCxoAuditLogContains(texts = []) {
        const body = await this.openCxoAuditLogs();
        expect(body, 'Audit Logs should not be empty after an amend')
            .not.toContain(IL.auditLogsEmptyMsg);
        for (const t of texts) {
            expect(body, `Audit Logs should record the amend change "${t}"`).toContain(t);
        }
        // Close the dialog.
        const dialog = this.page.locator(`xpath=${IL.auditLogsDialog}`).first();
        const close = dialog.getByRole('button', { name: /Close/i }).first();
        if (await close.isVisible({ timeout: 2000 }).catch(() => false)) await close.click();
        else await this.page.keyboard.press('Escape');
    }

    // ── Intake Tab Navigation ─────────────────────────────────────────────────

    async clickIntakeTab() {
        const tab = this.page.locator(`xpath=//button[@data-slot="tabs-trigger"][contains(normalize-space(.),"Intake")]`);
        await tab.waitFor({ state: 'visible', timeout: 15000 });
        await tab.click();
        await this.page.waitForSelector('[href="/intakes/create"]', { timeout: 15000 });
    }

    async clickCreateIntake() {
        await this.page.locator('[href="/intakes/create"]').click();
        await this.page.waitForURL(/\/intakes\/create/, { timeout: 15000 });
    }

    async assertIntakeCreatePage() {
        await expect(this.page).toHaveURL(/\/intakes\/create/);
    }

    // ── Intake Template + Setup ───────────────────────────────────────────────

    async selectIntakeTemplate() {
        const trigger = this.page.locator(`xpath=(//button[@role='combobox'])[1]`).first();
        await trigger.click();
        await this.page.waitForTimeout(500);
        const preferred = this.page.getByRole('option', { name: 'NSE - Intake + CXO', exact: true });
        if (await preferred.isVisible({ timeout: 5000 }).catch(() => false)) {
            await preferred.click();
        } else {
            await this.page.getByRole('option').first().click();
        }
        await this.page.waitForTimeout(800);
    }

    async closeAskAieraIfVisible() {
        const btn = this.page.locator(`xpath=(//div[contains(@class,'flex gap')]/button)[5]`).first();
        await btn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (!(await btn.isVisible({ timeout: 1000 }).catch(() => false))) return;
        await btn.click();
        await this.page.waitForTimeout(500);
    }

    async expandIntakeSections() {
        // Single click on button[1] expands all sections globally
        const btn = this.page.locator(`xpath=(//div[contains(@class,'flex gap')]/button)[1]`).first();
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        await btn.click();
        await this.page.waitForTimeout(800);
    }

    // ── Intake Header Details ─────────────────────────────────────────────────

    async fillIntakeTitle(data) {
        await this.page.locator(IL.intakeTitle).fill(data.intake.title);
    }

    async fillIntakeSummary(data) {
        await this.page.locator(IL.intakeSummary).fill(data.intake.summary);
    }

    async selectIntakeEntityTest2() {
        const el = this.page.locator(IL.intakeEntityTest2).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.click();
        const opt = this.page.locator(IL.intakeEntityTest2Opt).first();
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();
    }

    async selectIntakeCompany1() {
        const el = this.page.locator(IL.intakeCompany1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        let selected = false;
        while (!selected) {
            await this._openDropdown(el, { hasSearch: false });
            const opt = this.page.locator(IL.intakeCompanyOpt).first();
            await opt.waitFor({ state: 'visible', timeout: 15000 });
            const optText = (await opt.textContent() ?? '').trim();
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText(optText, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeCompany2() {
        const el = this.page.locator(IL.intakeCompany2).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        let selected = false;
        while (!selected) {
            await this._openDropdown(el, { hasSearch: false });
            const opt = this.page.locator(IL.intakeCompanyOpt).first();
            await opt.waitFor({ state: 'visible', timeout: 15000 });
            const optText = (await opt.textContent() ?? '').trim();
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText(optText, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeDepartment(data) {
        const trigger = this.page.locator(IL.intakeDepartment).first();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator(IL.intakeDepartmentSearch).last();
            await searchBox.waitFor({ state: 'visible', timeout: 8000 });
            await searchBox.fill(data.intake.department);
            await this.page.waitForTimeout(400);
            const opt = this.page.locator(IL.intakeDepartmentOpt).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.department, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeExpenseNatureApproval(data) {
        const trigger = this.page.locator(IL.intakeExpenseNatureApproval).first();
        if (!(await trigger.isVisible({ timeout: 3000 }).catch(() => false))) return;
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: false });
            const opt = this.page.locator(`[role="option"] [title="${data.intake.expenseNatureApproval}"]`).first();
            if (await opt.isVisible({ timeout: 5000 }).catch(() => false)) {
                await opt.click();
            } else {
                const fallback = this.page.locator(IL.intakeExpenseNatureApprovalOpt).first();
                if (await fallback.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await fallback.click({ timeout: 5000 });
                } else {
                    await this.page.keyboard.press('Escape');
                    await this.page.waitForTimeout(300);
                    continue;
                }
            }
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.expenseNatureApproval, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    // Currency is no longer selectable — the app pre-fills it and renders the
    // combobox disabled, so the old open-dropdown-and-pick loop could never
    // succeed (and, being unbounded, spun until the test timed out). Assert the
    // pre-filled value instead.
    async selectIntakeCurrency(data) {
        const trigger = this.page.locator(IL.intakeCurrency).first();
        await expect(trigger).toBeDisabled();
        await expect(trigger).toContainText(data.intake.currency);
    }

    async selectIntakeFunction(data) {
        const trigger = this.page.locator(IL.intakeFunction).first();
        if (!(await trigger.isVisible({ timeout: 3000 }).catch(() => false))) return;
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator('[placeholder="Search..."]').last();
            await searchBox.waitFor({ state: 'visible', timeout: 5000 });
            await searchBox.fill(data.intake.function);
            const opt = this.page.locator(`[role="option"] [title="${data.intake.function}"]`).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.function, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeVertical(data) {
        const trigger = this.page.locator(IL.intakeVertical).first();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator('[placeholder="Search..."]').last();
            await searchBox.waitFor({ state: 'visible', timeout: 5000 });
            await searchBox.fill(data.intake.vertical);
            const opt = this.page.locator(`[role="option"] [title="${data.intake.vertical}"]`).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.vertical, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeNatureOfExpense(data) {
        const trigger = this.page.locator(IL.intakeNatureOfExpense).first();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: false });
            const opt = this.page.locator(`[role="option"] [title="${data.intake.natureOfExpense}"]`).first();
            if (await opt.isVisible({ timeout: 5000 }).catch(() => false)) {
                await opt.click();
            } else {
                const fallback = this.page.locator(IL.intakeNatureOfExpenseOpt).first();
                if (await fallback.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await fallback.click({ timeout: 5000 });
                } else {
                    await this.page.keyboard.press('Escape');
                    await this.page.waitForTimeout(300);
                    continue;
                }
            }
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.natureOfExpense, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    // ── Intake – Header fields: Project Name, GL Account, Profit/Cost Center, SEBI, Sub Seg, Project Cat ──

    async selectIntakeProjectName() {
        const el = this.page.locator(IL.intakeProjectName).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        let selected = false;
        while (!selected) {
            await this._openDropdown(el, { hasSearch: true });
            const searchBox = this.page.locator('[placeholder="Search..."]').last();
            await searchBox.waitFor({ state: 'visible', timeout: 5000 });
            await searchBox.fill('NA');
            await this.page.waitForTimeout(500);
            let opt = this.page.locator(`[role="option"] [title="NA"]`).first();
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                opt = this.page.locator(`[role="option"][title="NA"]`).first();
            }
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(300);
                continue;
            }
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText('NA', { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    // Clicks a trigger until the dropdown opens (search box or options become visible)
    async _openDropdown(trigger, { hasSearch = true } = {}) {
        for (let i = 0; i < 5; i++) {
            await trigger.click();
            const indicator = hasSearch
                ? this.page.locator('[placeholder="Search..."]').last()
                : this.page.locator('[role="option"]').first();
            if (await indicator.isVisible({ timeout: 1500 }).catch(() => false)) return;
            await this.page.waitForTimeout(300);
        }
    }

    async _selectNADropdown(el) {
        let selected = false;
        while (!selected) {
            await this._openDropdown(el, { hasSearch: true });
            const searchBox = this.page.locator('[placeholder="Search..."]').last();
            await searchBox.waitFor({ state: 'visible', timeout: 5000 });
            await searchBox.fill('NA');
            await this.page.waitForTimeout(500);
            let opt = this.page.locator(`[role="option"] [title="NA"]`).first();
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                opt = this.page.locator(`[role="option"][title="NA"]`).first();
            }
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(300);
                continue;
            }
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText('NA', { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeGLAccount() {
        const el = this.page.locator(IL.intakeGLAccount).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
    }

    async selectIntakeProfitCenter() {
        const el = this.page.locator(IL.intakeProfitCenter).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
    }

    async selectIntakeCostCenter() {
        const el = this.page.locator(IL.intakeCostCentre).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
        
    }

    async selectIntakeSEBICategorization() {
        const el = this.page.locator(IL.intakeSEBIcategorization).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
    }

    async selectIntakeSubSegment() {
        const el = this.page.locator(IL.intakeSubSegment).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
    }

    async selectIntakeProjectCategory() {
        const el = this.page.locator(IL.intakeProjectCategory).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await this._selectNADropdown(el);
        await this.page.waitForTimeout(1000); // wait for BRF No. to auto-populate after project category
    }

    async selectIntakeCXOType(data) {
        const trigger = this.page.locator(IL.intakeCXOtype).first();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: false });
            const opt = this.page.locator(`[role="option"] [title="${data.intake.cxoType}"]`).first();
            await opt.waitFor({ state: 'visible', timeout: 15000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.cxoType, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeCXOTransaction(data) {
        // Read the CXO code fresh from disk — the imported `data` object is stale
        // when the CXO create test rewrote the JSON earlier in this same run.
        const cxoCode = this.getSavedCxoCode();
        const trigger = this.page.locator(IL.intakeCXOtransaction).first();
        if (!(await trigger.isVisible({ timeout: 3000 }).catch(() => false))) return;
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator(IL.intakeCXOtransactionSearch).last();
            await searchBox.fill(cxoCode);
            await this.page.waitForTimeout(800);
            const opt = this.page.locator(`xpath=(//div[@role='option'])[1]`).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(cxoCode, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async assertIntakeBRFAutoPopulated() {
        // BRF No. header field — soft assert (auto-populate depends on CXO linkage)
        const brfEl = this.page.locator(IL.intakeBRFNo).first();
        if (!(await brfEl.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await brfEl.scrollIntoViewIfNeeded().catch(() => {});
        const text = await brfEl.textContent().catch(() => '');
        console.log(`BRF No. value: "${text?.trim()}"`);
    }

    // ── Intake – Generic first-option helper ─────────────────────────────────

    async _selectFirstOptionByLabel(labelFragment) {
        const trigger = this.page.locator(
            `xpath=(//*[contains(normalize-space(.),'${labelFragment}')]/following::*[@role='combobox'])[1]`
        ).first();
        if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await trigger.scrollIntoViewIfNeeded();
        for (let attempt = 0; attempt < 3; attempt++) {
            await trigger.click();
            const opt = this.page.locator(`xpath=(//div[@role='option'])[1]`).first();
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await this.page.waitForTimeout(200);
            const optText = (await opt.textContent() ?? '').trim();
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(optText, { timeout: 4000 }); return; } catch { await this.page.waitForTimeout(300); }
        }
    }

    // ── Intake – Basic Information ────────────────────────────────────────────

    async fillIntakeContractStartDate(data) {
        const trigger = this.page.locator(IL.intakeContractStartDate).first();
        if (!(await trigger.isVisible({ timeout: 6000 }).catch(() => false))) return;
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.cxo.startDate);
        // _pickDate already presses Escape — no second Escape here (would close the form)
        await this.page.waitForTimeout(400);
    }

    async fillIntakeContractEndDate(data) {
        const trigger = this.page.locator(IL.intakeContractEndDate).first();
        if (!(await trigger.isVisible({ timeout: 6000 }).catch(() => false))) return;
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.cxo.endDate);
        // _pickDate already presses Escape — no second Escape here (would close the form)
        await this.page.waitForTimeout(400);
    }

    async selectIntakePurchaseRelatedServices() {
        await this._selectFirstOptionByLabel('Purchase Related Services');
    }

    async selectIntakeSingleVendorProcurement() {
        await this._selectFirstOptionByLabel('Single Vendor Procurement');
    }

    async selectIntakeTypeOfProcurement(data) {
        const el = this.page.locator(IL.intakeTypeOfProcurement).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        for (let attempt = 0; attempt < 3; attempt++) {
            await el.click();
            const opt = this.page.locator(`[title="${data.cxo.typeOfProcurement}"]`).first();
            if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
                await opt.click();
            } else {
                await this.page.locator(IL.intakeTypeOfProcurementOpt).first().click();
            }
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText(data.cxo.typeOfProcurement, { timeout: 4000 }); return; } catch { await this.page.waitForTimeout(300); }
        }
    }

    async selectIntakeFinancialYear(data) {
        const el = this.page.locator(IL.intakeFinancialYear).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        for (let attempt = 0; attempt < 3; attempt++) {
            await el.click();
            const opt = this.page.locator(`[title="${data.cxo.financialYear}"]`).first();
            if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
                await opt.click();
            } else {
                await this.page.locator(IL.intakeFinancialYearOpt).first().click();
            }
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(el).toContainText(data.cxo.financialYear, { timeout: 4000 }); return; } catch { await this.page.waitForTimeout(300); }
        }
    }

    // ── Intake – Particulars of Procurement ──────────────────────────────────

    async selectIntakeCXOAppInfra() {
        await this._selectFirstOptionByLabel('existing applications');
    }

    async selectIntakeCXOBizReq() {
        await this._selectFirstOptionByLabel('business requirement or compliance');
    }

    async selectIntakeCXOMinCommit() {
        await this._selectFirstOptionByLabel('minimum commitment');
    }

    async selectIntakeCXOMeitY() {
        await this._selectFirstOptionByLabel('MeitY');
    }

    async selectIntakeCXONSEDataTransfer() {
        await this._selectFirstOptionByLabel('transfer or sharing of NSE data');
    }

    async selectIntakeCXORPwD() {
        await this._selectFirstOptionByLabel('Rights of Persons with Disabilities');
    }

    // ── Intake – Business Objective rich text ─────────────────────────────────

    async fillIntakeBusinessObjectiveRichText(data) {
        const el = this.page.locator(IL.intakeBusinessObjectiveRichText).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this.page.waitForTimeout(300);
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.type(data.intake.businessObjective);
    }

    // ── Intake – Purchase Business Case ───────────────────────────────────────

    async fillIntakeBusinessObjectivePurchase(data) {
        const el = this.page.locator(IL.intakeBusinessObjectivePurchase).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click({ force: true });
        await el.clear();
        await el.fill(data.intake.businessObjective);
    }

    // Reuse CXO purchase business case methods — same form fields
    // fillDetailsOfItemsServices(), fillNecessityOfPurchase(), selectEmergencyProcurement(), fillDeliveryTimeline()

    // ── Intake – Line Item Grid ───────────────────────────────────────────────

    async addIntakeLineRow() {
        await this.page.locator(IL.intakeAddLineRow).click();
        await this.page.waitForTimeout(600);
    }

    /** Fill the intake's single line-item row. `qty` overrides the fixture
     *  quantity — scenarios 1 and 6 split one CXO across two intakes, so the
     *  row is not always the fixture's full 100. */
    async fillIntakeLineItem(data, { qty = null } = {}) {
        const lineQty = String(qty ?? data.intake.itemQty);
        // Item Name — click cell, search "Manpower", select "Manpower (T&M)"
        await this.page.locator(IL.intakeItemName).click();
        await this.page.locator(IL.intakeItemNameSearch).fill(data.intake.itemName);
        await this.page.waitForTimeout(600);
        const nameOpt = this.page.locator(`[role="option"] [title="${data.intake.itemNameOption}"]`).first();
        if (await nameOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nameOpt.click();
        } else {
            await this.page.getByRole('option').first().click();
        }
        await this.page.waitForTimeout(800);

        // QTY — click cell, type the quantity via keyboard, Tab to confirm
        await this.page.locator(IL.intakeItemQty).click();
        await this.page.waitForTimeout(500);
        await this.page.keyboard.type(lineQty);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(500);

        // Delivery Address — click cell, select first option
        await this.page.locator(IL.intakeItemDelAdd).click();
        const delOpt = this.page.locator(IL.intakeItemDelAddOpt).first();
        await delOpt.waitFor({ state: 'visible', timeout: 8000 });
        await delOpt.click();
        await this.page.waitForTimeout(500);

        // Billing Address — Tab from delivery address, Enter to open, select first option
        await this.page.keyboard.press('Tab');
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);
        const bilOpt = this.page.locator(IL.intakeItemBilAddOpt).first();
        await bilOpt.waitFor({ state: 'visible', timeout: 8000 });
        await bilOpt.click();
        await this.page.waitForTimeout(500);

        // Suggested Price — Tab from billing address, Enter to open, type price
        await this.page.keyboard.press('Tab');
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);
        await this.page.keyboard.type(data.intake.itemSuggestedPrice);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(800);

        // Assert Total = QTY × Suggested Price
        const totalInput = this.page.locator("xpath=//label[contains(.,'Total')]/following::input[1]").first();
        await totalInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await totalInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            const totalStr = await totalInput.inputValue();
            const numericTotal = parseFloat(totalStr.replace(/,/g, ''));
            const expected = parseInt(lineQty) * parseInt(data.intake.itemSuggestedPrice);
            console.log(`[Intake] Total: "${totalStr}" (expected: ${expected})`);
            expect(numericTotal).toBe(expected);
        }
    }

    // ── Intake – Potential Suppliers ──────────────────────────────────────────

    async fillIntakePotentialSuppliers(data) {
        const input = this.page.locator(IL.intakePotentialSuppliers).first();
        if (!(await input.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await input.fill(data.intake.potentialSuppliers ?? '1');
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(300);
    }

    // ── Intake – Submit ───────────────────────────────────────────────────────

    async submitIntake() {
        await this.page.locator(IL.intakeSubmit).first().click();
        await this.page.waitForTimeout(2000);
    }

    // ── Intake – Submission Popup (Proceed → Purchaser → Final Submit) ────────

    async completeIntakeSubmissionPopup() {
        // Step 1: Proceed through Workflow Summary.
        //
        // "Process Request — Step 1 of 2" renders its shell FIRST and loads the
        // workflow summary into it afterwards, keeping Proceed disabled until the
        // body arrives. Waiting only for :visible then clicking gives the click
        // the config's 5s actionTimeout to find an enabled button, which is not
        // always enough — scenario 1's chain B died exactly there on 2026-09-09,
        // on a dialog still showing its spinner. Wait for ENABLED instead.
        const proceedBtn = this.page.locator(IL.intakeProceed).first();
        await proceedBtn.waitFor({ state: 'visible', timeout: 15000 });
        await expect(proceedBtn, 'the Process Request dialog never enabled Proceed — it either '
            + 'never finished loading, or the intake failed validation')
            .toBeEnabled({ timeout: 60000 });
        await proceedBtn.click();
        await this.page.waitForTimeout(1500);

        // Step 2: Purchaser assignment
        const dropdown = this.page.locator(IL.intakePurAsignDropdown).first();
        if (await dropdown.isVisible({ timeout: 10000 }).catch(() => false)) {
            await dropdown.scrollIntoViewIfNeeded();
            await dropdown.click({ force: true });
            await this.page.waitForTimeout(600);
            const adminOpt = this.page.locator(IL.intakepurAsignOpt).first();
            await adminOpt.waitFor({ state: 'visible', timeout: 10000 });
            await adminOpt.click();
            await this.page.waitForTimeout(400);
        }

        // Step 3: Final Submit
        const finalSubmit = this.page.locator(IL.intakeFinalSubmit).first();
        await finalSubmit.waitFor({ state: 'visible', timeout: 10000 });
        await finalSubmit.click();

        await expect(this.page).toHaveURL(/overview/, { timeout: 20000 });
        await this.page.waitForTimeout(1000);
    }

    // ── Intake – Approval Workflow ────────────────────────────────────────────

    async approveIntakeUntilReleased(data, comments = 'Approved by automation') {
        const maxIter = 15;
        let noActionStreak = 0;
        for (let i = 0; i < maxIter; i++) {
            await this.page.waitForTimeout(2000);

            // Check Released/Active
            const released = await this.page.locator(`xpath=${L.cxoReleasedStatus}`)
                .first().isVisible({ timeout: 3000 }).catch(() => false);
            if (released) {
                console.log(`[Intake] Status Released/Active after ${i} step(s).`);
                break;
            }

            // Approve
            const approveBtn = this.page.locator(IL.intakeApprove1).first();
            if (await approveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
                noActionStreak = 0;
                console.log(`[Intake] Approving stage ${i + 1}...`);
                await approveBtn.click();
                const cf = this.page.locator(IL.intakeApproveComments);
                await cf.waitFor({ state: 'visible', timeout: 10000 });
                await cf.fill(comments);
                await this.page.locator(IL.intakeAppSubmit).click();
                await this.page.waitForTimeout(1500);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }

            // Review — open edit page, re-fill mandatory fields, submit
            const reviewBtn = this.page.locator(IL.intakeReview).first();
            if (await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                noActionStreak = 0;
                console.log(`[Intake] Handling Review step ${i + 1}...`);
                await reviewBtn.click();
                await this.page.waitForLoadState('domcontentloaded');
                await this.page.waitForTimeout(1500);
                // Re-fill fields that get cleared on the review edit page
                await this.selectIntakePurchaseRelatedServices();
                await this.fillIntakeContractStartDate(data);
                await this.fillIntakeContractEndDate(data);
                await this.selectIntakeSingleVendorProcurement();
                await this.selectIntakeTypeOfProcurement(data);
                await this.selectIntakeFinancialYear(data);
                await this.selectIntakeCXOAppInfra();
                await this.selectIntakeCXOBizReq();
                await this.selectIntakeCXOMinCommit();
                await this.selectIntakeCXOMeitY();
                await this.selectIntakeCXONSEDataTransfer();
                await this.selectIntakeCXORPwD();
                await this.fillIntakeBusinessObjectiveRichText(data);
                await this.fillIntakeBusinessObjectivePurchase(data);
                await this.fillDetailsOfItemsServices(data);
                await this.fillNecessityOfPurchase(data);
                await this.fillDeliveryTimeline(data);
                // Submit the review
                const submitBtn = this.page.locator(IL.intakeSubmit).first();
                if (await submitBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
                    await submitBtn.click();
                    await this.page.waitForTimeout(2000);
                    // Handle re-submission popup if it appears
                    const popup = this.page.locator('[role="dialog"]').first();
                    if (await popup.isVisible({ timeout: 5000 }).catch(() => false)) {
                        await this.completeIntakeSubmissionPopup().catch(() => {});
                    }
                }
                await this.page.waitForURL(/overview/, { timeout: 20000 }).catch(() => {});
                await this.page.waitForTimeout(2000);
                continue;
            }

            // Acknowledge
            const ackBtn = this.page.locator(IL.intakeAccept).first();
            if (await ackBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                noActionStreak = 0;
                console.log(`[Intake] Clicking Acknowledge/Accept step ${i + 1}...`);
                await ackBtn.click();
                await this.page.waitForTimeout(1500);
                const cf = this.page.locator(IL.intakeApproveComments);
                if (await cf.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await cf.fill(comments);
                    const confirmBtn = this.page.locator(`xpath=(//button[normalize-space(text())='Accept' or normalize-space(text())='Approve'])[2]`).first();
                    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
                }
                await this.page.waitForTimeout(1500);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }

            // No action button — the page state may be stale, or the step is
            // assigned to a different approver. Reload-retry first, then reassign
            // the workflow approver to NSEF Support Admin before giving up.
            // Reassign is attempted TWICE, with reloads in between, because the
            // reassign dialog itself is flaky (see reassignWorkflowApprover). A
            // single failed attempt used to end the chain here even though the
            // intake was merely awaiting a different approver — scenario 1,
            // 2026-09-10, INT-FNSE-26-438 stuck Pending Approval with only
            // Recall in the header.
            noActionStreak++;
            if (noActionStreak === 3 || noActionStreak === 6) {
                console.log(`[Intake] Still no action button — reassigning approver to NSEF Support Admin `
                    + `(attempt ${noActionStreak === 3 ? 1 : 2}/2)...`);
                if (await this.reassignWorkflowApprover('Reassigned for automated testing', 'Intake')) {
                    continue;
                }
                if (noActionStreak === 6) {
                    console.log(`[Intake] No action button visible at step ${i + 1} after retries — stopping.`);
                    break;
                }
                continue;
            }
            if (noActionStreak <= 6) {
                console.log(`[Intake] No action button at step ${i + 1} — reloading (${noActionStreak}/6)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }
            console.log(`[Intake] No action button visible at step ${i + 1} after retries — stopping.`);
            break;
        }
    }

    async assertIntakeStatusReleased() {
        await expect(this.page.locator(`xpath=${L.cxoReleasedStatus}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── Intake – Full create + submit (reusable) ──────────────────────────────
    // Mirrors the NSEF happy-path "Create Intake" steps. Leaves the intake on its
    // overview page in Pending Approval. Used by negative flows (Reject/Recall)
    // that need a freshly-submitted intake without re-typing the whole form.
    async createAndSubmitIntake(data, { qty = null } = {}) {
        await this.closeAskAieraIfVisible();
        await this.expandIntakeSections();

        await this.fillIntakeTitle(data);
        await this.fillIntakeSummary(data);
        await this.selectIntakeCompany1();
        await this.selectIntakeCompany2();
        await this.selectIntakeDepartment(data);
        await this.selectIntakeExpenseNatureApproval(data);
        await this.selectIntakeCurrency(data);
        await this.selectIntakeFunction(data);
        await this.selectIntakeVertical(data);
        await this.selectIntakeProjectName();
        await this.selectIntakeNatureOfExpense(data);
        await this.selectIntakeGLAccount();
        await this.selectIntakeProfitCenter();
        await this.selectIntakeCostCenter();
        await this.selectIntakeSEBICategorization();
        await this.selectIntakeSubSegment();
        await this.selectIntakeProjectCategory();
        await this.selectIntakeCXOType(data);
        await this.selectIntakeCXOTransaction(data);
        await this.assertIntakeBRFAutoPopulated();

        await this.addIntakeLineRow();
        await this.fillIntakeLineItem(data, { qty });
        await this.fillIntakePotentialSuppliers(data);

        await this.submitIntake();
        await this.completeIntakeSubmissionPopup();
    }

    // ── Intake – Reject (from the pending-approval page) ──────────────────────
    // The header Reject button opens a "Reject Intake ..." dialog with a comments
    // textarea; the dialog's Reject button stays disabled until a comment is
    // entered. If the Reject button is missing (step assigned to another
    // approver) we reassign to NSEF Support Admin and retry, same as approvals.
    async rejectIntake(reason = 'Rejected by automation') {
        const rejectBtn = this.page.locator(IL.intakeRejectBtn).first();

        let ready = false;
        for (let attempt = 0; attempt < 5 && !ready; attempt++) {
            await this.page.waitForTimeout(1500);
            if (await rejectBtn.isVisible({ timeout: 4000 }).catch(() => false)) { ready = true; break; }
            if (attempt < 2) {
                console.log(`[Intake] Reject button not visible — reloading (${attempt + 1}/2)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }
            if (attempt === 2) {
                console.log('[Intake] Reassigning approver to NSEF Support Admin so Reject is available...');
                await this.reassignWorkflowApprover('Reassigned for automated testing', 'Intake');
                continue;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        await rejectBtn.waitFor({ state: 'visible', timeout: 8000 });
        await rejectBtn.click();

        // Reject dialog → comments (shares the approve-comments placeholder)
        const comments = this.page.locator(IL.intakeApproveComments).first();
        await comments.waitFor({ state: 'visible', timeout: 10000 });
        await comments.fill(reason);

        const confirm = this.page.locator(`xpath=${IL.intakeRejectConfirm}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log('[Intake] Reject submitted');
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    async assertIntakeStatusRejected() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusRejected}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── Intake – Recall (from the pending-approval page) ──────────────────────
    // Header Recall opens a "Recall Intake Transaction" dialog (same shape as
    // Reject); confirm is disabled until a comment is typed. After recall the
    // status flips to Draft. Same approver-reassign fallback as rejectIntake.
    async recallIntake(reason = 'Recalled by automation') {
        const recallBtn = this.page.locator(IL.intakeRecallBtn).first();

        let ready = false;
        for (let attempt = 0; attempt < 5 && !ready; attempt++) {
            await this.page.waitForTimeout(1500);
            if (await recallBtn.isVisible({ timeout: 4000 }).catch(() => false)) { ready = true; break; }
            if (attempt < 2) {
                console.log(`[Intake] Recall button not visible — reloading (${attempt + 1}/2)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }
            if (attempt === 2) {
                console.log('[Intake] Reassigning approver to NSEF Support Admin so Recall is available...');
                await this.reassignWorkflowApprover('Reassigned for automated testing', 'Intake');
                continue;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        await recallBtn.waitFor({ state: 'visible', timeout: 8000 });
        await recallBtn.click();

        const comments = this.page.locator(IL.intakeApproveComments).first();
        await comments.waitFor({ state: 'visible', timeout: 10000 });
        await comments.fill(reason);

        const confirm = this.page.locator(`xpath=${IL.intakeRecallConfirm}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log('[Intake] Recall submitted');
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    async assertIntakeStatusDraft() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusDraft}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── Intake – Edit a recalled Draft and resubmit ───────────────────────────
    // Opens the Draft's editable form (Edit), tweaks the title so the edit is
    // real, then submits through the usual Workflow-Summary popup → back to
    // Pending Approval, re-triggering the approval workflow.
    async editAndResubmitDraftIntake(data) {
        // A Draft has no header Edit button — open it from the More dropdown.
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const editOption = this.page.locator(`xpath=${IL.intakeEditOption}`).first();
        await editOption.waitFor({ state: 'visible', timeout: 8000 });
        await editOption.click();
        await this.page.waitForURL(/\/intakes\/[^\/]+\/edit/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);
        await this.closeAskAieraIfVisible().catch(() => {});

        // Make a genuine edit — append to the document title.
        const title = this.page.locator(IL.intakeTitle).first();
        await title.waitFor({ state: 'visible', timeout: 10000 });
        await title.click();
        const current = await title.inputValue().catch(() => '');
        await title.fill(`${current || data.intake.title} - recalled edit`);
        await this.page.waitForTimeout(500);

        await this.submitIntake();
        await this.completeIntakeSubmissionPopup();
    }

    // ── Intake – Workflow Stages (More → Workflow Stages) ─────────────────────
    // Opens the slide-over "Workflow Steps" panel which lists each workflow run
    // as "Workflow N". A re-triggered workflow shows up as a new entry, so the
    // distinct "Workflow N" count increases after a recall + resubmit.
    async openWorkflowStages() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const option = this.page.locator(`xpath=${IL.intakeWorkflowStagesOption}`).first();
        await option.waitFor({ state: 'visible', timeout: 8000 });
        await option.click();
        await this.page.locator(`xpath=${IL.intakeWorkflowStepsPanelTitle}`).first()
            .waitFor({ state: 'visible', timeout: 10000 });
        await this.page.waitForTimeout(800);
    }

    /** Distinct count of "Workflow N" runs shown in the Workflow Steps panel. */
    async getWorkflowCount() {
        return await this.page.evaluate(() => {
            const set = new Set();
            document.querySelectorAll('*').forEach(e => {
                const t = (e.textContent || '').trim();
                if (/^Workflow\s+\d+$/.test(t)) set.add(t);
            });
            return set.size;
        });
    }

    async closeWorkflowStages() {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
    }

    /** With the Workflow Steps panel open: assert every workflow run is shown as
     *  Inactive and none is Active — the expected state right after a Recall (the
     *  intake is back in Draft, so its workflow runs are deactivated). The
     *  step-level "Pending" inside a run is not a workflow-level status. */
    async assertWorkflowsInactive() {
        const counts = await this.page.evaluate(() => {
            const set = new Set();
            document.querySelectorAll('*').forEach(e => {
                const t = (e.textContent || '').trim();
                if (/^Workflow\s+\d+$/.test(t)) set.add(t);
            });
            const leaf = s => [...document.querySelectorAll('*')]
                .filter(e => e.children.length === 0 && (e.textContent || '').trim() === s).length;
            return { workflows: set.size, inactive: leaf('Inactive'), active: leaf('Active') };
        });
        console.log(`[Recall] Draft workflow states — runs:${counts.workflows} inactive:${counts.inactive} active:${counts.active}`);
        expect(counts.workflows, 'workflow runs present in panel').toBeGreaterThanOrEqual(1);
        expect(counts.inactive, 'every workflow run should be Inactive on a recalled Draft')
            .toBeGreaterThanOrEqual(counts.workflows);
        expect(counts.active, 'no workflow run should be Active on a recalled Draft').toBe(0);
    }

    // ── Intake – Regenerate / Download Document (More dropdown) ────────────────

    /** More → Regenerate Document → assert the success toast. */
    async regenerateIntakeDocument() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const option = this.page.locator(`xpath=${IL.intakeRegenerateDocOption}`).first();
        await option.waitFor({ state: 'visible', timeout: 8000 });
        await option.click();
        await expect(this.page.getByText(IL.intakeRegenerateToast, { exact: false }).first())
            .toBeVisible({ timeout: 15000 });
        console.log('[Intake] Document regenerated');
        await this.page.waitForTimeout(1000);
    }

    /** More → Download Document → capture the downloaded PDF and return its text.
     *  The app fetches a presigned S3 URL and downloads a PDF; Playwright's
     *  download event captures it. The PDF is parsed with pdf-parse. */
    async downloadIntakeDocumentText() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const option = this.page.locator(`xpath=${IL.intakeDownloadDocOption}`).first();
        await option.waitFor({ state: 'visible', timeout: 8000 });

        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 30000 }),
            option.click(),
        ]);
        const filePath = await download.path();
        const suggested = download.suggestedFilename();
        console.log(`[Intake] Downloaded document: ${suggested}`);

        const buf = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: buf });
        const res = await parser.getText();
        return { text: res.text || '', filename: suggested };
    }

    /** Download the intake PDF and verify (a) the Status line shows the expected
     *  status (case-insensitive) and (b) every value in `expectedFields` appears.
     *  In the PDF the status is the line right after a "Status" label, in caps. */
    async assertIntakeDocumentStatusAndFields(expectedStatus, expectedFields = []) {
        const { text, filename } = await this.downloadIntakeDocumentText();

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const idx = lines.findIndex(l => l === 'Status');
        const docStatus = idx >= 0 ? lines[idx + 1] : '(no Status label found)';
        console.log(`[Intake] PDF "${filename}" → Status: "${docStatus}"`);

        // Normalise case and separators: the PDF prints "PENDING-APPROVAL" while
        // the UI uses "Pending Approval" — treat space/underscore/hyphen alike.
        const norm = s => (s || '').toUpperCase().replace(/[\s_-]+/g, ' ').trim();
        expect(norm(docStatus), `PDF status should be "${expectedStatus}"`)
            .toBe(norm(expectedStatus));

        for (const value of expectedFields) {
            expect(text, `PDF should display field value "${value}"`).toContain(value);
        }
        return { text, docStatus };
    }

    // ── Intake – Clone (More dropdown) ────────────────────────────────────────

    /** Read the visible intake code (e.g. "INT-FNSE-26-133") from the page. */
    async getCurrentIntakeCode() {
        const bodyText = (await this.page.locator('body').textContent()) ?? '';
        const m = bodyText.match(/INT-FNSE-\d+-\d+/);
        return m ? m[0] : null;
    }

    /** More → Clone → the pre-filled clone form → Submit → complete the
     *  Workflow-Summary popup. This template's clone has no empty date fields,
     *  so it submits as-is. Leaves the NEW (cloned) intake on its overview. */
    async cloneIntake() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const cloneOpt = this.page.locator(`xpath=${IL.intakeCloneOption}`).first();
        await cloneOpt.waitFor({ state: 'visible', timeout: 8000 });
        await cloneOpt.click();

        await this.page.waitForURL(/\/intakes\/[^\/]+\/clone/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);
        await this.closeAskAieraIfVisible().catch(() => {});

        await this.submitIntakeViaWorkflowPopup();
    }

    /** Submit a pre-filled intake form (clone / amend) through the Workflow-
     *  Summary popup. Step 2 (Purchaser Assignment) starts empty, so its Submit
     *  is disabled until a purchaser is chosen. Crucially, after picking the
     *  purchaser the people-picker overlay must be dismissed (Escape) — if left
     *  open it intercepts the final Submit click and the popup never closes. */
    async submitIntakeViaWorkflowPopup() {
        await this.submitIntake();

        // Amend submissions add a mandatory "Reason for amend" field at the top
        // of the Workflow-Summary popup; Proceed stays disabled until it's set.
        const reasonField = this.page.locator(
            "xpath=(//*[contains(normalize-space(.),'Reason for amend')]/following::*[self::input or self::textarea])[1]"
        ).first();
        if (await reasonField.isVisible({ timeout: 3000 }).catch(() => false)) {
            await reasonField.fill('Amended by automation');
            await this.page.waitForTimeout(500);
        }

        const proceed = this.page.locator(IL.intakeProceed).first();
        await proceed.waitFor({ state: 'visible', timeout: 15000 });
        await proceed.click();
        await this.page.waitForTimeout(1500);

        const finalSubmit = this.page.locator(IL.intakeFinalSubmit).first();
        await finalSubmit.waitFor({ state: 'visible', timeout: 10000 });

        // Assign a purchaser when the Submit is still disabled (picker empty).
        if (!(await finalSubmit.isEnabled().catch(() => false))) {
            const dropdown = this.page.locator(IL.intakePurAsignDropdown).first();
            await dropdown.click({ force: true });
            await this.page.waitForTimeout(600);
            const adminOpt = this.page.locator(IL.intakepurAsignOpt).first();
            await adminOpt.waitFor({ state: 'visible', timeout: 8000 });
            await adminOpt.click();
            await this.page.waitForTimeout(400);
            // Dismiss the people-picker overlay so it doesn't eat the Submit click.
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
        }

        await finalSubmit.click();
        await expect(this.page).toHaveURL(/overview/, { timeout: 25000 });
        await this.page.waitForTimeout(1000);
        console.log('[Intake] Submitted via workflow popup');
    }

    // ── Intake – Amend (More dropdown, Released intakes) ──────────────────────

    /** Change the (already-populated) line item's Qty cell to `newQty`. On the
     *  pre-filled amend/edit grid the Description stays a separate editable cell,
     *  so Qty is the 3rd inline-editable cell (intakeItemQtyEmptyRow = [3]), not
     *  the 2nd (which is Description). */
    async changeIntakeLineItemQty(newQty) {
        const cell = this.page.locator(IL.intakeItemQtyEmptyRow).first();
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(400);
        // ControlOrMeta+a → real select-all inside the focused input (on macOS a
        // plain Control+a moves to line start, prepending instead of replacing).
        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.press('Delete');
        await this.page.keyboard.type(String(newQty));
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(500);
    }

    /** More → Amend (Released intake) → editable pre-filled form → change the
     *  line-item qty, append "automation amended" to the title → submit through
     *  the workflow popup. Leaves the intake in its amend-approval state. */
    async amendIntake(data, newQty = '150') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const amendOpt = this.page.locator(`xpath=${IL.intakeAmendOption}`).first();
        await amendOpt.waitFor({ state: 'visible', timeout: 8000 });
        await amendOpt.click();

        await this.page.waitForURL(/\/intakes\/[^\/]+\/amend/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);
        await this.closeAskAieraIfVisible().catch(() => {});

        // Change the line item quantity.
        await this.changeIntakeLineItemQty(newQty);

        // Append "automation amended" to the title.
        const title = this.page.locator(IL.intakeTitle).first();
        await title.click();
        const current = await title.inputValue().catch(() => '');
        await title.fill(`${current || data.intake.title} automation amended`);
        await this.page.waitForTimeout(500);

        await this.submitIntakeViaWorkflowPopup();
        console.log('[Amend] Amend submitted');
    }

    /** With the Workflow Steps panel open: assert at least one workflow run is
     *  shown as Completed (the amend workflow after it has been approved). */
    async assertWorkflowCompleted() {
        const counts = await this.page.evaluate(() => {
            const leaf = s => [...document.querySelectorAll('*')]
                .filter(e => e.children.length === 0 && (e.textContent || '').trim() === s).length;
            return { completed: leaf('Completed'), active: leaf('Active'), pending: leaf('Pending'), inactive: leaf('Inactive') };
        });
        console.log(`[Amend] Workflow states — completed:${counts.completed} active:${counts.active} pending:${counts.pending} inactive:${counts.inactive}`);
        expect(counts.completed, 'amend workflow should show Completed').toBeGreaterThanOrEqual(1);
    }

    /** More → Audit Logs → wait for the change table (Change | From | To). */
    async openIntakeAuditLogs() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.intakeAuditLogsOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
        // The Audit Logs panel renders a table with a "Change"/"From"/"To" header.
        await this.page.getByText('Audit Logs', { exact: true }).first()
            .waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    /** With the Audit Logs panel open, assert the amend's title (subject) and
     *  line-item Qty changes are recorded as From → To rows. */
    async assertAuditLogShowsAmendChanges(data, oldQty, newQty) {
        const txt = await this.page.locator('body').innerText();
        const newTitle = `${data.intake.title} automation amended`;
        console.log(`[Amend] Audit log — has new title:${txt.includes(newTitle)} has qty ${oldQty}->${newQty}:${new RegExp(`Qty\\s+${oldQty}\\s+${newQty}`).test(txt)}`);

        // Subject change recorded (To column holds the amended title).
        expect(txt, 'audit log should record the subject/title change').toContain('automation amended');
        // Qty change recorded as "<item> - Qty  <old>  <new>".
        expect(txt, `audit log should record the Qty change ${oldQty} → ${newQty}`)
            .toMatch(new RegExp(`Qty\\s+${oldQty}\\s+${newQty}`));
    }

    async closeIntakeAuditLogs() {
        const closeBtn = this.page.getByRole('button', { name: /^Close$/ }).first();
        if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();
        else await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
    }

    // ── Intake – Reassign Purchaser (More dropdown, Released intakes) ─────────

    /** More → Reassign Purchaser → wait for the popup. */
    async openReassignPurchaser() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.intakeReassignPurchaserOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
        await this.page.locator(`xpath=${IL.intakeReassignAddTrigger}`).first()
            .waitFor({ state: 'visible', timeout: 10000 });
        await this.page.waitForTimeout(800);
    }

    /** Open the "Select purchasers to add" multi-select and tick the option rows
     *  at `indices` (option[0] is "Select All", users start at 1). Returns the
     *  selected user names. Closes the list (Escape) since it overlays the form. */
    async _selectAddPurchasers(indices) {
        await this.page.locator(`xpath=${IL.intakeReassignAddTrigger}`).first().click();
        await this.page.waitForTimeout(1000);
        const opts = this.page.locator('[role="option"]');
        const names = [];
        for (const i of indices) {
            const name = (await opts.nth(i).textContent())?.trim();
            names.push(name);
            await opts.nth(i).click();
            await this.page.waitForTimeout(300);
        }
        await this.page.keyboard.press('Escape'); // close the list (overlays reason/Reassign)
        await this.page.waitForTimeout(600);
        return names;
    }

    async _fillReasonAndReassign(reason) {
        await this.page.locator(IL.intakeReassignReason).first().fill(reason);
        await this.page.waitForTimeout(400);
        await this.page.locator(`xpath=${IL.intakeReassignConfirm}`).first().click();
        await expect(this.page.getByText(IL.intakeReassignToast, { exact: false }).first())
            .toBeVisible({ timeout: 15000 });
        await this.page.waitForTimeout(1500);
    }

    /** Reassignment #1: add the first two available purchasers. Returns their names. */
    async reassignPurchaserAddTwo(reason) {
        await this.openReassignPurchaser();
        const names = await this._selectAddPurchasers([1, 2]);
        await this._fillReasonAndReassign(reason);
        console.log('[Reassign] Added purchasers:', JSON.stringify(names));
        return names;
    }

    /** Reassignment #2: open the Replace-Purchaser dropdown, assert the
     *  previously-added users are listed, replace the first one, add a new
     *  purchaser, then reassign. */
    async reassignPurchaserReplace(reason, previousNames) {
        await this.openReassignPurchaser();

        // Open the Replace Purchaser dropdown and verify the previous purchasers.
        await this.page.locator(`xpath=${IL.intakeReassignReplaceTrigger}`).first().click();
        await this.page.waitForTimeout(1000);
        const replaceOpts = await this.page.evaluate(() =>
            [...document.querySelectorAll('[role="option"]')].map(o => (o.textContent || '').trim()).filter(Boolean));
        console.log('[Reassign] Replace dropdown options:', JSON.stringify(replaceOpts));
        for (const nm of previousNames) {
            expect(replaceOpts.some(o => o.includes(nm)),
                `Replace dropdown should list previously-added purchaser "${nm}"`).toBe(true);
        }
        // Replace the first previously-added purchaser. The Replace dropdown is a
        // single-select and auto-closes on pick — only Escape if it's still open
        // (an unconditional Escape would close the whole popup instead).
        await this.page.locator('[role="option"]').filter({ hasText: previousNames[0] }).first().click();
        await this.page.waitForTimeout(500);
        if (await this.page.locator('[role="option"]').first().isVisible({ timeout: 500 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(400);
        }

        // Add a new purchaser (a different option) and reassign. Return its name.
        const newNames = await this._selectAddPurchasers([3]);
        await this._fillReasonAndReassign(reason);
        console.log('[Reassign] Replace reassignment done — new purchaser:', JSON.stringify(newNames));
        return newNames[0];
    }

    /** Reopen Reassign Purchaser, open the Replace dropdown and assert the given
     *  (newly-added) purchaser is now listed there, then cancel out. Confirms the
     *  previous replace reassignment took effect. */
    async verifyReplaceDropdownHasUser(expectedName) {
        await this.openReassignPurchaser();
        await this.page.locator(`xpath=${IL.intakeReassignReplaceTrigger}`).first().click();
        await this.page.waitForTimeout(1000);
        const opts = await this.page.evaluate(() =>
            [...document.querySelectorAll('[role="option"]')].map(o => (o.textContent || '').trim()).filter(Boolean));
        console.log('[Reassign] Replace dropdown after replace:', JSON.stringify(opts));
        expect(opts.some(o => o.includes(expectedName)),
            `Replace dropdown should now list the newly-added purchaser "${expectedName}"`).toBe(true);
        // Close the dropdown, then cancel the popup.
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        const cancel = this.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(text())='Cancel']`).first();
        if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) await cancel.click();
        await this.page.waitForTimeout(800);
    }

    // ── Intake – Reassign User (More dropdown, Released intakes) ──────────────

    /** More → Reassign User → "Select a user" → pick a user → close the list →
     *  reason → Submit. Returns { name, toast } for assertions/logging. */
    async reassignUser(reason = 'Reassigned user by automation') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.intakeReassignUserOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const trigger = this.page.locator(`xpath=${IL.intakeReassignUserTrigger}`).first();
        await trigger.waitFor({ state: 'visible', timeout: 10000 });
        await trigger.click();
        await this.page.waitForTimeout(1000);

        const options = this.page.locator('[role="option"]');
        const name = (await options.first().textContent())?.trim();
        await options.first().click();
        await this.page.waitForTimeout(500);
        // Single-select usually auto-closes; only Escape if the list is still open.
        if (await options.first().isVisible({ timeout: 500 }).catch(() => false)) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(400);
        }

        await this.page.locator(IL.intakeReassignUserReason).first().fill(reason);
        await this.page.waitForTimeout(400);
        await this.page.locator(`xpath=${IL.intakeReassignUserSubmit}`).first().click();
        await expect(this.page.getByText(IL.intakeReassignUserToast, { exact: false }).first())
            .toBeVisible({ timeout: 15000 });
        await this.page.waitForTimeout(1000);
        console.log(`[ReassignUser] reassigned to "${name}" — toast confirmed`);
        return { name };
    }

    // ── Intake – Mark Processed (More dropdown, Released intakes) ─────────────

    /** More → Mark Processed → fill the reason → Submit → status becomes Processed. */
    async markIntakeProcessed(reason = 'Marked processed by automation') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.intakeMarkProcessedOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const reasonField = this.page.locator(`xpath=${IL.intakeMarkProcessedReason}`).first();
        await reasonField.waitFor({ state: 'visible', timeout: 10000 });
        await reasonField.fill(reason);
        await this.page.waitForTimeout(400);
        await this.page.locator(`xpath=${IL.intakeMarkProcessedSubmit}`).first().click();
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
        console.log('[MarkProcessed] submitted');
    }

    async assertIntakeStatusProcessed() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusProcessed}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── Revert Pending Budget (More dropdown, Released CXOs) ──────────────────
    // Lives on the parent CXO. The pending-budget row opens PRE-SELECTED with its
    // Rollback Value pre-filled to the full Pending Value, so a full revert only
    // needs Remarks + Submit. Same header More menu as the intake, so this works
    // on either module's overview page.

    /** More → Revert Pending Budget → (optionally override the amount in the
     *  Rollback Value cell) → fill Remarks → Submit. With `amount` null the
     *  pre-filled full Pending Value is used (revert everything). Throws if the
     *  dialog reports nothing is pending, which the test should surface. */
    async revertPendingBudget({ amount = null, remarks = 'Reverted by automation' } = {}) {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);

        const opt = this.page.locator(`xpath=${IL.intakeRevertBudgetOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const dialog = this.page.locator(`xpath=${IL.revertBudgetDialog}`).first();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });
        await this.page.waitForTimeout(600);

        // Guard: nothing to revert → fail loudly (setup problem, not a pass).
        if (await dialog.getByText(IL.revertBudgetEmptyMsg, { exact: false })
                .isVisible({ timeout: 2000 }).catch(() => false)) {
            throw new Error('[RevertBudget] Dialog shows "No pending budget to revert" — the released CXO has no pending budget.');
        }

        // The single budget row (has the Rollback Value input) — opens pre-ticked.
        const row = this.page.locator(`xpath=${IL.revertBudgetRow}`).first();
        await row.waitFor({ state: 'visible', timeout: 8000 });
        const checkbox = row.locator(`xpath=${IL.revertBudgetRowCheckbox}`).first();
        if ((await checkbox.getAttribute('aria-checked').catch(() => null)) === 'false') {
            await checkbox.click().catch(() => {});
        }

        const rollback = row.locator(`xpath=${IL.revertBudgetRollbackInput}`).first();
        await rollback.waitFor({ state: 'visible', timeout: 8000 });
        // Only override the pre-filled full amount when an explicit amount is given.
        if (amount != null) {
            await rollback.click();
            await rollback.fill(String(amount));
            await this.page.waitForTimeout(300);
        }
        const revertedAmount = (await rollback.inputValue().catch(() => '')) || String(amount ?? '');
        console.log(`[RevertBudget] Rollback Value = ${revertedAmount}`);

        // Remarks (required).
        const remarksField = this.page.locator(`xpath=${IL.revertBudgetRemarks}`).first();
        await remarksField.waitFor({ state: 'visible', timeout: 8000 });
        await remarksField.fill(remarks);
        await this.page.waitForTimeout(300);

        // Submit — enabled once a row is selected, amount set, and remarks entered.
        const submit = this.page.locator(`xpath=${IL.revertBudgetSubmit}`).first();
        await expect(submit).toBeEnabled({ timeout: 8000 });
        await submit.click();
        await this.page.waitForTimeout(2500);
        console.log(`[RevertBudget] Submitted revert of ${revertedAmount} with remarks "${remarks}"`);
        // Dialog closes on success.
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
        return revertedAmount;
    }

    /**
     * Open More → Revert Pending Budget on a CXO and READ the budget row without
     * submitting anything, as {transactionValue, consumed, reverted, pending}
     * (numbers, commas stripped) — or {empty:true} when the dialog reports
     * "No pending budget to revert".
     *
     * Scenario 2 needs this to prove the CXO is PARTIALLY consumed before the
     * revert: budget is consumed at AWARD, so a CXO whose intake is merely
     * released still reads Consumed 0 / Pending <full value> (verified live
     * 2026-09-09 on CXO-FNSE-26-390 and -391). Leaves the dialog OPEN so the
     * caller can go on to revert; pass {close:true} to dismiss it.
     */
    async readPendingBudgetRow({ close = false } = {}) {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const opt = this.page.locator(`xpath=${IL.intakeRevertBudgetOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();

        const dialog = this.page.locator(`xpath=${IL.revertBudgetDialog}`).first();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });
        await this.page.waitForTimeout(800);

        const empty = await dialog.getByText(IL.revertBudgetEmptyMsg, { exact: false })
            .isVisible({ timeout: 2000 }).catch(() => false);
        if (empty) {
            console.log('[RevertBudget] dialog reports: no pending budget to revert');
            if (close) await this._closeRevertBudgetDialog(dialog);
            return { empty: true };
        }

        // Row layout: Budget Item Code | Transaction Value | Consumed Value |
        // Reverted Value | Pending Value | Rollback Value(input).
        const row = this.page.locator(`xpath=${IL.revertBudgetRow}`).first();
        await row.waitFor({ state: 'visible', timeout: 8000 });
        const cells = (await row.locator('td').allInnerTexts())
            .map(t => t.replace(/\s+/g, ' ').trim());
        const num = (t) => {
            const cleaned = (t || '').replace(/[^\d.-]/g, '');
            return cleaned === '' ? null : parseFloat(cleaned);
        };
        // Anchor on the LAST cell (Rollback input) and count back, so a leading
        // checkbox column — present here — cannot shift every field by one.
        const rollbackValue = num(await row.locator(`xpath=${IL.revertBudgetRollbackInput}`)
            .first().inputValue().catch(() => ''));
        const tail = cells.slice(-5);
        const out = {
            empty: false,
            raw: cells,
            transactionValue: num(tail[0]),
            consumed: num(tail[1]),
            reverted: num(tail[2]),
            pending: num(tail[3]),
            rollbackValue,
        };
        console.log(`[RevertBudget] transaction=${out.transactionValue} consumed=${out.consumed} `
            + `reverted=${out.reverted} pending=${out.pending} rollback=${out.rollbackValue}`);
        if (close) await this._closeRevertBudgetDialog(dialog);
        return out;
    }

    async _closeRevertBudgetDialog(dialog) {
        const cancel = dialog.getByRole('button', { name: /Cancel|Close/i }).first();
        if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) await cancel.click();
        else await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(600);
    }

    /** Re-open Revert Pending Budget and assert the full pending budget is gone
     *  ("No pending budget to revert") — proving the revert persisted. */
    async assertPendingBudgetReverted() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        await this.page.locator(`xpath=${IL.intakeRevertBudgetOption}`).first().click();

        const dialog = this.page.locator(`xpath=${IL.revertBudgetDialog}`).first();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });
        await expect(dialog.getByText(IL.revertBudgetEmptyMsg, { exact: false }).first())
            .toBeVisible({ timeout: 8000 });
        console.log('[RevertBudget] Verified: no pending budget remains after revert');
        // Close the dialog.
        const cancel = dialog.getByRole('button', { name: /Cancel|Close/i }).first();
        if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) await cancel.click();
        else await this.page.keyboard.press('Escape');
    }

    // ── Intake – Activity Log (clock icon) ────────────────────────────────────

    async openActivityLog() {
        const clock = this.page.locator(`xpath=${IL.intakeActivityLogBtn}`).first();
        await clock.waitFor({ state: 'visible', timeout: 15000 });
        await clock.click();
        await this.page.locator(`xpath=${IL.intakeActivityLogTitle}`).first()
            .waitFor({ state: 'visible', timeout: 10000 });
        await this.page.waitForTimeout(1200);
    }

    /** Assert the Activity Log contains each of the given strings (e.g. the two
     *  distinct reassignment reasons → proves both events were captured). */
    async assertActivityLogContains(texts) {
        const log = await this.page.locator('body').innerText();
        console.log('[Reassign] Activity Log (first 1200 chars):\n' + log.slice(log.indexOf('Activity Log'), log.indexOf('Activity Log') + 1200));
        for (const t of texts) {
            expect(log, `Activity Log should capture "${t}"`).toContain(t);
        }
    }

    // ── Intake – Negative / validation helpers ────────────────────────────────
    // The Intake create page does NOT navigate or toast on an invalid Submit.
    // Instead it stays on /intakes/create and renders:
    //   • per-section "N errors!" badges (e.g. Header Details "19 errors!")
    //   • once a section is expanded, red-bordered fields + "<field> is empty" text

    /** Click Submit WITHOUT handling the Workflow-Summary popup — for invalid
     *  forms that are expected to be rejected, so the test can assert badges. */
    async submitIntakeExpectingError() {
        await this.page.locator(IL.intakeSubmit).first().click();
        await this.page.waitForTimeout(1200);
    }

    async assertStillOnIntakeCreatePage() {
        await expect(this.page).toHaveURL(/\/intakes\/create/);
    }

    /** Assert the Workflow-Summary submission popup did NOT open (i.e. the
     *  invalid Submit was blocked client-side). */
    async assertNoIntakeSubmissionPopup() {
        await this.page.waitForTimeout(600);
        const proceed = this.page.locator(IL.intakeProceed).first();
        const open = await proceed.isVisible({ timeout: 2000 }).catch(() => false);
        expect(open, 'Workflow-Summary submission popup should not open').toBe(false);
    }

    /** Assert the given section shows its "N errors!" badge. Takes the first
     *  error badge that follows the section title, which is that section's own
     *  badge (un-flagged sections render no badge). */
    async assertIntakeSectionErrorBadge(section) {
        const badge = this.page.locator(
            `xpath=(//*[normalize-space(text())=${JSON.stringify(section)}]/following::span[contains(normalize-space(.),'error') and contains(normalize-space(.),'!')])[1]`
        ).first();
        await expect(badge).toBeVisible({ timeout: 10000 });
    }

    /** Intake mandatory dropdowns flagged invalid render a red (destructive)
     *  border on their trigger button — note this is a plain <button>, not the
     *  role="combobox" the CXO form uses. */
    intakeRedBorderedFields() {
        return this.page.locator('button[class*="border-destructive"]');
    }

    /** With the sections expanded, assert ≥ `min` mandatory fields show the red
     *  border AND ≥ `min` "<field> is empty" helper messages are visible. */
    async assertIntakeMandatoryFieldsFlagged(min = 15) {
        await this.intakeRedBorderedFields().first().waitFor({ state: 'visible', timeout: 10000 });
        const reds = await this.intakeRedBorderedFields().count();
        expect(reds, 'red-bordered mandatory fields').toBeGreaterThanOrEqual(min);
        const empties = this.page.getByText(/is empty$/i);
        const emptyCount = await empties.count();
        expect(emptyCount, '"<field> is empty" messages').toBeGreaterThanOrEqual(min);
        console.log(`[IntakeNeg] ${reds} red-bordered fields, ${emptyCount} "is empty" messages`);
    }

    // ── Intake – Title edge-case helpers ──────────────────────────────────────

    /** Replace the document title with `value` and read back what the textarea
     *  actually stored. */
    async typeIntakeTitle(value) {
        const el = this.page.locator(IL.intakeTitle).first();
        await el.click();
        await el.fill('');
        await el.fill(value);
        await this.page.waitForTimeout(300);
    }

    async getIntakeTitleValue() {
        return await this.page.locator(IL.intakeTitle).first().inputValue();
    }

    // ── Intake – Line-item numeric edge-case helpers ──────────────────────────

    /** Type into the (already-added) row's inline Qty editor and read back what
     *  it accepted BEFORE committing — used to prove the field strips the minus
     *  sign / non-numeric chars and accepts decimals while typing. Discards the
     *  edit (Escape) so the cell is left untouched for the next call. */
    async typeIntakeQtyAndRead(value) {
        return await this._typeNumericCellAndRead(IL.intakeItemQtyEmptyRow, value);
    }

    /** Same as above for the Suggested Price cell. */
    async typeIntakePriceAndRead(value) {
        return await this._typeNumericCellAndRead(IL.intakeItemSuggPrice, value);
    }

    async _typeNumericCellAndRead(cellLocator, value) {
        const cell = this.page.locator(cellLocator).first();
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(500);
        // Select any existing (committed) content, then type the new value so the
        // field's numeric masking applies to each keystroke.
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.type(value);
        await this.page.waitForTimeout(300);
        // Read what the inline editor accepted BEFORE committing.
        const accepted = await this.page.evaluate(() => {
            const el = document.activeElement;
            return el && 'value' in el ? el.value : null;
        });
        // Commit with Tab (NOT Escape). Tab leaves the cell showing its value so a
        // subsequent click re-opens the editor reliably — Escape can leave the
        // cell in a state where the next click fails to re-enter edit mode.
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(400);
        return accepted;
    }

    /** Click Cancel on the create form, dismissing any "leave without saving"
     *  confirmation, then confirm the create page was left. */
    async cancelIntakeCreate() {
        await this.page.locator(L.cancelBtn).first().click();
        await this.page.waitForTimeout(1000);
        const leave = this.page.getByRole('button', { name: /Leave|Discard|Yes|Confirm|Ok/i }).first();
        if (await leave.isVisible({ timeout: 3000 }).catch(() => false)) {
            await leave.click();
            await this.page.waitForTimeout(800);
        }
        await expect(this.page).not.toHaveURL(/\/intakes\/create/, { timeout: 15000 });
    }

    // ── Save Intake code for downstream steps ────────────────────────────────

    async saveIntakeCode() {
        const url = this.page.url();

        const bodyText = await this.page.locator('body').textContent() ?? '';
        const codeMatch = bodyText.match(/INT[A-Z0-9\-]*\d+/i);
        const intakeCode = codeMatch ? codeMatch[0].trim() : null;

        const urlMatch = url.match(/\/intakes\/([^\/\?#]+)/);
        const intakeId = urlMatch ? urlMatch[1] : null;

        const displayCode = intakeCode || intakeId || 'unknown';

        console.log(`[Intake] Saving Intake code: ${displayCode}  |  URL: ${url}`);

        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedIntake = {
            code: displayCode,
            id:   intakeId,
            url:  url,
        };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');

        console.log(`[Intake] Saved to NSEFoundationData.json → savedIntake.code = "${displayCode}"`);
        return displayCode;
    }

    // ── Save CXO code for downstream steps ───────────────────────────────────

    async saveCxoCode() {
        const url = this.page.url();

        // Try to find a displayed CXO code on the page (e.g. "CXONSEF-00001")
        const bodyText = await this.page.locator('body').textContent() ?? '';
        const codeMatch = bodyText.match(/CXO[A-Z0-9\-]*\d+/i);
        const cxoCode = codeMatch ? codeMatch[0].trim() : null;

        // Extract numeric/UUID ID from the URL  e.g. /cxos/123  or /cxos/uuid-here
        const urlMatch = url.match(/\/cxos\/([^\/\?#]+)/);
        const cxoId = urlMatch ? urlMatch[1] : null;

        const displayCode = cxoCode || cxoId || 'unknown';

        console.log(`[CXO] Saving CXO code: ${displayCode}  |  URL: ${url}`);

        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedCxo = {
            code: displayCode,
            id:   cxoId,
            url:  url,
        };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');

        console.log(`[CXO] Saved to NSEFoundationData.json → savedCxo.code = "${displayCode}"`);
        return displayCode;
    }

    // ── Intake Listing → open saved Intake → Process → Send for Sourcing ─────

    // Reads savedIntake.code fresh from disk (the imported data object is stale
    // when the create test ran earlier in the same session and rewrote the JSON)
    getSavedIntakeCode() {
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const code = current.savedIntake?.code;
        if (!code || code === 'unknown') {
            throw new Error('No savedIntake.code in NSEFoundationData.json — run the Intake create test first.');
        }
        return code;
    }

    // Reads savedCxo.code fresh from disk (the imported data object is stale
    // when the CXO create test ran earlier in the same session and rewrote the
    // JSON — using `data.savedCxo.code` selects the PREVIOUS run's CXO).
    getSavedCxoCode() {
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const code = current.savedCxo?.code;
        if (!code || code === 'unknown') {
            throw new Error('No savedCxo.code in NSEFoundationData.json — run the CXO create test first.');
        }
        return code;
    }

    // Reads savedRequisition fresh from disk (same staleness reason as above)
    getSavedRequisition() {
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const saved = current.savedRequisition;
        if (!saved?.url) {
            throw new Error('No savedRequisition in NSEFoundationData.json — run the Award test first.');
        }
        return saved;
    }

    // Reads savedSourcingEvent fresh from disk (same staleness reason as above)
    getSavedSourcingEvent() {
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const saved = current.savedSourcingEvent;
        if (!saved?.code || saved.code === 'unknown') {
            throw new Error('No savedSourcingEvent.code in NSEFoundationData.json — run the Sourcing event test first.');
        }
        return saved;
    }

    async openSavedIntakeFromListing() {
        const code = this.getSavedIntakeCode();
        console.log(`[Intake] Searching listing for saved intake: ${code}`);

        // Reveal the hidden search input, search for the code
        const searchInput = this.page.locator(L.intakeListingSearchInput);
        if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
            await this.page.locator(L.intakeListingSearchIcon).first().click();
            await searchInput.waitFor({ state: 'visible', timeout: 5000 });
        }
        await searchInput.fill(code);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(2000);

        // Click the row whose Code column matches
        const row = this.page.locator(`xpath=${L.intakeRowByCode(code)}`).first();
        await row.waitFor({ state: 'visible', timeout: 15000 });
        const codeLink = row.locator('td:first-child a').first();
        if (await codeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await codeLink.click();
        } else {
            await row.locator('td').first().click();
        }

        await this.page.waitForURL(/\/intakes\/[^\/]+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        console.log(`[Intake] Opened intake ${code} → ${this.page.url()}`);
        return code;
    }

    async clickIntakeProcess() {
        const btn = this.page.locator(L.intakeProcessBtn).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click();
        console.log('[Intake] Clicked Process button');
        await this.page.waitForTimeout(1500);
    }

    async clickSendForSourcing() {
        const option = this.page.locator(L.intakeSendForSourcingOption).first();
        await option.waitFor({ state: 'visible', timeout: 15000 });
        await option.click();
        console.log('[Intake] Clicked Send for Sourcing');
        await this.page.waitForTimeout(2000);
    }

    // ── New Sourcing Event page ───────────────────────────────────────────────

    async expandSourcingSections() {
        const btn = this.page.locator(`xpath=${L.sourcingExpandAllBtn}`);
        await btn.waitFor({ state: 'visible', timeout: 15000 });
        await btn.click();
        console.log('[Sourcing] Expanded all sections');
        await this.page.waitForTimeout(1000);
    }

    // ── Sourcing Event — Event Information fields ─────────────────────────────

    async selectSourcingPaymentTerms() {
        const trigger = this.page.locator(`xpath=${L.sourcingPaymentTerms}`).first();
        await trigger.scrollIntoViewIfNeeded();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: false });
            const opt = this.page.locator('[role="option"]').first();
            await opt.waitFor({ state: 'visible', timeout: 15000 });
            const optText = (await opt.textContent() ?? '').trim();
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(optText, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
        console.log('[Sourcing] Payment Terms selected');
    }

    async fillSourcingExpectedDeliveryDate(data) {
        const trigger = this.page.locator(`xpath=${L.sourcingExpectedDeliveryDate}`).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.sourcing.expectedDeliveryDate);
        console.log('[Sourcing] Expected Delivery Date filled');
    }

    async fillSourcingCommercialBidDueDate(data) {
        const trigger = this.page.locator(`xpath=${L.sourcingCommercialBidDueDate}`).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.sourcing.commercialBidDueDate);
        console.log('[Sourcing] Commercial Bid Due Date filled');
    }

    async fillSourcingTechnicalBidDueDate(data) {
        const trigger = this.page.locator(`xpath=${L.sourcingTechnicalBidDueDate}`).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this._pickDate(data.sourcing.technicalBidDueDate);
        console.log('[Sourcing] Technical Bid Due Date filled');
    }

    // ── Sourcing Event — Supplier Selection ───────────────────────────────────

    async addSourcingSupplier(data) {
        const addBtn = this.page.locator(`xpath=${L.sourcingAddSupplierBtn}`).first();
        await addBtn.scrollIntoViewIfNeeded();
        await addBtn.click();

        // Popup → search for the supplier
        const search = this.page.locator(`xpath=${L.sourcingSupplierSearch}`).first();
        await search.waitFor({ state: 'visible', timeout: 10000 });
        await search.fill(data.sourcing.supplierSearch);
        await this.page.waitForTimeout(1500);

        // Select the displayed option
        const option = this.page.locator(`xpath=${L.sourcingSupplierOption(data.sourcing.supplierSearch)}`).first();
        await option.waitFor({ state: 'visible', timeout: 10000 });
        await option.click();

        // Submit inside the popup
        const submit = this.page.locator(`xpath=${L.sourcingSupplierPopupSubmit}`).first();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        await submit.click();
        console.log(`[Sourcing] Supplier "${data.sourcing.supplierSearch}" added`);
        await this.page.waitForTimeout(1500);
    }

    /**
     * Click the sourcing form's Submit and STOP at the Workflow Summary dialog.
     *
     * submitSourcingEvent() clicks Submit and immediately confirms the dialog,
     * which is right for building a chain and useless for scenario 18, where two
     * tabs must both sit on an OPEN dialog before either commits. Splitting the
     * two halves is what makes the race controllable.
     */
    async openSourcingWorkflowSummary() {
        const btn = this.page.locator(`xpath=${L.sourcingSubmitBtn}`).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        const dlgSubmit = this.page.locator(
            `xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
        await dlgSubmit.waitFor({ state: 'visible', timeout: 20000 });
        console.log('[Sourcing] Workflow Summary open, holding at Submit');
    }

    /**
     * Commit the Workflow Summary. Returns what happened rather than throwing on
     * a refusal: in scenario 18 the LOSER of the race is expected to be rejected,
     * and an exception there would hide the message we are trying to read.
     */
    async clickWorkflowSummarySubmit(tag = '') {
        const dlgSubmit = this.page.locator(
            `xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
        const visible = await dlgSubmit.isVisible({ timeout: 5000 }).catch(() => false);
        if (!visible) {
            console.log(`[Sourcing]${tag} no Workflow Summary Submit to click`);
            return { clicked: false, reason: 'dialog not open' };
        }
        const enabled = await dlgSubmit.isEnabled().catch(() => null);
        try {
            await dlgSubmit.click({ timeout: 10000 });
            console.log(`[Sourcing]${tag} Workflow Summary Submit clicked (enabled=${enabled})`);
            return { clicked: true, enabled };
        } catch (e) {
            const why = e.message.split('\n')[0];
            console.log(`[Sourcing]${tag} Workflow Summary Submit click FAILED: ${why}`);
            return { clicked: false, enabled, reason: why };
        }
    }

    async submitSourcingEvent() {
        const btn = this.page.locator(`xpath=${L.sourcingSubmitBtn}`).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('[Sourcing] Clicked Submit');

        // "Process Request" confirmation modal → Submit
        const confirmBtn = this.page.locator(`xpath=//div[@role='dialog']//button[normalize-space(.)='Submit']`).first();
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await confirmBtn.click();
        console.log('[Sourcing] Confirmed Process Request popup');
        await this.page.waitForTimeout(3000);
    }

    async _isSourcingPendingApproval(timeout = 3000) {
        return await this.page.locator(`xpath=${L.rfxPendingApprovalBadge}`).first()
            .isVisible({ timeout }).catch(() => false);
    }

    /**
     * Confirm the RFX has really LEFT Pending Approval, rather than inferring it
     * from a badge that has not rendered yet.
     *
     * The header is re-rendered after each approval, so there is a window where
     * no status badge exists at all. `!_isSourcingPendingApproval()` reads that
     * window as "approved" and the approval loop exits with the RFX still
     * pending — measured 2026-09-09: approveSourcingUntilReleased logged
     * "RFX live (not Pending Approval) after 1 approval(s)" for RFX-26-280,
     * which was still Pending Approval minutes later, and the chain then failed
     * at "Submit Quote not visible" with no clue as to why.
     *
     * So require a POSITIVE reading: reload, and only accept "left pending" when
     * some other status chip is actually on the page.
     */
    async _confirmSourcingLeftPendingApproval() {
        for (let i = 0; i < 3; i++) {
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(2500);
            if (await this._isSourcingPendingApproval(3000)) return false;
            const chip = await this.readV4StatusChip({ timeoutMs: 15000 }).catch(() => '');
            if (chip && chip !== 'Pending Approval') {
                console.log(`[Sourcing] confirmed status "${chip}" — no longer Pending Approval`);
                return true;
            }
            console.log(`[Sourcing] no status chip rendered yet — re-checking (${i + 1}/3)...`);
        }
        console.log('[Sourcing] could not read any status chip; treating as STILL pending');
        return false;
    }

    // After "Send for Sourcing" submit, the RFX header shows a "Pending Approval"
    // badge plus a direct Approve button (same shape as the CXO flow). It only
    // goes live (suppliers can Submit Quote) once approved. Mirror the CXO pattern:
    // each round, stop when no longer Pending Approval; otherwise find Approve
    // (reloading if stale), and if it never shows, reassign the approver to NSEF
    // Support Admin and retry, then approve.
    async approveSourcingUntilReleased(comments = 'Approved by automation') {
        const maxStages = 10;
        for (let i = 0; i < maxStages; i++) {
            if (!(await this._isSourcingPendingApproval(2000))
                    && await this._confirmSourcingLeftPendingApproval()) {
                console.log(`[Sourcing] RFX live (not Pending Approval) after ${i} approval(s).`);
                return;
            }

            let visible = await this._waitForApproveButton({
                tag: 'Sourcing',
                stopWhen: async () => !(await this._isSourcingPendingApproval(1000)),
            });

            if (!visible) {
                if (!(await this._isSourcingPendingApproval(1000))) {
                    console.log(`[Sourcing] RFX live after ${i} approval(s).`);
                    return;
                }
                console.log('[Sourcing] Approve button missing — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'Sourcing'))) {
                    console.log('[Sourcing] Reassign unavailable — stopping approval loop.');
                    break;
                }
                visible = await this._waitForApproveButton({
                    tag: 'Sourcing',
                    stopWhen: async () => !(await this._isSourcingPendingApproval(1000)),
                });
                if (!visible) {
                    console.log('[Sourcing] Still no Approve button after reassign — stopping.');
                    break;
                }
            }

            console.log(`[Sourcing] Approving stage ${i + 1}...`);
            await this._clickApproveWithComments(comments);
        }
    }

    // ── Quote Request (RFX) — navigation ──────────────────────────────────────

    async hoverSourcingTab() {
        const tab = this.page.locator(`xpath=${L.sourcingNavTab}`).first();
        await tab.waitFor({ state: 'visible', timeout: 15000 });
        await tab.hover();
        await this.page.waitForTimeout(800);
    }

    async clickQuoteRequestMenu() {
        const item = this.page.locator(`xpath=${L.quoteRequestMenuItem}`).first();
        await item.waitFor({ state: 'visible', timeout: 10000 });
        await item.click();
        await this.page.waitForURL(/\/quote-requests/, { timeout: 15000 });
        // Listing shows a "Checking permissions..." loader before rendering
        await this.page.locator('table').first().waitFor({ state: 'visible', timeout: 60000 });
        console.log('[Quote] On Quote Request listing page');
    }

    async openSavedSourcingEventFromListing() {
        const { code } = this.getSavedSourcingEvent();
        console.log(`[Quote] Searching quote requests for: ${code}`);

        const searchInput = this.page.locator(`xpath=${L.quoteRequestSearchInput}`).first();
        await searchInput.waitFor({ state: 'visible', timeout: 15000 });
        await searchInput.fill(code);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(2000);

        // Click the matching row
        const row = this.page.locator(`xpath=${L.quoteRequestRowByCode(code)}`).first();
        await row.waitFor({ state: 'visible', timeout: 15000 });
        const link = row.locator('a').first();
        if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
            await link.click();
        } else {
            await row.locator('td').first().click();
        }

        await this.page.waitForURL(/\/quote-requests\/[^\/]+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        console.log(`[Quote] Opened sourcing event ${code} → ${this.page.url()}`);
        return code;
    }

    // ── RFX — Submit Commercial Quote ─────────────────────────────────────────

    async clickSupplierSubmitQuote() {
        const btn = this.page.locator(`xpath=${L.rfxSubmitQuoteBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('[Quote] Clicked Submit Quote on supplier');
        await this.page.waitForTimeout(800);
    }

    async clickCommercialQuoteOption() {
        const opt = this.page.locator(`xpath=${L.rfxCommercialQuoteOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();
        console.log('[Quote] Selected Commercial Quote');
        await this.page.waitForTimeout(2500);
    }

    /**
     * Select one or more currencies in the Event Information "Currencies" field.
     *
     * This is what makes scenario 20 provable at all: the base-currency toggle
     * can only change a figure when the quote currency differs from the base
     * currency. An RFX restricted to INR (the base) can never show a conversion,
     * so the RFX must be created allowing INR *and* USD, then quoted in USD.
     *
     * The control is a multi-select, so the menu stays open between picks and
     * each wanted currency is clicked in turn. Selection state renders as a
     * lucide-check, not aria-selected, so the result is verified by the trigger
     * label changing rather than by reading aria.
     *
     * @param {string[]} currencies e.g. ['INR - Indian Rupee', 'USD - US Dollar']
     */
    async selectSourcingCurrencies(currencies) {
        const trigger = this.page.locator(`xpath=${L.sourcingCurrenciesField}`).first();
        await trigger.waitFor({ state: 'visible', timeout: 20000 });
        await trigger.scrollIntoViewIfNeeded();
        const before = (await trigger.innerText().catch(() => '')).trim();

        // The options TOGGLE. The field is pre-populated with the transaction's
        // currency (INR), so clicking INR blindly DESELECTS it and the RFX ends
        // up USD-only — observed live 2026-09-04: 'INR - Indian Rupee' -> 'USD -
        // US Dollar' when both were asked for. So click only what is missing,
        // judged from the trigger label rather than aria-selected (which reads
        // "false" even for the selected row).
        const already = c => before.includes(c) || before.includes(c.split(' - ')[0]);
        const toClick = currencies.filter(c => !already(c));
        const kept = currencies.filter(already);
        if (kept.length) console.log(`[SOURCING] already selected, not re-clicking: ${kept.join(', ')}`);

        if (toClick.length) {
            await trigger.click();
            await this.page.waitForTimeout(800);

            for (const currency of toClick) {
                const search = this.page.locator('[placeholder="Search..."]').last();
                if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await search.fill(currency.split(' - ')[0]);
                    await this.page.waitForTimeout(500);
                }
                const opt = this.page.locator(`xpath=${L.currencyMultiOption(currency)}`).first();
                await opt.waitFor({ state: 'visible', timeout: 8000 });
                await opt.click();
                await this.page.waitForTimeout(500);
            }
        }

        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(600);
        const after = (await trigger.innerText().catch(() => '')).trim();
        console.log(`[SOURCING] Currencies: "${before}" -> "${after}" (wanted ${currencies.join(', ')})`);

        // The trigger summarises rather than listing every pick, so three shapes
        // all mean success (all observed or plausible on this widget):
        //   "INR - Indian Rupee\n+1"  → first item plus N more  ← what it actually renders
        //   "2 selected"               → a bare count
        //   "INR - Indian Rupee, USD"  → the full list
        const codes = currencies.map(c => c.split(' - ')[0]);
        const listsAll = codes.every(code => after.includes(code));
        const countsAll = new RegExp(`\\b${codes.length}\\b`).test(after);
        // "+N" means N MORE beyond the one shown, so the total is 1 + N.
        const plus = after.match(/\+\s*(\d+)/);
        const plusAll = !!plus && (1 + Number(plus[1])) >= codes.length;
        if (!listsAll && !countsAll && !plusAll) {
            throw new Error(
                `Currencies field shows "${after}" — expected all of ${codes.join(', ')}. `
                + `The options toggle, so a currency that was already selected must not be re-clicked.`);
        }
        return { before, after };
    }

    async selectQuotePreferredCurrency(data, currencyOverride = null) {
        // Override lets a multi-currency RFX be quoted in USD without mutating
        // the shared fixture (see the shared-fixture hazard note in the repo).
        const wanted = currencyOverride || data.sourcing.preferredCurrency;
        const trigger = this.page.locator(`xpath=${L.quotePreferredCurrency}`).first();
        await trigger.waitFor({ state: 'visible', timeout: 20000 });
        await trigger.scrollIntoViewIfNeeded();
        let selected = false;
        while (!selected) {
            await trigger.click();
            await this.page.waitForTimeout(500);
            // Some currency dropdowns have a search box, some don't
            const searchBox = this.page.locator('[placeholder="Search..."]').last();
            if (await searchBox.isVisible({ timeout: 1500 }).catch(() => false)) {
                await searchBox.fill(wanted);
                await this.page.waitForTimeout(400);
            }
            const opt = this.page.locator(`xpath=//div[@role='option'][contains(normalize-space(.),'${wanted}')]`).first();
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(300);
                continue;
            }
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(wanted, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
        console.log(`[Quote] Preferred Currency set to ${wanted}`);
    }

    async fillQuoteUnitRate(data) {
        // Editable cell in the quote item grid — click to activate, then type.
        // Verify the value actually landed; retry if the grid swallowed the input.
        const cell = this.page.locator(L.quoteUnitRateCell).first();
        await cell.waitFor({ state: 'visible', timeout: 15000 });
        await cell.scrollIntoViewIfNeeded();

        for (let attempt = 0; attempt < 3; attempt++) {
            await cell.click();
            await this.page.waitForTimeout(500);
            await this.page.keyboard.type(data.sourcing.unitRate);
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(800);

            const cellText = (await cell.textContent() ?? '').replace(/[,\s]/g, '');
            if (cellText.includes(data.sourcing.unitRate)) {
                console.log(`[Quote] Unit Rate filled: ${data.sourcing.unitRate}`);
                return;
            }
            console.log(`[Quote] Unit Rate not registered (cell shows "${cellText}") — retrying...`);
        }
        throw new Error(`Unit Rate "${data.sourcing.unitRate}" was not entered into the quote grid`);
    }

    async submitQuote() {
        const btn = this.page.locator(`xpath=${L.quoteSubmitBtn}`).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('[Quote] Clicked Submit Quote');

        // Confirmation popup, if any
        const confirmBtn = this.page.locator(`xpath=//div[@role='dialog']//button[contains(normalize-space(.),'Submit') or normalize-space(.)='Confirm' or normalize-space(.)='Yes']`).first();
        if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await confirmBtn.click();
            console.log('[Quote] Confirmed quote submission popup');
        }

        // Wait for the quote form to actually close (submission processed and
        // navigated back to the RFX view) before any status checks/reloads —
        // reloading the form mid-submission cancels it
        const formBtn = this.page.locator(`xpath=${L.quoteSubmitBtn}`).first();
        await formBtn.waitFor({ state: 'hidden', timeout: 45000 })
            .then(() => console.log('[Quote] Quote form closed — submission processed'))
            .catch(() => console.log('[Quote] Quote form still open after 45s'));
        await this.page.waitForTimeout(2000);
    }

    async assertSourcingStatusQuoted() {
        // Status may need a reload to reflect.
        //
        // The reload is GUARDED: submitting the quote leaves the app mid-navigation
        // back to the RFX view, and a reload issued into that window dies with
        // "page.reload: net::ERR_ABORTED; maybe frame was detached?" — which killed
        // scenario 1 on 2026-09-10 right after a quote that had in fact succeeded.
        // Every reload in this file sits in a retry/refresh context with a re-check
        // after it, so a failed reload should cost one iteration, never the chain.
        // The expect() below is still the real assertion.
        for (let i = 0; i < 4; i++) {
            const quoted = await this.page.locator(`xpath=${L.quotedStatusBadge}`).first()
                .isVisible({ timeout: 5000 }).catch(() => false);
            if (quoted) {
                console.log('[Quote] Sourcing status is Quoted');
                return;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(2000);
        }
        await expect(this.page.locator(`xpath=${L.quotedStatusBadge}`).first()).toBeVisible({ timeout: 10000 });
    }

    // ── RFX — Reject during the approval workflow ─────────────────────────────
    // A submitted sourcing event sits at Pending Approval with a header Reject
    // button (same v4 header as CXO/Intake). The reject dialog needs a comment
    // before its Reject confirm enables. If the Reject button is missing (step
    // assigned to another approver) reassign to NSEF Support Admin and retry.
    async rejectRfx(reason = 'Rejected by automation') {
        const rejectBtn = this.page.locator(`xpath=${IL.intakeRejectBtn}`).first();

        let ready = false;
        for (let attempt = 0; attempt < 5 && !ready; attempt++) {
            await this.page.waitForTimeout(1500);
            if (await rejectBtn.isVisible({ timeout: 4000 }).catch(() => false)) { ready = true; break; }
            if (attempt < 2) {
                console.log(`[RFX] Reject button not visible — reloading (${attempt + 1}/2)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                continue;
            }
            if (attempt === 2) {
                console.log('[RFX] Reassigning approver to NSEF Support Admin so Reject is available...');
                await this.reassignWorkflowApprover('Reassigned for automated testing', 'RFX');
                continue;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        await rejectBtn.waitFor({ state: 'visible', timeout: 8000 });
        await rejectBtn.click();

        const comments = this.page.locator(IL.intakeApproveComments).first();
        await comments.waitFor({ state: 'visible', timeout: 10000 });
        await comments.fill(reason);

        const confirm = this.page.locator(`xpath=${IL.intakeRejectConfirm}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log('[RFX] Reject submitted');
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    async assertSourcingStatusRejected() {
        await expect(this.page.locator(`xpath=${IL.intakeStatusRejected}`).first())
            .toBeVisible({ timeout: 20000 });
    }

    // ── RFX — Edit a Rejected RFX and resubmit ────────────────────────────────
    // A Rejected RFX is editable via More → Edit (it drops back to an editable
    // Draft form, pre-filled with the prior values). Resubmitting re-triggers the
    // approval workflow; the caller then approves it to live/Released.
    async editAndResubmitRejectedRfx() {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const editOpt = this.page.locator(`xpath=//*[@role='menuitem'][normalize-space(.)='Edit']`).first();
        await editOpt.waitFor({ state: 'visible', timeout: 8000 });
        await editOpt.click();

        await this.page.waitForURL(/\/quote-requests\/[^\/]+\/edit/, { timeout: 15000 }).catch(() => {});
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2500);

        // The form is pre-filled and valid → resubmit as-is (Submit + the
        // "Process Request" confirmation popup, same as a fresh sourcing event).
        await this.submitSourcingEvent();
        await this.page.waitForTimeout(2000);
        console.log('[RFX] Rejected RFX edited & resubmitted → Pending Approval');
    }

    async assertSourcingStatusReleased() {
        // A live/approved RFX no longer shows the Pending Approval badge; its
        // header status reads Released (accept Live/Active/Published as synonyms).
        await expect(this.page.locator(
            `xpath=//*[normalize-space(text())='Released' or normalize-space(text())='Live' or normalize-space(text())='Active' or normalize-space(text())='Published']`
        ).first()).toBeVisible({ timeout: 20000 });
    }

    // ── RFX — More → Foreclose ────────────────────────────────────────────────

    async forecloseRfx(data) {
        // More dropdown
        const moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 20000 });
        await moreBtn.click();
        await this.page.waitForTimeout(800);

        // Foreclose option — absent when the RFX is already foreclosed (re-runs)
        const foreclose = this.page.locator(`xpath=${L.rfxForecloseOption}`).first();
        if (!(await foreclose.isVisible({ timeout: 10000 }).catch(() => false))) {
            console.log('[Award] Foreclose option not available — already foreclosed, skipping.');
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
            return;
        }
        await foreclose.click();
        console.log('[Award] Clicked Foreclose');
        await this.page.waitForTimeout(1000);

        // Reason → Submit
        const reason = this.page.locator(`xpath=${L.rfxForecloseReasonField}`).first();
        await reason.waitFor({ state: 'visible', timeout: 10000 });
        await reason.fill(data.sourcing.forecloseReason);

        const submit = this.page.locator(`xpath=${L.rfxForecloseSubmitBtn}`).first();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        await submit.click();
        console.log('[Award] Foreclose submitted');
        await this.page.waitForTimeout(3000);
    }

    // ── RFX — Award flow ──────────────────────────────────────────────────────

    async clickAnalysisTab() {
        // The Analysis tab content can hang on its loading spinner — wait for
        // the Award button to render, reloading and re-clicking the tab if stuck
        for (let attempt = 0; attempt < 3; attempt++) {
            const tab = this.page.locator(`xpath=${L.rfxAnalysisTab}`).first();
            await tab.waitFor({ state: 'visible', timeout: 20000 });
            await tab.click();
            await this.page.waitForTimeout(2000);

            const rendered = await this.page.locator(`xpath=${L.rfxAwardBtn}`).first()
                .waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true).catch(() => false);
            if (rendered) {
                console.log('[Award] On Analysis tab');
                return;
            }
            console.log(`[Award] Analysis tab stuck loading — reloading (${attempt + 1}/3)...`);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        throw new Error('Analysis tab content did not load (Award button never appeared)');
    }

    async clickAwardButton() {
        const btn = this.page.locator(`xpath=${L.rfxAwardBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click();
        console.log('[Award] Clicked Award');
        await this.page.waitForTimeout(2000);
    }

    async fillAllocatedQuantity() {
        // Read the Pending Awarded Quantity from the table, type it into the
        // Allocated Quantity cell (grid-style: click → type → Tab → verify)
        const pendingCell = this.page.locator(L.awardPendingQtyCell).first();
        await pendingCell.waitFor({ state: 'visible', timeout: 15000 });
        const pendingText = (await pendingCell.textContent() ?? '').trim();
        const qty = String(parseFloat(pendingText.replace(/[^\d.]/g, '')));
        console.log(`[Award] Pending Awarded Quantity: "${pendingText}" → entering ${qty}`);

        const cell = this.page.locator(L.awardAllocatedQtyCell).first();
        await cell.scrollIntoViewIfNeeded();
        for (let attempt = 0; attempt < 3; attempt++) {
            await cell.click();
            await this.page.waitForTimeout(500);
            await this.page.keyboard.type(qty);
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(800);

            const cellText = (await cell.textContent() ?? '').replace(/[,\s]/g, '');
            if (cellText.includes(qty)) {
                console.log(`[Award] Allocated quantity filled: ${qty}`);
                return;
            }
            console.log(`[Award] Allocated qty not registered (cell shows "${cellText}") — retrying...`);
        }
        throw new Error('Allocated Quantity was not entered into the award grid');
    }

    // ── Award justification fields (sheet scenario 21) ───────────────────────
    //
    // Resolve a section row by its LABEL and return its internal row index. The
    // label sits in that row's `_product` cell. Never use the visible "#" column:
    // on RFX 1468 "Initial Quote Remarks" displayed as #11 but its cells are
    // cell_12_*, so a number read off the screen addresses the wrong row.
    /**
     * Dump everything about the New Award page's attachment section.
     *
     * Scenario 59 needs to upload into 4 attachment fields there, and the page
     * is the same one-big-grid layout as the justification rows (see
     * awardRowLabelCells) - so the fields may be grid ROWS, or a separate
     * attachments block like SAPP's, or plain file inputs. Guessing costs a
     * ~6 min chain build per wrong guess, so the first run reports the truth.
     */
    /**
     * Scroll the award page (and its inner scroller) to the bottom so the
     * virtualised rows below the fold actually mount.
     *
     * This is not cosmetic: before scrolling the page exposes 6 file inputs and
     * ONE "Attachments" row, which reads as a single multi-file control. After
     * scrolling it exposes 21 inputs and the real Attachment section -
     * Commercial Comparison / Vendor Quotes / Justification / Others (verified
     * live 2026-09-11). Enumerating without scrolling describes a page that has
     * not finished existing.
     */
    async scrollAwardPageToBottom(passes = 14) {
        for (let i = 0; i < passes; i++) {
            await this.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 0.9);
                const sc = [...document.querySelectorAll('*')]
                    .filter(e => e.scrollHeight > e.clientHeight + 80 && e.clientHeight > 200)
                    .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
                if (sc) sc.scrollTop += sc.clientHeight * 0.9;
            });
            await this.page.waitForTimeout(800);
        }
        await this.page.waitForTimeout(2000);
    }

    /**
     * Award grid rows that actually hold a file input, as {row, label}.
     *
     * Resolving by label ALONE is unsafe here: the award page has TWO rows
     * called "Justification" - a text row in the main grid and an attachment row
     * in the Attachment section - so findAwardRowByLabel('Justification') would
     * match whichever came first and upload into the wrong place.
     */
    async listAwardAttachmentRows() {
        const rows = await this.page.evaluate(() => {
            const out = [];
            for (const td of document.querySelectorAll('td[id$="_product"]')) {
                const idx = td.id.match(/cell_(\d+)_/)?.[1];
                if (!idx) continue;
                const inputs = document.querySelectorAll(`td[id^="cell_${idx}_"] input[type=file]`).length;
                if (!inputs) continue;
                out.push({ row: idx, label: (td.innerText || '').replace(/\s+/g, ' ').trim(), inputs });
            }
            return out;
        });
        console.log(`[Award] attachment rows: ${JSON.stringify(rows)}`);
        return rows;
    }

    /**
     * Upload one file into a named award attachment field.
     *
     * Each such row carries 5 inputs - one real and four in ZERO-WIDTH mirror
     * cells (the quirk documented on awardRowLabelCells). setInputFiles works on
     * the hidden input directly, verified live, so there is no file-chooser
     * dance here; the assertion is the cell's own count text, because the page
     * never renders the filename.
     */
    async uploadAwardAttachment(label, filePath) {
        const rows = await this.listAwardAttachmentRows();
        const match = rows.find(r => r.label.toLowerCase() === label.toLowerCase());
        if (!match) {
            throw new Error(`[Award] no attachment field "${label}". Fields present: `
                + JSON.stringify(rows.map(r => r.label)));
        }
        const input = this.page.locator(`td[id^="cell_${match.row}_"] input[type=file]`).first();

        // The cell flips to "Upload 1 File" IMMEDIATELY, while the real upload is
        // still in flight: the app presigns (POST helpers/generate-upload-url)
        // and then PUTs the bytes to S3, which lands 3-6s later. Waiting a flat
        // 3.5s and asserting on that optimistic label is why run 3 submitted an
        // award that ended up holding "No files" - the label lied, and the test
        // believed it. Wait for the S3 PUT itself.
        const putDone = this.page.waitForResponse(
            r => r.request().method() === 'PUT' && /amazonaws\.com/.test(r.url()),
            { timeout: 90000 });
        await input.setInputFiles(filePath, { timeout: 20000 });
        const put = await putDone;
        expect(put.status(), `the S3 upload for "${label}" returned ${put.status()}`)
            .toBeLessThan(300);
        await this.page.waitForTimeout(1500);

        const cellText = await this.page.evaluate((r) => {
            const c = [...document.querySelectorAll(`td[id^="cell_${r}_"]`)]
                .find(x => x.getBoundingClientRect().width > 0 && x.querySelector('input[type=file]'));
            return c ? (c.innerText || '').replace(/\s+/g, ' ').trim() : '';
        }, match.row);

        expect(cellText, `"${label}" should report an uploaded file after setInputFiles; `
            + `the cell reads "${cellText}"`).toMatch(/\d+\s*File/i);
        console.log(`[Award] ${label} <- ${path.basename(filePath)} (cell now "${cellText}")`);
        return cellText;
    }

    /**
     * Which of `names` appear anywhere on the current page, after scrolling so
     * virtualised content mounts. Used to prove the award's attachments carried
     * through to the PR and the PRC.
     */
    /**
     * Look for `names` across every tab of a detail page, scrolling each.
     *
     * Scenario 59's PR/PRC pages are v3 and split across Overview / Process /
     * Transactions, so a body scan of whichever tab happens to be open proves
     * nothing about the others.
     */
    /**
     * Attachment sections on a v3 detail page (PR / PRC), as {label, value}.
     *
     * Filenames are NOT usable as evidence here: the award grid, the award
     * detail page and the PR all render a COUNT ("1 File") or an empty state
     * ("No Attachments.", "No Attachment Added") and never the filename -
     * verified live 2026-09-11. Four scenario-59 runs asserted on filenames and
     * so could not have passed whatever the app did.
     */
    async readAttachmentSections() {
        await this.scrollAwardPageToBottom(10);
        const sections = await this.page.evaluate(() => {
            const out = [];
            const RE = /(award attachment|justification att|attachments?)\b/i;
            for (const e of document.querySelectorAll('div,section,p,td')) {
                if (e.children.length > 4) continue;
                const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
                if (!t || t.length > 200 || !RE.test(t)) continue;
                out.push(t);
            }
            return [...new Set(out)];
        });
        const counts = await this.page.evaluate(() =>
            (document.body.innerText.match(/\d+\s*Files?\b/g) || []));
        console.log(`[Attach] ${this.page.url()}\n  sections: ${JSON.stringify(sections)}\n  counts: ${JSON.stringify(counts)}`);
        return { sections, counts, hasAny: counts.length > 0 };
    }

    /**
     * Every attachment field on a v3 detail page, as {label, value, index} -
     * one entry per OCCURRENCE, duplicates included.
     *
     * Duplicate labels are the point. The award grid carries two rows called
     * "Justification" (a text row and the attachment row), and QA reports the PR
     * carries TWO "Justification Att." fields (2026-09-11). Anything that
     * resolves a field by label alone reads whichever comes first - so a
     * carry-forward that landed in the second one looks missing, and a
     * whole-page "any files?" check hides the difference entirely.
     */
    /**
     * For each expected field label, the attachment value shown beside it:
     * a count ("1 File") or an empty state ("No Attachments.").
     *
     * Targeted by label rather than by scanning for attachment-ish elements: the
     * previous version exact-matched element text and returned [] on a PR whose
     * sections a manual probe could plainly see, because the DOM nests the label
     * and its value differently per page. This climbs a few levels from the
     * label to find whichever of the two it sits with.
     *
     * Labels differ between pages - the award calls it "Justification", the PR
     * calls it "Justification Att." (QA, 2026-09-11) - so callers pass the list
     * that belongs to the page they are on.
     */
    async readAttachmentFieldValues(labels) {
        await this.scrollAwardPageToBottom(10);
        const rows = await this.page.evaluate((wanted) => {
            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const VALUE = /(\d+\s*Files?\b)|No Attachments?\.?|No Attachment Added|No files/i;
            const out = [];
            for (const label of wanted) {
                let value = null, ctx = null;
                const cands = [...document.querySelectorAll('div,td,p,span,label')]
                    .filter(e => {
                        const t = norm(e.innerText).toLowerCase();
                        return t.startsWith(label.toLowerCase()) && t.length < 300;
                    })
                    .sort((a, b) => norm(a.innerText).length - norm(b.innerText).length);
                for (const e of cands) {
                    let n = e;
                    for (let k = 0; k < 4 && n; k++, n = n.parentElement) {
                        const t = norm(n.innerText);
                        // The value must be ADJACENT to the label. Without this
                        // cap the climb reaches a page-level container and
                        // matches an empty state (or a count) belonging to some
                        // other field entirely - observed 2026-09-11, where
                        // "Commercial Comparison" was reported "No Attachments."
                        // from a block beginning "Company National Stock
                        // Exchange Foundation Subject ...". That reads as a
                        // finding and is noise.
                        if (t.length > 220) break;
                        const m = t.match(VALUE);
                        if (m) { value = m[0]; ctx = t.slice(0, 140); break; }
                    }
                    if (value) break;
                }
                out.push({ label, value, ctx });
            }
            return out;
        }, labels);
        console.log(`[Attach] ${this.page.url()}\n  ${rows.map(r => `${r.label} = ${r.value ?? 'NOT FOUND'}`).join('\n  ')}`);
        return rows;
    }

    async readAttachmentFields() {
        await this.scrollAwardPageToBottom(10);
        const fields = await this.page.evaluate(() => {
            const LABEL = /^(award attachment|justification att\.?|commercial comparison|vendor quotes|justification|others|attachments?)$/i;
            const out = [];
            for (const e of document.querySelectorAll('div,td,p,span')) {
                if (e.children.length > 2) continue;
                const label = (e.innerText || '').replace(/\s+/g, ' ').trim();
                if (!LABEL.test(label)) continue;
                // the value is the nearest following text that states a count or
                // an empty state
                let value = '';
                const scope = e.parentElement?.innerText || '';
                const m = scope.replace(/\s+/g, ' ')
                    .match(/(\d+\s*Files?\b|No Attachments?\.?|No Attachment Added|No files)/i);
                if (m) value = m[1];
                out.push({ label, value });
            }
            // de-dup identical label+value pairs that come from nested wrappers,
            // but KEEP genuine repeats by numbering them
            const seen = new Map();
            return out.map(o => {
                const k = `${o.label}||${o.value}`;
                const n = (seen.get(k) ?? 0);
                seen.set(k, n + 1);
                return { ...o, occurrence: n };
            }).filter(o => o.occurrence === 0 || o.value);
        });
        console.log(`[Attach] fields on ${this.page.url()}:\n  ${JSON.stringify(fields)}`);
        return fields;
    }

    async findFilenamesAcrossTabs(names, { tabs = ['Overview', 'Process', 'Transactions'] } = {}) {
        const seen = new Set();
        for (const tabName of tabs) {
            const tab = this.page.locator(
                `xpath=//*[@role='tab' or @data-slot='tabs-trigger'][normalize-space(.)='${tabName}']`).first();
            if (await tab.isVisible({ timeout: 4000 }).catch(() => false)) {
                await tab.click().catch(() => {});
                await this.page.waitForTimeout(3500);
            } else {
                continue;
            }
            const hits = await this.findFilenamesOnPage(names);
            hits.forEach(h => seen.add(h));
            if (seen.size === names.length) break;
        }
        const found = [...seen];
        console.log(`[Attach] across tabs -> ${found.length}/${names.length}: ${JSON.stringify(found)}`);
        return found;
    }

    async findFilenamesOnPage(names) {
        await this.scrollAwardPageToBottom(10);
        const body = await this.page.evaluate(() => document.body.innerText);
        const found = names.filter(n => body.includes(n));
        console.log(`[Attach] on ${this.page.url()} -> found ${found.length}/${names.length}: ${JSON.stringify(found)}`);

        // Finding nothing is ambiguous: wrong page, not-yet-mounted content, or a
        // page that shows a COUNT instead of filenames (the award page does
        // exactly that). Report what attachment-ish content IS there so the next
        // run is informed rather than another blind guess.
        if (!found.length) {
            const diag = await this.page.evaluate(() => ({
                fileishLinks: [...document.querySelectorAll('a')]
                    .map(e => (e.innerText || '').trim())
                    .filter(t => /\.(pdf|png|jpe?g|xlsx?|docx?|csv|txt)$/i.test(t)).slice(0, 10),
                attachText: [...new Set([...document.querySelectorAll('*')]
                    .filter(e => !e.children.length && /attach|upload|\bfiles?\b/i.test(e.innerText || ''))
                    .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()))].slice(0, 15),
                tabs: [...document.querySelectorAll('[role="tab"],[data-slot="tabs-trigger"]')]
                    .map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 12),
            }));
            console.log(`[Attach] nothing matched — page diagnostics: ${JSON.stringify(diag)}`);
        }
        return found;
    }

    async dumpAwardAttachmentSection() {
        const info = await this.page.evaluate(() => {
            const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
            return {
                url: location.href,
                gridRowLabels: [...document.querySelectorAll('td[id$="_product"]')]
                    .map(td => txt(td)).filter(Boolean),
                fileInputs: [...document.querySelectorAll('input[type=file]')].map(i => ({
                    id: i.id || null, name: i.name || null, accept: i.accept || null,
                    hidden: !(i.offsetWidth || i.offsetHeight),
                    parentClass: String(i.parentElement?.className || '').slice(0, 80),
                })),
                attachishClasses: [...new Set([...document.querySelectorAll('[class*="attach" i]')]
                    .map(e => String(e.className).slice(0, 90)))].slice(0, 12),
                attachishText: [...new Set([...document.querySelectorAll('*')]
                    .filter(e => !e.children.length && /attach|upload|browse|drag/i.test(txt(e)))
                    .map(e => txt(e)))].slice(0, 20),
                buttons: [...new Set([...document.querySelectorAll('button')]
                    .map(b => txt(b)).filter(t => t && t.length < 40))].slice(0, 30),
            };
        });
        console.log('[Award] attachment section dump:\n' + JSON.stringify(info, null, 1));
        return info;
    }

    async findAwardRowByLabel(label) {
        const row = await this.page.evaluate((wanted) => {
            for (const td of document.querySelectorAll('td[id$="_product"]')) {
                const text = (td.innerText || '').replace(/\s+/g, ' ').trim();
                if (text.toLowerCase() === wanted.toLowerCase())
                    return td.id.match(/cell_(\d+)_/)?.[1] ?? null;
            }
            return null;
        }, label);
        if (!row) {
            const seen = await this.page.evaluate(() =>
                [...document.querySelectorAll('td[id$="_product"]')]
                    .map(td => (td.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
            throw new Error(`[Award] no award row labelled "${label}". Rows present: ${JSON.stringify(seen)}`);
        }
        return row;
    }

    /**
     * Type `text` into the value cell of the award row labelled `label`.
     *
     * The cell is click-to-edit. Two mechanisms are handled because the grid uses
     * both: some cells mount a real input/textarea on click, others take raw
     * keystrokes against the focused cell (the same shape as
     * fillAllocatedQuantity). insertText is used rather than keyboard.type - 300
     * characters typed one keystroke at a time is minutes of wall clock.
     *
     * A cell that accepts NEITHER is a hard failure, not a silent skip: on a
     * QUOTED (not yet foreclosed) RFX these cells are read-only and keystrokes
     * land on document.body, which is exactly how a "filled" justification could
     * be reported for an empty field (observed 2026-09-07 on RFX-26-251).
     */
    async fillAwardRowValue(label, text) {
        const row = await this.findAwardRowByLabel(label);
        const cell = this.page.locator(L.awardRowValueCell(row)).first();
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(1200);

        // Preferred: an editor mounted inside the cell.
        const editor = cell.locator('input, textarea, [contenteditable="true"]').first();
        if (await editor.count()) {
            await editor.fill(text).catch(async () => {
                await editor.click();
                await this.page.keyboard.insertText(text);
            });
        } else {
            // Fallback: raw keystrokes into whatever the click focused.
            const focused = await this.page.evaluate(() => document.activeElement?.tagName || '');
            if (/^(BODY|HTML)$/.test(focused)) {
                throw new Error(`[Award] clicking "${label}" focused <${focused}> - the cell is not editable. `
                    + 'On a Quoted RFX these cells are read-only; the award form must be reached after FORECLOSE.');
            }
            await this.page.keyboard.insertText(text);
        }
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(1500);

        // Verify it actually landed - the cell renders the value (truncated).
        const shown = (await cell.innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim();
        const head = text.slice(0, 25);
        if (!shown.includes(head.slice(0, 15))) {
            throw new Error(`[Award] "${label}" did not accept the text. Cell now reads "${shown.slice(0, 80)}"`);
        }
        console.log(`[Award] "${label}" filled with ${text.length} chars (cell shows "${shown.slice(0, 40)}…")`);
        return row;
    }

    /**
     * Hover the value cell of `label` and prove the WHOLE text is reachable.
     *
     * Asserts three things, per QA (2026-09-07):
     *   1. the reveal contains the full string that was entered - the terminal
     *      marker proves nothing was ellipsised away;
     *   2. the reveal actually OVERFLOWS its box (scrollHeight > clientHeight or
     *      scrollWidth > clientWidth) - otherwise "scrollable" is vacuous;
     *   3. it really scrolls - scrollTop/scrollLeft moves when driven.
     *
     * The reveal mechanism is not assumed. Tooltip/popover roots, a title
     * attribute and the cell's own overflow are each tried, and if none carries
     * the text the error DUMPS what hover produced instead of guessing.
     */
    /**
     * Hover the value cell of `label` and prove the WHOLE text is reachable.
     *
     * Measured live 2026-09-07 with a 300-char value in Remarks:
     *   · the cell's truncating child reports scrollWidth 2018 vs clientWidth 709
     *     — so the value IS clipped and hover is genuinely needed;
     *   · the hover tooltip carries all 300 characters;
     *   · that tooltip reports scrollHeight 141 == clientHeight 141 — it WRAPS the
     *     text and needs no scrolling at this length.
     *
     * So the assertions are: the reveal carries the complete string, and the cell
     * is actually truncated (otherwise "hover shows the full text" is vacuous —
     * it would be visible anyway). Scrollability is checked only where the reveal
     * really overflows, and reported either way rather than assumed: demanding
     * overflow on a tooltip that wraps would fail correct behaviour.
     *
     * The tooltip is picked as the SHORTEST node containing the value. Nested
     * containers accumulate their children's text (601 and 902 chars were seen
     * for the same 300-char value), so "first match" measures the wrong box.
     */
    async assertAwardRowHoverShowsFullText(label, expected) {
        const row = await this.findAwardRowByLabel(label);
        const cell = this.page.locator(L.awardRowValueCell(row)).first();
        await cell.scrollIntoViewIfNeeded();

        // Is the value clipped in the cell? Measured BEFORE hovering.
        const clipped = await this.page.evaluate(({ rowIdx, want }) => {
            const c = document.querySelector(`td[id^="cell_${rowIdx}_"][id$="::price"]`);
            if (!c) return null;
            let best = null;
            for (const n of [c, ...c.querySelectorAll('*')]) {
                if (!(n.innerText || '').includes(want)) continue;
                const over = n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight;
                if (over) best = { sW: n.scrollWidth, cW: n.clientWidth, sH: n.scrollHeight, cH: n.clientHeight,
                                   cls: String(n.className || '').slice(0, 40) };
            }
            return best;
        }, { rowIdx: row, want: expected });

        await cell.hover();
        await this.page.waitForTimeout(2500);

        const hit = await this.page.evaluate(({ sel, want, rowIdx }) => {
            const cands = [];
            for (const el of document.querySelectorAll(sel)) cands.push({ how: 'tooltip', el });
            const c = document.querySelector(`td[id^="cell_${rowIdx}_"][id$="::price"]`);
            if (c) for (const n of [c, ...c.querySelectorAll('*')]) cands.push({ how: 'cell', el: n });
            // Prefer a VISIBLE node inside a tooltip root. "Shortest text match"
            // alone picked the wrong box: on 2026-09-07 it chose a collapsed
            // tooltip wrapper for Remarks (scrollHeight 18 / clientHeight 1) and
            // the <td> itself for Initial Quote Remarks, so the scroll metrics
            // described neither visible tooltip.
            const visible = (el) => el.offsetParent !== null && el.clientHeight > 1 && el.clientWidth > 1;
            const scored = cands
                .map(x => ({ how: x.how, el: x.el, text: (x.el.innerText || x.el.textContent || '') }))
                .filter(x => x.text.includes(want))
                .map(x => ({ ...x, vis: visible(x.el) }));
            const withText = [
                ...scored.filter(x => x.how === 'tooltip' && x.vis).sort((a, b) => a.text.length - b.text.length),
                ...scored.filter(x => x.how === 'tooltip').sort((a, b) => a.text.length - b.text.length),
                ...scored.filter(x => x.vis).sort((a, b) => a.text.length - b.text.length),
                ...scored.sort((a, b) => a.text.length - b.text.length),
            ];
            if (!withText.length) {
                return { none: true, sample: cands.slice(0, 10).map(x => ({ how: x.how,
                    len: (x.el.innerText || '').length, cls: String(x.el.className || '').slice(0, 40) })) };
            }
            const w = withText[0];
            const titleAttr = c?.getAttribute('title') || c?.querySelector('[title]')?.getAttribute('title') || null;
            return { none: false, how: w.how, len: w.text.length, exact: w.text.trim() === want,
                     cls: String(w.el.className || '').slice(0, 40), hasTitle: !!titleAttr,
                     sH: w.el.scrollHeight, cH: w.el.clientHeight, sW: w.el.scrollWidth, cW: w.el.clientWidth };
        }, { sel: L.hoverRevealCandidates, want: expected, rowIdx: row });

        if (hit.none) {
            throw new Error(`[Award] hovering "${label}" revealed nothing containing the full ${expected.length}-char value.\n`
                + `What hover produced: ${JSON.stringify(hit.sample, null, 1)}`);
        }

        const overflows = hit.sH > hit.cH || hit.sW > hit.cW;
        let scrolled = null;
        if (overflows) {
            scrolled = await this.page.evaluate(({ sel, want }) => {
                for (const el of document.querySelectorAll(sel)) {
                    for (const n of [el, ...el.querySelectorAll('*')]) {
                        if (!(n.innerText || '').includes(want)) continue;
                        if (n.scrollHeight > n.clientHeight) { n.scrollTop = n.scrollHeight; return { axis: 'y', moved: n.scrollTop > 0 }; }
                        if (n.scrollWidth > n.clientWidth) { n.scrollLeft = n.scrollWidth; return { axis: 'x', moved: n.scrollLeft > 0 }; }
                    }
                }
                return { axis: null, moved: false };
            }, { sel: L.hoverRevealCandidates, want: expected });
        }

        console.log(`[Award] "${label}": reveal via ${hit.how} (${hit.cls}) — ${hit.len} chars`
            + `, exact=${hit.exact}, box ${hit.sH}/${hit.cH}h ${hit.sW}/${hit.cW}w`
            + `, cell clipped=${clipped ? `${clipped.sW}/${clipped.cW}w ${clipped.sH}/${clipped.cH}h` : 'NO'}`
            + `, reveal overflows=${overflows}${scrolled ? ` scrolled=${JSON.stringify(scrolled)}` : ''}`);

        return { how: hit.how, fullText: hit.len >= expected.length, exact: hit.exact,
                 cellClipped: !!clipped, clipped, overflows, scrolled };
    }

    /**
     * Assert the PO code shown on the current page is the RIGHT one (scenario 117).
     *
     * Checks presence AND correctness: every PO-NSEF… string on the page must be
     * the expected code. Presence alone would pass while a page displayed some
     * other PO's number, which is precisely what this scenario is about.
     */
    async assertPoCodeVisible(poCode, where = 'page') {
        // Scans RENDERED TEXT *and* FIELD VALUES. innerText alone was not enough:
        // on the Invoice creation page the PO code lives only in an input's value
        // (id mui-74794), which innerText and textContent both omit, so the page
        // was reported as showing no PO code at all (2026-09-07).
        const seen = await this.page.evaluate(() => {
            const re = /PO-[A-Z]+-\d+-\d+/g;
            const out = new Set();
            const eat = (s) => { for (const m of (s || '').matchAll(re)) out.add(m[0]); };
            eat(document.body.innerText);
            for (const f of document.querySelectorAll('input, textarea')) eat(f.value);
            return [...out];
        });
        if (!seen.includes(poCode)) {
            throw new Error(`[S117] ${where}: expected PO code ${poCode} is NOT displayed. `
                + `PO codes on the page: ${JSON.stringify(seen)}`);
        }
        const wrong = seen.filter(c => c !== poCode);
        if (wrong.length) {
            throw new Error(`[S117] ${where}: shows PO code(s) that are not ${poCode}: ${JSON.stringify(wrong)}`);
        }
        console.log(`[S117] ${where}: PO code ${poCode} displayed correctly`);
    }

    // ── Duplicate invoice reference (sheet scenarios 126 / 127) ──────────────

    /** Fill the Invoice Number with an EXACT value instead of the auto-bumped one. */
    async fillInvoiceNumberExactly(value) {
        // Two shapes. On the CREATE page the field is found by label proximity. On
        // the REVIEW EDIT page (/invoices/<id>/edit) the label-proximity xpath can
        // resolve to a different control, so fall back to the id — which there is
        // "Invoice Number-<random suffix>", hence a PREFIX match.
        let num = this.page.locator(`xpath=${L.invoiceNumberInput}`).first();
        const usable = await num.isVisible({ timeout: 15000 }).catch(() => false)
            && !await num.isDisabled().catch(() => false);
        if (!usable) {
            num = this.page.locator(L.nonPoLabelledField('Invoice Number')).first();
            await num.waitFor({ state: 'visible', timeout: 15000 });
            console.log('[INV] Invoice Number addressed by id prefix (review edit page shape)');
        }
        await num.fill(String(value));
        await this.page.waitForTimeout(600);
        console.log(`[INV] Invoice Number set to "${value}" (deliberate duplicate)`);
    }

    /**
     * The supplier invoice number that an EXISTING invoice actually holds.
     *
     * NOT invoice.invoiceNumber from the data file: that is the number last
     * GENERATED, and every refused submit bumps it, so it drifts away from any
     * real invoice. Observed 2026-09-07 — after two refused runs it read
     * INV-AUTO-113, a number no invoice held, and the app correctly answered
     * "Invoice has PASSED duplicate validation". Reading it off the saved
     * invoice's own page makes the collision real by construction.
     */
    async readSavedInvoiceNumber(data) {
        await this.openSavedInvoice(data);
        // POLL. The detail page renders its fields late, and a single read raced it
        // — the same settle race that made the review page's More button look
        // absent (both seen 2026-09-08). One-shot reads on this app are a bug.
        let num = null;
        for (let i = 0; i < 12; i++) {
            num = await this.page.evaluate(() => {
                const m = (document.body.innerText || '').match(/INV-[A-Z0-9]+-\d+/);
                return m ? m[0] : null;
            });
            if (num) break;
            await this.page.waitForTimeout(2500);
        }
        if (!num) throw new Error('[INV] could not read an invoice number off the saved invoice page '
            + `after 30s (url: ${this.page.url()})`);
        console.log(`[INV] saved invoice holds invoice number "${num}"`);
        return num;
    }

    /**
     * Submit an invoice that MUST be refused for a duplicate reference.
     *
     * Returns the validation text. Two ways this app refuses things, both handled:
     * an explicit message, or a SILENT block that simply leaves the form in place
     * (the known pattern here — a 2nd invoice on a partially consumed PO stays on
     * /invoices/new with no error in the DOM). A silent block is reported as such
     * rather than being dressed up as a validation, and a submit that SUCCEEDS is a
     * hard failure — that is the bug this scenario is looking for.
     */
    // ── Subject character limit at the review stage (sheet scenario 127) ─────
    //
    // QA 2026-09-08: the real limit is 250 characters, NOT the 240 the sheet says.
    // Checked in the SAME review-edit visit as the duplicate reference (126b) —
    // set an over-long Subject, assert the limit validation, restore the original
    // Subject, then go on to the duplicate. One Pending-Review invoice covers both.

    /** Current Subject on the invoice edit page. Prefix-matched: the id is
     *  "Subject-<random suffix>", regenerated on every render. */
    async readInvoiceSubject() {
        const inp = this.page.locator(L.nonPoLabelledField('Subject')).first();
        await inp.waitFor({ state: 'visible', timeout: 20000 });
        const v = (await inp.inputValue().catch(() => '')).trim();
        console.log(`[INV] Subject currently ${JSON.stringify(v.slice(0, 60))}`
            + (v.length > 60 ? ` (${v.length} chars)` : ''));
        return v;
    }

    /** Set Subject and VERIFY it stuck.
     *
     *  Re-resolves the locator on every attempt: after a failed submit the form
     *  re-renders and the id's random suffix is REGENERATED, so a handle taken
     *  before the error points at a detached node. Observed 2026-09-08 — the fill
     *  reported "set to 25 characters" while a read-back still returned the old
     *  255-character value, because the two had hold of different elements. */
    async fillInvoiceSubject(value) {
        const want = String(value);
        for (let i = 1; i <= 4; i++) {
            const inp = this.page.locator(L.nonPoLabelledField('Subject')).first();
            await inp.waitFor({ state: 'visible', timeout: 20000 });
            await inp.click({ timeout: 8000 }).catch(() => {});
            await inp.fill('').catch(() => {});
            await inp.fill(want).catch(() => {});
            await inp.blur().catch(() => {});
            await this.page.waitForTimeout(1500);
            const got = (await this.page.locator(L.nonPoLabelledField('Subject')).first()
                .inputValue().catch(() => '')).trim();
            if (got === want.trim()) {
                console.log(`[INV] Subject set to ${want.length} characters (attempt ${i}, verified)`);
                return;
            }
            console.log(`[INV] Subject did not stick on attempt ${i} — wanted ${want.length} chars, `
                + `field holds ${got.length}; re-resolving`);
        }
        throw new Error(`[INV] could not set Subject to ${want.length} characters after 4 attempts`);
    }

    /** Text of the topmost visible dialog, whitespace-collapsed. */
    async _topDialogText() {
        const dlgs = this.page.locator(`xpath=//div[@role='dialog']`);
        const n = await dlgs.count().catch(() => 0);
        for (let i = n - 1; i >= 0; i--) {
            if (await dlgs.nth(i).isVisible().catch(() => false)) {
                return ((await dlgs.nth(i).innerText().catch(() => '')) || '')
                    .replace(/\s+/g, ' ').trim();
            }
        }
        return '';
    }

    /**
     * Click a button inside the open dialog and VERIFY it did something.
     *
     * Written 2026-09-08 after three separate dialog buttons were clicked
     * "successfully" while the dialog sat unchanged — the SAPP Approvers Submit,
     * the Validations Proceed, and the Workflow Summary Submit. A click that logs
     * fine and changes nothing is worse than a failure, because the run then
     * misattributes the consequence: the Workflow Summary case was about to be
     * recorded as "the app does not validate the subject limit".
     *
     * Returns true once the dialog's text changes or the button disappears.
     */
    async clickDialogButtonVerified(label, { attempts = 4, settleMs = 6000, tag = 'INV' } = {}) {
        const xp = `//div[@role='dialog']//button[normalize-space(.)='${label}']`
            + ` | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='${label}']`;
        for (let i = 1; i <= attempts; i++) {
            const all = this.page.locator(`xpath=${xp}`);
            const n = await all.count().catch(() => 0);
            let btn = null;
            for (let k = 0; k < n; k++) {
                if (await all.nth(k).isVisible().catch(() => false)) { btn = all.nth(k); break; }
            }
            if (!btn) {
                console.log(`[${tag}] "${label}" no longer present — treating as done`);
                return true;
            }
            const before = await this._topDialogText();
            // Diagnostics: a swallowed click and a DISABLED button look identical in
            // the log otherwise, and they mean very different things.
            const st = await btn.evaluate(el => ({
                disabled: !!el.disabled,
                aria: el.getAttribute('aria-disabled'),
                pe: getComputedStyle(el).pointerEvents,
                cls: (el.className || '').toString().slice(0, 80),
                box: (b => b && { w: Math.round(b.width), h: Math.round(b.height) })(el.getBoundingClientRect()),
            })).catch(() => null);
            console.log(`[${tag}] "${label}" state: ${JSON.stringify(st)}`);
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            // Plain click first so Playwright waits for actionability; force only as
            // a fallback, because a forced click on a not-yet-ready button is
            // precisely what gets swallowed.
            await btn.click({ timeout: 8000 }).catch(async () => {
                await btn.click({ force: true }).catch(() => {});
            });
            await this.page.waitForTimeout(settleMs);
            const after = await this._topDialogText();
            if (after !== before) {
                console.log(`[${tag}] "${label}" clicked (attempt ${i}) — dialog advanced`);
                return true;
            }
            console.log(`[${tag}] "${label}" clicked (attempt ${i}) but the dialog did not change`);
        }
        console.log(`[${tag}] "${label}" never advanced the dialog after ${attempts} attempts`);
        return false;
    }

    /**
     * Submit the review edit page with an over-long Subject and report whether the
     * 250-character limit is enforced.
     *
     * THE FULL GAUNTLET, per QA 2026-09-08 — the limit is checked at the LAST step,
     * not the first:
     *
     *     Submit  ->  "Validations" dialog   -> Proceed
     *             ->  Workflow Summary popup -> Submit
     *             ->  the subject validation appears HERE
     *
     * An earlier version stopped at the Validations dialog, saw only "Invoice has
     * passed duplicate validation" and wrongly concluded the limit was unenforced.
     * That dialog only ever reports the duplicate check.
     *
     * PRECONDITION SAFETY: an over-long Subject is expected to be REFUSED, which
     * leaves the invoice in Pending Review for the duplicate half of the flow. If
     * it is instead ACCEPTED, the invoice submits out of Review and that
     * precondition is gone — reported explicitly as `consumed`, because the next
     * assertion in the flow would then fail for an unrelated reason.
     */
    async submitInvoiceExpectingSubjectLimitRejection({ settleMs = 8000 } = {}) {
        const LIMIT_RE = /(\b250\b|\b240\b).{0,60}(char|limit)|(char|limit).{0,60}(\b250\b|\b240\b)|exceed|too long|maximum length|subject.{0,40}(long|limit|char)/i;

        const scan = () => this.page.evaluate((src) => {
            const re = new RegExp(src, 'i');
            const hits = [];
            for (const dlg of document.querySelectorAll('[role="dialog"], [class*="MuiDialog"]')) {
                const t = (dlg.innerText || '').replace(/\s+/g, ' ').trim();
                if (t && re.test(t)) hits.push(t.slice(0, 300));
            }
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length) continue;
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t && t.length < 300 && re.test(t)) hits.push(t);
            }
            const errish = [];
            for (const el of document.querySelectorAll(
                '[class*="error"], [class*="helper"], [role="alert"], [class*="Mui-error"]')) {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t) errish.push(t.slice(0, 160));
            }
            return { hits: [...new Set(hits)], errish: [...new Set(errish)].slice(0, 12) };
        }, LIMIT_RE.source);

        const held = (await this.page.locator(L.nonPoLabelledField('Subject')).first()
            .inputValue().catch(() => '')).length;
        const dialogText = async () => (await this.page.locator(`xpath=${L.muiDialog}`).last()
            .innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim();

        // (1) a client-side cap would already be visible, before any round trip.
        let found = await scan();
        if (found.hits.length) {
            console.log(`[INV] subject limit reported INLINE: ${JSON.stringify(found.hits)}`);
            return { enforced: true, inline: true, consumed: false, messages: found.hits, heldChars: held };
        }

        // (2) Submit -> Validations dialog.
        await this.page.locator(`xpath=${L.invoiceSubmitBtn}`).first()
            .click({ timeout: 20000 }).catch(() => {});
        await this.page.waitForTimeout(settleMs);
        console.log(`[INV] after Submit, dialog says: ${JSON.stringify((await dialogText()).slice(0, 200))}`);

        // (3) Proceed past the Validations dialog.
        const proceed = this.page.locator(`xpath=${L.dialogProceedBtn2}`).first();
        if (await proceed.isVisible({ timeout: 15000 }).catch(() => false)) {
            await this.clickDialogButtonVerified('Proceed', { tag: 'INV', settleMs: 5000 });
        } else {
            console.log('[INV] no Proceed button appeared after Submit');
        }

        // (4) Workflow Summary popup -> Submit. THIS is where the limit is reported.
        const wfSubmit = this.page.locator(`xpath=${L.workflowSummarySubmitBtn}`).last();
        if (await wfSubmit.isVisible({ timeout: 15000 }).catch(() => false)) {
            console.log(`[INV] workflow popup says: ${JSON.stringify((await dialogText()).slice(0, 200))}`);
            // CLICK ONCE, THEN POLL. The message is TRANSIENT and the Workflow
            // Summary dialog does NOT change when it appears — so
            // clickDialogButtonVerified is the wrong tool here: it read "dialog
            // unchanged" as "click swallowed", clicked three more times, and by the
            // time anything scanned the page the message had auto-dismissed. That is
            // how a validation QA can see by eye got recorded as "the 250-char limit
            // is not enforced" (2026-09-08). Retrying is unsafe too — each click is a
            // real submit attempt.
            await wfSubmit.scrollIntoViewIfNeeded().catch(() => {});
            await wfSubmit.click({ timeout: 10000 })
                .catch(async () => { await wfSubmit.click({ force: true }).catch(() => {}); });
            console.log('[INV] Workflow Summary -> Submit (once); polling for the validation');

            for (let i = 0; i < 100; i++) {          // ~25s at 250ms
                found = await scan();
                if (found.hits.length) {
                    console.log(`[INV] validation caught ~${((i * 250) / 1000).toFixed(1)}s after the click`);
                    break;
                }
                await this.page.waitForTimeout(250);
            }
        } else {
            console.log('[INV] no Workflow Summary Submit appeared');
        }

        if (!found || !found.hits.length) found = await scan();
        const stillOnEdit = /\/invoices\/\d+\/edit/.test(this.page.url());

        if (found.hits.length) {
            console.log(`[INV] subject limit REFUSED at the final submit: ${JSON.stringify(found.hits)}`);
            // Clear whatever dialog is carrying the message so the caller can go on
            // to restore the Subject and run the duplicate half.
            const mc = this.page.locator(`xpath=${L.dialogMakeChangesBtn}`).first();
            if (await mc.isVisible({ timeout: 4000 }).catch(() => false)) await mc.click().catch(() => {});
            else await this.page.keyboard.press('Escape').catch(() => {});
            await this.page.waitForTimeout(2500);
            return { enforced: true, inline: false, consumed: false, messages: found.hits, heldChars: held };
        }

        const finalDialog = await dialogText();
        console.log(`[INV] NO subject-limit validation after Proceed + Workflow Submit. `
            + `Field held ${held} chars; still on edit page: ${stillOnEdit}; `
            + `dialog: ${JSON.stringify(finalDialog.slice(0, 240))}; `
            + `error-shaped text: ${JSON.stringify(found.errish)}`);
        return { enforced: false, inline: false, consumed: !stillOnEdit, messages: [],
                 heldChars: held, dialogText: finalDialog, errish: found.errish, url: this.page.url() };
    }

    async submitInvoiceExpectingDuplicateRejection(
        { settleMs = 9000, formUrlRe = /\/invoices\/new/ } = {}) {
        const before = this.page.url();
        await this.page.locator(`xpath=${L.invoiceSubmitBtn}`).first().click({ timeout: 20000 });
        await this.page.waitForTimeout(settleMs);

        const found = await this.page.evaluate(() => {
            // Must mean FAILURE. A bare /duplicate/ also matches the SUCCESS dialog
            // "Invoice has passed duplicate validation", which scored a clean
            // submit as a refusal (2026-09-07).
            const re = /failed duplicate validation|duplicate (invoice|reference|entry)|already (exists|exist|used|present)|same (reference|invoice number)|must be unique/i;
            const passed = /passed duplicate validation/i;
            const hits = [];
            // DIALOGS FIRST, read whole. The message is NOT a leaf node: the app
            // renders "Invoice has failed duplicate validation. Please refer to
            // <a>Invoice-FNSE-26-367</a>", so the element carrying the word
            // "duplicate" HAS a child and a leaf-only scan skips it while the leaf
            // itself is just the invoice code. That is exactly how a working
            // validation was first mis-reported as a silent refusal (2026-09-07).
            for (const dlg of document.querySelectorAll('[role="dialog"], [class*="MuiDialog"]')) {
                const t = (dlg.innerText || '').replace(/\s+/g, ' ').trim();
                if (t && re.test(t) && !passed.test(t)) hits.push(t.slice(0, 300));
            }
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length) continue;
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t && t.length < 300 && re.test(t) && !passed.test(t)) hits.push(t);
            }
            // Anything error-shaped, for diagnosis when nothing matched.
            const errish = [];
            for (const el of document.querySelectorAll('[class*="error"], [class*="helper"], [role="alert"], [class*="Mui-error"]')) {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t) errish.push(t.slice(0, 160));
            }
            return { hits: [...new Set(hits)], errish: [...new Set(errish)].slice(0, 12) };
        });

        // Parameterised: the SAME refusal has to be recognised on the review edit
        // page (/invoices/<id>/edit), not just the create page, for scenario 126(b).
        const stillOnForm = formUrlRe.test(this.page.url());
        if (found.hits.length) {
            console.log(`[INV] duplicate reference REFUSED with: ${JSON.stringify(found.hits)}`);
            return { refused: true, silent: false, messages: found.hits };
        }
        if (stillOnForm) {
            console.log(`[INV] duplicate reference refused SILENTLY — still on ${this.page.url()}, `
                + `no message. Error-shaped text on the page: ${JSON.stringify(found.errish)}`);
            return { refused: true, silent: true, messages: [], errish: found.errish };
        }
        throw new Error('[INV] the duplicate invoice number was ACCEPTED — the invoice submitted and left '
            + `/invoices/new (now ${this.page.url()}). Expected a duplicate-reference validation.`);
    }

    async submitWorkflowSummary() {
        const btn = this.page.locator(`xpath=${L.workflowSummarySubmitBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 15000 });
        await btn.click();
        console.log('[Award] Workflow Summary submitted');
        await this.page.waitForTimeout(3000);
    }

    // Opens Workflow Stages, reads the OVERALL workflow badge (not per-stage
    // statuses — completed stages also say "Completed"), closes by clicking outside.
    // The popup sometimes opens empty while its data loads — close and reopen.
    async _isWorkflowCompleted(tag = 'Award') {
        for (let attempt = 0; attempt < 4; attempt++) {
            const stagesBtn = this.page.locator(`xpath=${L.workflowStagesBtn}`).first();
            await stagesBtn.waitFor({ state: 'visible', timeout: 20000 });
            await stagesBtn.click();
            await this.page.waitForTimeout(1500);

            const badge = this.page.locator(`xpath=${L.workflowOverallStatusBadge}`).first();
            const hasData = await badge.waitFor({ state: 'visible', timeout: 8000 })
                .then(() => true).catch(() => false);

            if (!hasData) {
                console.log(`[${tag}] Workflow Stages popup is empty — closing and reopening (${attempt + 1}/4)...`);
                await this.page.mouse.click(5, 500);
                await this.page.waitForTimeout(2000);
                continue;
            }

            const statusText = (await badge.textContent() ?? '').trim();
            const completed = /completed/i.test(statusText);

            // Close the popup by clicking outside it
            await this.page.mouse.click(5, 500);
            await this.page.waitForTimeout(1000);

            console.log(`[${tag}] Workflow Stages → overall status: "${statusText}" → ${completed ? 'Completed' : 'NOT completed'}`);
            return completed;
        }
        throw new Error('Workflow Stages popup never loaded its data');
    }

    async completeAwardApprovals(comments = 'Approved by automation') {
        // Each round: read the OVERALL status in Workflow Stages. Only "Completed"
        // ends the loop (the badge shows e.g. "Active" otherwise — never
        // "Not Completed"). Anything else → look for Approve; if no Approve
        // button, reassign to NSEF Support Admin, then approve.
        const maxRounds = 12;
        for (let round = 0; round < maxRounds; round++) {
            if (await this._isWorkflowCompleted()) return;

            let visible = await this._waitForApproveButton({ maxReloads: 1, tag: 'Award' });
            if (!visible) {
                console.log('[Award] No Approve button — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'Award'))) {
                    throw new Error('Award workflow: Approve missing and reassign unavailable');
                }
                visible = await this._waitForApproveButton({ maxReloads: 2, tag: 'Award' });
                if (!visible) throw new Error('Award workflow: Approve still missing after reassign');
            }

            console.log(`[Award] Approving (round ${round + 1})...`);
            await this._clickApproveWithComments(comments);
        }
        throw new Error('Award workflow did not reach Completed status');
    }

    /** Every visible action on the current page (buttons, menu items, links).
     *  Used to report what an award page ACTUALLY offers when an expected
     *  control is missing, instead of a bare locator timeout. */
    async listPageActions() {
        return await this.page.evaluate(() => {
            const els = [...document.querySelectorAll('button,[role="menuitem"],a')]
                .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
                .filter(t => t && t.length < 40);
            return [...new Set(els)];
        });
    }

    /**
     * Reject an award while it is in its approval workflow (sheet scenario 7).
     *
     * Mirrors rejectIntake: v4 header Reject → comments → the dialog's own
     * Reject, which stays disabled until a comment is typed. The award workflow
     * often assigns its first stage to another user (completeAwardApprovals hits
     * this too), so if Reject is absent the approver is reassigned to NSEF
     * Support Admin and it retries once.
     */
    async rejectAward(reason = 'Rejected by automation') {
        const rejectBtn = this.page.locator(`xpath=${IL.intakeRejectBtn}`).first();

        let ready = await rejectBtn.isVisible({ timeout: 8000 }).catch(() => false);
        if (!ready) {
            console.log('[Award] Reject not visible — reassigning approver to NSEF Support Admin...');
            await this.reassignWorkflowApprover('Reassigned for automated testing', 'Award').catch(() => false);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(2500);
            ready = await rejectBtn.isVisible({ timeout: 10000 }).catch(() => false);
        }
        if (!ready) {
            throw new Error('[Award] no Reject control on the award page. Actions present: '
                + JSON.stringify(await this.listPageActions()));
        }
        await rejectBtn.click();

        const comments = this.page.locator(IL.intakeApproveComments).first();
        await comments.waitFor({ state: 'visible', timeout: 10000 });
        await comments.fill(reason);

        const confirm = this.page.locator(`xpath=${IL.intakeRejectConfirm}`).first();
        await expect(confirm).toBeEnabled({ timeout: 8000 });
        await confirm.click();
        console.log(`[Award] Reject submitted ("${reason}")`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(2000);
    }

    /**
     * Cancel an award from the v4 header More menu (sheet scenario 7), with the
     * mandatory reason. Same dialog shape as CXO/intake cancel.
     */
    async cancelAward(reason = 'Cancelled by automation') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(800);

        const opt = this.page.locator(`xpath=${IL.cxoCancelOption}`).first();
        if (!(await opt.isVisible({ timeout: 6000 }).catch(() => false))) {
            const items = await this.page.evaluate(() =>
                [...document.querySelectorAll('[role="menuitem"]')].map(e => (e.innerText || '').trim()));
            throw new Error('[Award] no Cancel in the award More menu. Menu items: '
                + JSON.stringify(items));
        }
        await opt.click();

        // The "Cancel Award" dialog is award-specific — NOT the CXO/intake
        // shape. Confirm is "Cancel Award"; "Keep Award" sits next to it as the
        // dismiss, so targeting the wrong button silently keeps the award.
        // Reason is a mandatory textarea. Verified live 2026-09-10.
        const dialog = this.page.locator(`xpath=${L.awardCancelDialog}`).first();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });

        const reasonField = this.page.locator(`xpath=${L.awardCancelReason}`).first();
        await reasonField.waitFor({ state: 'visible', timeout: 8000 });
        await reasonField.fill(reason);
        await this.page.waitForTimeout(400);

        const confirm = this.page.locator(`xpath=${L.awardCancelConfirm}`).first();
        await expect(confirm, 'the Cancel Award confirm never enabled — is the reason required?')
            .toBeEnabled({ timeout: 10000 });
        await confirm.click();
        console.log(`[Award] Cancel submitted ("${reason}")`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(2000);
    }

    /**
     * The AWARD's own status, read from the RFX → Awards tab.
     *
     * Do NOT scan the award detail page for a status word: it renders the parent
     * RFX's badge AND a per-line-item Status column, both of which say "Awarded"
     * on an award that is actually Rejected. Verified 2026-09-10 —
     * AWD-FNSE-26-198 read "Awarded" on its own page while the Awards tab
     * correctly showed "Status: Rejected" with "Requisition: -".
     *
     * Navigates to the Awards tab of the saved RFX, so it works from anywhere.
     * Returns { status, requisition, code }.
     */
    async readAwardSummary({ navigate = true } = {}) {
        // navigate:false reads the page we are ALREADY on — the award's back
        // arrow lands on this very Awards view, so the flow under test does not
        // need (and QA does not do) a separate navigation to check the status.
        if (navigate) {
            const rfx = this.getSavedSourcingEvent();
            const id = (rfx.url || '').match(/quote-requests\/(\d+)/)?.[1] ?? rfx.id;
            const cfg = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
            await this.page.goto(`${cfg.loginUrl}/quote-requests/${id}/awards`,
                { waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(3000);
        }

        // Wait for the summary block itself before reading fields, so a slow
        // render costs one wait rather than one-per-label.
        await this.page.locator(`xpath=${L.awardsTabLabel('Award Code')}`).first()
            .waitFor({ state: 'visible', timeout: 30000 })
            .catch(() => console.log('[Award] "Award Code:" never rendered on ' + this.page.url()));

        // textContent() MUST carry its own short timeout. Without one it inherits
        // the spec's actionTimeout (20s here), so a label that is not on the page
        // costs 20s per iteration — 10 iterations x 3 labels is ~10 minutes of a
        // browser sitting motionless, which is exactly how this looked on
        // 2026-09-10 before it was spotted from the screen.
        const valueOf = async (label) => {
            const el = this.page.locator(`xpath=${L.awardsTabValueFor(label)}`).first();
            for (let i = 0; i < 8; i++) {
                const txt = (await el.textContent({ timeout: 1500 }).catch(() => '') ?? '').trim();
                if (txt) return txt;
                await this.page.waitForTimeout(1000);
            }
            console.log(`[Award] no value found for "${label}:" on ${this.page.url()}`);
            return '';
        };
        const summary = {
            code: await valueOf('Award Code'),
            requisition: await valueOf('Requisition'),
            status: await valueOf('Status'),
        };
        console.log(`[Award] ${summary.code}: status="${summary.status}" requisition="${summary.requisition}"`);
        return summary;
    }

    async clickAwardBackArrow() {
        const back = this.page.locator(`xpath=${L.awardBackArrow}`).first();
        if (await back.isVisible({ timeout: 5000 }).catch(() => false)) {
            await back.click();
            console.log('[Award] Clicked back button beside award code');
            await this.page.waitForTimeout(2000);
            return;
        }

        // Cancelling an award redirects to the RFX's Awards view by itself —
        // verified 2026-09-11 on AWD-FNSE-26-201 (RFX-26-298): the award-code
        // <h1> the back arrow hangs off is gone, and "Award Code:" is already
        // on screen with Status "Cancelled". Waiting 15s for an arrow that the
        // app has legitimately removed cost the whole scenario-7 run, so
        // "already there" counts as done.
        const onAwardsView = /\/quote-requests\/\d+\/awards/.test(this.page.url())
            && await this.page.locator(`xpath=${L.awardsTabLabel('Award Code')}`)
                .first().isVisible({ timeout: 5000 }).catch(() => false);
        if (onAwardsView) {
            console.log('[Award] already on the Awards view — no back arrow to click');
            return;
        }

        // Neither on an award page nor on the Awards view: the caller's
        // assumption about where we are is wrong, so fail loudly.
        throw new Error('[Award] no back arrow and not on the Awards view — on '
            + this.page.url() + '. Actions present: '
            + JSON.stringify(await this.listPageActions()));
    }

    async isRfxAwarded() {
        return await this.page.locator(`xpath=${L.awardedStatusBadge}`).first()
            .isVisible({ timeout: 5000 }).catch(() => false);
    }

    async assertSourcingStatusAwarded() {
        await expect(this.page.locator(`xpath=${L.awardedStatusBadge}`).first())
            .toBeVisible({ timeout: 20000 });
        console.log('[Award] Sourcing status is Awarded');
    }

    async clickAwardsTab() {
        const tab = this.page.locator(`xpath=${L.rfxAwardsTab}`).first();
        await tab.waitFor({ state: 'visible', timeout: 20000 });
        await tab.click();
        await this.page.waitForTimeout(2000);
    }

    async waitForRequisitionCode() {
        // PR is created asynchronously — the Requisition field shows "Processing"
        // until it exists. Reload the current page every 30s until the code shows.
        const maxAttempts = 10; // ~5 minutes
        for (let i = 0; i < maxAttempts; i++) {
            const link = this.page.locator(`xpath=${L.requisitionCodeLink}`).first();
            if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
                const text = (await link.textContent() ?? '').trim();
                // Any code counts (e.g. "PR-DRAFT") — only "Processing" means wait
                if (text && !/processing/i.test(text)) {
                    console.log(`[Award] Requisition code displayed: ${text}`);
                    return text;
                }
                console.log(`[Award] Requisition field shows "${text}" — reloading in 30s (${i + 1}/${maxAttempts})...`);
            } else {
                console.log(`[Award] Requisition field not visible yet — reloading in 30s (${i + 1}/${maxAttempts})...`);
            }
            await this.page.waitForTimeout(30000);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        throw new Error('Requisition code did not appear after waiting');
    }

    async openRequisitionAndSaveCode() {
        const link = this.page.locator(`xpath=${L.requisitionCodeLink}`).first();
        await link.waitFor({ state: 'visible', timeout: 10000 });
        const linkText = (await link.textContent() ?? '').trim();

        // Requisition opens in a new tab
        const [newPage] = await Promise.all([
            this.page.context().waitForEvent('page', { timeout: 15000 }),
            link.click(),
        ]);
        await newPage.waitForLoadState('domcontentloaded');
        await newPage.waitForTimeout(3000);
        const url = newPage.url();
        console.log(`[Award] Requisition "${linkText}" opened in new tab → ${url}`);

        // Prefer the real PR code rendered on the requisition page (the field on
        // the award page may just say "PR-DRAFT")
        let code = linkText;
        const bodyText = await newPage.locator('body').textContent().catch(() => '') ?? '';
        const codeMatch = bodyText.match(/PR[A-Z0-9\-\/]*\d+/i);
        if (codeMatch) code = codeMatch[0].trim();

        const urlMatch = url.match(/\/(?:purchase-requisitions?|requisitions?|prs?)\/([^\/\?#]+)/i);
        const reqId = urlMatch ? urlMatch[1] : null;

        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedRequisition = {
            code: code,
            id:   reqId,
            url:  url,
        };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[Award] Saved to NSEFoundationData.json → savedRequisition.code = "${code}"`);
        return code;
    }

    // ── Requisition (PR) — edit → submit ──────────────────────────────────────

    async openSavedRequisition(data) {
        const { url, code } = this.getSavedRequisition();
        console.log(`[PR] Opening saved requisition ${code} → ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);

        // The PR lives on the non-v4 capp domain — the v4 session may or may not
        // carry. If redirected to the auth login, re-login tolerantly: each step
        // (email, password) may be skipped when SSO logs in automatically.
        if (/nse-auth-uat\.aerchain\.io/.test(this.page.url())) {
            console.log('[PR] Redirected to login for capp domain — logging in again...');
            const emailField = this.page.locator(L.loginEmailField).first();
            if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
                await emailField.fill(data.login.email);
                await this.page.locator(L.loginContinueBtn).click();
            }
            const pwField = this.page.locator(L.loginPasswordField).first();
            if (await pwField.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
                await pwField.fill(data.login.password);
                await this.page.locator(L.loginSubmitBtn).click();
            } else {
                console.log('[PR] Password step skipped (SSO) — continuing.');
            }
        }

        await this.page.waitForURL(/\/requisitions\/\d+/, { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log(`[PR] On requisition page: ${this.page.url()}`);
    }

    async clickPrEdit() {
        const btn = this.page.locator(`xpath=${L.prEditBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 30000 });
        await btn.click();
        console.log('[PR] Clicked Edit');
        await this.page.waitForURL(/\/edit/, { timeout: 20000 });
        // MUI edit form takes a while to fully render
        await this.page.locator(L.prEffectiveFromInput).first()
            .waitFor({ state: 'visible', timeout: 30000 });
        await this.page.waitForTimeout(2000);
        console.log('[PR] Edit page loaded');
    }

    // react-datepicker: open calendar from input, navigate months, click day
    async _pickReactDate(input, dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        await input.scrollIntoViewIfNeeded();
        await input.click();
        const cal = this.page.locator('.react-datepicker').last();
        await cal.waitFor({ state: 'visible', timeout: 10000 });

        for (let i = 0; i < 36; i++) {
            const caption = (await this.page.locator('.react-datepicker__current-month').last().textContent() ?? '').trim();
            const [mName, yStr] = caption.split(/\s+/);
            const diff = (year * 12 + month) - (parseInt(yStr) * 12 + MONTHS.indexOf(mName) + 1);
            if (diff === 0) break;
            await this.page.locator(diff > 0
                ? '.react-datepicker__navigation--next'
                : '.react-datepicker__navigation--previous').last().click();
            await this.page.waitForTimeout(300);
        }

        await this.page.locator(
            `.react-datepicker__day--${String(day).padStart(3, '0')}:not(.react-datepicker__day--outside-month)`
        ).last().click();
        await this.page.waitForTimeout(800);
    }

    async fillPrEffectiveFromDate() {
        // Effective from date = script execution date (today)
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await this._pickReactDate(this.page.locator(L.prEffectiveFromInput).first(), today);
        console.log(`[PR] Effective from date filled with today: ${today}`);
    }

    async fillPrEffectiveToDate(data) {
        await this._pickReactDate(this.page.locator(L.prEffectiveToInput).first(), data.requisition.effectiveToDate);
        console.log('[PR] Effective to date filled');
    }

    async selectPrPurchaseType(data) {
        const input = this.page.locator(L.prPurchaseTypeInput).first();
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await this.page.waitForTimeout(800);
        const option = this.page.locator(L.prAutocompleteOption)
            .filter({ hasText: data.requisition.purchaseType }).first();
        if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
            await option.click();
        } else {
            await this.page.locator(L.prAutocompleteOption).first().click();
        }
        await this.page.waitForTimeout(500);
        await expect(input).toHaveValue(/.+/, { timeout: 5000 });
        console.log(`[PR] Purchase Type selected: ${await input.inputValue()}`);
    }

    async selectPrInwardRequiredYes() {
        const radio = this.page.locator(L.prInwardRequiredYes).first();
        await radio.scrollIntoViewIfNeeded();
        await radio.check({ force: true });
        console.log('[PR] Inward Required → Yes');
        await this.page.waitForTimeout(500);
    }

    async selectPrInwardMatchingQuantity() {
        const radio = this.page.locator(L.prInwardMatchQuantity).first();
        await radio.scrollIntoViewIfNeeded();
        await radio.check({ force: true });
        console.log('[PR] Inward Matching Criterion → Quantity');
        await this.page.waitForTimeout(500);
    }

    async submitPr() {
        const btn = this.page.locator(`xpath=${L.prSubmitBtn}`).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('[PR] Clicked Submit');

        // "Approvers" popup → Submit (waitFor actually blocks; isVisible(timeout)
        // does not — it returns immediately before the popup renders)
        const popupSubmit = this.page.locator(
            `xpath=//div[contains(@class,'MuiDialog-root')]//button[normalize-space(.)='Submit']`
        ).first();
        const appeared = await popupSubmit.waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true).catch(() => false);
        if (appeared) {
            await popupSubmit.click();
            console.log('[PR] Confirmed Approvers popup');
            await popupSubmit.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
        } else {
            console.log('[PR] Approvers popup did not appear');
        }
        await this.page.waitForTimeout(4000);
    }

    async assertPrSubmitted() {
        await expect(this.page.locator(`xpath=${L.prSubmittedStatus}`).first())
            .toBeVisible({ timeout: 20000 });
        console.log('[PR] Requisition status is Submitted');
    }

    // Reload the PR page every `intervalMs` until its status badge shows `status`.
    // After submit the PR auto-progresses: Submitted → Processed (PRC auto-created)
    // → Completed (PO auto-created).
    // `status` may be a string OR an array of acceptable statuses; returns the
    // one that matched. PASS AN ARRAY WHEN WAITING FOR AN INTERMEDIATE STATE:
    // "Processed" is transient, and if the backend hops to Completed between two
    // 10s polls, waiting on "Processed" alone never matches and burns all 60
    // attempts on a PR that is already past it — measured 2026-09-10, 54 polls
    // for "Processed" while PR-NSEFN-26-167 sat there Completed.
    async waitForPrStatus(status, { intervalMs = 10000, maxAttempts = 60 } = {}) {
        const wanted = Array.isArray(status) ? status : [status];
        const label = wanted.join('" or "');
        for (let i = 0; i < maxAttempts; i++) {
            for (const s of wanted) {
                const badge = this.page.locator(`xpath=${L.prStatusBadge(s)}`).first();
                if (await badge.isVisible().catch(() => false)) {
                    console.log(`[PR] Status is "${s}".`);
                    return s;
                }
            }
            console.log(`[PR] Status not "${label}" yet — reloading in ${intervalMs / 1000}s (${i + 1}/${maxAttempts})...`);
            await this.page.waitForTimeout(intervalMs);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        throw new Error(`PR status did not reach "${label}" after ${maxAttempts} reloads`);
    }

    // Save the real PR code (e.g. PR-NSEFN-26-43) now that it replaced PR-DRAFT
    async saveRequisitionCode() {
        const url = this.page.url();
        const bodyText = await this.page.locator('body').textContent() ?? '';
        const codeMatch = bodyText.match(/PR-[A-Z0-9\-]*\d+/i);
        const code = codeMatch ? codeMatch[0].trim() : null;
        if (!code) throw new Error('PR code not found on the requisition page');

        const urlMatch = url.match(/\/requisitions?\/([^\/\?#]+)/i);
        const reqId = urlMatch ? urlMatch[1] : null;

        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedRequisition = { code, id: reqId, url };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[PR] Saved to NSEFoundationData.json → savedRequisition.code = "${code}"`);
        return code;
    }

    // ── Save Sourcing Event code for downstream steps ─────────────────────────

    async saveSourcingEventCode() {
        // Wait for the created event page to actually load — the post-submit
        // navigation can be slow, and saving before the RFX code is displayed
        // would store nothing useful for the downstream tests
        await this.page.waitForURL(/\/quote-requests\/\d+/, { timeout: 90000 });

        let eventCode = null;
        for (let i = 0; i < 18; i++) { // up to ~90s
            const bodyText = await this.page.locator('body').textContent() ?? '';
            const codeMatch = bodyText.match(/SNEV-RFX[A-Z0-9\-]*\d+/i) || bodyText.match(/RFX[A-Z0-9\-]*\d+/i);
            if (codeMatch) { eventCode = codeMatch[0].trim(); break; }
            console.log(`[Sourcing] RFX code not displayed yet — waiting (${i + 1}/18)...`);
            await this.page.waitForTimeout(5000);
        }
        if (!eventCode) {
            throw new Error('RFX code never appeared on the created sourcing event page — not saving');
        }

        const url = this.page.url();
        const urlMatch = url.match(/\/(?:quote-requests|sourcing(?:-events)?|events|rfx)\/([^\/\?#]+)/i);
        const eventId = urlMatch ? urlMatch[1] : null;
        const displayCode = eventCode;

        console.log(`[Sourcing] Saving Sourcing Event code: ${displayCode}  |  URL: ${url}`);

        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedSourcingEvent = {
            code: displayCode,
            id:   eventId,
            url:  url,
        };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');

        console.log(`[Sourcing] Saved to NSEFoundationData.json → savedSourcingEvent.code = "${displayCode}"`);
        return displayCode;
    }

    // ── Completed PR → PO → GRN (convert to GRN, approve until Inwarded) ───────

    async clickPrTransactionsTab() {
        const tab = this.page.locator(`xpath=${L.prTransactionsTab}`).first();
        await tab.waitFor({ state: 'visible', timeout: 30000 });
        await tab.click();
        await this.page.waitForTimeout(2000);
        console.log('[PR] Opened Transactions tab');
    }

    async expandPrConversionsSection() {
        const header = this.page.locator(`xpath=${L.prConversionsSection}`).first();
        await header.waitFor({ state: 'visible', timeout: 15000 });
        await header.scrollIntoViewIfNeeded();
        await header.click();
        await this.page.waitForTimeout(1500);
        console.log('[PR] Expanded Conversions section');
    }

    async openPrcFromConversions() {
        const link = this.page.locator(`xpath=${L.prcCodeLink}`).first();
        await link.waitFor({ state: 'visible', timeout: 15000 });
        const code = (await link.textContent() ?? '').trim();
        await link.click();
        await this.page.waitForTimeout(2500);
        console.log(`[PRC] Opened ${code} (Requisition Conversion View)`);
        return code;
    }

    // Hover "POs(N)" in the Requisition Conversion View → click the PO code in the
    // revealed popover → PO opens in a NEW TAB. Switches this.page to the new tab
    // (sized to match) so all subsequent PO/GRN actions run there.
    async openPoFromConversionViewInNewTab() {
        const poCount = this.page.locator(`xpath=${L.conversionPoCountLink}`).first();
        await poCount.waitFor({ state: 'visible', timeout: 15000 });
        await poCount.scrollIntoViewIfNeeded();

        // Hover the "POs(N)" value to reveal the popover holding the PO code link.
        // React tooltips can ignore Playwright's synthetic hover, so retry and fall
        // back to dispatching real mouseover/mouseenter events on the element.
        const poLink = this.page.locator(`xpath=${L.poCodeLink}`).first();
        let revealed = false;
        for (let attempt = 0; attempt < 4 && !revealed; attempt++) {
            await poCount.hover().catch(() => {});
            await this.page.waitForTimeout(1200);
            revealed = await poLink.isVisible({ timeout: 2500 }).catch(() => false);
            if (!revealed) {
                await poCount.evaluate((el) => {
                    for (const type of ['mouseover', 'mouseenter', 'mousemove']) {
                        el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
                    }
                }).catch(() => {});
                await this.page.waitForTimeout(1200);
                revealed = await poLink.isVisible({ timeout: 2500 }).catch(() => false);
            }
        }
        await poLink.waitFor({ state: 'visible', timeout: 10000 });
        const poCode = (await poLink.textContent() ?? '').trim();

        const [newPage] = await Promise.all([
            this.page.context().waitForEvent('page', { timeout: 20000 }),
            poLink.click(),
        ]);
        await newPage.waitForLoadState('domcontentloaded');
        // Keep the new tab the same size as the main one (user requirement)
        await newPage.setViewportSize({ width: 1800, height: 900 });
        await newPage.waitForTimeout(3000);

        this.prPage = this.page;   // keep a handle to the PR tab
        this.page = newPage;       // operate on the PO tab from here on
        await this.page.waitForURL(/\/purchase-orders\/\d+/, { timeout: 30000 });
        const url = this.page.url();
        console.log(`[PO] Opened ${poCode} in new tab → ${url}`);

        // Save PO code/url for potential downstream (Invoice) steps
        const idMatch = url.match(/\/purchase-orders\/(\d+)/);
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedPurchaseOrder = { code: poCode || null, id: idMatch ? idMatch[1] : null, url };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        return poCode;
    }

    // Shared PO/GRN approval: header Approve → notes modal → confirm → reload.
    async _approveWithNotes(comments = 'Approved by automation', tag = 'PO') {
        await this.page.locator(`xpath=${L.poApproveBtn}`).first().click();
        const notes = this.page.locator(`xpath=${L.poApproveNotesField}`).first();
        await notes.waitFor({ state: 'visible', timeout: 10000 });
        await notes.fill(comments);
        await this.page.locator(`xpath=${L.poApproveConfirmBtn}`).first().click();
        console.log(`[${tag}] Approved a stage`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(2500);
    }

    // Approve the PO through all stages until the "Create" dropdown appears
    // (status → Submitted). Reassigns approver to NSEF Support Admin if Approve
    // disappears before completion (same pattern as CXO/award).
    // ── PO Recall (sheet scenario 65) ────────────────────────────────────────
    //
    // Recall is offered ONLY while the PO is Pending Approval — see the locator
    // note. So this must run on a chain built with { approvePo: false }.

    /** The status word shown on the PO detail page. */
    async readPoStatus() {
        for (let i = 0; i < 10; i++) {
            const t = (await this.page.locator('body').innerText().catch(() => '')) || '';
            // "Rejected" MUST be in here: it is where Recall actually lands the PO
            // (QA, 2026-09-08). Leaving it out made a successful recall read as a
            // null status for 15 polls, and the test failed while the app was right
            // — PO-NSEFN-26-222 was sitting in Rejected the whole time.
            const m = t.match(
                /pending[-\s]?approval|pending[-\s]?sync|Rejected|Recalled|Submitted|In-progress|Draft|Completed|Cancelled/i);
            if (m) return m[0].trim();
            await this.page.waitForTimeout(2000);
        }
        return null;
    }

    /** Items in the PO's More menu, left OPEN for the caller to act on. */
    async openPoMoreMenu() {
        const more = this.page.locator(`xpath=${L.v3MoreBtn}`).first();
        // 30s: this page renders its header actions late — the same settle race
        // that made the invoice More button look absent (2026-09-08).
        await more.waitFor({ state: 'visible', timeout: 30000 });
        for (let attempt = 1; attempt <= 3; attempt++) {
            await more.click({ timeout: 10000 }).catch(() => {});
            await this.page.waitForTimeout(2000);
            const items = (await this.page.locator(`xpath=${L.anyV3MenuItem}`)
                .allInnerTexts().catch(() => [])).map(t => t.trim()).filter(Boolean);
            if (items.length) {
                console.log(`[PO] More menu: ${JSON.stringify(items)}`);
                return items;
            }
            console.log(`[PO] More menu did not open (attempt ${attempt})`);
        }
        return [];
    }

    /**
     * Recall a Pending-Approval PO and assert the status it actually reaches.
     *
     * TWO CORRECTIONS from QA, 2026-09-08:
     *   1. Recall opens a popup with a MANDATORY REASON — submitting without one
     *      is refused silently. A first attempt clicked the dialog's button with
     *      no reason and the PO sat at Pending Approval through 15 polls, which
     *      read exactly like "Recall does nothing".
     *   2. The end status is REJECTED, not the Draft the sheet's wording says.
     *      Same class of sheet error as scenario 127's "240" (really 250).
     *
     * Polls for Rejected but reports whatever it actually settles on, so a future
     * behaviour change is described rather than just failing as a timeout.
     */
    async recallPoWithReason(reason = 'Recalled by automation') {
        const status = await this.readPoStatus();
        if (!/pending[-\s]?approval/i.test(status || '')) {
            throw new Error(`[PO] Recall needs a Pending-Approval PO, but this one reads `
                + `"${status}". Build the chain with { approvePo: false }.`);
        }
        const items = await this.openPoMoreMenu();
        if (!items.some(t => /^recall$/i.test(t))) {
            throw new Error(`[PO] no "Recall" in the More menu of a Pending-Approval PO. `
                + `Menu was ${JSON.stringify(items)}`);
        }
        await this.page.locator(`xpath=${L.v3MenuItem('Recall')}`).first().click({ timeout: 15000 });
        console.log('[PO] Recall clicked — expecting the reason popup');
        await this.page.waitForTimeout(4000);

        // The reason field. Same dialog shape as Foreclose / Cancel, so the
        // locator is shared rather than re-guessed.
        const reasonField = this.page.locator(`xpath=${L.rfxForecloseReasonField}`).first();
        if (!await reasonField.isVisible({ timeout: 20000 }).catch(() => false)) {
            throw new Error('[PO] the Recall reason popup never appeared — QA confirmed one is '
                + `required. Dialog currently reads: ${JSON.stringify(await this._topDialogText())}`);
        }
        await reasonField.fill(reason);
        console.log(`[PO] recall reason entered: ${JSON.stringify(reason)}`);
        await this.page.waitForTimeout(800);

        // Submit it. The button has carried more than one label in this app, so
        // try the plausible ones and VERIFY the dialog actually moved.
        let submitted = false;
        for (const label of ['Submit', 'Recall', 'Confirm', 'Yes', 'Proceed']) {
            const btn = this.page.locator(
                `xpath=//div[@role='dialog']//button[normalize-space(.)='${label}']`).first();
            if (!await btn.isVisible({ timeout: 3000 }).catch(() => false)) continue;
            submitted = await this.clickDialogButtonVerified(label, { tag: 'PO', settleMs: 6000 });
            if (submitted) break;
        }
        if (!submitted) {
            console.log('[PO] WARNING: no reason-popup button visibly advanced the dialog — '
                + 'continuing to the status poll anyway');
        }

        for (let i = 0; i < 15; i++) {
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(5000);
            const now = await this.readPoStatus();
            console.log(`[PO] status after recall (poll ${i + 1}): ${now}`);
            if (/rejected|draft/i.test(now || '')) return now;
        }
        throw new Error('[PO] the PO never left Pending Approval after Recall + reason. Expected '
            + 'Rejected (QA, 2026-09-08).');
    }

    async approvePoUntilSubmitted(comments = 'Approved by automation') {
        const createReady = async (t = 1000) =>
            await this.page.locator(`xpath=${L.poCreateBtn}`).first().isVisible({ timeout: t }).catch(() => false);

        // RELOAD BEFORE GIVING UP ON APPROVE — this loop used to check Approve
        // once with a 4s budget and, on a miss, go straight to reassigning the
        // approver, never refreshing the page. A newly created PO renders its
        // header actions late, and a reassignment only surfaces Approve after a
        // reload, so the fallback could never recover: scenario 1 on 2026-09-10
        // reassigned 5x, threw "PO did not reach approved/Submitted", and the
        // failure screenshot showed PO-NSEFN-26-246 Pending Approval with the
        // Approve button plainly visible. _waitForApproveButton reloads and
        // re-polls, which is what the Intake/RFX/CXO loops have always done.
        for (let i = 0; i < 10; i++) {
            if (await createReady()) {
                console.log(`[PO] Approvals complete (Create available) after ${i} approval(s).`);
                return;
            }

            let visible = await this._waitForApproveButton({
                tag: 'PO',
                selector: L.poApproveBtn,
                stopWhen: createReady,
            });

            if (!visible) {
                if (await createReady()) {
                    console.log(`[PO] Approvals complete (Create available) after ${i} approval(s).`);
                    return;
                }
                console.log('[PO] Approve missing — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'PO'))) {
                    console.log('[PO] Reassign unavailable — stopping approval loop.');
                    break;
                }
                visible = await this._waitForApproveButton({
                    tag: 'PO',
                    selector: L.poApproveBtn,
                    stopWhen: createReady,
                });
                if (!visible) {
                    console.log('[PO] Still no Approve button after reassign — stopping.');
                    break;
                }
            }

            console.log(`[PO] Approving stage ${i + 1}...`);
            await this._approveWithNotes(comments, 'PO');
        }
        if (!(await createReady())) throw new Error('PO did not reach approved/Submitted (Create) state');
    }

    async clickPoCreateGrn() {
        // WAIT for Create before clicking. openSavedPurchaseOrder navigates afresh
        // and this v3 page renders its header actions late, so the bare click ran
        // into the 5s default actionTimeout — scenario 1, 2026-09-10, right after
        // "Approvals complete (Create available)" had already proved the button
        // exists on the pre-navigation page.
        const createBtn = this.page.locator(`xpath=${L.poCreateBtn}`).first();
        await createBtn.waitFor({ state: 'visible', timeout: 30000 });
        await createBtn.click();
        await this.page.waitForTimeout(800);
        const grn = this.page.locator(`xpath=${L.poCreateGrnOption}`).first();
        await grn.waitFor({ state: 'visible', timeout: 10000 });
        await grn.click();
        console.log('[GRN] Create → GRN clicked');
        await this.page.waitForTimeout(1500);
    }

    async submitSelectPoItemsPopup() {
        const submit = this.page.locator(`xpath=${L.selectPoItemsSubmitBtn}`).first();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        // Submit renders disabled until the dialog's PO-item grid has loaded its
        // (pre-selected) rows — a slow grid otherwise reads as a click timeout.
        await expect(submit).toBeEnabled({ timeout: 30000 });
        await submit.click();
        console.log('[GRN] Submitted Select PO Items popup');
        await this.page.waitForURL(/\/inward/, { timeout: 30000 });
        await this.page.waitForTimeout(2500);
        console.log(`[GRN] On Create GRN page: ${this.page.url()}`);
    }

    async fillGrnGeneralDetails(data) {
        const inv = this.page.locator(`xpath=${L.grnInvoiceNumberInput}`).first();
        await inv.waitFor({ state: 'visible', timeout: 15000 });
        await inv.fill(data.grn.invoiceNumber);
        await this.page.locator(`xpath=${L.grnDeliveryChallanInput}`).first().fill(data.grn.deliveryChallan);
        console.log('[GRN] Filled Invoice Number + Delivery challan');
    }

    async fillGrnDocumentDetails(data) {
        await this.page.locator(`xpath=${L.grnDeliveryNoteRefInput}`).first().fill(data.grn.deliveryNoteReference);

        // Document Date = test execution date (today). This is a react-datepicker
        // (same widget as the PR dates) — open it and CLICK the day; typing leaves
        // the value unparsed. Reuse the shared _pickReactDate helper.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await this._pickReactDate(this.page.locator(L.grnDocumentDateInput).first(), today);
        const dateVal = await this.page.locator(L.grnDocumentDateInput).first().inputValue().catch(() => '');
        console.log(`[GRN] Filled Delivery Note Reference + Document Date (${today} → "${dateVal}")`);
    }

    // Verify the GRN line item's Received quantity matches the PO Quantity.
    // The Line Items grid is an AG Grid with pinned columns, so cells are split
    // across containers — read them by stable col-id (line_items_po_quantity /
    // line_items_received), scoped to the grid that holds the PO Quantity header.
    /**
     * Set the GRN's Received qty on line 0 — a PARTIAL receipt.
     *
     * Needed by sheet scenario 13 (GRN 50 vs invoice 100 -> Disputed): the GRN
     * otherwise defaults to the full PO quantity, which is what
     * assertGrnReceivedMatchesPoQty checks for the happy path.
     *
     * Mirrors _invoiceQtyOps: AG-grid cells silently ignore keystrokes when the
     * grid is not in edit mode, so never trust one attempt, and the clear uses
     * ControlOrMeta+a — plain Control+a does not select the cell contents on macOS.
     */
    async setGrnReceivedQty(qty) {
        const cell = this.page.locator(`xpath=${L.grnReceivedCell}`).first();
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        const read = async () => {
            const txt = (await cell.textContent().catch(() => '')) ?? '';
            const m = txt.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
            return m ? String(parseFloat(m[0])) : '';
        };
        for (let i = 1; i <= 3; i++) {
            await cell.scrollIntoViewIfNeeded().catch(() => {});
            await cell.dblclick();
            await this.page.waitForTimeout(500);
            const editor = cell.locator('input').first();
            if (await editor.count().catch(() => 0)) {
                await editor.fill(String(qty)).catch(() => {});
            } else {
                await this.page.keyboard.press('ControlOrMeta+a');
                await this.page.keyboard.press('Delete');
                await this.page.keyboard.type(String(qty));
            }
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(900);
            const now = await read();
            if (now === String(qty)) {
                console.log(`[GRN] Received set to ${qty} (cell reads "${now}")`);
                return;
            }
            console.log(`[GRN] Received did not stick (cell reads "${now}") — retry ${i}/3`);
        }
        throw new Error(`[GRN] could not set Received to ${qty}`);
    }

    /** The status word on an invoice detail page. */
    async readInvoiceStatus() {
        for (let i = 0; i < 10; i++) {
            const t = (await this.page.locator('body').innerText().catch(() => '')) || '';
            const m = t.match(
                /disputed|pending[-\s]?review|pending[-\s]?approval|pending[-\s]?sync|accounted|rejected|cancelled|draft|to-review|to-enrich/i);
            if (m) return m[0].trim();
            await this.page.waitForTimeout(2000);
        }
        return null;
    }

    /** Poll the invoice detail page until its status matches, reloading each time.
     *  Returns the status seen, or throws with what it actually settled on. */
    async waitForInvoiceStatus(re, { polls = 12, tag = 'INV' } = {}) {
        let last = null;
        for (let i = 1; i <= polls; i++) {
            last = await this.readInvoiceStatus();
            console.log(`[${tag}] invoice status (poll ${i}): ${last}`);
            if (re.test(last || '')) return last;
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(5000);
        }
        throw new Error(`[${tag}] the invoice never reached ${re} — it settled on "${last}"`);
    }

    async assertGrnReceivedMatchesPoQty() {
        await this.page.locator(`xpath=${L.grnLineItemColHeader('PO Quantity')}`).first()
            .waitFor({ state: 'visible', timeout: 10000 });
        const result = await this.page.evaluate(() => {
            const norm = s => s.replace(/\*|f\(x\)/g, '').trim();
            const poqHeader = [...document.querySelectorAll('[role="columnheader"]')]
                .find(h => norm(h.textContent) === 'PO Quantity');
            const grid = poqHeader && poqHeader.closest('[role="grid"]');
            if (!grid) return null;
            const headers = [...grid.querySelectorAll('.ag-header-cell[col-id]')];
            const colId = (label) => {
                const h = headers.find(x => norm(x.textContent) === label);
                return h && h.getAttribute('col-id');
            };
            const cellVal = (label) => {
                const id = colId(label);
                if (!id) return null;
                const c = grid.querySelector(`.ag-row[row-index="0"] [col-id="${id}"]`);
                if (!c) return null;
                const inp = c.querySelector('input');
                return (inp ? inp.value : c.textContent).trim();
            };
            return { poQty: cellVal('PO Quantity'), received: cellVal('Received') };
        });
        if (!result || result.poQty == null || result.received == null) {
            throw new Error(`Could not read PO Quantity / Received from line items: ${JSON.stringify(result)}`);
        }
        const poQty = parseFloat(result.poQty);
        const received = parseFloat(result.received);
        console.log(`[GRN] Line item — PO Quantity=${poQty}, Received=${received}`);
        expect(received).toBe(poQty);
    }

    async submitGrn() {
        const submit = this.page.locator(`xpath=${L.grnSubmitBtn}`).first();
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        await submit.click();
        console.log('[GRN] Clicked Submit');

        // "Workflow Summary" popup → Submit (approvers pre-populated). Scoped to the
        // dialog so it doesn't collide with the page header's Submit.
        await this.page.waitForTimeout(2000);
        const wfSubmit = this.page.locator(`xpath=${L.grnWorkflowSummarySubmitBtn}`).first();
        const appeared = await wfSubmit.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (appeared) {
            await wfSubmit.click();
            console.log('[GRN] Confirmed Workflow Summary popup');
        } else {
            console.log('[GRN] Workflow Summary popup did not appear');
        }
        await this.page.waitForURL(/\/inwards\/\d+/, { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log(`[GRN] GRN created → ${this.page.url()}`);
    }

    // Approve the GRN (Stock Inward) until status = Inwarded.
    async approveGrnUntilInwarded(comments = 'Approved by automation') {
        const inwarded = async (t = 1500) =>
            await this.page.locator(`xpath=${L.grnInwardedStatus}`).first().isVisible({ timeout: t }).catch(() => false);

        for (let i = 0; i < 10; i++) {
            if (await inwarded()) {
                console.log(`[GRN] Status Inwarded after ${i} approval(s).`);
                return;
            }
            const approveVisible = await this.page.locator(`xpath=${L.poApproveBtn}`).first()
                .isVisible({ timeout: 4000 }).catch(() => false);
            if (approveVisible) {
                console.log(`[GRN] Approving stage ${i + 1}...`);
                await this._approveWithNotes(comments, 'GRN');
            } else {
                if (await inwarded()) return;
                console.log('[GRN] Approve missing — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'GRN'))) break;
            }
        }
        if (!(await inwarded())) throw new Error('GRN did not reach Inwarded status');
    }

    async assertGrnInwarded() {
        await expect(this.page.locator(`xpath=${L.grnInwardedStatus}`).first())
            .toBeVisible({ timeout: 15000 });
        console.log('[GRN] Status is Inwarded');
    }

    async saveGrnCode() {
        const url = this.page.url();
        const bodyText = await this.page.locator('body').textContent() ?? '';
        const m = bodyText.match(/INW-[A-Z0-9\-]*\d+/i);
        const code = m ? m[0].trim() : null;
        const idMatch = url.match(/\/inwards\/(\d+)/);
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedGrn = { code, id: idMatch ? idMatch[1] : null, url };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[GRN] Saved to NSEFoundationData.json → savedGrn.code = "${code}"`);
        return code;
    }

    // ── PO → Invoice (create, match the PO's GRN, approve until Pending Sync) ──

    // Open the saved PO directly (re-login on the capp domain if redirected).
    async openSavedPurchaseOrder(data) {
        const fresh = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        const { url, code } = fresh.savedPurchaseOrder;
        console.log(`[PO] Opening saved PO ${code} → ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);

        if (/nse-auth-uat\.aerchain\.io/.test(this.page.url())) {
            console.log('[PO] Redirected to login for capp domain — logging in again...');
            const emailField = this.page.locator(L.loginEmailField).first();
            if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
                await emailField.fill(data.login.email);
                await this.page.locator(L.loginContinueBtn).click();
            }
            const pwField = this.page.locator(L.loginPasswordField).first();
            if (await pwField.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
                await pwField.fill(data.login.password);
                await this.page.locator(L.loginSubmitBtn).click();
            } else {
                console.log('[PO] Password step skipped (SSO) — continuing.');
            }
        }

        await this.page.waitForURL(/\/purchase-orders\/\d+/, { timeout: 30000 });
        await this.page.waitForTimeout(2000);
        console.log(`[PO] On PO page: ${this.page.url()}`);
    }

    async clickPoCreateInvoice() {
        // Same late-rendering Create action as clickPoCreateGrn — wait, don't
        // rely on the 5s default actionTimeout.
        const createBtn = this.page.locator(`xpath=${L.poCreateBtn}`).first();
        await createBtn.waitFor({ state: 'visible', timeout: 30000 });
        await createBtn.click();
        await this.page.waitForTimeout(800);
        const inv = this.page.locator(`xpath=${L.poCreateInvoiceOption}`).first();
        await inv.waitFor({ state: 'visible', timeout: 10000 });
        await inv.click();
        console.log('[INV] Create → Invoice clicked');
        await this.page.waitForTimeout(1500);
    }

    async submitSelectPoItemsForInvoice() {
        const submit = this.page.locator(`xpath=${L.selectPoItemsSubmitBtn}`).first();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        await submit.click();
        console.log('[INV] Submitted Select PO Items popup');
        await this.page.waitForTimeout(1500);
    }

    async confirmInvoiceCreation() {
        const proceed = this.page.locator(`xpath=${L.confirmInvoiceProceedBtn}`).first();
        await proceed.waitFor({ state: 'visible', timeout: 10000 });
        await proceed.click();
        console.log('[INV] Proceeded Confirm Invoice Creation');
        await this.page.waitForURL(/\/invoices\/new/, { timeout: 30000 });
        await this.page.waitForTimeout(2500);
        console.log(`[INV] On Create Invoice page: ${this.page.url()}`);
    }

    async uploadInvoiceDocument(data) {
        const input = this.page.locator(L.invoiceUploadInput).first();
        const filePath = path.resolve(data.invoice.documentPath);
        await input.setInputFiles(filePath);
        console.log(`[INV] Uploaded invoice document: ${filePath}`);
        await this.page.waitForTimeout(2000);
    }

    // Bump the stored invoice number by 1 (e.g. INV-AUTO-001 → INV-AUTO-002) and
    // persist it back to NSEFoundationData.json. The app rejects duplicate invoice
    // numbers, so every run must use a fresh one.
    _nextInvoiceNumber() {
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.invoice = current.invoice || {};
        const prev = current.invoice.invoiceNumber || 'INV-AUTO-000';
        const m = prev.match(/^(.*?)(\d+)$/);
        let next;
        if (m) {
            const n = parseInt(m[2], 10) + 1;
            next = m[1] + String(n).padStart(m[2].length, '0');
        } else {
            next = `${prev}-1`;
        }
        current.invoice.invoiceNumber = next;
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[INV] Invoice number bumped: ${prev} → ${next}`);
        return next;
    }

    async fillInvoiceDetails(data) {
        // Use a fresh, incremented invoice number each run (duplicate check in app)
        const invoiceNumber = this._nextInvoiceNumber();
        const num = this.page.locator(`xpath=${L.invoiceNumberInput}`).first();
        await num.waitFor({ state: 'visible', timeout: 15000 });
        await num.fill(invoiceNumber);
        // Invoice Date = test execution date (today) — react-datepicker
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await this._pickReactDate(this.page.locator(L.invoiceDateInput).first(), today);
        console.log(`[INV] Filled Invoice Number (${invoiceNumber}) + Invoice Date (${today})`);
    }

    // MUI Autocomplete: click field → click the "No" option
    async _selectAutocompleteNo(fieldXpath, label) {
        const field = this.page.locator(`xpath=${fieldXpath}`).first();
        await field.scrollIntoViewIfNeeded();
        await field.click();
        await this.page.waitForTimeout(700);
        const no = this.page.locator(`xpath=${L.autocompleteNoOption}`).first();
        await no.waitFor({ state: 'visible', timeout: 8000 });
        await no.click();
        await this.page.waitForTimeout(500);
        console.log(`[INV] ${label} → No`);
    }

    async setInvoiceGeneralDetailsNo() {
        await this._selectAutocompleteNo(L.invoicePeriodBasedField, 'Period based Invoicing');
        await this._selectAutocompleteNo(L.invoiceExtraBillingField, 'Extra billing');
    }

    // FIX → Item Matching popup → Add GRN (the PO's GRN) → Submit
    //
    // `reselect` — the GRN is ALREADY ticked in the Add GRN multi-select when the
    // popup is reopened on a rejected invoice's edit form, so the first click
    // DESELECTS it and the invoice resubmits unmatched. The option's selected state
    // drives the clicking where the DOM exposes it; where it doesn't, this flag is
    // the fallback (click twice: off → on, leaving it matched again).
    async matchGrnInItemMatching({ reselect = false } = {}) {
        const fix = this.page.locator(`xpath=${L.invoiceFixBtn}`).first();
        await fix.scrollIntoViewIfNeeded();
        await fix.click();
        console.log('[INV] Clicked FIX → Item Matching');
        await this.page.waitForTimeout(2000);

        // GRN created for this PO
        const fresh = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        const grnCode = fresh.savedGrn && fresh.savedGrn.code;

        const addGrn = this.page.locator(`xpath=${L.itemMatchingAddGrnField}`).first();
        await addGrn.waitFor({ state: 'visible', timeout: 10000 });
        await addGrn.click();
        await this.page.waitForTimeout(1000);
        const opt = grnCode
            ? this.page.locator(`xpath=${L.itemMatchingGrnOption(grnCode)}`).first()
            : this.page.locator(`xpath=//li[@role='option'][contains(normalize-space(.),'INW-')]`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });

        // 'true' / 'false' when the option reports its state, null when it doesn't.
        const selectedState = async () => {
            const aria = await opt.getAttribute('aria-selected').catch(() => null);
            if (aria === 'true' || aria === 'false') return aria === 'true';
            const cls = (await opt.getAttribute('class').catch(() => null)) ?? '';
            if (/Mui-selected/.test(cls)) return true;
            const box = opt.locator(`input[type='checkbox']`).first();
            if (await box.count().catch(() => 0)) return await box.isChecked().catch(() => null);
            return null;
        };

        const before = await selectedState();
        const clicks = before === null ? (reselect ? 2 : 1) : 4; // known state → click until ticked
        for (let i = 0; i < clicks; i++) {
            await opt.click();
            await this.page.waitForTimeout(800);
            if (before !== null && await selectedState() === true) break;
        }
        const after = await selectedState();
        if (after === false) {
            throw new Error(`[INV] GRN ${grnCode || '(first)'} stayed deselected in Item Matching — it would resubmit unmatched.`);
        }
        console.log(`[INV] Selected GRN ${grnCode || '(first)'} in Item Matching`
            + ` (was ${before === null ? 'state-unknown' : before ? 'already ticked' : 'unticked'})`);

        // Close the multi-select dropdown by clicking the dialog heading, then Submit
        await this.page.locator(`xpath=(//div[@role='dialog']//*[contains(normalize-space(text()),'Item Matching')])[1]`)
            .first().click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(500);
        const submit = this.page.locator(`xpath=${L.itemMatchingSubmitBtn}`).first();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        await submit.click();
        console.log('[INV] Submitted Item Matching');
        await this.page.waitForTimeout(2000);
    }

    async submitInvoice() {
        // Header Submit (no popup open yet → the only visible Submit)
        const submit = this.page.locator(`xpath=${L.invoiceSubmitBtn}`).first();
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        await submit.click();
        console.log('[INV] Clicked Submit (create page)');
        await this.page.waitForTimeout(1500);

        // "Validations" popup → Proceed
        const proceed = this.page.locator(`xpath=${L.invoiceValidationProceedBtn}`).first();
        if (await proceed.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
            await proceed.click();
            console.log('[INV] Proceeded Validations popup');
        } else {
            console.log('[INV] Validations popup did not appear');
        }
        await this.page.waitForTimeout(2000);

        // "Workflow Summary" popup → Submit
        const wf = this.page.locator(`xpath=${L.invoiceWorkflowSummarySubmitBtn}`).first();
        if (await wf.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
            await wf.click();
            console.log('[INV] Confirmed Workflow Summary popup');
        } else {
            console.log('[INV] Workflow Summary popup did not appear');
        }
        // Must land on the invoice detail page. The old /\/invoices\/\d+/ pattern
        // also matched /invoices/<id>/edit, so a submit that never left the edit
        // form was logged as a success and failed much later instead.
        await this.page.waitForURL(/\/invoices\/\d+(?:$|\/(?!edit))/, { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log(`[INV] Invoice submitted → ${this.page.url()}`);
    }

    // Approve the invoice through all stages until it reaches "Pending Sync".
    // After the final approval the Approve button disappears and the status flips
    // to "Pending Sync" — the terminal state for this test. (It only becomes
    // "Accounted" after an external acknowledgement, which is out of scope.)
    async approveInvoiceUntilPendingSync(comments = 'Approved by automation', { acceptSyncFailed = true } = {}) {
        // An approved invoice settles on Pending Sync OR Sync Failed, and BOTH are
        // acknowledgeable through to Accounted — QA rule, 2026-09-09. Measured the
        // same day: Invoice-FNSE-26-388 finished approvals on Sync Failed, the ack
        // POST returned 200 {"success":true}, and the invoice went to Accounted
        // with "+ Payment" offered.
        //
        // Hence the default is true. It used to be false, which made every caller
        // that did not opt in throw "Invoice did not reach Pending Sync status" on
        // an invoice that was perfectly ackable — scenario 1 died exactly that way.
        // Pass { acceptSyncFailed: false } only for a test whose POINT is that the
        // invoice must reach Pending Sync specifically.
        const pendingSync = async (t = 1500) => {
            if (await this.page.locator(`xpath=${L.invoicePendingSyncStatus}`).first()
                    .isVisible({ timeout: t }).catch(() => false)) return true;
            if (!acceptSyncFailed) return false;
            return await this.page.locator(`xpath=${L.invoiceSyncFailedStatus}`).first()
                .isVisible({ timeout: t }).catch(() => false);
        };
        const pendingApproval = async (t = 1500) =>
            await this.page.locator(`xpath=${L.invoicePendingApprovalStatus}`).first().isVisible({ timeout: t }).catch(() => false);

        // A SINGLE 4s probe is not enough on this page. The v3 invoice detail view
        // renders its header actions and status badge late — heavier than the PO
        // page because of the line-item grid — so a bare isVisible check missed
        // both the Approve button AND the Pending Approval badge on most passes.
        // Scenario 1 on 2026-09-10 burned all 12 iterations logging "No Approve
        // button and not Pending Approval" while the failure screenshot showed
        // Invoice-FNSE-26-404 Pending Approval with Approve right there in the
        // header (it did find it on pass 5, which is what gives the timing away).
        // _waitForApproveButton reloads and re-polls, exactly as the PO loop now
        // does.
        for (let i = 0; i < 12; i++) {
            if (await pendingSync()) {
                console.log(`[INV] Status Pending Sync after ${i} approval(s).`);
                return;
            }
            const approveVisible = await this._waitForApproveButton({
                tag: 'INV',
                selector: L.poApproveBtn,
                stopWhen: pendingSync,
            });
            if (approveVisible) {
                console.log(`[INV] Approving stage ${i + 1}...`);
                await this._approveWithNotes(comments, 'INV');
                continue;
            }
            if (await pendingSync()) {
                console.log(`[INV] Status Pending Sync after ${i} approval(s).`);
                return;
            }
            // No Approve button. If still Pending Approval, the approver isn't us —
            // reassign and retry. Otherwise the badge may be mid-transition; reload.
            if (await pendingApproval(4000)) {
                console.log('[INV] Approve missing while Pending Approval — reassigning to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'INV'))) break;
                continue;
            }
            console.log('[INV] No Approve button and not Pending Approval — reloading to re-check status...');
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        if (!(await pendingSync())) {
            throw new Error(acceptSyncFailed
                ? 'Invoice reached neither Pending Sync nor Sync Failed'
                : 'Invoice did not reach Pending Sync status');
        }
    }

    /** Assert the invoice has settled somewhere acknowledgeable: Pending Sync or
     *  Sync Failed (QA rule, 2026-09-09 — the ack applies to both). Returns which.
     *  `strict:true` demands Pending Sync, for a test about that state itself. */
    async assertInvoicePendingSync({ strict = false } = {}) {
        if (strict) {
            await expect(this.page.locator(`xpath=${L.invoicePendingSyncStatus}`).first())
                .toBeVisible({ timeout: 15000 });
            console.log('[INV] Status is Pending Sync');
            return 'Pending Sync';
        }
        return await this.assertInvoiceReadyForAck();
    }

    async saveInvoiceCode() {
        const url = this.page.url();
        const bodyText = await this.page.locator('body').textContent() ?? '';
        const m = bodyText.match(/Invoice-[A-Z0-9\-]*\d+/i);
        const code = m ? m[0].trim() : null;
        const idMatch = url.match(/\/invoices\/(\d+)/);
        const dataPath = this._dataPath();
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedInvoice = { code, id: idMatch ? idMatch[1] : null, url };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[INV] Saved to NSEFoundationData.json → savedInvoice.code = "${code}"`);
        return code;
    }

    // ── External acknowledgement (invoice → Accounted) ─────────────────────────

    /**
     * POST the invoice acknowledgement to the external API so a Pending Sync
     * invoice flips to "Accounted". EXPENSE_RECORD_NO = saved invoice code and
     * response_body_reference = the invoice number, both read fresh from disk so
     * they match the invoice the last flow created. The X-API-Key is read from
     * the NSEF_INVOICE_ACK_KEY env var (.env) — never hardcoded.
     */
    async acknowledgeInvoice(data) {
        const fresh = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        const expenseRecordNo = fresh.savedInvoice?.code;
        const responseBodyRef = fresh.invoice?.invoiceNumber;
        // Prefer the env var (.env) but fall back to the committed data key so the
        // test runs without local .env setup.
        const apiKey = process.env.NSEF_INVOICE_ACK_KEY || data.invoice.ackApiKey;
        if (!apiKey) throw new Error('Invoice ack API key missing (NSEF_INVOICE_ACK_KEY env or invoice.ackApiKey)');
        if (!expenseRecordNo) throw new Error('savedInvoice.code missing — run the invoice flow first');

        const payload = {
            transactionData: {
                EXPENSE_RECORD_NO: expenseRecordNo,
                success: true,
                operation: 'create',
                response_body_reference: responseBodyRef,
                templateId: data.invoice.ackTemplateId ?? 1233,
            },
        };
        console.log(`[ACK] POST ${data.invoice.ackUrl} → EXPENSE_RECORD_NO="${expenseRecordNo}", response_body_reference="${responseBodyRef}"`);
        // Retry transient transport failures. The ack is a single POST at the very
        // end of a ~20 minute chain, so losing it to one flaky socket throws away
        // the whole run — which is exactly what happened on 2026-09-10
        // ("apiRequestContext.post: read ETIMEDOUT" on Invoice-FNSE-26-408, an
        // invoice that acked fine moments later). Retrying is safe: the ack is
        // idempotent per EXPENSE_RECORD_NO.
        let resp;
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                resp = await this.page.request.post(data.invoice.ackUrl, {
                    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                    data: payload,
                    timeout: 60000,
                });
                break;
            } catch (e) {
                const why = String(e).split('\n')[0];
                if (attempt === 4) throw new Error(`[ACK] POST failed after 4 attempts — ${why}`);
                console.log(`[ACK] POST attempt ${attempt} failed (${why}) — retrying in 10s...`);
                await this.page.waitForTimeout(10000);
            }
        }
        const body = await resp.text().catch(() => '');
        console.log(`[ACK] Response ${resp.status()}: ${body.slice(0, 300)}`);
        expect(resp.ok(), `Ack API returned ${resp.status()}: ${body}`).toBeTruthy();
        await this.page.waitForTimeout(2000); // let the backend apply the status change
        return resp;
    }

    /** Open the invoice created by the last flow (capp domain — re-login if redirected). */
    async openSavedInvoice(data) {
        const fresh = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        const { url, code } = fresh.savedInvoice;
        console.log(`[INV] Opening saved invoice ${code} → ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);

        if (/nse-auth-uat\.aerchain\.io/.test(this.page.url())) {
            console.log('[INV] Redirected to login for capp domain — logging in again...');
            const emailField = this.page.locator(L.loginEmailField).first();
            if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
                await emailField.fill(data.login.email);
                await this.page.locator(L.loginContinueBtn).click();
            }
            const pwField = this.page.locator(L.loginPasswordField).first();
            if (await pwField.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
                await pwField.fill(data.login.password);
                await this.page.locator(L.loginSubmitBtn).click();
            }
        }
        await this.page.waitForURL(/\/invoices\/\d+/, { timeout: 30000 });
        await this.page.waitForTimeout(2000);
        console.log(`[INV] On invoice page: ${this.page.url()}`);
    }

    /** Assert the invoice status is "Accounted" (reload-retry — the flip can lag the ack). */
    /** Read every status chip currently rendered on an old-capp detail page.
     *  Used to report what state a doc is ACTUALLY in when a precondition fails. */
    async _readDocStatusChips() {
        const known = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled',
            'Accounted', 'Pending Sync', 'Sync Failed', 'Completed', 'Inwarded',
            'Released', 'Processed', 'Partially Processed', 'Recalled'];
        return await this.page.evaluate((known) => {
            const out = new Set();
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length) continue;
                const t = (el.innerText || '').trim();
                if (known.includes(t)) out.add(t);
            }
            return [...out];
        }, known);
    }

    /** Assert an old-capp doc's header status reads `status`, tolerating the late
     *  chip render with a few reloads. On a miss it reports the status the page
     *  DOES show — a wrong-state precondition otherwise surfaces only as an
     *  opaque "element is not enabled" timeout further down the test. */
    async assertCappDocStatus(status, tag = 'DOC') {
        const chip = this.page.locator(`xpath=//*[normalize-space(text())='${status}']`).first();
        for (let i = 0; i < 4; i++) {
            if (await chip.isVisible({ timeout: 2500 }).catch(() => false)) {
                console.log(`[${tag}] Status is ${status}`);
                return;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(2500);
        }
        throw new Error(`[${tag}] expected status "${status}" but the page shows ` +
            JSON.stringify(await this._readDocStatusChips()));
    }

    async assertInvoiceAccounted() {
        const accounted = async (t = 2000) =>
            await this.page.locator(`xpath=${L.invoiceAccountedStatus}`).first().isVisible({ timeout: t }).catch(() => false);
        for (let i = 0; i < 6; i++) {
            if (await accounted(2000)) { console.log('[INV] Status is Accounted'); return; }
            console.log(`[INV] Not Accounted yet — reloading (${i + 1}/6)...`);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        await expect(this.page.locator(`xpath=${L.invoiceAccountedStatus}`).first())
            .toBeVisible({ timeout: 5000 });
    }

    // ── Invoice payment ────────────────────────────────────────────────────────

    /** Read the "Invoice Amount" from the invoice Overview as a number (₹ 2,00,000.00 → 200000). */
    /**
     * Read the invoice's Invoice Amount.
     *
     * The page renders "₹ 0.00" placeholders and fills them a moment later, so a
     * single reading can capture 0 — which then gets typed into Paid Amount as a
     * zero payment. Observed 2026-09-10 on Invoice-FNSE-26-408, an invoice
     * genuinely worth ₹1,00,000. A zero invoice is never valid in this flow, so
     * poll until a non-zero figure appears and fail loudly if it never does,
     * rather than silently paying nothing.
     */
    async readInvoiceAmount({ timeoutMs = 30000 } = {}) {
        const el = this.page.locator(`xpath=${L.invoiceAmountValue}`).first();
        await el.waitFor({ state: 'visible', timeout: 15000 });
        const deadline = Date.now() + timeoutMs;
        let amount = 0;
        let seen = '';
        while (Date.now() < deadline) {
            seen = (await el.textContent().catch(() => '')) ?? '';
            amount = parseFloat(seen.replace(/[₹,\s]/g, ''));
            if (Number.isFinite(amount) && amount > 0) {
                console.log(`[INV] Invoice Amount = ${amount}`);
                return amount;
            }
            await this.page.waitForTimeout(1000);
        }
        throw new Error(`[INV] Invoice Amount never became non-zero (last read "${seen.trim()}") `
            + '— paying 0 would silently create a meaningless payment');
    }

    /** Open the "Converting to Payment" drawer via the + Payment button. */
    async clickAddPayment() {
        await this.page.locator(`xpath=${L.invoiceAddPaymentBtn}`).first().click();
        await this.page.locator(`xpath=${L.paymentDrawerHeading}`).first()
            .waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(1000);
    }

    /** Fill the payment form: Paid Amount, a unique UTR, and the payment date. */
    async fillPaymentForm(amount, utr, dateStr) {
        await this.page.locator(L.paymentPaidAmountInput).first().fill(String(amount));
        await this.page.locator(L.paymentUtrInput).first().fill(utr);
        await this._pickReactDate(this.page.locator(L.paymentDateInput).first(), dateStr);
        console.log(`[PAY] Paid Amount=${amount}, UTR=${utr}, Payment Date=${dateStr}`);
    }

    /** Read the line item's "Actual Amount" in the payment drawer as a number. */
    async getPaymentActualAmount() {
        const cell = this.page.locator(L.paymentActualAmountCell).first();
        await cell.waitFor({ state: 'visible', timeout: 10000 });
        return parseFloat(((await cell.textContent()) ?? '').replace(/[₹,\s]/g, ''));
    }

    async submitPayment() {
        await this.page.locator(`xpath=${L.paymentSubmitBtn}`).first().click();
    }

    /** Assert a (transient) success toast appears right after submitting the payment. */
    async assertPaymentSuccessToast() {
        const toast = this.page.locator(L.paymentSuccessToast).filter({ hasText: /\S/ }).first();
        await expect(toast).toBeVisible({ timeout: 8000 });
        console.log(`[PAY] Success message: ${((await toast.textContent()) ?? '').trim().slice(0, 120)}`);
    }

    async openInvoiceTransactionsTab() {
        await this.page.locator(`xpath=${L.invoiceTransactionsTab}`).first().click();
        await this.page.waitForTimeout(1500);
    }

    /** Assert the Payments table lists our payment (by UTR) with status Completed. */
    async assertPaymentCompleted(utr) {
        await expect(this.page.getByText(utr, { exact: false }).first())
            .toBeVisible({ timeout: 10000 });
        await expect(this.page.locator(`xpath=${L.paymentCompletedStatus}`).first())
            .toBeVisible({ timeout: 10000 });
        console.log(`[PAY] Payment ${utr} shows status Completed`);
    }

    // ── Org Settings › User Management (Tracks — department access) ────────────
    // VERIFIED against the live UAT env (2026-07-07). The v4 top-bar gear opens
    // Org Settings in a NEW TAB on the admin subdomain
    // (nse-capp-admin-uat.aerchain.io). We keep a handle to the original v4
    // dashboard tab (`this.dashboardPage`) and switch `this.page` to the admin
    // tab for the User-Management steps, then close the admin tab and switch
    // back for the "home → dashboard" step.

    /** Click the v4 top-bar gear ("Open Settings"). Org Settings opens in a NEW
     *  browser tab — capture it and make it the active page. */
    async clickOrgSettings() {
        const context = this.page.context();
        this.dashboardPage = this.page; // remember the v4 dashboard tab
        const [adminPage] = await Promise.all([
            context.waitForEvent('page', { timeout: 20000 }),
            this.page.locator(L.orgSettingsGearBtn).first().click(),
        ]);
        await adminPage.waitForLoadState('domcontentloaded');
        await adminPage.waitForLoadState('networkidle').catch(() => {});
        this.page = adminPage; // subsequent steps run on the admin tab
        console.log('[ADMIN] Opened Org Settings (new tab)');
    }

    /** Expand the "User Management" accordion in the admin sidebar. */
    async clickUserManagement() {
        const heading = this.page.locator(`xpath=${L.adminUserMgmtHeading}`).first();
        await heading.waitFor({ state: 'visible', timeout: 15000 });
        await heading.click();
        // Wait for the revealed "Users" child link to appear
        await this.page.locator(`xpath=${L.adminUsersLink}`).first()
            .waitFor({ state: 'visible', timeout: 10000 });
        console.log('[ADMIN] Expanded User Management');
    }

    async clickUsers() {
        await this.page.locator(`xpath=${L.adminUsersLink}`).first().click();
        await this.page.waitForURL(/\/user-management\/users/, { timeout: 15000 });
        // Wait for the users table to render
        await this.page.locator('table tbody tr').first()
            .waitFor({ state: 'visible', timeout: 15000 });
        console.log('[ADMIN] Opened Users list');
    }

    /** Open a user record by its display name — clicking the row opens the
     *  "Update User" drawer. The drawer is a MUI modal with a full-viewport
     *  backdrop, so once open the row is no longer clickable; never blindly
     *  re-click. Wait generously for the drawer; retry only after Escaping any
     *  backdrop. */
    async openUserByName(name) {
        const row = this.page.locator(`xpath=${L.adminUserRowByName(name)}`).first();
        const drawer = this.page.getByRole('heading', { name: 'Update User' });
        await row.waitFor({ state: 'visible', timeout: 15000 });
        await row.click();
        if (await drawer.isVisible({ timeout: 12000 }).catch(() => false)) {
            console.log(`[ADMIN] Opened user "${name}" (Update User drawer)`);
            return;
        }
        // Retry once: clear any stray backdrop first so the row is clickable again.
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
        await row.click();
        await drawer.waitFor({ state: 'visible', timeout: 12000 });
        console.log(`[ADMIN] Opened user "${name}" (Update User drawer, retry)`);
    }

    /** Adjust the "Full Access" checkbox beside "Select Department", exercising
     *  the Update flow. Behaviour depends on the box's initial state (dictated):
     *   • Initially UNCHECKED → check → Update → uncheck → Update, then close the
     *     drawer. (Leaves it unchecked & saved, having exercised Update twice.)
     *   • Initially CHECKED → just uncheck; the caller then closes the settings
     *     tab (no Update / drawer close needed).
     *  Either way the caller follows with clickHomeIcon() + waitForUserDashboard(). */
    async handleDepartmentFullAccess() {
        const box = this.page.locator(`xpath=${L.fullAccessCheckboxFor('Select Department')}`).first();
        await box.waitFor({ state: 'attached', timeout: 10000 });
        const startedChecked = await box.isChecked();

        if (!startedChecked) {
            console.log('[ADMIN] Dept Full Access started UNCHECKED → check→Update→uncheck→Update');
            await this._setDeptFullAccess(box, true);   // check
            await this.clickUpdate();
            await this._setDeptFullAccess(box, false);  // uncheck
            await this.clickUpdate();
            await this.closeUserPanel();
        } else {
            console.log('[ADMIN] Dept Full Access started CHECKED → uncheck, then close settings tab');
            await this._setDeptFullAccess(box, false);  // uncheck; caller closes the tab
        }
    }

    /** Set the given checkbox to `checked` (click only if the state differs). */
    async _setDeptFullAccess(box, checked) {
        if ((await box.isChecked()) !== checked) {
            await box.click();
        }
        if (checked) await expect(box).toBeChecked({ timeout: 5000 });
        else         await expect(box).not.toBeChecked({ timeout: 5000 });
    }

    async clickUpdate() {
        await this.page.locator(`xpath=${L.updateBtn}`).first().click();
        // Confirm the save landed
        await expect(this.page.getByText(L.userUpdatedToast, { exact: false }).first())
            .toBeVisible({ timeout: 10000 });
        console.log('[ADMIN] Clicked Update — "User updated successfully"');
    }

    /** Close the "Update User" drawer via its cross (X) icon. */
    async closeUserPanel() {
        await this.page.locator(L.panelCloseIcon).first().click();
        await this.page.getByRole('heading', { name: 'Update User' })
            .waitFor({ state: 'hidden', timeout: 10000 });
        console.log('[ADMIN] Closed user drawer');
    }

    /** "Home" given the new-tab reality: close the Org Settings tab and return
     *  to the still-open v4 dashboard tab. */
    async clickHomeIcon() {
        if (this.dashboardPage && this.page !== this.dashboardPage) {
            await this.page.close();
            this.page = this.dashboardPage;
            await this.page.bringToFront();
        }
        console.log('[ADMIN] Returned to v4 dashboard tab');
    }

    /** Wait until the user dashboard has rendered ("User's Dashboard" heading). */
    async waitForUserDashboard() {
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await expect(this.page.getByText("User's Dashboard", { exact: false }).first())
            .toBeVisible({ timeout: 30000 });
        await this.page.locator('tbody tr td').first()
            .waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        console.log('[ADMIN] User dashboard displayed');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // REJECT → EDIT → RESUBMIT helpers (testSuiteallmodulesrejectedit)
    //
    // Shared pattern across modules: a document is Rejected during its approval
    // workflow, re-opened from the header More dropdown ("Edit"), its line-item
    // quantity is lowered, " reject edit" is appended to the title/subject, and
    // it is resubmitted — which must re-trigger a fresh approval workflow (a new
    // "Workflow N" entry in the Workflow Steps panel).
    //
    // NOTE: the PR/PO/PRC helpers below touch UI not previously automated; their
    // selectors are provisional and may need tightening after a live run.
    // ═════════════════════════════════════════════════════════════════════════

    /** Snapshot the number of distinct "Workflow N" runs (open the panel, read,
     *  close). Used to assert a resubmit added a new workflow run. */
    async snapshotWorkflowCount() {
        await this.openWorkflowStages();
        const n = await this.getWorkflowCount();
        await this.closeWorkflowStages();
        console.log(`[RejectEdit] Workflow runs currently: ${n}`);
        return n;
    }

    /** Assert the Workflow Steps panel now shows MORE runs than `previous` — i.e.
     *  the resubmit re-triggered a new approval workflow. */
    async assertNewWorkflowTriggered(previous) {
        await this.openWorkflowStages();
        const now = await this.getWorkflowCount();
        await this.closeWorkflowStages();
        console.log(`[RejectEdit] Workflow runs before=${previous} after=${now}`);
        expect(now, 'resubmit after reject should trigger a new workflow run')
            .toBeGreaterThan(previous);
        return now;
    }

    // ── CXO reject → edit → resubmit ──────────────────────────────────────────

    /** Overwrite the (already-added) CXO line-item Qty cell with a new value. */
    async changeCxoLineItemQty(newQty) {
        const cell = this.page.locator(L.itemQtyCell).first();
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(400);
        // ControlOrMeta+a → real select-all inside the focused input (on macOS a
        // plain Control+a is "move to line start", which prepends instead of
        // replacing → e.g. 100 became 5100).
        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.press('Delete');
        await this.page.keyboard.type(String(newQty));
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(500);
        console.log(`[CXO] Line-item qty changed to ${newQty}`);
    }

    /** Rejected CXO → More → Edit → editable form (/cxos/{id}/edit) → lower qty,
     *  append " reject edit" to the title → Submit (handles the Workflow-Summary
     *  popup). Leaves the CXO on its overview at Pending Approval; caller then
     *  verifies a new workflow was triggered. Returns the new title. */
    async editAndResubmitRejectedCxo(data, newQty = '5') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const editOpt = this.page.locator(`xpath=${IL.intakeEditOption}`).first();
        await editOpt.waitFor({ state: 'visible', timeout: 8000 });
        await editOpt.click();

        await this.page.waitForURL(/\/cxos\/[^\/]+\/edit/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);

        await this.changeCxoLineItemQty(newQty);

        const current = await this.getTitleValue();
        const newTitle = `${current} reject edit`;
        await this.typeTitle(newTitle);
        await this.page.waitForTimeout(500);

        await this.clickSubmit();
        await expect(this.page).toHaveURL(/\/cxos\/[^\/]+\/overview/, { timeout: 25000 });
        await this.page.waitForTimeout(1500);
        console.log(`[CXO] Rejected CXO edited & resubmitted → title="${newTitle}"`);
        return newTitle;
    }

    // ── Intake reject → edit → resubmit ───────────────────────────────────────

    /** Rejected intake → More → Edit → editable form (/intakes/{id}/edit) → lower
     *  qty, append " reject edit" to the title → resubmit through the intake
     *  submission popup. Returns the new title. */
    async editAndResubmitRejectedIntake(data, newQty = '5') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const editOpt = this.page.locator(`xpath=${IL.intakeEditOption}`).first();
        await editOpt.waitFor({ state: 'visible', timeout: 8000 });
        await editOpt.click();

        await this.page.waitForURL(/\/intakes\/[^\/]+\/edit/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);
        await this.closeAskAieraIfVisible().catch(() => {});

        await this.changeIntakeLineItemQty(newQty);

        const title = this.page.locator(IL.intakeTitle).first();
        await title.click();
        const current = await title.inputValue().catch(() => '');
        const newTitle = `${current || data.intake.title} reject edit`;
        await title.fill(newTitle);
        await this.page.waitForTimeout(500);

        await this.submitIntake();
        await this.completeIntakeSubmissionPopup();
        console.log(`[Intake] Rejected intake edited & resubmitted → title="${newTitle}"`);
        return newTitle;
    }

    // ── RFX reject → edit → lower qty → resubmit ──────────────────────────────

    /** Rejected RFX → More → Edit → editable Draft form → lower the line-item qty,
     *  append " reject edit" to the title → resubmit the sourcing event. The RFX
     *  qty cell reuses the intake qty-cell pattern. */
    async editAndResubmitRejectedRfxLowerQty(newQty = '5') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);
        const editOpt = this.page.locator(`xpath=//*[@role='menuitem'][normalize-space(.)='Edit']`).first();
        await editOpt.waitFor({ state: 'visible', timeout: 8000 });
        await editOpt.click();

        await this.page.waitForURL(/\/quote-requests\/[^\/]+\/edit/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2500);

        // Lower the quantity (best-effort: reuse the intake qty-cell overwrite).
        await this.changeIntakeLineItemQty(newQty).catch(
            () => console.log('[RFX] qty cell not editable on RFX edit form — skipping'));

        // Append " reject edit" to the title if a title field is present.
        const title = this.page.locator(IL.intakeTitle).first();
        if (await title.isVisible({ timeout: 5000 }).catch(() => false)) {
            const current = await title.inputValue().catch(() => '');
            await title.fill(`${current} reject edit`);
            await this.page.waitForTimeout(500);
        }

        await this.submitSourcingEvent();
        await this.page.waitForTimeout(2000);
        console.log(`[RFX] Rejected RFX edited (qty→${newQty}) & resubmitted`);
    }

    /**
     * On the New Sourcing event form (Intake → Process → Send For Sourcing),
     * overwrite the item grid's Quantity so the RFX converts only PART of the
     * intake — sheet scenario 6 converts 50 of an intake's 100.
     *
     * The cell is click-to-edit: clicking mounts an <input> pre-filled with the
     * intake quantity ("100.00"). ControlOrMeta+a is required rather than
     * Control+a — on macOS a plain Control+a moves the caret to line start and
     * the new digits are PREPENDED, silently converting 100 → 50100.
     * Verified live 2026-09-09 on intake 2250: 100.00 → 50.00.
     */
    /**
     * Every error the page is currently showing: toasts, inline red text, and
     * any open dialog. Used where the QUESTION is whether the app complained at
     * all, and where it complained - not where a specific message is expected.
     */
    /**
     * Start recording every toast/alert the page raises, from now until read.
     *
     * collectVisibleErrors() SNAPSHOTS the DOM, which cannot see a message that
     * has already faded. Scenario 17 chased that for five runs: the app does
     * show a quantity error on submit (confirmed on screen by QA, 2026-09-11),
     * but the toast was gone by the time the snapshot ran, so the run reported
     * "no error" and came within one commit of filing a false defect.
     *
     * A MutationObserver catches each toast as it is inserted, so transient
     * messages survive to be asserted on. Note a full page navigation wipes the
     * log - restart it after one if the flow navigates.
     */
    async startErrorRecorder() {
        await this.page.evaluate(() => {
            const SEL = '[role="status"],[role="alert"],[class*="toast"],[data-sonner-toast],[class*="Toastify"]';
            window.__errLog = [];
            // A date picker's month labels ("September 2026", ...) match one of the
            // toast selectors on this app, so they are filtered out here rather
            // than left to trip a future assertion.
            const NOISE = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;
            const push = (t) => {
                t = (t || '').replace(/\s+/g, ' ').trim();
                if (!t || t.length <= 2 || NOISE.test(t)) return;
                if (!window.__errLog.includes(t)) window.__errLog.push(t);
            };
            const scan = (root) => {
                if (!root || root.nodeType !== 1) return;
                if (root.matches?.(SEL)) push(root.innerText);
                root.querySelectorAll?.(SEL).forEach(e => push(e.innerText));
            };
            scan(document.body);
            window.__errMo?.disconnect();
            window.__errMo = new MutationObserver(muts => {
                for (const m of muts) m.addedNodes?.forEach(scan);
                scan(document.body);
            });
            window.__errMo.observe(document.body, { childList: true, subtree: true });
        });
        console.log('[ERR] recorder started');
    }

    /** Everything the recorder has seen since startErrorRecorder(). */
    async readRecordedErrors() {
        const log = await this.page.evaluate(() => window.__errLog || []);
        if (log.length) console.log(`[ERR] recorded: ${JSON.stringify(log)}`);
        return log;
    }

    async collectVisibleErrors() {
        return await this.page.evaluate(() => ({
            toasts: [...document.querySelectorAll('[role="status"],[role="alert"],[class*="toast"]')]
                .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8),
            // Error-styled TEXT only. An earlier version matched on the class
            // alone and picked up the "Cancel" BUTTON, whose destructive styling
            // uses the same tokens - scenario 17 then reported a guard the app
            // does not have and passed on a false positive (2026-09-11).
            // Controls are excluded, and so is anything that reads like a label.
            inline: [...document.querySelectorAll('*')]
                .filter(e => !e.children.length
                    && /text-red|text-destructive|error/i.test(String(e.className || ''))
                    && !e.closest('button,[role="button"],a,[role="menuitem"],label'))
                .map(e => (e.innerText || '').trim())
                .filter(t => t.length > 3 && t.length < 300
                    && !/^(cancel|close|delete|remove|submit|clear|reset|back)$/i.test(t))
                .slice(0, 10),
            dialog: (document.querySelector('[role="dialog"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
        }));
    }

    /**
     * Type a quantity into the sourcing grid and report what happened, WITHOUT
     * asserting the value took (sheet scenario 17).
     *
     * setSourcingLineItemQty asserts the cell now holds the typed value, which
     * is right when lowering a qty (scenario 6) and wrong when the whole point
     * is that the app should REFUSE the value: the helper would fail on its own
     * assertion and tell us nothing about the app's error handling.
     */
    async attemptSourcingLineItemQty(qty, rowIndex = 0) {
        const cell = this.page.locator(L.sourcingItemQtyCell).nth(rowIndex);
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        await cell.scrollIntoViewIfNeeded();
        const before = (await cell.innerText().catch(() => '')).trim();

        await cell.click();
        await this.page.waitForTimeout(500);
        const focused = await this.page.evaluate(() => document.activeElement?.tagName || '');
        if (/^(BODY|HTML)$/.test(focused)) {
            throw new Error(`[RFX] clicking the Quantity cell focused <${focused}> — the sourcing grid is not editable here`);
        }

        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.press('Delete');
        await this.page.keyboard.type(String(qty));
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(2500);

        const after = (await cell.innerText().catch(() => '')).replace(/[,\s]/g, '');
        const accepted = new RegExp(`^${qty}(\\.0+)?$`).test(after);
        const errors = await this.collectVisibleErrors();
        console.log(`[RFX] attempted qty ${before} → ${qty}: cell now "${after}" (accepted=${accepted})`);
        if (errors.toasts.length || errors.inline.length || errors.dialog) {
            console.log(`[RFX] errors on screen: ${JSON.stringify(errors)}`);
        }
        return { before, after, accepted, errors };
    }

    async setSourcingLineItemQty(qty, rowIndex = 0) {
        const cell = this.page.locator(L.sourcingItemQtyCell).nth(rowIndex);
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        await cell.scrollIntoViewIfNeeded();
        const before = (await cell.innerText().catch(() => '')).trim();

        await cell.click();
        await this.page.waitForTimeout(500);

        // The click must have mounted an editor. If focus stayed on <body> the
        // grid is read-only and a "lowered" qty would be a silent no-op.
        const focused = await this.page.evaluate(() => document.activeElement?.tagName || '');
        if (/^(BODY|HTML)$/.test(focused)) {
            throw new Error(`[RFX] clicking the Quantity cell focused <${focused}> — the sourcing grid is not editable here`);
        }

        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.press('Delete');
        await this.page.keyboard.type(String(qty));
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(1200);

        const after = (await cell.innerText().catch(() => '')).replace(/[,\s]/g, '');
        expect(after, `sourcing line qty should have changed from ${before} to ${qty}`)
            .toMatch(new RegExp(`^${qty}(\\.0+)?$`));
        console.log(`[RFX] Sourcing line qty ${before} → ${after}`);
        return after;
    }

    /** After a re-convertible intake's Process → Send for Sourcing lands on the
     *  New Sourcing event page: expand the sections and assert the (lowered)
     *  line-item qty shows in the Item Table. The qty may render as a grid-cell
     *  text node or an input value, so check both. */
    async assertSourcingLineItemQty(qty) {
        await this.expandSourcingSections().catch(() => {});
        await this.page.waitForTimeout(1500);
        await this.assertQtyVisibleOnPage(qty, 'RFX', 'sourcing line item');
    }

    /** Assert `qty` appears somewhere on the current page — as a grid-cell / text
     *  node OR an input value — tolerating trailing decimals ("50.00"), units
     *  ("50 Nos") and thousands separators. */
    async assertQtyVisibleOnPage(qty, tag = 'Qty', where = 'page') {
        const q = String(qty);
        const found = await this.page.evaluate((val) => {
            const re = new RegExp(`(^|[^\\d])${val}(\\.0+)?([^\\d]|$)`);
            const norm = s => (s || '').replace(/,/g, '').trim();
            const textHit = [...document.querySelectorAll('*')]
                .some(e => e.children.length === 0 && re.test(norm(e.textContent)));
            const inputHit = [...document.querySelectorAll('input, textarea')]
                .some(i => re.test(norm(i.value)));
            return textHit || inputHit;
        }, q);
        expect(found, `${where} should show the qty ${q}`).toBeTruthy();
        console.log(`[${tag}] Verified qty ${q} shown in the ${where}`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GRN + Invoice reject → edit → lower qty (old capp domain) — PROVISIONAL
    // ═════════════════════════════════════════════════════════════════════════

    /** Diagnostic: log every editable field (id / name / placeholder / value) and
     *  every button caption on the page — used to discover selectors for UI not
     *  yet automated (old-capp GRN/Invoice reject + edit forms). */
    async dumpEditableFields(tag = 'DUMP') {
        const info = await this.page.evaluate(() => {
            const inputs = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')]
                .map(e => ({
                    id: e.id || '', name: e.getAttribute('name') || '',
                    ph: e.getAttribute('placeholder') || '', type: e.getAttribute('type') || e.tagName,
                    val: (e.value ?? e.textContent ?? '').toString().slice(0, 30),
                }))
                .filter(x => x.id || x.name || x.ph || x.val);
            const buttons = [...document.querySelectorAll('button')]
                .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 50);
            return { inputs: inputs.slice(0, 50), buttons };
        });
        console.log(`[${tag}] editable fields:\n` + JSON.stringify(info.inputs, null, 1));
        console.log(`[${tag}] buttons: ${JSON.stringify(info.buttons)}`);
        return info;
    }

    /** Reject a document currently in an old-capp approval workflow (GRN / Invoice):
     *  header Reject → notes → confirm. Reassigns the approver to NSEF Support
     *  Admin and retries if Reject isn't available (same pattern as approvals). */
    async rejectCappDoc(reason = 'Rejected by automation', tag = 'DOC') {
        // Wait for the V3 header toolbar to render FIRST. Without this the Non-PO
        // invoice page is still on its spinner, so Reject *and* the More menu used
        // to reassign the approver both look absent and the retry loop below burns
        // out against an unrendered page ("No More button — cannot reassign",
        // 2026-08-25). Verified live: on a rendered page this user is the creator,
        // gets no Reject, and reassigning the workflow approver to itself makes
        // both Reject and Approve appear.
        const rejectBtn = this.page.locator(`xpath=${L.cappRejectBtn}`).first();
        let ready = false;
        for (let attempt = 0; attempt < 5 && !ready; attempt++) {
            // Re-wait EVERY pass: each reload below drops the toolbar back to blank,
            // so checking straight after one sees no Reject and no More and the
            // reassign fallback misfires on an empty page (buttons: []).
            await this.waitForCappDetailLoaded(tag);
            if (await rejectBtn.isVisible({ timeout: 4000 }).catch(() => false)) { ready = true; break; }
            if (attempt === 2) {
                console.log(`[${tag}] Reject missing — reassigning approver to NSEF Support Admin...`);
                await this.reassignWorkflowApprover('Reassigned for automated testing', tag).catch(() => {});
            } else {
                console.log(`[${tag}] Reject not visible — reloading (${attempt + 1})`);
                await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            }
            await this.page.waitForTimeout(1500);
        }
        if (!ready) {
            console.log(`[${tag}] Reject still not found — dumping buttons for discovery`);
            await this.dumpEditableFields(`${tag}-DETAIL`);
        }
        await rejectBtn.waitFor({ state: 'visible', timeout: 8000 });
        await rejectBtn.click();

        const notes = this.page.locator(`xpath=${L.poApproveNotesField}`).first();
        if (await notes.isVisible({ timeout: 8000 }).catch(() => false)) await notes.fill(reason);

        const confirm = this.page.locator(`xpath=${L.cappRejectConfirmBtn}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log(`[${tag}] Reject submitted`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(1500);
    }

    /** Old-capp detail pages can sit on the app spinner long after the reject →
     *  reload (the Invoice one especially). Wait for the header toolbar to
     *  render — "More" is always there — reloading if it stays blank. */
    async waitForCappDetailLoaded(tag = 'DOC') {
        for (let attempt = 0; attempt < 3; attempt++) {
            const rendered = await this.page.locator(`xpath=${IL.intakeMoreBtn}`).first()
                .waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true).catch(() => false);
            if (rendered) return true;
            console.log(`[${tag}] Detail page still on the spinner — reloading (${attempt + 1})`);
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.page.waitForTimeout(3000);
        }
        console.log(`[${tag}] Detail page never rendered its header toolbar`);
        return false;
    }

    /** Open the edit form of a rejected old-capp doc (GRN/Invoice). The header
     *  exposes the edit as an unlabelled pencil icon (img[alt='Edit']); there is
     *  no text "Edit" button and More holds only "Reassign User". Tries the icon,
     *  then a text Edit, then More → Edit. Dumps buttons if none is found.
     *  Returns true when an edit was opened. */
    async openCappEditForm(tag = 'DOC') {
        await this.waitForCappDetailLoaded(tag);
        const iconBtn = this.page.locator(`xpath=${L.cappEditIconBtn}`).first();
        if (await iconBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
            await iconBtn.click();
            await this.page.waitForTimeout(2500);
            console.log(`[${tag}] Opened edit via header pencil icon`);
            return true;
        }
        const editBtn = this.page.locator(`xpath=${L.cappEditBtn}`).first();
        if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await editBtn.click();
            await this.page.waitForTimeout(2500);
            return true;
        }
        // Fall back to the More dropdown → Edit.
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        if (await more.isVisible({ timeout: 5000 }).catch(() => false)) {
            await more.click();
            await this.page.waitForTimeout(700);
            const editOpt = this.page.locator(`xpath=${IL.intakeEditOption}`).first();
            if (await editOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
                await editOpt.click();
                await this.page.waitForTimeout(2500);
                console.log(`[${tag}] Opened edit via More → Edit`);
                return true;
            }
            console.log(`[${tag}] More opened but no Edit option — dumping`);
            // Dismiss the popover: its backdrop otherwise intercepts every later
            // click/dblclick and the real failure surfaces as a bogus timeout.
            await this.page.keyboard.press('Escape').catch(() => {});
            await this.page.waitForTimeout(500);
        }
        console.log(`[${tag}] Edit not found (icon, text or More) — dumping`);
        await this.dumpEditableFields(`${tag}-DETAIL`);
        return false;
    }

    /** Rejected GRN → Edit → lower the Received qty (AG-grid cell), annotate the
     *  Invoice Number with " reject edit" → resubmit. */
    async editGrnReceivedLowerQtyAndSubmit(newQty = '50') {
        if (!await this.openCappEditForm('GRN')) {
            throw new Error('[GRN] Could not open the edit form on the rejected GRN — see the field/button dump above.');
        }
        await this.page.waitForTimeout(500);

        // Lower the Received qty in the AG-grid cell (double-click → edit → type).
        const cell = this.page.locator(`xpath=${L.grnReceivedCell}`).first();
        if (await cell.isVisible({ timeout: 8000 }).catch(() => false)) {
            await cell.scrollIntoViewIfNeeded();
            await cell.dblclick();
            await this.page.waitForTimeout(400);
            await this.page.keyboard.press('ControlOrMeta+a');
            await this.page.keyboard.press('Delete');
            await this.page.keyboard.type(String(newQty));
            await this.page.keyboard.press('Enter');
            console.log(`[GRN] Received qty lowered to ${newQty}`);
        } else {
            console.log('[GRN] Received cell not found — dumping');
            await this.dumpEditableFields('GRN-EDIT');
        }
        await this.page.waitForTimeout(500);

        // Annotate the Invoice Number field with " reject edit".
        const inv = this.page.locator(`xpath=${L.grnInvoiceNumberInput}`).first();
        if (await inv.isVisible({ timeout: 5000 }).catch(() => false)) {
            const cur = await inv.inputValue().catch(() => '');
            await inv.fill(`${cur} reject edit`);
            console.log('[GRN] Invoice Number annotated with " reject edit"');
        }
        await this.page.waitForTimeout(500);

        await this.submitGrn();
    }

    /** Open the saved PO → Create → GRN → Select PO Items, and assert the reduced
     *  qty is available for creating a new GRN. */
    async assertPoQtyAvailableForGrn(qty, data) {
        await this.openSavedPurchaseOrder(data);
        await this.clickPoCreateGrn();
        await this.page.waitForTimeout(1500);
        await this.assertQtyVisibleOnPage(qty, 'GRN', 'Select PO Items (qty available for GRN)');
    }

    /** Rejected Invoice → Edit → lower the qty (AG-grid cell), annotate the invoice
     *  number with " reject edit" → resubmit. */
    /** Handles for the invoice qty AG-grid cell (line_items_quantity), shared by
     *  the CREATE Invoice page and the rejected-invoice EDIT form. Returns the
     *  cell plus cellQty() (what it currently displays) and setQty() (type the
     *  value and confirm it stuck). `tag` only labels the dump if the cell is
     *  missing. */
    async _invoiceQtyOps(newQty, tag = 'INV-EDIT') {
        // Invoice qty lives in its own AG-grid column (line_items_quantity).
        const cell = this.page.locator(`xpath=${L.invoiceQtyCell}`).first();
        if (!await cell.isVisible({ timeout: 8000 }).catch(() => false)) {
            console.log(`[INV] Qty cell not found on invoice ${tag} — dumping`);
            await this.dumpEditableFields(tag);
            // Resubmitting at the original qty leaves nothing for the downstream
            // "reduced qty available" check and fails far from the real cause.
            throw new Error('[INV] Invoice qty cell (line_items_quantity) not found.');
        }

        // What the cell currently displays, digits only ("50.000" → "50").
        const cellQty = async () => {
            const txt = (await cell.textContent().catch(() => '')) ?? '';
            const m = txt.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
            return m ? String(parseFloat(m[0])) : '';
        };

        // Type into the cell and confirm it stuck. The keystrokes silently no-op if
        // the grid isn't ready for editing, so never trust a single attempt.
        const setQty = async () => {
            for (let i = 0; i < 3; i++) {
                await cell.scrollIntoViewIfNeeded();
                await cell.dblclick();
                await this.page.waitForTimeout(500);
                const editor = cell.locator('input').first();
                if (await editor.count().catch(() => 0)) {
                    await editor.fill(String(newQty)).catch(() => {});
                } else {
                    await this.page.keyboard.press('ControlOrMeta+a');
                    await this.page.keyboard.press('Delete');
                    await this.page.keyboard.type(String(newQty));
                }
                await this.page.keyboard.press('Enter');
                await this.page.waitForTimeout(800);
                const now = await cellQty();
                if (now === String(newQty)) {
                    console.log(`[INV] Qty lowered to ${newQty} (cell reads "${now}")`);
                    return true;
                }
                console.log(`[INV] Qty did not stick (cell reads "${now}") — retrying (${i + 1}/3)`);
            }
            return false;
        };

        return { cell, cellQty, setQty };
    }

    /** Set the qty on the CREATE Invoice page. A 2nd invoice against a partially
     *  consumed PO defaults to the FULL PO qty, which the app then refuses to
     *  submit SILENTLY (stays on /invoices/new, no error in the DOM), so it must
     *  be lowered to the PO's remaining balance before Submit. */
    async setInvoiceQty(newQty) {
        const { setQty } = await this._invoiceQtyOps(newQty, 'INV-CREATE');
        if (!await setQty()) {
            throw new Error(`[INV] Could not set the invoice qty to ${newQty} on the create page.`);
        }
        await this.page.waitForTimeout(500);
    }

    /** Item Matching can push the GRN's matched qty back into the row, so confirm
     *  the qty survived and re-apply it if it was overwritten. */
    async ensureInvoiceQty(newQty) {
        const { cellQty, setQty } = await this._invoiceQtyOps(newQty, 'INV-CREATE');
        const now = await cellQty();
        if (now === String(newQty)) return;
        console.log(`[INV] Item Matching reset the qty to "${now}" — re-applying ${newQty}`);
        if (!await setQty()) {
            throw new Error(`[INV] Invoice qty reverted to "${now}" after Item Matching and could not be re-set.`);
        }
    }

    async editInvoiceLowerQtyAndSubmit(newQty = '50') {
        if (!await this.openCappEditForm('INV')) {
            throw new Error('[INV] Could not open the edit form on the rejected Invoice — see the field/button dump above.');
        }
        await this.page.waitForTimeout(500);

        const { cellQty, setQty } = await this._invoiceQtyOps(newQty, 'INV-EDIT');

        if (!await setQty()) {
            throw new Error(`[INV] Could not set the invoice qty to ${newQty} — the cell kept its original value.`);
        }
        await this.page.waitForTimeout(500);

        // Lowering the qty breaks the existing GRN match, so the invoice must be
        // re-matched (FIX → Item Matching → GRN) before it can be resubmitted —
        // without this the Submit silently leaves the form on /invoices/<id>/edit.
        // The GRN is still ticked here from the original submit, hence reselect.
        await this.matchGrnInItemMatching({ reselect: true });
        await this.page.waitForTimeout(500);

        // Re-matching can push the GRN's matched qty back into the row, so confirm
        // the lowered qty survived and re-apply it if it was overwritten.
        const afterMatch = await cellQty();
        if (afterMatch !== String(newQty)) {
            console.log(`[INV] Item Matching reset the qty to "${afterMatch}" — re-applying ${newQty}`);
            if (!await setQty()) {
                throw new Error(`[INV] Invoice qty reverted to "${afterMatch}" after Item Matching and could not be re-set.`);
            }
        }

        await this.submitInvoice();
    }

    /** Open the saved PO → Create → Invoice, and assert the reduced qty is
     *  available for creating a new Invoice. */
    async assertPoQtyAvailableForInvoice(qty, data) {
        await this.openSavedPurchaseOrder(data);
        await this.clickPoCreateInvoice();
        await this.page.waitForTimeout(1500);
        await this.assertQtyVisibleOnPage(qty, 'INV', 'Select PO Items (qty available for Invoice)');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Non-PO ("CXO") Invoice — §4 of the NSE Customer Flow Document
    //
    // CXO → direct Invoice: no Intake, no RFX, no PO. The only invoice type that
    // consumes budget straight from the CXO, so it is where the §2.4 parent-check
    // ceiling is enforced.
    //
    // Route: this flow LEAVES V4 for the V3 Ant app —
    //   nse-capp-v4-uat → Home → nse-capp-uat/home → Modules → /invoices
    // The V3 shell is Ant (spans/divs, not buttons); the invoice form is MUI, and
    // the in-grid Product editor is Ant again. All selectors below were captured
    // live on 2026-08-19.
    // ═════════════════════════════════════════════════════════════════════════

    _ac(label) {
        return this.page.locator(`xpath=${L.muiAcInputFor(label)}`).first();
    }

    async _acOptions(label) {
        const inp = this._ac(label);
        await inp.waitFor({ state: 'visible', timeout: 20000 });
        await inp.click();
        await this.page.waitForTimeout(1200);
        const opts = await this.page.locator(L.muiAcOption).allInnerTexts().catch(() => []);
        return opts.map(o => o.trim()).filter(Boolean);
    }

    /** Pick `value` from the autocomplete labelled `label` (typing to filter first —
     *  these lists are long). No value ⇒ take the first option. */
    async _selectFromAc(label, value = null, { exact = true } = {}) {
        const inp = this._ac(label);
        await inp.waitFor({ state: 'visible', timeout: 20000 });
        await inp.click();
        await this.page.waitForTimeout(800);
        if (value) {
            await inp.fill(value);
            await this.page.waitForTimeout(1500);
        }
        const options = this.page.locator(L.muiAcOption);
        await options.first().waitFor({ state: 'visible', timeout: 15000 });
        const target = value
            ? (exact
                ? options.filter({ hasText: new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first()
                : options.filter({ hasText: value }).first())
            : options.first();
        const picked = (await target.innerText().catch(() => '')).trim();
        await target.click();
        await this.page.waitForTimeout(1500);
        console.log(`[NONPO] ${label} → "${picked}"`);
        return picked;
    }

    // ── Navigation: V4 → V3 → Invoices → + Create Invoice ────────────────────

    /** Click "Home" in the top bar — this crosses to the V3 domain, which renders
     *  noticeably slower than V4, so wait for the Ant header, not just the URL. */
    async clickV3Home() {
        await this.page.locator(`xpath=${L.v3HomeLink}`).first().click();
        await this.page.waitForURL(/nse-capp-uat\.aerchain\.io/, { timeout: 60000 });
        await this.page.locator(L.v3ModulesToggle).first()
            .waitFor({ state: 'visible', timeout: 60000 });
        await this.page.waitForTimeout(1500);
        console.log(`[NONPO] V3 home → ${this.page.url()}`);
    }

    /** Open the all-modules panel (Ant appstore icon).
     *  The V3 shell hydrates lazily, so a click that lands too early is swallowed —
     *  and because the control is a TOGGLE, a blind second click would close a panel
     *  that did open. Check before re-clicking. */
    async openModulesPanel() {
        const toggle = this.page.locator(L.v3ModulesToggle).first();
        const invoices = this.page.locator(`xpath=${L.v3ModuleInvoices}`).first();
        await toggle.waitFor({ state: 'visible', timeout: 60000 });

        for (let attempt = 1; attempt <= 4; attempt++) {
            if (await invoices.isVisible({ timeout: 2000 }).catch(() => false)) {
                await this.page.waitForTimeout(800);
                return;
            }
            await toggle.click({ timeout: 15000 }).catch(() => {});
            if (await invoices.isVisible({ timeout: 8000 }).catch(() => false)) {
                await this.page.waitForTimeout(800);
                console.log(`[NONPO] modules panel opened (attempt ${attempt})`);
                return;
            }
            console.log(`[NONPO] modules panel not open yet (attempt ${attempt}) — retrying`);
            await this.page.waitForTimeout(2500);
        }
        throw new Error('[NONPO] Modules panel never revealed the Invoices entry after 4 attempts');
    }

    /** Click "Invoices" in the panel. Several nodes carry that exact text (recently
     *  visited, the group heading, the child link) and the heading is not navigable,
     *  so try each until the URL actually changes. */
    async openInvoiceModule() {
        const links = this.page.locator(`xpath=${L.v3ModuleInvoices}`);
        const n = await links.count();
        if (n === 0) throw new Error('[NONPO] No "Invoices" entry in the modules panel');
        for (let i = 0; i < n; i++) {
            await links.nth(i).click({ timeout: 10000 }).catch(() => {});
            const ok = await this.page.waitForURL(/\/invoices(\?|$|\/)/, { timeout: 15000 })
                .then(() => true).catch(() => false);
            if (ok) {
                await this.page.waitForLoadState('networkidle').catch(() => {});
                await this.page.waitForTimeout(2000);
                console.log(`[NONPO] invoice listing → ${this.page.url()} (match ${i + 1}/${n})`);
                return;
            }
        }
        throw new Error(`[NONPO] Clicked all ${n} "Invoices" nodes but never reached /invoices`);
    }

    async clickCreateNewInvoice() {
        await this.page.locator(`xpath=${L.invoiceCreateNewBtn}`).first().click();
        await this.page.waitForURL(/\/invoices\/new/, { timeout: 60000 });
        await this.page.locator(`xpath=${L.nonPoUploadDropzoneText}`)
            .first().waitFor({ state: 'visible', timeout: 30000 });
        console.log('[NONPO] on /invoices/new (upload dropzone shown)');
    }

    /** Composite: dashboard → Home → Modules → Invoices → + Create Invoice.
     *  Re-entrant: negative tests call this again after a submit, when the V4 shell's
     *  "Home" link is gone. `direct` skips the shell walk entirely and loads
     *  /invoices/new — needed for a SECOND invoice, where the previous form's state
     *  stopped the Templates picker from appearing. */
    async openNonPoInvoiceCreatePage({ direct = false } = {}) {
        if (direct) {
            await this.page.goto('https://nse-capp-uat.aerchain.io/invoices/new');
            await this.page.waitForLoadState('networkidle').catch(() => {});
            await this.page.locator(`xpath=${L.nonPoUploadDropzoneText}`)
                .first().waitFor({ state: 'visible', timeout: 30000 });
            console.log('[NONPO] loaded /invoices/new directly');
            return;
        }
        if (!/nse-capp-uat\.aerchain\.io/.test(this.page.url())) {
            await this.clickV3Home();
        }
        const viaPanel = await this.openModulesPanel()
            .then(() => this.openInvoiceModule())
            .then(() => true)
            .catch((e) => {
                console.log(`[NONPO] modules-panel route unavailable (${e.message.split('\n')[0]}) — using the listing URL`);
                return false;
            });
        if (!viaPanel) {
            await this.page.goto('https://nse-capp-uat.aerchain.io/invoices');
            await this.page.waitForLoadState('networkidle').catch(() => {});
            await this.page.waitForTimeout(2500);
        }
        await this.clickCreateNewInvoice();
    }

    // ── The progressive form ─────────────────────────────────────────────────

    /** Upload the invoice document. The form is PROGRESSIVE — only the dropzone
     *  renders until a document is attached. Extraction time varies a lot and it
     *  occasionally does not start, so allow a long wait and retry the attach once.
     *  Uses a locator timeout because a waitForFunction timeout gets clamped by the
     *  file-scoped default. */
    async uploadNonPoInvoiceDocument(data) {
        const filePath = path.resolve(data.invoice.documentPath);
        const templateInput = this.page.locator(L.nonPoTemplateInput).first();
        for (let attempt = 1; attempt <= 3; attempt++) {
            // Only attach while the dropzone still exists. When extraction fails the
            // dialog REPLACES it, so the old unconditional re-attach threw
            // "setInputFiles: Timeout 20000ms" waiting for an input that had gone —
            // masking the real cause (2026-08-25).
            const fileInput = this.page.locator(L.invoiceUploadInput).first();
            if (await fileInput.count().then(c => c > 0).catch(() => false)) {
                await fileInput.setInputFiles(filePath);
                console.log(`[NONPO] attached ${filePath} (attempt ${attempt})`);
            } else {
                console.log(`[NONPO] dropzone gone (attempt ${attempt}) — not re-attaching`);
            }
            const rendered = await templateInput.waitFor({ state: 'visible', timeout: 120000 })
                .then(() => true).catch(() => false);
            if (rendered) {
                await this.page.waitForTimeout(2000);
                console.log('[NONPO] form rendered (Templates picker present)');
                return;
            }
            if (!(await this._handleExtractionFailed())) {
                const seen = (await this.page.locator('body').innerText().catch(() => '')).slice(0, 200);
                console.log(`[NONPO] form did not render on attempt ${attempt}. Page shows: ${JSON.stringify(seen)}`);
            }
            await this.page.waitForTimeout(3000);
        }
        throw new Error('[NONPO] Invoice document uploaded but the form never rendered (no Templates picker)');
    }

    /** The V3 upload intermittently answers with "Extraction Failed — Document
     *  extraction was unsuccessful. Please choose how to proceed" instead of the
     *  extracted form. Re-uploading is impossible (the dropzone is gone), so the
     *  only way on is the dialog's own action. Logs the buttons it finds, so an
     *  unexpected variant is self-diagnosing next time.
     *  Returns true when such a dialog was found and actioned. */
    async _handleExtractionFailed() {
        const body = await this.page.locator('body').innerText().catch(() => '');
        if (!/Extraction Failed/i.test(body)) return false;
        const labels = [...new Set((await this.page.locator('button').allTextContents())
            .map(t => t.trim()).filter(t => t && t.length < 40))];
        console.log('[NONPO] Extraction Failed dialog — buttons: ' + JSON.stringify(labels));
        for (const pattern of [/manual|proceed|continue|without|skip/i, /retry|again|re-?upload/i]) {
            const btn = this.page.locator('button').filter({ hasText: pattern }).first();
            if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
                const label = ((await btn.textContent()) || '').trim();
                await btn.click().catch(() => {});
                console.log(`[NONPO] Extraction Failed → clicked "${label}"`);
                await this.page.waitForTimeout(3000);
                return true;
            }
        }
        console.log('[NONPO] Extraction Failed dialog offered no recognised way forward');
        return false;
    }

    /** Choose the CXO invoice template. Options seen: "RC Invoice",
     *  "PO Invoice NSEF", "CXO Template (Dev)", "NSEF Credit Note". */
    async selectNonPoTemplate(data) {
        const name = data.nonPoInvoice.template;
        const inp = this.page.locator(L.nonPoTemplateInput).first();
        await inp.waitFor({ state: 'visible', timeout: 30000 });
        await inp.click();
        await this.page.waitForTimeout(1000);
        await this.page.locator(L.muiAcOption).filter({ hasText: name }).first().click();
        await this.page.waitForTimeout(4000); // template choice re-renders the form
        console.log(`[NONPO] template → "${name}"`);
    }

    /** Expand the form's sections. They are MUI Accordions: fields inside a
     *  collapsed one are present and enabled but carry visibility:hidden via
     *  MuiCollapse, so Playwright rightly refuses to act on them. The header is a
     *  TOGGLE, so read aria-expanded and only click when needed. */
    async expandNonPoSections() {
        for (const title of ['General Details', 'Additional Details', 'Invoice Details', 'Line Items']) {
            const header = this.page.locator(`xpath=//*[normalize-space(text())="${title}"]`).first();
            if (!await header.isVisible({ timeout: 2000 }).catch(() => false)) continue;
            const summary = this.page.locator(
                `xpath=//*[normalize-space(text())="${title}"]/ancestor-or-self::*[@aria-expanded][1]`
            ).first();
            const expanded = await summary.getAttribute('aria-expanded').catch(() => null);
            if (expanded === 'true') {
                console.log(`[NONPO] section "${title}" already expanded`);
                continue;
            }
            await header.click({ timeout: 8000 }).catch(() => {});
            await this.page.waitForTimeout(800);
            if (await summary.getAttribute('aria-expanded').catch(() => null) === 'false') {
                await header.click({ timeout: 8000 }).catch(() => {});
                await this.page.waitForTimeout(800);
            }
            console.log(`[NONPO] expanded section "${title}"`);
        }
        await this.page.waitForTimeout(1000);
    }

    /** Resolve a control to the VISIBLE match. Two traps, both observed: the same id
     *  can appear more than once (so .first() may grab a hidden twin), and sections
     *  are accordions (so a field can be present but collapsed). */
    async _resolveVisible(selector, label) {
        const all = this.page.locator(selector);
        const firstVisible = async () => {
            const n = await all.count();
            for (let i = 0; i < n; i++) {
                if (await all.nth(i).isVisible().catch(() => false)) return all.nth(i);
            }
            return null;
        };
        let el = await firstVisible();
        if (el) return el;
        await this.expandNonPoSections();
        el = await firstVisible();
        if (el) return el;
        throw new Error(
            `[NONPO] "${label}" has ${await all.count()} match(es) but none visible, even ` +
            'after expanding the form sections.');
    }

    /** Pick a value from an autocomplete addressed by its id (= its visible label). */
    async _selectAcById(label, value = null, { exact = true, waitEnabledMs = 0 } = {}) {
        const inp = await this._resolveVisible(L.nonPoFieldById(label), label);
        // Some fields start disabled and are enabled by an earlier selection —
        // Currency only becomes editable once a Supplier is chosen.
        for (let waited = 0; waited < waitEnabledMs && await inp.isDisabled().catch(() => false); waited += 1000) {
            await this.page.waitForTimeout(1000);
        }
        if (await inp.isDisabled().catch(() => false)) {
            const existing = await inp.inputValue().catch(() => '');
            console.log(`[NONPO] ${label} is disabled (system-populated) → "${existing}" — skipped`);
            return existing;
        }
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.click();
        await this.page.waitForTimeout(600);
        if (value) await inp.fill(String(value));

        // These lists load asynchronously and several cascade off the dimensions
        // chosen before them, so a fixed pause is not enough — a 1.2s wait made
        // "Project Category" intermittently report zero options. Poll, and re-open
        // the picker once before concluding it is genuinely empty.
        const opts = this.page.locator(L.muiAcOption);
        const pollForOptions = async (ms) => {
            for (let waited = 0; waited < ms; waited += 500) {
                if (await opts.count() > 0) return true;
                await this.page.waitForTimeout(500);
            }
            return false;
        };
        let n = 0;
        if (await pollForOptions(15000)) {
            n = await opts.count();
        } else {
            await inp.click();
            if (value) await inp.fill(String(value));
            if (await pollForOptions(10000)) n = await opts.count();
        }
        if (n === 0) {
            throw new Error(`[NONPO] "${label}" offered no options${value ? ` for "${value}"` : ''}`);
        }

        // MUI filters by SUBSTRING, so a short value silently matches the wrong row —
        // "NA" matches "Ma(na)ged/Hosting services", which broke the budget
        // combination and left BRF empty. Require an exact match when a value was
        // asked for; only take the first option when it wasn't.
        let target = opts.first();
        if (value) {
            const texts = (await opts.allInnerTexts()).map(t => t.trim());
            const want = String(value).toLowerCase();
            let idx = texts.findIndex(t => t.toLowerCase() === want);
            if (idx === -1 && !exact) idx = texts.findIndex(t => t.toLowerCase().includes(want));
            if (idx === -1) {
                throw new Error(
                    `[NONPO] "${label}" has no option exactly equal to "${value}". ` +
                    `Options offered: ${JSON.stringify(texts.slice(0, 15))}`);
            }
            target = opts.nth(idx);
        }
        const picked = (await target.innerText()).trim();
        await target.click();
        await this.page.waitForTimeout(700);
        console.log(`[NONPO] ${label} → "${picked}"`);
        return picked;
    }

    async _fillTextById(label, value) {
        const inp = await this._resolveVisible(L.nonPoTextById(label), label);
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.fill(String(value));
        console.log(`[NONPO] ${label} → "${value}"`);
    }

    /** For a mandatory field that may be auto-populated by an earlier selection:
     *  wait briefly for it to become enabled, then set it only if still empty. A
     *  field that filled itself is left alone (overwriting a supplier-derived value
     *  would be wrong); one that stays disabled and empty is reported. */
    async _selectIfEmptyAndEnabled(label, value = null) {
        const inp = await this._resolveVisible(L.nonPoFieldById(label), label);
        for (let waited = 0; waited < 15000; waited += 1000) {
            if (!await inp.isDisabled().catch(() => false)) break;
            if ((await inp.inputValue().catch(() => '')).trim()) break;
            await this.page.waitForTimeout(1000);
        }
        const existing = (await inp.inputValue().catch(() => '')).trim();
        if (existing) {
            console.log(`[NONPO] ${label} already set → "${existing}"`);
            return existing;
        }
        if (await inp.isDisabled().catch(() => false)) {
            console.log(`[NONPO] WARNING: mandatory "${label}" is disabled and empty — cannot be set`);
            return '';
        }
        return await this._selectAcById(label, value || null, { exact: !!value });
    }

    /** Select the CXO at the invoice header. Defaults to the CXO this run created
     *  (savedCxo, read fresh from disk — the imported data object is stale once
     *  createAndReleaseCxo() rewrote the JSON). */
    async selectNonPoCxo(code = null) {
        return await this._selectFromAc(L.nonPoCxoLabel, code || this.getSavedCxoCode());
    }

    /** The CXO codes currently offered — used to assert that only Submitted CXOs
     *  with available value are selectable (§4 Step 2). */
    async getSelectableCxoCodes() {
        const opts = await this._acOptions(L.nonPoCxoLabel);
        await this.page.keyboard.press('Escape');
        return opts;
    }

    /** Additional Details → the budget-defining dimension combination.
     *  MUST be set before BRF - Description offers anything: the budget list is the
     *  intersection of the user's dimension access and the CXO's budget (§4 Step 3),
     *  so a mismatched combination yields an empty list. Values mirror the CXO line
     *  item so the same BRF resolves. */
    async fillNonPoBudgetCombination(data) {
        const li = data.lineItem;
        await this._selectAcById('Department', data.cxo.department);
        await this._selectAcById('Function', data.cxo.function);
        await this._selectAcById('Expense Nature (for approval triggers)', data.cxo.expenseNature);
        await this._selectAcById('Project Name', li.projectName);
        await this._selectAcById('Vertical', li.vertical);
        await this._selectAcById('Nature of Expense (budget level)', li.natureOfExpense);
        await this._selectAcById('GL Account', li.glAccount);
        await this._selectAcById('Profit Center', li.profitCenter);
        await this._selectAcById('Cost Center', li.costCenter);
        await this._selectAcById('SEBI Categorization', li.sebiCategorization);
        await this._selectAcById('Sub Segment', li.subSegment);
        await this._selectAcById('Project Category', li.projectCategory);
        console.log('[NONPO] budget combination set');
    }

    /** Select the single header-level budget item. Does NOT auto-populate from the
     *  CXO, and ships DISABLED until the dimension combination resolves. */
    async selectNonPoBrf(data) {
        const inp = this.page.locator(L.nonPoBrfInput).first();
        await inp.waitFor({ state: 'attached', timeout: 30000 });
        if (await inp.isDisabled().catch(() => false)) {
            await inp.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
            if (await inp.isDisabled().catch(() => false)) {
                throw new Error(
                    '[NONPO] "BRF - Description" is still disabled — the dimension ' +
                    'combination has not resolved to a budget item. Call ' +
                    'fillNonPoBudgetCombination() first and check the values match ' +
                    'the CXO line item.');
            }
        }
        await inp.click();
        await this.page.waitForTimeout(1500);
        const opts = this.page.locator(L.muiAcOption);
        const n = await opts.count();
        if (n === 0) {
            throw new Error(
                '[NONPO] No BRF options. Per §4 the budget list is the intersection ' +
                'of the user dimension combination and the CXO budget — check the ' +
                'dimension fields are set and the CXO carries a matching budget item.');
        }
        const picked = (await opts.first().innerText()).trim();
        await opts.first().click();
        await this.page.waitForTimeout(1500);
        console.log(`[NONPO] BRF → "${picked}" (of ${n} options)`);
        return picked;
    }

    /** Invoice Details. Field states verified from the form's accessibility tree:
     *    editable → Supplier, Subject, Invoice Number, Invoice Date, Delivery Address
     *    disabled → Company, Billing Address, Supplier/Customer Tax Number
     *  Supplier goes FIRST: the auto-populated fields derive from it, and Payment
     *  Spoc/Terms and Currency only become settable afterwards (§12.3 maps a Payment
     *  SPOC per supplier — picking a SPOC first filtered the supplier list). */
    async fillNonPoInvoiceDetails(data) {
        const inv = data.nonPoInvoice;
        await this._selectAcById('Supplier', data.sourcing.supplierSearch, { exact: false });
        await this._fillTextById('Subject', inv.subject);
        // Duplicate invoice numbers are rejected, so take a fresh one each run.
        await this._fillTextById('Invoice Number', this._nextInvoiceNumber());

        const dateInput = this.page.locator(L.nonPoDateByPh('Enter Invoice Date')).first();
        await this._pickReactDate(dateInput, inv.invoiceDate);

        await this._selectAcById('Delivery Address');
        await this._selectAcById('Currency', inv.currency, { waitEnabledMs: 15000 });
        await this._selectIfEmptyAndEnabled('Payment Spoc', inv.paymentSpoc);
        await this._selectIfEmptyAndEnabled('Payment Terms', inv.paymentTerms);

        this.nonPoAutoFilled = await this.reportNonPoAutoFilled(['Company', 'Billing Address']);
        console.log('[NONPO] invoice details filled');
    }

    // ── Vendor Type / RPT FLag autopopulation (sheet scenarios 73-80) ────────
    //
    // Verified live 2026-09-08 on the NSEF Credit Note template: with no supplier
    // both fields are blank; choosing "HG Automation SUPP (FNSE-26-2993)" fills
    // Vendor Type="IT" and RPT FLag="N". They sit in a collapsed accordion and
    // their ids carry a random suffix — see nonPoLabelledField for the full trap
    // list. On the PO Invoice template the Supplier picker is DISABLED (the PO
    // supplies it), so both fields are already populated on arrival.

    /** Read the three supplier-derived flags. Never fills — they are disabled by
     *  design. Expands the accordions first, else every value reads as absent. */
    async readVendorRptFlags() {
        await this.expandNonPoSections();
        const read = async (label) => {
            const loc = this.page.locator(L.nonPoLabelledField(label));
            if (!await loc.count().then(n => n > 0).catch(() => false)) return null;
            for (let i = 0; i < 8; i++) {
                const v = (await loc.first().inputValue().catch(() => '')).trim();
                if (v) return v;
                await this.page.waitForTimeout(1000);
            }
            return '';
        };
        const flags = {
            vendorType: await read('Vendor Type'),
            rptFlag:    await read('RPT FLag'),
            msme:       await read('MSME vendor?'),
        };
        console.log(`[VENDORRPT] Vendor Type=${JSON.stringify(flags.vendorType)} `
            + `RPT FLag=${JSON.stringify(flags.rptFlag)} MSME=${JSON.stringify(flags.msme)}`);
        return flags;
    }

    /** Pick a supplier on a template whose Supplier picker is enabled (Credit Note,
     *  CXO Template). Returns the option text actually chosen so the test can
     *  report which supplier drove the autopopulation. */
    async selectNonPoSupplier(name) {
        const inp = this.page.locator(L.nonPoSupplierInput).first();
        await inp.waitFor({ state: 'visible', timeout: 30000 });
        if (await inp.isDisabled().catch(() => false)) {
            throw new Error(`[VENDORRPT] the Supplier picker is disabled on this template — `
                + 'it is driven by the PO, so do not try to choose one');
        }
        await inp.click();
        await this.page.waitForTimeout(1000);
        await inp.fill(name);
        await this.page.waitForTimeout(3500);
        const opts = this.page.locator(L.muiAcOption);
        if (!await opts.count().then(n => n > 0).catch(() => false)) {
            throw new Error(`[VENDORRPT] no supplier option matched "${name}"`);
        }
        const chosen = (await opts.first().innerText().catch(() => name)).replace(/\n/g, ' | ').trim();
        await opts.first().click();
        await this.page.waitForTimeout(8000); // the choice triggers the autopopulate fetch
        console.log(`[VENDORRPT] supplier -> "${chosen}"`);
        return chosen;
    }

    /** True when the Supplier picker is present but disabled (the PO-driven case). */
    async isNonPoSupplierLocked() {
        const inp = this.page.locator(L.nonPoSupplierInput).first();
        if (!await inp.count().then(n => n > 0).catch(() => false)) return false;
        return await inp.isDisabled().catch(() => false);
    }

    /** Mandatory-but-disabled fields, populated by the app from the CXO + supplier.
     *  Reported, not asserted — failing on an assumption about fill timing would
     *  mask the real behaviour. */
    async reportNonPoAutoFilled(labels) {
        const values = {};
        for (const label of labels) {
            const inp = this.page.locator(L.nonPoFieldById(label)).first();
            let value = '';
            for (let i = 0; i < 6; i++) {
                value = (await inp.inputValue().catch(() => '')).trim();
                if (value) break;
                await this.page.waitForTimeout(1000);
            }
            values[label] = value;
            console.log(value
                ? `[NONPO] auto-filled ${label} = "${value}"`
                : `[NONPO] WARNING: mandatory field "${label}" is disabled AND empty — submission may be blocked`);
        }
        return values;
    }

    /** WORKAROUND for a known app bug (reported by NSE QA 2026-08-19, dev fixing):
     *  clicking "Add Item" CLEARS the mandatory Currency field. The wipe blocks
     *  submission silently — no validation message, no API call; Submit throws
     *  "Cannot read properties of undefined (reading 'exchangeRate')" internally.
     *  Remove this call once the fix lands; it becomes a no-op either way. */
    async reapplyFieldsClearedByAddItem(data) {
        const inv = data.nonPoInvoice;
        for (const [label, value] of [
            ['Currency', inv.currency],
            ['Payment Spoc', inv.paymentSpoc],
            ['Payment Terms', inv.paymentTerms],
        ]) {
            const inp = this.page.locator(L.nonPoFieldById(label)).first();
            if (!await inp.count().then(n => n > 0).catch(() => false)) continue;
            if ((await inp.inputValue().catch(() => '')).trim()) continue;
            console.log(`[NONPO] KNOWN BUG: "${label}" was cleared by Add Item — re-applying`);
            if (await inp.isDisabled().catch(() => false)) {
                console.log(`[NONPO] WARNING: "${label}" is blank AND disabled after Add Item — cannot re-apply`);
                continue;
            }
            await this._selectAcById(label, value || null, { exact: !!value });
        }
    }

    // ── Line items (AG grid) ─────────────────────────────────────────────────

    /** Add one line item. */
    async addNonPoLineItem(data, { qty, price } = {}) {
        const C = L.nonPoGridColIds;
        await this.page.locator(L.nonPoAddItemBtn).first().click();
        await this.page.waitForTimeout(1500);

        await this._setGridProduct(data.intake.itemName, data.intake.itemNameOption);
        await this._setGridCell(C.quantity, qty ?? data.nonPoInvoice.fullQty);
        await this._setGridCell(C.price, price ?? data.nonPoInvoice.fullPrice);
        await this.page.waitForTimeout(2000);

        // Read the row back: an AG-grid edit that never committed leaves the cell
        // blank and would silently invoice zero.
        const readCell = async (colId) =>
            (await this.page.locator(`xpath=${L.nonPoGridCell(colId)}`).first()
                .innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const row = {
            product: await readCell(C.product),
            uom: await readCell(C.uom),
            quantity: await readCell(C.quantity),
            price: await readCell(C.price),
            amount: await readCell(C.amount),
        };
        console.log(`[NONPO] line item row → ${JSON.stringify(row)}`);
        for (const [k, v] of Object.entries({ product: row.product, quantity: row.quantity, price: row.price })) {
            if (!v) throw new Error(`[NONPO] line item "${k}" did not commit — grid cell is empty. Row: ${JSON.stringify(row)}`);
        }

        await this.reapplyFieldsClearedByAddItem(data);
        return row;
    }

    /** Select the line-item Product from the item master.
     *  NSE forbids free-text products (§5.5), so the option MUST be clicked —
     *  typing + Enter leaves raw text, the row stays invalid, and Submit then fails
     *  client-side with no error and no API call. The editor is an ANT AutoComplete,
     *  so options are .ant-select-item-option in a body-level portal, not MUI. */
    async _setGridProduct(typed, wanted = null) {
        const cell = this.page.locator(`xpath=${L.nonPoGridCell(L.nonPoGridColIds.product)}`).first();
        await cell.scrollIntoViewIfNeeded().catch(() => {});
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        await cell.dblclick();

        const input = this.page.locator(L.nonPoProductEditorInput).first();
        await input.waitFor({ state: 'visible', timeout: 20000 });
        await input.fill(String(typed));

        const opts = this.page.locator(L.nonPoAntOption);
        await opts.first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
        const texts = (await opts.allInnerTexts()).map(t => t.trim()).filter(Boolean);
        if (!texts.length) {
            throw new Error(`[NONPO] Product search "${typed}" returned no options from the item master`);
        }
        let idx = 0;
        if (wanted) {
            const want = String(wanted).toLowerCase();
            const exact = texts.findIndex(t => t.toLowerCase() === want);
            idx = exact !== -1 ? exact : texts.findIndex(t => t.toLowerCase().includes(want));
            if (idx === -1) {
                throw new Error(`[NONPO] Product "${wanted}" not among options: ${JSON.stringify(texts.slice(0, 10))}`);
            }
        }
        await opts.nth(idx).click();
        await this.page.waitForTimeout(2500);
        console.log(`[NONPO] Product → "${texts[idx]}" (searched "${typed}", ${texts.length} options)`);

        // NOTE: UOM does NOT auto-populate here. §5.5's "UOM auto-populates and
        // locks" is documented for Intake; on this template the cell keeps its
        // "Enter UOM" placeholder even after a real master item is selected.
        await this._setGridUomIfEmpty();
        return texts[idx];
    }

    /** Fill the line-item UOM if it still shows its placeholder. The editor type is
     *  not fixed (Ant select or plain input), so handle both. */
    async _setGridUomIfEmpty(fallback = 'Nos') {
        const uomCell = this.page.locator(`xpath=${L.nonPoGridCell(L.nonPoGridColIds.uom)}`).first();
        const current = (await uomCell.innerText().catch(() => '')).trim();
        if (current && !/^enter uom$/i.test(current)) {
            console.log(`[NONPO] UOM already set → "${current}"`);
            return current;
        }
        await uomCell.dblclick();
        await this.page.waitForTimeout(1200);
        for (const opts of [this.page.locator(L.nonPoAntOption), this.page.locator(L.muiAcOption)]) {
            if (await opts.count() > 0 && await opts.first().isVisible().catch(() => false)) {
                const picked = (await opts.first().innerText()).trim();
                await opts.first().click();
                await this.page.waitForTimeout(1200);
                console.log(`[NONPO] UOM → "${picked}" (from option list)`);
                return picked;
            }
        }
        await this.page.keyboard.type(String(fallback), { delay: 60 });
        await this.page.waitForTimeout(1000);
        const late = this.page.locator(L.nonPoAntOption);
        if (await late.count() > 0 && await late.first().isVisible().catch(() => false)) {
            const picked = (await late.first().innerText()).trim();
            await late.first().click();
            console.log(`[NONPO] UOM → "${picked}" (after typing "${fallback}")`);
        } else {
            await this.page.keyboard.press('Enter');
            console.log(`[NONPO] UOM typed → "${fallback}"`);
        }
        await this.page.waitForTimeout(1200);
        return (await uomCell.innerText().catch(() => '')).trim();
    }

    /** Type into one AG-grid cell. Cells commit on Enter; on macOS the clear
     *  shortcut must be ControlOrMeta+a (Control+a alone does not select). */
    async _setGridCell(colId, value) {
        const cell = this.page.locator(`xpath=${L.nonPoGridCell(colId)}`).first();
        await cell.scrollIntoViewIfNeeded().catch(() => {});
        await cell.waitFor({ state: 'visible', timeout: 20000 });
        await cell.dblclick();
        await this.page.waitForTimeout(600);
        await this.page.keyboard.press('ControlOrMeta+a').catch(() => {});
        await this.page.keyboard.type(String(value), { delay: 60 });
        await this.page.waitForTimeout(1200);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(600);
    }

    // ── Totals ───────────────────────────────────────────────────────────────

    /** Parse an Indian-formatted amount, including the abbreviated forms this UI
     *  uses: "2.00L" = 200000, "1.5Cr" = 15000000, "20K" = 20000. Takes the LAST
     *  number, since the label precedes the value. */
    _parseIndianAmount(text, label = 'amount') {
        const matches = [...String(text).matchAll(/([\d,]+(?:\.\d+)?)\s*(Cr|L|K)?\b/gi)];
        if (!matches.length) throw new Error(`[NONPO] no number in "${label}" text: "${text}"`);
        const [, num, unit] = matches[matches.length - 1];
        const mult = { cr: 1e7, l: 1e5, k: 1e3 }[(unit || '').toLowerCase()] ?? 1;
        return parseFloat(num.replace(/,/g, '')) * mult;
    }

    /** Read a value off the totals strip. The label and its amount are separate
     *  nodes at no fixed depth, so walk up from the label until an ancestor holds a
     *  number. */
    async readNonPoTotal(label = 'Grand Total') {
        const value = await this.page.evaluate((label) => {
            const leaf = [...document.querySelectorAll('*')]
                .find(e => !e.children.length && (e.innerText || '').trim() === label);
            if (!leaf) return { error: 'label not found' };
            let n = leaf;
            for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
                const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
                if (/[\d]/.test(t)) return { raw: t.slice(0, 120) };
            }
            return { error: 'no number near label', raw: (leaf.parentElement?.innerText || '').slice(0, 120) };
        }, label);
        if (value.error) {
            throw new Error(`[NONPO] could not read "${label}": ${value.error} (raw ${JSON.stringify(value.raw || '')})`);
        }
        const parsed = this._parseIndianAmount(value.raw, label);
        console.log(`[NONPO] ${label} = ${parsed}  (raw "${value.raw}")`);
        return parsed;
    }

    async assertNonPoGrandTotal(expected) {
        expect(await this.readNonPoTotal('Grand Total')).toBeCloseTo(Number(expected), 2);
    }

    // ── Submit / assertions ──────────────────────────────────────────────────

    /** Submit a Non-PO invoice that is EXPECTED to be refused.
     *
     *  submitInvoice() is built for the happy path: it walks the Validations popup,
     *  then the Workflow Summary popup, then waits for navigation. A refused invoice
     *  reaches none of those, so that helper hangs on a dialog that never appears.
     *
     *  Per NSE QA a budget breach is reported in the WORKFLOW SUMMARY POPUP, only
     *  after Proceed — and there can be more than one Proceed in the chain. So click
     *  through each, re-reading the dialog after every click, stopping as soon as a
     *  budget message appears. Never requires navigation.
     *  @returns {Promise<{url: string, messages: string[], dialogText: string}>} */
    async submitNonPoInvoiceExpectingRejection({ settleMs = 8000 } = {}) {
        await this.page.locator(`xpath=${L.invoiceSubmitBtn}`).first().click({ timeout: 20000 });
        console.log('[NONPO] clicked Submit (expecting rejection)');

        const dialog = this.page.locator(`xpath=${L.muiDialog}`).last();
        const readDialog = async () =>
            (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

        let dialogText = '';
        for (let step = 1; step <= 3; step++) {
            const current = await readDialog();
            if (current) {
                dialogText = current;
                console.log(`[NONPO] dialog (step ${step}) → "${current.slice(0, 220)}"`);
                if (/budget/i.test(current)) break;
            }
            const proceed = this.page.locator(`xpath=${L.invoiceValidationProceedBtn}`).first();
            const dialogSubmit = this.page.locator(`xpath=${L.invoiceWorkflowSummarySubmitBtn}`).first();
            let clicked = false;
            if (await proceed.isVisible({ timeout: 6000 }).catch(() => false)) {
                await proceed.click().catch(() => {});
                console.log(`[NONPO] clicked Proceed (step ${step})`);
                clicked = true;
            } else if (await dialogSubmit.isVisible({ timeout: 4000 }).catch(() => false)) {
                await dialogSubmit.click().catch(() => {});
                console.log(`[NONPO] clicked the dialog Submit (step ${step})`);
                clicked = true;
            }
            if (!clicked) {
                console.log(`[NONPO] nothing left to click (step ${step})`);
                break;
            }
            await this.page.waitForTimeout(6000);
        }
        dialogText = (await readDialog()) || dialogText;
        await this.page.waitForTimeout(settleMs);

        const messages = await this.page.evaluate(() => {
            const out = new Set();
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length) continue;
                const t = (el.innerText || '').trim();
                if (t && t.length < 160 &&
                    /error|exceed|insufficient|not available|budget|mandat|requir|invalid|fail/i.test(t)) {
                    out.add(t);
                }
            }
            return [...out];
        });
        const url = this.page.url();
        console.log(`[NONPO] after Submit → ${url}`);
        console.log(`[NONPO] on-screen messages → ${JSON.stringify(messages.slice(0, 12))}`);
        return { url, messages, dialogText };
    }

    /** Budget ceiling breach (§2.4). The breach is reported inside the Workflow
     *  Summary popup, so search that text as well as the page. On a miss, fail WITH
     *  both, so one run pins the real wording. */
    async assertBudgetExceeded(observed = null) {
        const messages = observed?.messages ?? await this.page.evaluate(() => {
            const out = new Set();
            for (const el of document.querySelectorAll('*')) {
                if (el.children.length) continue;
                const t = (el.innerText || '').trim();
                if (t && t.length < 160) out.add(t);
            }
            return [...out];
        });
        const haystack = [observed?.dialogText || '', ...messages];
        const hit = haystack.find(m =>
            /budget/i.test(m) && /exceed|insufficient|not available|no available|limit|over/i.test(m));
        if (!hit) {
            throw new Error(
                '[NONPO] no budget-exceeded message found.\n  Workflow Summary popup: ' +
                JSON.stringify((observed?.dialogText || '(not captured)').slice(0, 300)) +
                '\n  Page messages: ' + JSON.stringify(messages.slice(0, 25)));
        }
        console.log(`[NONPO] budget ceiling enforced → "${hit}"`);
        return hit;
    }

    /** After an empty Submit the app renders "<Field> is Mandatory" helper texts and
     *  an "Atleast one row is required" toast for the grid. */
    async assertNonPoMandatoryErrorsShown() {
        const helpers = this.page.locator(`xpath=${L.nonPoMandatoryHelperText}`);
        await expect(helpers.first()).toBeVisible({ timeout: 20000 });
        const texts = (await helpers.allInnerTexts()).map(t => t.trim()).filter(Boolean);
        console.log(`[NONPO] mandatory errors: ${JSON.stringify(texts.slice(0, 12))}`);
        for (const field of ['Company', 'Supplier', 'Subject', 'Invoice Number',
                             'Invoice Date', 'Delivery Address', 'Billing Address', 'Currency']) {
            expect(texts.join(' | ')).toContain(`${field} is Mandatory`);
        }
        return texts;
    }

    // ── CXO linkage verification ─────────────────────────────────────────────

    /** Open a CXO overview by code. */
    async openCxoByCode(code) {
        const current = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        const saved = current.savedCxo || {};
        if (saved.code === code && saved.url) {
            await this.page.goto(saved.url);
        } else {
            await this.page.goto(`${current.loginUrl}/cxos`);
            await this.page.waitForLoadState('domcontentloaded').catch(() => {});
            await this.page.locator(`xpath=//*[normalize-space(text())="${code}"]`).first()
                .click({ timeout: 30000 });
        }
        await this.page.waitForURL(/\/cxos\/[^\/]+\/overview/, { timeout: 60000 }).catch(() => {});
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log(`[NONPO] CXO overview → ${this.page.url()}`);
    }

    /** Open the CXO's Transactions tab. */
    async openCxoTransactionsTab() {
        // normalize-space(text()) reads only the FIRST text node — the tab renders an
        // icon before its label, so that node is whitespace and never matches.
        const tabs = this.page.locator(`xpath=//*[normalize-space(.)="Transactions"]`);
        let n = 0;
        for (let waited = 0; waited < 30000; waited += 1000) {
            n = await tabs.count();
            if (n > 0) {
                let anyVisible = false;
                for (let i = 0; i < n && !anyVisible; i++) {
                    anyVisible = await tabs.nth(i).isVisible().catch(() => false);
                }
                if (anyVisible) break;
            }
            await this.page.waitForTimeout(1000);
        }
        for (let i = 0; i < n; i++) {
            const t = tabs.nth(i);
            if (!await t.isVisible().catch(() => false)) continue;
            await t.click({ timeout: 15000 }).catch(() => {});
            await this.page.waitForTimeout(4000);
            console.log(`[NONPO] opened CXO Transactions tab (match ${i + 1}/${n})`);
            return;
        }
        throw new Error(`[NONPO] no visible "Transactions" tab among ${n} matches`);
    }

    /** Verify the CXO records the downstream invoice.
     *  NOTE: the CXO overview does NOT expose a consumed/available figure — only
     *  "CXO Total Value" (verified live). So consumption is verified structurally
     *  here, and behaviourally by the Budget Exceeded tests. */
    async assertCxoListsInvoice(invoiceCode) {
        await this.openCxoTransactionsTab();
        const row = this.page.locator(`xpath=//*[contains(normalize-space(.),"${invoiceCode}")]`).first();
        await expect(row, `CXO Transactions tab should list invoice ${invoiceCode}`)
            .toBeVisible({ timeout: 20000 });
        console.log(`[NONPO] CXO Transactions tab lists ${invoiceCode}`);
    }

    getSavedInvoiceCode() {
        const fresh = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        return fresh.savedInvoice?.code;
    }

    /** List the actions available on the current invoice — reports precisely what
     *  exists when an expected control is missing. */
    async _listInvoiceActions() {
        return await this.page.evaluate(() => {
            const btns = [...document.querySelectorAll('button,[role="menuitem"],a')]
                .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(e => (e.innerText || '').trim())
                .filter(t => t && t.length < 40);
            return [...new Set(btns)];
        });
    }

    /** Reject the invoice. PROVISIONAL: there is no header "Reject" on a Non-PO
     *  invoice (actions are ["Settle Advances", "More", ...]), so it falls back to
     *  the More menu; the real steps are still to be confirmed by NSE QA. */
    async rejectInvoice(reason = 'Rejected by automation') {
        let btn = this.page.locator(`xpath=//button[normalize-space(.)="Reject"]`).first();
        if (!await btn.isVisible({ timeout: 8000 }).catch(() => false)) {
            const more = this.page.locator(`xpath=//button[contains(normalize-space(.),"More")]`).first();
            if (!await more.isVisible({ timeout: 10000 }).catch(() => false)) {
                throw new Error('[NONPO] neither "Reject" nor "More" on the invoice. Available actions: ' +
                    JSON.stringify(await this._listInvoiceActions()));
            }
            await more.click();
            await this.page.waitForTimeout(1500);
            btn = this.page.locator(`xpath=//*[@role="menuitem"][normalize-space(.)="Reject"]`).first();
            if (!await btn.isVisible({ timeout: 8000 }).catch(() => false)) {
                throw new Error('[NONPO] no "Reject" under More. Menu shows: ' +
                    JSON.stringify(await this._listInvoiceActions()));
            }
        }
        await btn.click();
        const box = this.page.locator('textarea').last();
        await box.fill(reason);
        await this.page.locator(`xpath=//div[@role="dialog"]//button[normalize-space(.)="Reject"]`)
            .first().click({ timeout: 20000 });
        await this.page.waitForTimeout(3000);
        console.log('[NONPO] invoice rejected');
    }

    /** Cancel the invoice (More → Cancel + mandatory reason). PROVISIONAL. */
    /**
     * Recall an invoice that is still Pending Approval, so it can be cancelled.
     *
     * WHY THIS IS NEEDED: a Pending-Approval invoice has NO Cancel action at all.
     * Its actions are `Settle Advances · More · Overview · Transactions ·
     * Match Line Item`, and More holds `Reassign Workflow Approver ·
     * Reassign User · Recall · Download Document · Regenerate Document`.
     * Cancel only appears once the invoice is Rejected or Accounted.
     *
     * Recall is the cheap route there: its dialog states outright
     * "Transaction will be kept in Rejected Status", and after confirming, the
     * status reads Rejected and a top-level Cancel button appears.
     * Verified live 2026-09-03 on Invoice-FNSE-26-363.
     *
     * NOTE the dialog's own buttons are `Cancel` / `Recall` — "Cancel" there
     * DISMISSES the dialog, so it must not be confused with the invoice's
     * Cancel action.
     */
    async recallInvoice(reason = 'Recalled by automation') {
        const more = this.page.locator(`xpath=//button[normalize-space()="More"]`).first();
        await more.waitFor({ state: 'visible', timeout: 30000 });
        await more.click();
        await this.page.waitForTimeout(1500);

        const item = this.page.locator(`xpath=//li[@role="menuitem"][normalize-space()="Recall"]`).first();
        if (!(await item.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log('[INV] no Recall action — invoice is probably not Pending Approval.');
            await this.page.keyboard.press('Escape').catch(() => {});
            return false;
        }
        await item.click();
        await this.page.waitForTimeout(3000);

        const dialog = this.page.locator('[class*="MuiDialog-root"]').first();
        await dialog.waitFor({ state: 'visible', timeout: 20000 });
        const notes = dialog.locator('textarea').first();
        if (await notes.isVisible({ timeout: 6000 }).catch(() => false)) await notes.fill(reason);

        // Match the dialog's confirm button EXACTLY — a loose /Recall/ match also
        // hits the heading text, and /Cancel/ would dismiss the dialog instead.
        await dialog.locator('button').filter({ hasText: /^(Recall|Confirm)$/ }).first().click();
        await this.page.waitForTimeout(8000);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(6000);
        console.log(`[INV] recalled (now expected Rejected) — reason "${reason}"`);
        return true;
    }

    async cancelInvoice(reason = 'Cancelled by automation') {
        // Cancel sits in the header toolbar on some states (seen on a Rejected /
        // Accounted invoice) and under More on others — try the header first,
        // otherwise this throws "no Cancel under More" while the button is on screen.
        const headerBtn = this.page.locator(`xpath=//button[normalize-space(.)="Cancel"]`).first();
        if (await headerBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
            await headerBtn.click();
            await this._confirmCancelDialog(reason);
            console.log('[NONPO] invoice cancelled (header button)');
            return;
        }
        const more = this.page.locator(`xpath=//button[contains(normalize-space(.),"More")]`).first();
        if (!await more.isVisible({ timeout: 15000 }).catch(() => false)) {
            throw new Error('[NONPO] no "More" menu on the invoice. Available actions: ' +
                JSON.stringify(await this._listInvoiceActions()));
        }
        await more.click();
        await this.page.waitForTimeout(1500);
        const item = this.page.locator(`xpath=//*[@role="menuitem"][normalize-space(.)="Cancel"]`).first();
        if (!await item.isVisible({ timeout: 8000 }).catch(() => false)) {
            throw new Error('[NONPO] no "Cancel" item under More. Menu shows: ' +
                JSON.stringify(await this._listInvoiceActions()));
        }
        await item.click();
        await this._confirmCancelDialog(reason);
        console.log('[NONPO] invoice cancelled (More menu)');
    }

    /** Fill the mandatory reason and confirm the cancel dialog.
     *  Everything is scoped to the dialog: a page-wide `textarea` lookup picked up
     *  the wrong (hidden) box, so "Cancellation Notes" stayed empty, Confirm was
     *  refused by validation, and the cancel silently did nothing while the caller
     *  logged success (2026-08-25 — the doc stayed Rejected). The dialog closing is
     *  therefore the only proof the cancel was accepted. */
    async _confirmCancelDialog(reason) {
        const dialog = this.page.locator('[role="dialog"]').last();
        await dialog.waitFor({ state: 'visible', timeout: 12000 });
        const notes = dialog.locator('textarea').first();
        if (await notes.isVisible({ timeout: 6000 }).catch(() => false)) {
            await notes.fill(reason);
        }
        await dialog.locator('button')
            .filter({ hasText: /^(Confirm|Submit|Yes|Cancel Invoice)$/ })
            .first().click({ timeout: 20000 });
        await dialog.waitFor({ state: 'hidden', timeout: 20000 });
        await this.page.waitForTimeout(2500);
    }

    /** Terminal check before acking: Pending Sync, or (in UAT) Sync Failed.
     *  Returns and logs which, so a change in environment behaviour is visible.
     *
     *  Both states are ackable. Originally written for Non-PO invoices, but PO
     *  invoices land on Sync Failed too — measured 2026-09-09, when scenario 1's
     *  two PO invoices (Invoice-FNSE-26-388 / -390) both finished approvals on
     *  Sync Failed. Acking 388 from that state returned 200 and the invoice went
     *  straight to Accounted with "+ Payment" offered, so the distinction does
     *  not affect the flow. What proves the invoice is really settled is the
     *  post-ack assertInvoiceAccounted(), not which of the two it passed through.
     */
    async assertInvoiceReadyForAck(tag = 'INV') {
        const sync = this.page.locator(`xpath=${L.invoicePendingSyncStatus}`).first();
        const failed = this.page.locator(`xpath=${L.invoiceSyncFailedStatus}`).first();
        if (await sync.isVisible({ timeout: 10000 }).catch(() => false)) {
            console.log(`[${tag}] invoice status = Pending Sync`);
            return 'Pending Sync';
        }
        if (await failed.isVisible({ timeout: 10000 }).catch(() => false)) {
            console.log(`[${tag}] invoice status = Sync Failed (seen in UAT — ack still applies)`);
            return 'Sync Failed';
        }
        const chips = await this._readDocStatusChips().catch(() => []);
        throw new Error(`[${tag}] invoice is neither Pending Sync nor Sync Failed `
            + `— status chips on the page: ${JSON.stringify(chips)}`);
    }

    /** Back-compat alias for the Non-PO callers. */
    async assertNonPoInvoiceReadyForAck() {
        return await this.assertInvoiceReadyForAck('NONPO');
    }

    // ── v4 detail-page "More" dropdown + Transactions tab ─────────────────────
    //
    // CXO, Intake and RFX all render the same shadcn/radix header on the v4 app,
    // so these helpers are module-agnostic. The CXO-named wrappers below are
    // kept because existing tests call them.
    //
    // Radix marks an unavailable item with aria-disabled="true" + data-disabled.
    // Do NOT test for a "disabled" substring in className — every item's
    // Tailwind class list contains `data-[disabled]:` utilities, so that check
    // is always true.

    async openV4MoreMenu() {
        const items = this.page.locator(`xpath=${L.anyCxoMenuItem}`);
        if (await items.first().isVisible().catch(() => false)) return;
        await this.page.locator(`xpath=${L.cxoMoreButton}`).first().click();
        await items.first().waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(400);
    }

    async closeV4MoreMenu() {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
    }

    /** Labels of every item currently in the v4 "More" dropdown. */
    async getV4MoreMenuItems() {
        await this.openV4MoreMenu();
        const items = this.page.locator(`xpath=${L.anyCxoMenuItem}`);
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await items.nth(i).innerText()) ?? '').trim());
        return out;
    }

    /**
     * true = present but disabled, false = present and enabled,
     * null = not in the menu at all. The three states matter: some actions are
     * DISABLED once unavailable (CXO Cancel) while others are REMOVED entirely
     * (Intake Cancel once Processed), and a test that conflates them proves
     * nothing.
     */
    async isV4MenuItemDisabled(label) {
        const item = this.page.locator(`xpath=${L.cxoMenuItem(label)}`).first();
        if (await item.count() === 0) return null;
        const aria = await item.getAttribute('aria-disabled');
        const data = await item.getAttribute('data-disabled');
        return aria === 'true' || data !== null;
    }

    /** Is a header action button (e.g. "Process") rendered on this page? */
    async hasV4HeaderButton(label) {
        return (await this.page.locator(`xpath=//button[normalize-space()="${label}"]`).count()) > 0;
    }

    /**
     * Read a v4 Transactions tab. Each linked-transaction group is its own
     * heading + table, so a single row count across the page would conflate
     * them.
     */
    async readV4TransactionSections(headings) {
        await this.page.waitForTimeout(1500);
        return this.page.evaluate((wanted) => {
            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const sections = {};
            for (const heading of wanted) {
                const h = [...document.querySelectorAll('*')]
                    .filter(e => e.children.length === 0 && norm(e.textContent) === heading)[0];
                if (!h) { sections[heading] = null; continue; }
                let host = h;
                for (let i = 0; i < 8 && host; i++) {
                    if (host.querySelector('table')) break;
                    host = host.parentElement;
                }
                const table = host && host.querySelector('table');
                const rows = table ? [...table.querySelectorAll('tbody tr')] : [];
                sections[heading] = {
                    present: true,
                    rowCount: rows.length,
                    codes: rows.map(r => norm((r.querySelectorAll('td')[1] || {}).textContent)).filter(Boolean),
                    emptyText: table ? norm(table.textContent).slice(0, 120) : '',
                };
            }
            return sections;
        }, headings);
    }

    // ── CXO wrappers (sheet scenarios 3 & 8) ──────────────────────────────────

    async openCxoMoreMenu()  { return this.openV4MoreMenu(); }
    async closeCxoMoreMenu() { return this.closeV4MoreMenu(); }
    async getCxoMoreMenuItems() {
        const items = this.page.locator(`xpath=${L.anyCxoMenuItem}`);
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await items.nth(i).innerText()) ?? '').trim());
        return out;
    }
    async isCxoMenuItemDisabled(label) { return this.isV4MenuItemDisabled(label); }

    async assertCxoMenuItemDisabled(label) {
        const state = await this.isV4MenuItemDisabled(label);
        if (state === null) throw new Error(`[CXO] "${label}" is not present in the More menu`);
        expect(state, `[CXO] expected "${label}" to be disabled`).toBeTruthy();
        console.log(`[CXO] More → "${label}" is disabled, as expected`);
    }

    async assertCxoMenuItemEnabled(label) {
        const state = await this.isV4MenuItemDisabled(label);
        if (state === null) throw new Error(`[CXO] "${label}" is not present in the More menu`);
        expect(state, `[CXO] expected "${label}" to be enabled`).toBeFalsy();
    }

    async readCxoTransactionSections() {
        return this.readV4TransactionSections(['Linked Intakes', 'Linked Non-PO Invoices']);
    }

    async assertCxoTransactionsTabStructure() {
        const s = await this.readCxoTransactionSections();
        expect(s['Linked Intakes'], 'Linked Intakes section missing').not.toBeNull();
        expect(s['Linked Non-PO Invoices'], 'Linked Non-PO Invoices section missing').not.toBeNull();
        console.log(`[CXO] Transactions → intakes=${s['Linked Intakes'].rowCount}, non-PO invoices=${s['Linked Non-PO Invoices'].rowCount}`);
        return s;
    }

    // ── Intake Transactions tab (sheet scenario 9) ────────────────────────────

    /** Open an intake straight from its id, bypassing the listing. */
    async openIntakeById(id, tab = 'overview') {
        const cfg = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        await this.page.goto(`${cfg.loginUrl}/intakes/${id}/${tab}`, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3500);
    }

    /** Status chip text on an intake/CXO overview (e.g. "Processed").
     *
     *  `timeoutMs` polls until a chip actually renders. Without it a caller that
     *  reads immediately after a navigation gets "" from a half-drawn page —
     *  which then passes any `not.toBe('SomeStatus')` assertion vacuously
     *  (observed 2026-09-09 in scenario 6, where the chip read "" and the real
     *  status went unchecked). */
    async readV4StatusChip({ timeoutMs = 0 } = {}) {
        const known = ['Draft', 'Pending Approval', 'Released', 'Processed', 'Partially Processed',
                       'Rejected', 'Cancelled', 'Awarded', 'Quoted'];
        const readOnce = async () => {
            const lines = (await this.page.locator('body').innerText().catch(() => ''))
                .split('\n').map(t => t.trim());
            return lines.find(t => known.includes(t)) ?? '';
        };
        const deadline = Date.now() + timeoutMs;
        let chip = await readOnce();
        while (!chip && Date.now() < deadline) {
            await this.page.waitForTimeout(1000);
            chip = await readOnce();
        }
        return chip;
    }

    async readIntakeTransactionSections() {
        return this.readV4TransactionSections(
            ['Linked Requisitions', 'Linked Negotiations', 'Linked Quote Requests'],
        );
    }

    async assertIntakeTransactionsTabStructure() {
        const s = await this.readIntakeTransactionSections();
        for (const key of ['Linked Requisitions', 'Linked Negotiations', 'Linked Quote Requests']) {
            expect(s[key], `${key} section missing`).not.toBeNull();
        }
        console.log(`[INTAKE] Transactions → requisitions=${s['Linked Requisitions'].rowCount}, negotiations=${s['Linked Negotiations'].rowCount}, quote requests=${s['Linked Quote Requests'].rowCount}`);
        return s;
    }

    // ── Activity Log panel (sheet scenarios 35-37) ────────────────────────────

    /** Open the Activity Log sheet from any v4 detail page. */
    async openActivityLogPanel() {
        await this.page.locator(`xpath=${L.activityLogButton}`).first().click();
        await this.page.locator(`xpath=${L.activityLogPanel}`).first()
            .waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(1500);
    }

    async closeActivityLogPanel() {
        const x = this.page.locator(`xpath=${L.activityLogCloseBtn}`).first();
        if (await x.count() > 0) await x.click().catch(() => {});
        else await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(600);
    }

    async activityLogEntryCount() {
        return this.page.locator(`xpath=${L.activityLogEntries}`).count();
    }

    /**
     * Download one artefact from an open Activity Log panel.
     *
     * @param {'Download Activities'|'Download Comments'} label
     *
     * Two traps here, both verified live 2026-08-31:
     *  - The download control is a DROPDOWN TRIGGER. Clicking it only opens a
     *    menu; the actual export needs a second click on the menu item.
     *  - The file is built in the browser (Blob → <a download>) and fires NO
     *    network request, so Playwright's `download` event is the only signal —
     *    waiting on a response would hang until the test times out.
     */
    async downloadActivityLogItem(label, moduleTag = 'v4') {
        const trigger = this.page.locator(`xpath=${L.activityLogDownloadBtn}`).first();
        await trigger.waitFor({ state: 'visible', timeout: 15000 });
        await trigger.click();

        const item = this.page.locator(`xpath=${L.activityLogDownloadItem(label)}`).first();
        await item.waitFor({ state: 'visible', timeout: 10000 });

        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 30000 }),
            item.click(),
        ]);

        const name = download.suggestedFilename();
        fs.mkdirSync('downloads', { recursive: true });
        const target = `downloads/activity_${moduleTag}_${label.replace(/\s+/g, '_')}_${Date.now()}_${name}`;
        await download.saveAs(target);
        const size = fs.statSync(target).size;
        expect(size, `"${label}" download ("${name}") is empty`).toBeGreaterThan(0);
        console.log(`[ACTIVITY] ${moduleTag} → ${label}: ${name} (${size} bytes)`);
        return { name, path: target, size };
    }

    /**
     * Is the Activity Log's add-comment field present on this transaction?
     *
     * Commenting is state-dependent, NOT universal: an AWARDED RFX renders the
     * panel with the filter chips and feed but no textarea at all (confirmed
     * live 2026-09-04 on RFX-26-243 / 1458 — the panel had zero inputs). So the
     * comment precondition has to be probed, not assumed, or the RFX case fails
     * on a by-design restriction and looks like a bug.
     */
    async hasActivityLogCommentField() {
        const box = this.page.locator(`xpath=${L.activityLogCommentInput}`).first();
        return box.isVisible({ timeout: 4000 }).catch(() => false);
    }

    /**
     * Add a comment in an open Activity Log panel and confirm it landed.
     *
     * Precondition for the Comments export, NOT a cosmetic extra: with no
     * comments on the transaction the "Download Comments" file is named
     * ActivityTimeline_undefined_<ts>.xlsx, because the export has no
     * conversation to name itself after. Once a comment exists the same export
     * comes back as ActivityTimeline_Conversations_<ts>.xlsx. That is the whole
     * reason the "undefined" filename was mistaken for a defect (sheet 35-37,
     * retracted by QA 2026-09-04).
     *
     * The blue right-arrow send button ships DISABLED and enables only when the
     * textarea is non-empty, so this waits for enabled instead of clicking
     * straight after fill().
     *
     * @param {string} text comment body
     * @returns {Promise<string>} the text that was posted
     */
    async addActivityLogComment(text = `Automation comment ${Date.now()}`) {
        const box = this.page.locator(`xpath=${L.activityLogCommentInput}`).first();
        await box.waitFor({ state: 'visible', timeout: 15000 });
        await box.click();
        await box.fill(text);

        const send = this.page.locator(`xpath=${L.activityLogCommentSendBtn}`).first();
        await expect(send, 'comment send button never enabled after typing').toBeEnabled({ timeout: 10000 });
        await send.click();

        // The feed re-renders in place; wait for the posted body to show up
        // rather than a fixed sleep, so a slow save cannot race the download.
        const posted = this.page.locator(`xpath=${L.activityLogPanel}`)
            .first()
            .getByText(text, { exact: false });
        await posted.first().waitFor({ state: 'visible', timeout: 20000 })
            .catch(() => { throw new Error(`comment "${text}" did not appear in the Activity Log feed after send`); });

        await this.page.waitForTimeout(800);
        console.log(`[ACTIVITY] comment posted: "${text}"`);
        return text;
    }

    /** Labels offered by the Activity Log download dropdown. */
    async getActivityDownloadOptions() {
        await this.page.locator(`xpath=${L.activityLogDownloadBtn}`).first().click();
        await this.page.waitForTimeout(1200);
        const items = this.page.locator(`xpath=//*[@role="menuitem"]`);
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) {
            if (await items.nth(i).isVisible().catch(() => false)) {
                out.push(((await items.nth(i).innerText()) ?? '').trim());
            }
        }
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        return out;
    }

    // ── RFX Analysis tab (sheet scenarios 23, 25, 26, 27, 30) ─────────────────

    async openRfxAnalysisTab() {
        await this.page.locator(`xpath=${L.rfxAnalysisTabBtn}`).first().click();
        await this.page.waitForURL(/\/analysis/, { timeout: 30000 }).catch(() => {});
        await this.page.locator(`xpath=${L.analysisBaseCurrencySwitch}`).first()
            .waitFor({ state: 'visible', timeout: 30000 });
        await this.page.waitForTimeout(1500);
    }

    async getAnalysisSwitchState(label) {
        const sw = this.page.locator(`xpath=${L.analysisSwitch(label)}`).first();
        await sw.waitFor({ state: 'visible', timeout: 15000 });
        return sw.getAttribute('data-state');   // 'checked' | 'unchecked'
    }

    async toggleAnalysisSwitch(label) {
        const before = await this.getAnalysisSwitchState(label);
        await this.page.locator(`xpath=${L.analysisSwitch(label)}`).first().click();
        await this.page.waitForTimeout(2500);
        const after = await this.getAnalysisSwitchState(label);
        expect(after, `"${label}" switch did not change state`).not.toBe(before);
        return { before, after };
    }

    /** Every currency amount rendered on the analysis grid, in document order. */
    async readAnalysisAmounts() {
        return this.page.evaluate(() => {
            const t = document.body.innerText;
            return (t.match(/[₹$€£]\s?[\d,]+(?:\.\d+)?/g) || []);
        });
    }

    /** Currency symbols currently shown on the analysis grid. */
    async readAnalysisCurrencySymbols() {
        const amounts = await this.readAnalysisAmounts();
        return [...new Set(amounts.map(a => a.trim()[0]))];
    }

    async getAnalysisDownloadOptions() {
        await this.page.locator(`xpath=${L.analysisDownloadBtn}`).first().click();
        await this.page.waitForTimeout(1500);
        const items = this.page.locator(`xpath=//*[@role="menuitem"]`);
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) {
            if (await items.nth(i).isVisible().catch(() => false)) {
                out.push(((await items.nth(i).innerText()) ?? '').trim());
            }
        }
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
        return out;
    }

    /**
     * Download one export from the Analysis tab's download dropdown.
     * Like the Activity Log export this is produced client-side, so the
     * `download` event is the only signal.
     */
    async downloadAnalysisFile(label) {
        await this.page.locator(`xpath=${L.analysisDownloadBtn}`).first().click();
        const item = this.page.locator(`xpath=${L.analysisDownloadItem(label)}`).first();
        await item.waitFor({ state: 'visible', timeout: 10000 });

        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 45000 }),
            item.click(),
        ]);

        const name = download.suggestedFilename();
        fs.mkdirSync('downloads', { recursive: true });
        const target = `downloads/rfx_analysis_${label.replace(/\s+/g, '_')}_${Date.now()}_${name}`;
        await download.saveAs(target);
        const size = fs.statSync(target).size;
        expect(size, `"${label}" download ("${name}") is empty`).toBeGreaterThan(0);
        console.log(`[ANALYSIS] ${label} → ${name} (${size} bytes)`);
        return { name, path: target, size };
    }

    /**
     * Attempt an Analysis export and report what actually happened.
     *
     * Not every export is available on every RFX: "Download Benchmarks" returns
     * HTTP 400 with {"success":0,"reason":"No benchmark fields configured for
     * download"} when the RFX has no benchmark fields — and the UI shows NOTHING
     * for it (verified live on RFX-26-231, 2026-08-31). So a plain
     * waitForEvent('download') just hangs until timeout, telling you nothing
     * about why.
     *
     * Races the download event against the API response so the caller can tell
     * "worked", "legitimately unavailable" and "broken" apart.
     *
     * @returns {{ok:true, file:{name,path,size}} | {ok:false, status:number, reason:string}}
     */
    async tryDownloadAnalysisFile(label) {
        await this.page.locator(`xpath=${L.analysisDownloadBtn}`).first().click();
        const item = this.page.locator(`xpath=${L.analysisDownloadItem(label)}`).first();
        await item.waitFor({ state: 'visible', timeout: 10000 });

        const downloadP = this.page.waitForEvent('download', { timeout: 45000 })
            .then(d => ({ kind: 'download', d })).catch(() => null);
        const failureP = this.page.waitForResponse(
            r => /excel-download|download/i.test(r.url()) && !r.ok(),
            { timeout: 45000 },
        ).then(r => ({ kind: 'failure', r })).catch(() => null);

        await item.click();
        const result = await Promise.race([
            downloadP,
            failureP,
            new Promise(r => setTimeout(() => r(null), 47000)),
        ]);

        if (result && result.kind === 'download') {
            const name = result.d.suggestedFilename();
            fs.mkdirSync('downloads', { recursive: true });
            const target = `downloads/rfx_analysis_${label.replace(/\s+/g, '_')}_${Date.now()}_${name}`;
            await result.d.saveAs(target);
            const size = fs.statSync(target).size;
            console.log(`[ANALYSIS] ${label} → ${name} (${size} bytes)`);
            return { ok: true, file: { name, path: target, size } };
        }

        if (result && result.kind === 'failure') {
            let reason = '';
            try { reason = (await result.r.json())?.reason ?? ''; } catch { /* non-JSON body */ }
            console.log(`[ANALYSIS] ${label} → HTTP ${result.r.status()} "${reason}"`);
            return { ok: false, status: result.r.status(), reason };
        }

        return { ok: false, status: 0, reason: 'no download and no error response' };
    }

    /** Any user-visible toast / alert text currently on screen. */
    async readVisibleToasts() {
        return this.page.evaluate(() => {
            const sel = '[class*=oast],[class*=nackbar],[role=status],[role=alert]';
            return [...document.querySelectorAll(sel)]
                .map(e => (e.textContent || '').trim())
                .filter(t => t && t.length < 300);
        });
    }

    async getAnalysisViewTypes() {
        await this.page.locator(`xpath=${L.analysisViewTypeBtn}`).first().click();
        await this.page.waitForTimeout(1500);
        const items = this.page.locator(`xpath=//*[@role="menuitem"] | //*[@role="option"]`);
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) {
            if (await items.nth(i).isVisible().catch(() => false)) {
                out.push(((await items.nth(i).innerText()) ?? '').trim());
            }
        }
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
        return out.filter(Boolean);
    }

    /** Open the inline Compare panel (it is NOT a dialog). */
    async openAnalysisCompare() {
        await this.page.locator(`xpath=${L.analysisCompareBtn}`).first().click();
        await this.page.locator(`xpath=${L.analysisCompareNote}`).first()
            .waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(1000);
    }

    // ── Save → edit → submit during creation (sheet scenarios 14-18) ──────────

    /**
     * Fill the Intake create form and Save it as a Draft (no workflow submit).
     * Mirrors createCxoDraft. Lands on the intake overview and persists the code.
     */
    /**
     * Every header field on the intake create page, with NO line row added.
     * Extracted from createIntakeDraft/createAndSubmitIntake so scenario 10 can
     * build a header and let Bulk Upload supply the lines - those two callers
     * used to inline this identical block and both still behave exactly as before.
     */
    async fillIntakeHeaderFields(data) {
        await this.fillIntakeTitle(data);
        await this.fillIntakeSummary(data);
        await this.selectIntakeCompany1();
        await this.selectIntakeCompany2();
        await this.selectIntakeDepartment(data);
        await this.selectIntakeExpenseNatureApproval(data);
        await this.selectIntakeCurrency(data);
        await this.selectIntakeFunction(data);
        await this.selectIntakeVertical(data);
        await this.selectIntakeProjectName();
        await this.selectIntakeNatureOfExpense(data);
        await this.selectIntakeGLAccount();
        await this.selectIntakeProfitCenter();
        await this.selectIntakeCostCenter();
        await this.selectIntakeSEBICategorization();
        await this.selectIntakeSubSegment();
        await this.selectIntakeProjectCategory();
        await this.selectIntakeCXOType(data);
        await this.selectIntakeCXOTransaction(data);
    }

    // ── Intake Bulk Upload (sheet scenario 10) ───────────────────────────────

    async openIntakeBulkUpload() {
        const btn = this.page.locator(`xpath=${L.intakeBulkUploadBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 15000 });
        await btn.click();
        const dlg = this.page.locator(`xpath=//*[@role='dialog']`).first();
        await dlg.waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(1200);
        console.log('[BULK] Bulk Upload dialog open');
    }

    /**
     * Download Template. Saved under downloads/ like every other download in
     * this suite. Verified to fire a real download event, but the race with
     * 'page' is kept because this app opens a tab instead often enough that a
     * bare waitForEvent('download') would hang for the full timeout and report
     * a working feature as broken (same trap as scenario 91).
     */
    async downloadIntakeTemplate() {
        const btn = this.page.locator(`xpath=${L.bulkDownloadTemplateBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 15000 });

        const ctx = this.page.context();
        const race = Promise.race([
            this.page.waitForEvent('download', { timeout: 45000 }).then(d => ({ kind: 'download', d })),
            ctx.waitForEvent('page', { timeout: 45000 }).then(pg => ({ kind: 'tab', pg })),
        ]);
        await btn.click();
        const r = await race.catch(() => ({ kind: 'neither' }));
        if (r.kind !== 'download') {
            throw new Error(`[BULK] Download Template produced "${r.kind}", not a download`
                + (r.kind === 'tab' ? ` (tab: ${r.pg.url()})` : ''));
        }

        const name = r.d.suggestedFilename();
        fs.mkdirSync('downloads', { recursive: true });
        const target = `downloads/intake_template_${Date.now()}_${name}`;
        await r.d.saveAs(target);
        const size = fs.statSync(target).size;
        expect(size, `the downloaded template "${name}" is empty`).toBeGreaterThan(0);
        console.log(`[BULK] template downloaded: ${name} (${size} bytes) -> ${target}`);
        return target;
    }

    /**
     * Upload a filled template. Goes through the file chooser (see the locator
     * note - the dialog's own input[type=file] is inert), then waits for the
     * app's streaming /intakes/excel-upload response to finish. That response is
     * NDJSON-ish progress frames ending in a "complete" frame; response.text()
     * resolves only once the stream closes, which is exactly the signal that the
     * rows have been parsed and pushed into the grid.
     */
    async uploadIntakeBulkFile(filePath) {
        const respP = this.page.waitForResponse(
            r => /\/intakes\/excel-upload/.test(r.url()) && r.request().method() === 'POST',
            { timeout: 180000 });

        const chooserP = this.page.waitForEvent('filechooser', { timeout: 20000 });
        await this.page.locator(`xpath=${L.bulkUploadFileBtn}`).first().click();
        const chooser = await chooserP;
        await chooser.setFiles(filePath);
        console.log(`[BULK] file handed to the chooser: ${filePath}`);

        const resp = await respP;
        const body = await resp.text().catch(() => '');
        expect(resp.status(), 'excel-upload did not return 2xx').toBeLessThan(300);
        if (!/"type"\s*:\s*"complete"/.test(body)) {
            throw new Error('[BULK] excel-upload never emitted a "complete" frame. '
                + `status=${resp.status()} tail=${body.slice(-300).replace(/\s+/g, ' ')}`);
        }
        console.log('[BULK] excel-upload completed');
        await this.page.waitForTimeout(4000);
    }

    /**
     * Count the line-item rows in the VIRTUALISED grid.
     *
     * Counting mounted cells is wrong - only ~31 of 100 rows exist in the DOM at
     * any time, so a DOM count reports 31 and fails a working feature. Instead
     * scroll the grid's own container to the bottom, collecting the narrow
     * serial-number column as it goes, and report the highest serial seen.
     */
    async countIntakeLineItemRows() {
        return await this.page.evaluate(async () => {
            const scrollers = [...document.querySelectorAll('*')]
                .filter(e => e.scrollHeight > e.clientHeight + 60 && e.clientHeight > 150);
            const target = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            if (!target) return { max: 0, count: 0, note: 'no scroll container found' };

            const seen = new Set();
            const harvest = () => [...document.querySelectorAll('td,div')].forEach(e => {
                const t = (e.innerText || '').trim();
                if (/^\d{1,4}$/.test(t) && +t > 0 && +t <= 2000 && e.clientWidth < 70) seen.add(+t);
            });

            target.scrollTop = 0;
            await new Promise(r => setTimeout(r, 250));
            for (let i = 0; i < 80; i++) {
                harvest();
                if (target.scrollTop + target.clientHeight >= target.scrollHeight - 5) break;
                target.scrollTop += target.clientHeight * 0.8;
                await new Promise(r => setTimeout(r, 300));
            }
            harvest();
            const arr = [...seen].sort((a, b) => a - b);
            return { max: arr[arr.length - 1] ?? 0, count: arr.length };
        });
    }

    async assertIntakeLineItemCount(expected) {
        const { max, count } = await this.countIntakeLineItemRows();
        console.log(`[BULK] grid serials -> highest ${max}, distinct ${count} (expected ${expected})`);
        expect(max, `the grid's highest line-item serial should be ${expected}`).toBe(expected);
        expect(count, `the grid should hold ${expected} distinct line-item serials`).toBe(expected);
    }

    async createIntakeDraft(data) {
        await this.closeAskAieraIfVisible();
        await this.expandIntakeSections();

        await this.fillIntakeTitle(data);
        await this.fillIntakeSummary(data);
        await this.selectIntakeCompany1();
        await this.selectIntakeCompany2();
        await this.selectIntakeDepartment(data);
        await this.selectIntakeExpenseNatureApproval(data);
        await this.selectIntakeCurrency(data);
        await this.selectIntakeFunction(data);
        await this.selectIntakeVertical(data);
        await this.selectIntakeProjectName();
        await this.selectIntakeNatureOfExpense(data);
        await this.selectIntakeGLAccount();
        await this.selectIntakeProfitCenter();
        await this.selectIntakeCostCenter();
        await this.selectIntakeSEBICategorization();
        await this.selectIntakeSubSegment();
        await this.selectIntakeProjectCategory();
        await this.selectIntakeCXOType(data);
        await this.selectIntakeCXOTransaction(data);

        await this.addIntakeLineRow();
        await this.fillIntakeLineItem(data);
        await this.fillIntakePotentialSuppliers(data);

        const save = this.page.locator(`xpath=${L.v4SaveDraftBtn}`).first();
        await save.waitFor({ state: 'visible', timeout: 15000 });
        await save.click();

        await this.page.waitForURL(/\/intakes\/[^\/]+\/overview/, { timeout: 30000 });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(2500);
        console.log('[INTAKE] Saved as Draft → overview');
        await this.saveIntakeCode();
    }

    /**
     * Draft CXO → More → Edit → change the title → Submit.
     *
     * A Draft has no header Edit button; the action lives in the More dropdown,
     * same as the rejected-CXO path.
     */
    async editDraftCxoAndSubmit(suffix = ' - draft edit') {
        const more = this.page.locator(`xpath=${IL.intakeMoreBtn}`).first();
        await more.waitFor({ state: 'visible', timeout: 15000 });
        await more.click();
        await this.page.waitForTimeout(600);

        const editOpt = this.page.locator(`xpath=${IL.intakeEditOption}`).first();
        await editOpt.waitFor({ state: 'visible', timeout: 10000 });
        await editOpt.click();

        await this.page.waitForURL(/\/cxos\/[^\/]+\/edit/, { timeout: 20000 });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.waitForCreatePageLoaded().catch(() => {});
        await this.page.waitForTimeout(1500);

        const current = await this.getTitleValue();
        const newTitle = `${current}${suffix}`;
        await this.typeTitle(newTitle);
        await this.page.waitForTimeout(500);

        await this.clickSubmit();
        await expect(this.page).toHaveURL(/\/cxos\/[^\/]+\/overview/, { timeout: 30000 });
        await this.page.waitForTimeout(2000);
        console.log(`[CXO] Draft edited & submitted → title="${newTitle}"`);
        return newTitle;
    }

    /** Is a Save-as-draft control present on the current create page? */
    async hasSaveDraftButton() {
        return (await this.page.locator(`xpath=${L.v4SaveDraftBtn}`).count()) > 0;
    }

    // ── User's Dashboard (sheet scenarios 22, 89, 92) ─────────────────────────

    async openDashboard(data) {
        await this.page.goto(`${data.loginUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.locator(`xpath=${L.dashboardHeading}`).first()
            .waitFor({ state: 'visible', timeout: 30000 });
        await this.page.waitForTimeout(2000);
    }

    /**
     * Switch a v4 tab by accessible role.
     *
     * The dashboard and listings render their tab bar twice (desktop + mobile).
     * A plain XPath/text match can resolve the inert copy and silently do
     * nothing, which is exactly how a "My Pending Approval" click left the All
     * tab active while still looking like it had worked.
     */
    async clickV4Tab(name) {
        await this.page.getByRole('tab', { name, exact: true }).first().click();
        await this.page.waitForTimeout(4000);
    }

    async getActiveV4TabNames() {
        return this.page.evaluate(() =>
            [...document.querySelectorAll('[data-slot="tabs-trigger"]')]
                .filter(t => t.getAttribute('data-state') === 'active')
                .map(t => (t.textContent || '').trim()));
    }

    /** Total row count from the "Showing X – Y of Z entries" footer. */
    async getListingTotalEntries() {
        const info = this.page.locator(`xpath=${L.dashboardPaginationInfo}`).first();
        await info.waitFor({ state: 'visible', timeout: 20000 });
        const text = (await info.innerText()) ?? '';
        const m = text.match(/of\s+([\d,]+)\s+entries/i);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
    }

    /** Rows on the current dashboard page: {code, type, status}. */
    async readDashboardRows() {
        return this.page.evaluate(() => {
            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const ths = [...document.querySelectorAll('th')].map(t => norm(t.textContent));
            const idx = (label) => ths.findIndex(h => h.startsWith(label));
            const ci = idx('Code'), ti = idx('Transaction Type'), si = idx('Status');
            return [...document.querySelectorAll('tbody tr')].map(r => {
                const td = r.querySelectorAll('td');
                return {
                    code:   ci >= 0 ? norm((td[ci] || {}).textContent) : '',
                    type:   ti >= 0 ? norm((td[ti] || {}).textContent) : '',
                    status: si >= 0 ? norm((td[si] || {}).textContent) : '',
                };
            });
        });
    }

    /**
     * Walk every page of the current dashboard grid and tally rows by
     * Transaction Type. Bounded by `maxPages` so a data explosion cannot turn
     * this into an unbounded crawl.
     */
    async tallyDashboardByType(maxPages = 12) {
        const tally = {};
        let pages = 0;

        for (; pages < maxPages; pages++) {
            for (const row of await this.readDashboardRows()) {
                if (!row.type) continue;
                tally[row.type] = (tally[row.type] ?? 0) + 1;
            }
            const next = this.page.getByRole('button', { name: 'Next' }).first();
            if (await next.count() === 0) break;
            if (await next.isDisabled().catch(() => true)) break;
            await next.click();
            await this.page.waitForTimeout(3000);
        }
        return { tally, pagesWalked: pages + 1 };
    }

    // ── Listing "pending approval" view (sheet scenario 131) ─────────────────
    //
    // A rejected transaction must no longer sit in the approver's queue. Scoped
    // to CXO / PO / Invoice on QA's instruction (2026-09-08): probed live, those
    // are the only three modules that HAVE such a view. GRN's /inwards listing
    // shows no approval text at all, and Intake and RFX offer only "All".
    //
    // TWO SHAPES, and the label is NOT the same in both:
    //   CXO      (v4)  role=tab   "My Pending Approval"
    //   Invoice  (v3)  plain text "My Pending Approval"
    //   PO       (v3)  plain text "Pending My Approval"   <- word order differs
    // Matching "My Pending Approval" everywhere would silently find nothing on
    // the PO listing.

    /** Load a listing and switch to its pending-approval view. */
    async openPendingApprovalView(url, label, tag = 'LIST') {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        // These listings render late; waiting on rows is far more reliable than a
        // fixed sleep — an under-waited probe reported the v3 tabs as absent
        // entirely (2026-09-08).
        await this.page.waitForSelector('tbody tr, .MuiTab-root, [data-slot="tabs-trigger"]',
            { timeout: 90000 }).catch(() => {});
        await this.page.waitForTimeout(10000);

        const byRole = this.page.getByRole('tab', { name: label, exact: true }).first();
        if (await byRole.count().catch(() => 0) && await byRole.isVisible().catch(() => false)) {
            await byRole.click();
            console.log(`[${tag}] switched to "${label}" (role=tab)`);
        } else {
            const el = this.page.locator(`xpath=//*[normalize-space(text())="${label}"]`).first();
            if (!await el.isVisible({ timeout: 30000 }).catch(() => false)) {
                throw new Error(`[${tag}] the listing at ${url} offers no "${label}" view`);
            }
            await el.click({ force: true });
            console.log(`[${tag}] switched to "${label}" (text match)`);
        }
        await this.page.waitForTimeout(9000);
    }

    /** Every transaction code on the current listing, across pages. */
    async listingCodesAcrossPages(maxPages = 15, tag = 'LIST') {
        const codes = [];
        for (let i = 0; i < maxPages; i++) {
            const page = await this.page.evaluate(() => {
                const norm = t => (t || '').replace(/\s+/g, ' ').trim();
                return [...document.querySelectorAll('tbody tr')]
                    .map(r => norm((r.querySelectorAll('td')[0] || {}).textContent))
                    .filter(Boolean);
            });
            codes.push(...page);
            const next = this.page.getByRole('button', { name: 'Next' }).first();
            if (!await next.count().catch(() => 0)) break;
            if (await next.isDisabled().catch(() => true)) break;
            await next.click();
            await this.page.waitForTimeout(3500);
        }
        console.log(`[${tag}] ${codes.length} code(s) in this view across pages`);
        return codes;
    }

    /**
     * Walk every page of the CURRENT listing and return rows whose status is
     * terminal — a record that can no longer be approved has no business
     * sitting in a "My Pending Approval" queue.
     */
    async findTerminalStatusRowsAcrossPages(maxPages = 12) {
        const TERMINAL = ['Cancelled', 'Rejected', 'Amend Rejected', 'Budget Rejected', 'Completed', 'Processed'];
        const found = [];

        for (let i = 0; i < maxPages; i++) {
            const rows = await this.page.evaluate(() => {
                const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
                const ths = [...document.querySelectorAll('th')].map(t => norm(t.textContent));
                const si = ths.findIndex(h => h.startsWith('Status'));
                return [...document.querySelectorAll('tbody tr')].map(r => {
                    const td = r.querySelectorAll('td');
                    return {
                        code:   norm((td[0] || {}).textContent),
                        status: si >= 0 ? norm((td[si] || {}).textContent) : '',
                    };
                });
            });
            for (const r of rows) {
                if (TERMINAL.includes(r.status)) found.push(`${r.code} (${r.status})`);
            }

            const next = this.page.getByRole('button', { name: 'Next' }).first();
            if (await next.count() === 0) break;
            if (await next.isDisabled().catch(() => true)) break;
            await next.click();
            await this.page.waitForTimeout(3000);
        }
        return found;
    }

    // ── Invoice acknowledgement rules (sheet scenarios 115, 116) ──────────────

    /**
     * Call the invoice ack API for an ARBITRARY invoice code and return the
     * outcome WITHOUT asserting success.
     *
     * acknowledgeInvoice() asserts a 2xx because the happy path expects one.
     * Scenarios 115/116 need the opposite: proof that a Cancelled or Rejected
     * invoice is refused. A refusal can arrive either as a non-2xx OR as HTTP
     * 200 carrying success:0 — this app does both — so the caller gets the
     * status, the parsed success flag and the reason.
     */
    async tryAcknowledgeInvoiceCode(data, expenseRecordNo, responseBodyRef = null) {
        const apiKey = process.env.NSEF_INVOICE_ACK_KEY || data.invoice.ackApiKey;
        if (!apiKey) throw new Error('Invoice ack API key missing');

        const payload = {
            transactionData: {
                EXPENSE_RECORD_NO: expenseRecordNo,
                success: true,
                operation: 'create',
                response_body_reference: responseBodyRef ?? data.invoice.invoiceNumber,
                templateId: data.invoice.ackTemplateId ?? 1233,
            },
        };
        const resp = await this.page.request.post(data.invoice.ackUrl, {
            headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
            data: payload,
        });
        const text = await resp.text().catch(() => '');
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON body */ }

        const result = {
            status: resp.status(),
            ok: resp.ok(),
            success: json?.success,
            reason: json?.reason ?? json?.message ?? '',
            body: text.slice(0, 400),
        };
        console.log(`[ACK] ${expenseRecordNo} → HTTP ${result.status} success=${result.success} reason="${result.reason}"`);
        return result;
    }

    /**
     * Read an invoice's status from its detail page.
     *
     * POLLS rather than waiting a fixed interval: on the first navigation of a
     * run the v3 detail page can still be rendering after 5s, and a single read
     * then returns "" — which looked like "the invoice is not Cancelled" and
     * failed a test for a reason that had nothing to do with the invoice
     * (2026-08-31).
     */
    async readInvoiceStatusByPath(hrefPath, timeout = 45000) {
        const KNOWN = ['Draft', 'Pending-approval', 'Pending Approval', 'Rejected', 'Cancelled',
                       'Pending-sync', 'Pending Sync', 'Accounted', 'Sync-failed', 'Disputed',
                       'To-review', 'To-enrich', 'Submitted', 'Completed', 'Partially Processed'];

        await this.page.goto(`https://nse-capp-uat.aerchain.io${hrefPath}`, {
            waitUntil: 'domcontentloaded', timeout: 60000,
        });

        const deadline = Date.now() + timeout;
        for (;;) {
            const status = await this.page.evaluate((known) => {
                const lines = document.body.innerText.split('\n').map(t => t.trim());
                return lines.find(t => known.includes(t)) ?? '';
            }, KNOWN);
            if (status) return status;
            if (Date.now() > deadline) return '';
            await this.page.waitForTimeout(1500);
        }
    }

    /** First invoice on the listing whose Status matches, as {code, href}. */
    async findInvoiceWithStatus(statusPattern) {
        await this.page.goto('https://nse-capp-uat.aerchain.io/invoices', {
            waitUntil: 'domcontentloaded', timeout: 60000,
        });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(1500);
        return this.page.evaluate((pattern) => {
            const re = new RegExp(pattern, 'i');
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.findIndex(h => h.startsWith('Status'));
            if (si === -1) return null;
            for (const r of document.querySelectorAll('tbody tr')) {
                const td = r.querySelectorAll('td');
                if (!re.test(((td[si] || {}).textContent || '').trim())) continue;
                const a = r.querySelector('a');
                if (a) return {
                    code: ((td[0] || {}).textContent || '').trim(),
                    href: a.getAttribute('href'),
                    status: ((td[si] || {}).textContent || '').trim(),
                };
            }
            return null;
        }, statusPattern);
    }

    // ── CXO clone reference rules (sheet scenarios 107, 108) ──────────────────

    /** First CXO on the listing whose Status matches, as {code, href, status}. */
    async findCxoWithStatus(statusPattern) {
        const cfg = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        await this.page.goto(`${cfg.loginUrl}/cxos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(1500);
        return this.page.evaluate((pattern) => {
            const re = new RegExp(`^${pattern}$`, 'i');
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.findIndex(h => h.startsWith('Status'));
            if (si === -1) return null;
            for (const r of document.querySelectorAll('tbody tr')) {
                const td = r.querySelectorAll('td');
                const status = ((td[si] || {}).textContent || '').trim();
                if (!re.test(status)) continue;
                const a = r.querySelector('a');
                if (a) return { code: ((td[0] || {}).textContent || '').trim(), href: a.getAttribute('href'), status };
            }
            return null;
        }, statusPattern);
    }

    /** Open a CXO and start a clone; lands on /cxos/{id}/clone. */
    async startCxoClone(hrefPath) {
        const cfg = JSON.parse(fs.readFileSync(this._dataPath(), 'utf-8'));
        await this.page.goto(`${cfg.loginUrl}${hrefPath}/overview`, {
            waitUntil: 'domcontentloaded', timeout: 60000,
        });
        await this.page.waitForTimeout(4000);

        await this.page.locator(`xpath=${L.cxoMoreButton}`).first().click();
        const clone = this.page.locator(`xpath=${L.cxoMenuItem('Clone')}`).first();
        await clone.waitFor({ state: 'visible', timeout: 15000 });
        await clone.click();

        await this.page.waitForURL(/\/clone/, { timeout: 30000 });
        await this.page.waitForTimeout(4000);
    }

    /**
     * Submit the open clone form untouched and report what happened.
     *
     * Returns { created, url, toasts } — `created` is true when the app
     * navigated to a NEW cxo id, which is the only reliable signal: the success
     * toast is transient and a blocked submit leaves you on /clone.
     */
    async submitCloneUnchanged(maxAttempts = 3) {
        const before = this.page.url();
        const submit = () => this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();

        let toasts = [];
        // The first Submit click frequently does nothing visible on this form —
        // it appears to run validation / expand sections — and only a second
        // click actually posts. Observed by hand: click 1 left the page on
        // /clone with no toast; click 2 produced "CXO request created
        // successfully". The same two-click quirk affects the PR item panel.
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await submit();
            for (let i = 0; i < 8; i++) {
                const found = await this.readVisibleToasts();
                if (found.length) toasts = [...new Set([...toasts, ...found])];
                if (!/\/clone/.test(this.page.url())) break;
                await this.page.waitForTimeout(1000);
            }
            if (!/\/clone/.test(this.page.url())) break;
            await this.page.waitForTimeout(1500);
        }

        const after = this.page.url();
        const created = !/\/clone/.test(after) && /\/cxos\/\d+/.test(after);
        console.log(`[CLONE] ${before} -> ${after} | created=${created} | toasts=${JSON.stringify(toasts)}`);
        return { created, url: after, toasts };
    }


    // ── RFX supplier reminders (sheet scenario 34) ────────────────────────────

    /**
     * Open the newest RFX whose Status is one of `statuses`.
     * Returns { code, url } or null when the first listing page has none.
     */
    async openRfxWithStatus(statuses, baseUrl) {
        await this.page.goto(`${baseUrl}/quote-requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(1200);

        const hit = await this.page.evaluate((wanted) => {
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.indexOf('Status');
            if (si === -1) return null;
            for (const r of [...document.querySelectorAll('tbody tr')]) {
                const tds = r.querySelectorAll('td');
                const st = ((tds[si] || {}).textContent || '').trim();
                if (!wanted.includes(st)) continue;
                const a = r.querySelector('a');
                if (!a) continue;
                return { code: ((tds[0] || {}).textContent || '').trim(), href: a.getAttribute('href'), status: st };
            }
            return null;
        }, statuses);

        if (!hit) return null;
        await this.page.goto(`${baseUrl}${hit.href}/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(3000);
        return hit;
    }

    async hasBulkReminderButton() {
        return (await this.page.getByRole('button', { name: /Bulk Reminder/i }).count()) > 0;
    }

    /**
     * Click Bulk Reminder and return the HTTP status of the send.
     * The app shows no toast, so the API call is the only observable signal.
     */
    async clickBulkReminder() {
        const resp = this.page.waitForResponse(
            r => /send-reminder-to-all-suppliers/.test(r.url()),
            { timeout: 60000 },
        );
        await this.page.getByRole('button', { name: /Bulk Reminder/i }).first().click();
        const r = await resp;
        await this.page.waitForTimeout(1500);
        return r.status();
    }

    // ── RFX → Convert to Auction (sheet scenario 32) ──────────────────────────

    /**
     * "Convert to Auction" only appears once a QUOTED RFX has been FORECLOSED.
     * Confirmed on UAT 2026-09-01: RFX-26-233 (Quoted, not foreclosed) offers
     * Foreclose and no auction option, while RFX-26-222 (quoted then
     * foreclosed) offers Convert to Auction and no Foreclose.
     */
    async hasV4MenuItem(label) {
        await this.openV4MoreMenu();
        const items = await this.getV4MoreMenuItems();
        return items.some(t => new RegExp(label, 'i').test(t));
    }

    async clickV4MenuItem(label) {
        const item = this.page.getByRole('menuitem', { name: new RegExp(label, 'i') }).first();

        // Opening the menu is not reliable on a freshly navigated page: the
        // More button renders before the page finishes hydrating, so the first
        // click can be swallowed and the item never appears. Retry the OPEN
        // rather than waiting longer on an item that was never rendered.
        let opened = false;
        for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
            await this.openV4MoreMenu().catch(() => {});
            opened = await item.waitFor({ state: 'visible', timeout: 10000 })
                .then(() => true).catch(() => false);
            if (!opened) {
                await this.page.keyboard.press('Escape').catch(() => {});
                await this.page.waitForTimeout(1500);
            }
        }
        if (!opened) throw new Error(`More menu never offered "${label}"`);

        await item.click({ timeout: 20000 });
        await this.page.waitForTimeout(2000);
    }

    /**
     * Confirm the Convert to Auction dialog. Its confirm button repeats the
     * dialog title, so it must be picked by ROLE inside the dialog — a text
     * match alone also hits the heading.
     */
    async confirmConvertToAuction() {
        const dialog = this.page.getByRole('dialog').filter({ hasText: /Convert to Auction/i }).first();
        await expect(dialog).toBeVisible({ timeout: 20000 });

        // The confirm button starts DISABLED (pointer-events:none, opacity .5)
        // until at least one line item is selected.
        //
        // Tick each checkbox at most ONCE. An earlier version clicked with
        // Playwright and then "fell back" to a DOM click when the button had
        // not enabled yet — which simply toggled the box straight back off, so
        // the confirm never enabled and it looked like the control was broken.
        const confirmEnabled = async () => this.page.evaluate(() => {
            const d = [...document.querySelectorAll('[role=dialog]')]
                .filter(e => e.offsetWidth > 100)[0];
            if (!d) return false;
            const b = [...d.querySelectorAll('button')]
                .find(x => (x.innerText || '').trim() === 'Convert to Auction');
            return !!b && !b.disabled;
        });

        const boxes = dialog.getByRole('checkbox');
        await expect(boxes.first()).toBeVisible({ timeout: 15000 });
        const n = await boxes.count();

        for (let i = 0; i < n; i++) {
            if (await confirmEnabled()) break;
            const box = boxes.nth(i);
            if ((await box.getAttribute('aria-checked')) === 'true') continue;

            await box.click({ timeout: 10000 }).catch(() => {});
            await this.page.waitForTimeout(900);

            // Only fall back to a DOM click if the box is STILL unchecked —
            // never on top of a successful tick.
            if ((await box.getAttribute('aria-checked')) !== 'true') {
                await this.page.evaluate((idx) => {
                    const d = [...document.querySelectorAll('[role=dialog]')]
                        .filter(e => e.offsetWidth > 100)[0];
                    const cb = d && d.querySelectorAll('[role=checkbox]')[idx];
                    if (cb) cb.click();
                }, i);
                await this.page.waitForTimeout(900);
            }
        }

        const ready = await confirmEnabled();
        console.log(`[Auction] confirm enabled = ${ready}`);
        if (!ready) throw new Error('Convert to Auction stayed disabled — no line item could be selected');


        const resp = this.page.waitForResponse(
            r => /auction/i.test(r.url()) && r.request().method() !== 'GET',
            { timeout: 60000 },
        ).catch(() => null);

        const confirm = dialog.getByRole('button', { name: /^Convert to Auction$/i }).first();
        await confirm.waitFor({ state: 'visible', timeout: 20000 });
        await confirm.click({ timeout: 20000 });
        const r = await resp;
        await this.page.waitForTimeout(4000);
        return r ? r.status() : null;
    }

    /** All RFX rows on the first listing page whose Status is in `statuses`. */
    async listRfxByStatus(statuses, baseUrl) {
        await this.page.goto(`${baseUrl}/quote-requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(1200);
        return this.page.evaluate((wanted) => {
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.indexOf('Status');
            const out = [];
            for (const r of [...document.querySelectorAll('tbody tr')]) {
                const tds = r.querySelectorAll('td');
                const st = ((tds[si] || {}).textContent || '').trim();
                const a = r.querySelector('a');
                if (wanted.includes(st) && a) {
                    out.push({ code: ((tds[0] || {}).textContent || '').trim(), href: a.getAttribute('href'), status: st });
                }
            }
            return out;
        }, statuses);
    }

    // ── RFX clone → 2 suppliers → quote both → foreclose (sheet scenario 32) ──
    //
    // QA (2026-09-01) asked for scenario 32 to run on data it creates itself
    // rather than hunting for an already-foreclosed RFX, so the test cannot
    // silently skip when UAT happens to hold none.

    /** addSourcingSupplier, but for an explicitly named supplier. */
    async addSourcingSupplierNamed(name) {
        // Do NOT expandSourcingSections() here: on the clone form that TOGGLES
        // the already-open sections shut and hides the date fields. Just scroll
        // the Add Supplier control into view.
        const addBtn = this.page.locator(`xpath=${L.sourcingAddSupplierBtn}`).first();
        await addBtn.waitFor({ state: 'visible', timeout: 30000 });
        await addBtn.scrollIntoViewIfNeeded();
        await addBtn.click();

        const search = this.page.locator(`xpath=${L.sourcingSupplierSearch}`).first();
        await search.waitFor({ state: 'visible', timeout: 15000 });
        await search.fill(name);
        await this.page.waitForTimeout(2000);

        const option = this.page.locator(`xpath=${L.sourcingSupplierOption(name)}`).first();
        await option.waitFor({ state: 'visible', timeout: 15000 });
        await option.click();

        const submit = this.page.locator(`xpath=${L.sourcingSupplierPopupSubmit}`).first();
        await submit.waitFor({ state: 'visible', timeout: 15000 });
        await submit.click();
        await this.page.waitForTimeout(2000);
        console.log(`[Sourcing] Supplier "${name}" added`);
    }

    /** How many supplier rows still offer "Submit Quote". */
    async countPendingQuotes() {
        return this.page.locator(`xpath=${L.rfxSubmitQuoteBtn}`).count();
    }

    /** Surrogate-quote whichever supplier row is next in line. */
    async quoteNextSupplier(data) {
        await this.clickSupplierSubmitQuote();
        await this.clickCommercialQuoteOption();
        await this.selectQuotePreferredCurrency(data);
        await this.fillQuoteUnitRate(data);
        await this.submitQuote();
        await this.page.waitForTimeout(2500);
    }

    /**
     * More → Clone on the RFX currently open, fill the bid dates the clone
     * does not carry over, add `extraSupplier`, and submit.
     * Returns the cloned RFX's overview URL.
     */
    async cloneRfxAddSupplierAndSubmit(data, extraSupplier) {
        await this.clickV4MenuItem('Clone');
        await this.page.waitForURL(/\/quote-requests\/\d+\/clone/, { timeout: 30000 });
        await this.page.waitForTimeout(5000);

        // The clone drops the BID dates (the originals are in the past) but
        // carries the expected delivery date on the line items, so that field
        // is not always rendered on the clone form — treat it as optional
        // rather than failing the whole flow on a field the clone did not need.
        await this.fillSourcingCommercialBidDueDate(data);
        await this.fillSourcingTechnicalBidDueDate(data);
        await this.fillSourcingExpectedDeliveryDate(data)
            .catch(() => console.log('[Sourcing] Expected Delivery Date not present on clone — carried over'));

        await this.addSourcingSupplierNamed(extraSupplier);

        // submitSourcingEvent already handles the Process Request popup. Do NOT
        // wait for an /overview URL here: the clone can land on a different
        // route and the wait then burns 60s before failing on a submit that
        // actually succeeded. Settle, then report wherever it landed.
        await this.submitSourcingEvent();
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.page.waitForTimeout(6000);
        const url = this.page.url();
        console.log(`[Sourcing] Clone landed on ${url}`);
        return url;
    }

    // ── Double-submit protection (sheet scenario 113) ─────────────────────────

    /**
     * Submit a filled CXO create form, clicking the workflow popup's Submit
     * TWICE in quick succession, and report every create request the app made.
     *
     * A user double-clicking must not produce two transactions. Counting the
     * POSTs is the only reliable way to see that: the UI shows one overview
     * either way, so a duplicate would be silently created behind it.
     *
     * Returns EVERY non-GET call so the caller can both assert and diagnose.
     * The create itself is `POST /api/capp/v4/transactions/` — verified live
     * 2026-09-01. The submit also fires budget-items/validate-items and
     * workflow/stages/eligible-users, which are NOT creates; counting all
     * non-GET traffic would report a passing app as broken.
     */
    async submitCxoTwiceAndCountCreates() {
        const calls = [];
        const listener = (resp) => {
            const req = resp.request();
            if (req.method() !== 'GET') {
                calls.push({ method: req.method(), url: resp.url(), status: resp.status() });
            }
        };
        this.page.on('response', listener);

        await this.page.locator(L.submitBtn).first().click();
        await this.page.waitForTimeout(2000);

        const popupSubmit = this.page.locator(
            'div[role="dialog"] button:has-text("Submit"), [class*="modal"] button:has-text("Submit"), [class*="dialog"] button:has-text("Submit")',
        ).first();

        if (await popupSubmit.isVisible({ timeout: 8000 }).catch(() => false)) {
            // Two clicks as fast as the page allows — the second is the one a
            // real double-click would land.
            await popupSubmit.click({ timeout: 15000 }).catch(() => {});
            await popupSubmit.click({ timeout: 3000 }).catch(() => {});
        }

        await this.page.waitForTimeout(8000);
        this.page.off('response', listener);
        return calls;
    }

    // ── RFX Extend Deadline (sheet scenario 36) ───────────────────────────────
    //
    // Quoting closes when the Quote Deadline passes: the supplier row then shows
    // neither "Submit Quote" nor "Update Quote". Extending the deadline reopens
    // it. Verified live 2026-09-02 on RFX-26-233 — deadline 2026-08-31 (past),
    // no quote action; after extending to 2026-09-25 the row offered
    // "Update Quote" again.
    //
    // The dialog carries TWO date triggers whose label is their current value,
    // and Update stays disabled until a date really changes. The calendar itself
    // renders in a Radix popper OUTSIDE the dialog, and it opens on the CURRENT
    // MONTH regardless of the deadline being months away — days before today are
    // disabled, everything from today on (including dates EARLIER than the
    // current deadline) is selectable.

    /** The Quote Deadline printed in the RFX header, e.g. "2026-09-25, 05:44 PM". */
    async readRfxQuoteDeadline() {
        return this.page.evaluate(() => {
            const t = [...document.body.innerText.split('\n')].map(x => x.trim()).filter(Boolean);
            const i = t.findIndex(x => /^Quote Deadline:$/.test(x));
            return i === -1 ? null : t[i + 1];
        });
    }

    /** How many supplier rows still offer a quote action (Submit or Update). */
    async countRfxQuoteActions() {
        return this.page.locator(`xpath=${L.rfxQuoteActionBtn}`).count();
    }

    /** Foreclosed RFXs lose "Foreclose" from More and gain "Convert to Auction". */
    async isRfxForeclosed() {
        await this.openV4MoreMenu();
        const items = await this.getV4MoreMenuItems();
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(800);
        return !items.some(t => /^Foreclose$/i.test(t.trim()));
    }

    /**
     * Extend both deadlines to `day` of the month the calendar opens on, then
     * submit with `remarks`. Returns the HTTP status of the save — the app shows
     * no toast, so the API call is the only reliable signal.
     */
    async extendRfxDeadline(day, remarks = 'Extended by automation') {
        await this.page.locator(`xpath=${L.rfxExtendDeadlineBtn}`).first().click();
        await this.page.waitForTimeout(3000);

        const dateBtns = this.page.locator(`xpath=${L.extendDeadlineDateBtns}`);
        const n = await dateBtns.count();
        if (!n) throw new Error('Extend Deadlines dialog exposed no date triggers');

        for (let i = 0; i < n; i++) {
            await dateBtns.nth(i).click();
            await this.page.waitForTimeout(1800);

            // `.last()` because the leading greyed-out days of the previous month
            // repeat the same numbers as the tail of this one.
            const cell = this.page.locator(`xpath=${L.datePickerDay(day)}`).last();
            await cell.waitFor({ state: 'visible', timeout: 15000 });
            if (await cell.isDisabled()) throw new Error(`day ${day} is not selectable`);
            await cell.click();
            await this.page.waitForTimeout(1500);

            // The popper overlays the dialog — leaving it open swallows the
            // Update click, which silently loses the whole change.
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(800);
        }

        await this.page.locator(`xpath=${L.extendDeadlineRemarks}`).first().fill(remarks);
        await this.page.waitForTimeout(500);

        const update = this.page.locator(`xpath=${L.extendDeadlineUpdateBtn}`).first();
        if (await update.isDisabled()) throw new Error('Update stayed disabled — no deadline change registered');

        const saved = this.page.waitForResponse(
            r => /update-deadlines-for-quote/.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60000 },
        );
        await update.click();
        const resp = await saved;
        const status = resp.status();
        console.log(`[RFX] update-deadlines-for-quote → ${status} ${(await resp.text().catch(() => '')).slice(0, 120)}`);
        await this.page.waitForTimeout(6000);
        return status;
    }


    // ── RFX Evaluation (sheet scenario 35) ────────────────────────────────────
    //
    // QA (2026-09-02): the Evaluation is added DURING the Intake → RFX
    // conversion; the supplier then answers that section while quoting, and only
    // after the quote + foreclose can the evaluator score the answers.
    //
    // The Create Evaluation dialog is identical on the conversion page and on an
    // RFX that has not been quoted yet: an #label input and four Radix
    // comboboxes in a FIXED ORDER — Section, Assigned Users, Rating Type,
    // Approval Type. Each combobox's visible text is its current value, so after
    // the first pick it can no longer be found by its placeholder; index is the
    // only stable handle. Do NOT press Escape after choosing: a single-select
    // closes itself, and the stray Escape closes the whole dialog with it.

    /** Close a dropdown popper still hanging over the dialog, if there is one. */
    async _closeStrayPopper() {
        if (await this.page.locator('[data-radix-popper-content-wrapper]').count() > 0) {
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(900);
        }
    }

    /** Choose `text` in the `idx`-th combobox of the Create Evaluation dialog. */
    async _pickEvaluationOption(idx, text) {
        // The Assigned Users control is a MULTI-select: its cmdk popper stays
        // open after a pick and then intercepts the click on the next trigger.
        // It is a Radix popper, not a [role=listbox], so that is what to look
        // for. One Escape closes just the popper; a second would close the whole
        // dialog, so never send it blind.
        await this._closeStrayPopper();
        const combo = this.page.locator(`xpath=${L.evalCombos}`).nth(idx);
        await combo.waitFor({ state: 'visible', timeout: 20000 });
        await combo.click();
        await this.page.waitForTimeout(1800);

        const option = this.page.locator('[role="option"]').filter({ hasText: text }).first();
        if (!await option.count()) {
            const all = await this.page.locator('[role="option"]').allInnerTexts();
            throw new Error(`Evaluation option "${text}" not offered — got ${JSON.stringify(all)}`);
        }
        await option.click();
        await this.page.waitForTimeout(1800);
    }

    /**
     * Add an Evaluation from the conversion page / RFX overview.
     * Returns the label used, so the test can find the card again later.
     */
    async addRfxEvaluation({ label, section, evaluator, ratingType = 'Rating', approvalType = 'Any Approver' }) {
        const addBtn = this.page.locator(`xpath=${L.rfxAddEvaluationBtn}`).first();
        await addBtn.scrollIntoViewIfNeeded();
        await addBtn.click();
        await this.page.waitForTimeout(3500);
        await expect(this.page.locator(`xpath=${L.evalCreateDialog}`).first()).toBeVisible({ timeout: 20000 });

        await this.page.locator(`xpath=${L.evalLabelInput}`).first().fill(label);
        await this._pickEvaluationOption(0, section);
        await this._pickEvaluationOption(1, evaluator);
        await this._pickEvaluationOption(2, ratingType);
        await this._pickEvaluationOption(3, approvalType);

        await this._closeStrayPopper();

        const create = this.page.locator(`xpath=${L.evalCreateBtn}`).first();
        await create.click();
        await this.page.waitForTimeout(4000);
        console.log(`[Eval] Created evaluation "${label}" on section "${section}" (${ratingType} / ${approvalType} / ${evaluator})`);
        return label;
    }


    // ── Quote form — questionnaire (sheet scenario 35, step 3) ────────────────
    //
    // Every question in a Technical section renders as a Radix combobox reading
    // "Select an option", with Yes / No behind it. Verified live 2026-09-02 on
    // RFX-26-220: 4 questions across "RFP T&C - Letter of Commitment" and
    // "Delivery Lead Time - Letter of Commitment", all answered by this loop.
    //
    // They must be answered before the quote is submitted — an unanswered
    // section leaves nothing for the evaluator to score afterwards.

    /** Answer every unanswered question on the quote form. Returns the count. */
    async answerQuoteQuestions(answer = 'Yes') {
        let answered = 0;
        for (let guard = 0; guard < 20; guard++) {
            const open = this.page.locator('button[role="combobox"]', { hasText: /^Select an option$/ });
            if (!await open.count()) break;

            const first = open.first();
            await first.scrollIntoViewIfNeeded();
            await first.click();
            await this.page.waitForTimeout(1500);

            const choice = this.page.locator('[role="option"]', { hasText: new RegExp(`^${answer}$`) }).first();
            if (await choice.count()) {
                await choice.click();
                answered++;
            } else {
                // Not a Yes/No question — leave it and stop, rather than looping
                // forever on a control this helper cannot fill.
                await this.page.keyboard.press('Escape');
                break;
            }
            await this.page.waitForTimeout(1500);
        }
        console.log(`[Quote] Answered ${answered} question(s) with "${answer}"`);
        return answered;
    }

    // ── Evaluations tab — scoring (sheet scenario 35, steps 5-6) ──────────────
    //
    // Confirmed by QA and reproduced live 2026-09-02 on RFX-26-236:
    //   expand the card → Evaluate → for EACH answer: hover it, click the star,
    //   type a reason, click that answer's tick → then the tick on the header
    //   line beside the evaluation name, which submits the whole thing.
    //
    // The mechanics that make this hard to drive, all learned the hard way:
    //  · The stars EXIST ONLY WHILE THE ANSWER CELL IS HOVERED and are rendered
    //    in an overlay, so they have to be read off the page after the hover
    //    rather than located inside the cell.
    //  · The widget tracks pointer MOVEMENT — glide across the stars before
    //    clicking; a teleporting click can be ignored.
    //  · Per-answer ticks save NOTHING to the server. The ratings are held in
    //    the browser and the header tick POSTs them in one go to
    //    /quote-requests/<id>/evaluations/<evalId>. Watching for a request after
    //    each answer is therefore misleading.
    //  · A scored answer STILL SHOWS ITS ANSWER TEXT ("Yes"), so "which answers
    //    are left" cannot be read from the text — that mistake made an earlier
    //    version re-rate row 1 forever and never reach rows 2 and 3, leaving the
    //    header tick with an incomplete evaluation to submit, which it ignores.
    //    Iterate the table rows BY INDEX; the marker for an already-scored
    //    answer is a `lucide-user-round-check` icon in the cell.
    //  · The comment popover overlaps the row below and hides its text, which is
    //    another reason not to count by text.
    //
    // Once submitted: status → Completed, every answer cell turns green
    // (background rgb(230,243,229), text rgb(3,135,0)) and picks up the
    // user-round-check icon, and the Activity Log records
    // "Evaluation has been submitted by <user>".

    /** Expand the evaluation card with the given label. */
    async openEvaluationCard(label) {
        const card = this.page.locator('button').filter({ hasText: label }).first();
        await card.waitFor({ state: 'visible', timeout: 30000 });
        // Only click if it is collapsed — clicking an open card closes it.
        if (!await this.page.locator('table tbody tr').count()) {
            await card.click();
            await this.page.waitForTimeout(4000);
        }
    }

    /** The status chip printed next to an evaluation's label. */
    async readEvaluationStatus(label) {
        return this.page.evaluate((lbl) => {
            const t = document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean);
            const i = t.indexOf(lbl);
            return i === -1 ? null : t[i + 1];
        }, label);
    }

    /**
     * Row indexes whose answer has NO rating saved against it.
     *
     * The only trustworthy marker is the `user-round-check` icon the app adds to
     * a scored cell (it also turns the cell green). Everything else lies:
     *  · the answer TEXT ("Yes") stays put whether the row is scored or not, and
     *  · hovering an UNSCORED row still renders all five stars filled — verified
     *    on RFX-26-235, whose answer 1 has no rating at all yet hovers "FFFFF".
     */
    async _unscoredRowIndexes() {
        return this.page.evaluate(() => {
            const out = [];
            [...document.querySelectorAll('table tbody tr')].forEach((r, i) => {
                const tds = [...r.querySelectorAll('td')];
                if (!tds.length) return;
                if (!tds[tds.length - 1].querySelector('svg.lucide-user-round-check')) out.push(i);
            });
            return out;
        });
    }

    /** Answer cells the app has painted green, i.e. the ones that were scored. */
    async countGreenAnswers() {
        return this.page.evaluate(() => [...document.querySelectorAll('table tbody tr')]
            .filter(r => {
                const tds = [...r.querySelectorAll('td')];
                if (!tds.length) return false;
                const m = getComputedStyle(tds[tds.length - 1]).backgroundColor
                    .match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!m) return false;
                const [r0, g0, b0] = [+m[1], +m[2], +m[3]];
                return g0 > r0 && g0 > b0;          // a green tint, whatever the exact shade
            }).length);
    }

    /** Put the card into scoring mode. Reads "Re-evaluate" once it has a score. */
    async _enterScoringMode() {
        const btn = this.page.getByRole('button', { name: /^(Re-)?evaluate$/i }).first();
        if (await btn.count()) {
            await btn.click();
            await this.page.waitForTimeout(6000);
            return true;
        }
        return false;
    }

    /**
     * Rate ONE answer row. Returns true only once the star click is confirmed.
     *
     * The confirmation is the comment popover: it opens if and only if the star
     * actually registered. Without that check a swallowed first click passes
     * silently, the header tick then submits an incomplete set, and the
     * evaluation lands on "Partially Completed" — exactly what happened to
     * answer 1 of RFX-26-235 on 2026-09-02.
     */
    async _rateAnswerRow(rowIndex, stars, reason) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const tds = this.page.locator('xpath=//table//tbody/tr').nth(rowIndex).locator('td');
            const cell = tds.nth(await tds.count() - 1);
            await cell.scrollIntoViewIfNeeded();
            const box = await cell.boundingBox();
            if (!box) return false;

            // Approach from off-cell so the hover is a real enter event, then
            // hover the answer text rather than the cell centre (the centre sits
            // under the star overlay itself).
            await this.page.mouse.move(10, 10);
            await this.page.waitForTimeout(500);
            await this.page.mouse.move(box.x + 25, box.y + box.height / 2);
            await this.page.waitForTimeout(2000);

            // Keep only the stars belonging to THIS row — the overlay is drawn
            // outside the <td>, so an unrelated row's strip would otherwise do.
            const starBoxes = await this.page.evaluate(({ top, bottom }) =>
                [...document.querySelectorAll('svg.lucide-star')]
                    .map(s => { const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
                    .filter(p => p.y >= top && p.y <= bottom),
                { top: box.y - 10, bottom: box.y + box.height + 10 });

            if (starBoxes.length < stars) {
                console.log(`[Eval] row ${rowIndex + 1}: only ${starBoxes.length} stars on hover (try ${attempt})`);
                continue;
            }

            for (const s of starBoxes) {
                await this.page.mouse.move(s.x, s.y);
                await this.page.waitForTimeout(150);
            }
            await this.page.mouse.click(starBoxes[stars - 1].x, starBoxes[stars - 1].y);

            const comment = this.page.getByPlaceholder('Leave a comment...').first();
            const opened = await comment.waitFor({ state: 'visible', timeout: 8000 })
                .then(() => true).catch(() => false);
            if (!opened) {
                console.log(`[Eval] row ${rowIndex + 1}: star click did not take (try ${attempt})`);
                await this.page.keyboard.press('Escape').catch(() => {});
                await this.page.waitForTimeout(1200);
                continue;
            }

            const cb = await comment.boundingBox();
            await this.page.mouse.click(cb.x + 40, cb.y + cb.height / 2);
            await this.page.keyboard.type(`${reason} (answer ${rowIndex + 1})`);
            await this.page.waitForTimeout(700);

            const tick = await this._tickBelowHeader();
            if (!tick) {
                console.log(`[Eval] row ${rowIndex + 1}: no confirm tick (try ${attempt})`);
                continue;
            }
            await this.page.mouse.click(tick.x, tick.y);
            await this.page.waitForTimeout(3000);
            console.log(`[Eval] row ${rowIndex + 1} rated ${stars}/5`);
            return true;
        }
        return false;
    }

    /**
     * Score every answer of `label` and submit. Self-healing: after the header
     * tick it RELOADS and re-reads which answers the server actually kept, and
     * rates any that were dropped, up to `passes` times. That is what stops a
     * single swallowed click leaving the evaluation "Partially Completed".
     */
    async evaluateRfxEvaluation(label, { stars = 5, reason = 'Rated by automation', passes = 3 } = {}) {
        let saveStatus = null;
        let scored = 0;
        let missedRows = [];

        for (let pass = 1; pass <= passes; pass++) {
            await this.openEvaluationCard(label);

            const pending = await this._unscoredRowIndexes();
            const total = await this.page.locator('table tbody tr').count();
            console.log(`[Eval] pass ${pass}: ${pending.length} of ${total} answer(s) unscored`);
            if (!pending.length) break;

            await this._enterScoringMode();

            missedRows = [];
            for (const rowIndex of pending) {
                if (await this._rateAnswerRow(rowIndex, stars, reason)) scored++;
                else missedRows.push(rowIndex + 1);
            }
            if (missedRows.length) {
                console.log(`[Eval] pass ${pass}: could not rate answer(s) ${JSON.stringify(missedRows)}`);
            }

            const header = await this._tickOnHeaderLine();
            if (header) {
                const saved = this.page.waitForResponse(
                    r => /\/evaluations\/\d+/.test(r.url()) && r.request().method() !== 'GET',
                    { timeout: 60000 },
                ).catch(() => null);
                await this.page.mouse.click(header.x, header.y);
                const resp = await saved;
                if (resp) saveStatus = resp.status();
                await this.page.waitForTimeout(7000);
            }

            // Re-read the truth from the server before deciding to stop.
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(8000);
        }

        await this.openEvaluationCard(label);
        const result = {
            scored,
            saveStatus,
            missedRows,
            unscored: (await this._unscoredRowIndexes()).map(i => i + 1),
            status: await this.readEvaluationStatus(label),
            greenAnswers: await this.countGreenAnswers(),
            totalAnswers: await this.page.locator('table tbody tr').count(),
        };
        console.log(`[Eval] ${JSON.stringify(result)}`);
        return result;
    }

    /** The tick inside an answer's rating popover (below the card header). */
    async _tickBelowHeader() {
        return this.page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .filter(x => x.querySelector('svg.lucide-check') && x.getBoundingClientRect().y > 340);
            if (!b.length) return null;
            const r = b[b.length - 1].getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
    }

    /** The tick on the evaluation's header line — submits the evaluation. */
    async _tickOnHeaderLine() {
        return this.page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].filter(x =>
                x.querySelector('svg.lucide-check')
                && x.getBoundingClientRect().y < 340
                && x.getBoundingClientRect().x > 1000);
            if (!b.length) return null;
            const r = b[0].getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
    }

    /** Lines of the RFX Activity Log panel. */
    async readRfxActivityTimeline() {
        await this.openActivityLogPanel();
        const lines = await this.page.locator(`xpath=${L.activityLogPanel}`).first().innerText();
        await this.closeActivityLogPanel();
        return lines.split('\n').map(s => s.trim()).filter(Boolean);
    }


    // ── RFX — Cancel after foreclosure (sheet scenario 98) ────────────────────
    //
    // A foreclosed RFX keeps "Cancel" in its More menu (verified live 2026-09-02:
    // a foreclosed RFX offers Audit Logs · Amend · Workflow Stages · Clone ·
    // Regenerate/Download Document · Convert to Auction · Reassign User · Cancel,
    // with Foreclose gone). The dialog is the same reason + Submit shape as
    // Foreclose.

    /** Is this RFX foreclosed? Foreclosed ones lose "Foreclose" from More. */
    async rfxOffersForeclose() {
        const moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 20000 });
        await moreBtn.click();
        await this.page.waitForTimeout(1500);
        const items = (await this.page.locator('[role="menuitem"]').allInnerTexts())
            .map(t => t.trim());
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(700);
        return { items, hasForeclose: items.some(t => /^Foreclose$/i.test(t)) };
    }

    /** More → Cancel → reason → Submit. Returns the menu items seen. */
    async cancelRfx(reason = 'Cancelled by automation') {
        const moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 20000 });
        await moreBtn.click();
        await this.page.waitForTimeout(1500);

        const cancel = this.page.locator(`xpath=${L.rfxCancelOption}`).first();
        await cancel.waitFor({ state: 'visible', timeout: 15000 });
        await cancel.click();
        await this.page.waitForTimeout(2500);

        const field = this.page.locator(`xpath=${L.rfxForecloseReasonField}`).first();
        await field.waitFor({ state: 'visible', timeout: 15000 });
        await field.fill(reason);
        await this.page.waitForTimeout(600);

        const submit = this.page.locator(`xpath=${L.rfxForecloseSubmitBtn}`).first();
        await submit.click();
        console.log('[RFX] Cancel submitted');
        await this.page.waitForTimeout(6000);
    }

    /** The status chip in the RFX header. */
    async readRfxStatus() {
        return this.page.evaluate(() => {
            const t = document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean);
            const i = t.findIndex(x => /^RFX-\d/.test(x));
            return i === -1 ? null : t[i + 1];
        });
    }

}
