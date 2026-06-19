import { expect } from '@playwright/test';
import { NSEFoundation_Locators as L } from './NSEFoundationLocators';
import { intakeCreate_Locators as IL } from './allLocators';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// NSEFoundationActions
// Covers: Login → CXO create → (Direct PO → GRN → Invoice → Workflow)
// ─────────────────────────────────────────────────────────────────────────────

export class NSEFoundationActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
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
        await this.page.goto(`${data.loginUrl}/`);
        await this.page.waitForLoadState('domcontentloaded');
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
        await this.page.waitForFunction(() => {
            const vals = [...document.querySelectorAll('textarea')].map(t => (t.value || '').trim());
            return vals.includes('Header Details') && vals.includes('Suggested Suppliers');
        }, { timeout: 25000 });
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
        // Click the ^ expand-all toggle anchored to the title field container
        await this.page.locator(`xpath=${L.cxoExpandAllSections}`).click();
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

    async selectCxoCurrency(data) {
        await this._selectDropdown(L.cxoCurrency, data.cxo.currency);
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

        // A "Workflow Summary" confirmation popup appears — click its Submit button
        const popupSubmit = this.page.locator('div[role="dialog"] button:has-text("Submit"), [class*="modal"] button:has-text("Submit"), [class*="dialog"] button:has-text("Submit")').first();
        if (await popupSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
            await popupSubmit.click();
            await this.page.waitForTimeout(2000);
        }
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
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(2000);
    }

    /** Wait for the Approve button, reloading up to `maxReloads` times if stale.
     *  Returns true if it appeared. Stops early if `stopWhen()` resolves true. */
    async _waitForApproveButton({ maxReloads = 5, tag = 'Workflow', stopWhen = null } = {}) {
        const approveBtn = this.page.locator(`xpath=${L.approveBtn}`).first();
        for (let attempt = 0; attempt <= maxReloads; attempt++) {
            if (await approveBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
                return true;
            }
            if (stopWhen && await stopWhen()) return false;
            if (attempt < maxReloads) {
                console.log(`[${tag}] Approve button not visible for 4s — reloading (${attempt + 1}/${maxReloads})...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' });
                await this.page.waitForTimeout(2000);
            }
        }
        return false;
    }

    /** More → Reassign Workflow Approver → NSEF Support Admin → reason → Submit.
     *  Generic across CXO/award (same v4 header More menu). */
    async reassignWorkflowApprover(reason = 'Reassigned for automated testing', tag = 'Workflow') {
        const moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
        if (!(await moreBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log(`[${tag}] No More button — cannot reassign.`);
            return false;
        }
        await moreBtn.click();
        await this.page.waitForTimeout(800);

        const opt = this.page.locator(`xpath=${L.reassignApproverOption}`).first();
        if (!(await opt.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log(`[${tag}] Reassign option not available.`);
            await this.page.keyboard.press('Escape');
            return false;
        }
        await opt.click();
        await this.page.waitForTimeout(1500);

        const userDropdown = this.page.locator(`xpath=${L.reassignUserDropdown}`).first();
        await userDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await userDropdown.click({ force: true });
        await this.page.waitForTimeout(600);
        const adminOpt = this.page.locator(L.reassignAdminOption).first();
        await adminOpt.waitFor({ state: 'visible', timeout: 10000 });
        await adminOpt.click();
        await this.page.waitForTimeout(400);

        const reasonField = this.page.locator(`xpath=${L.reassignReasonField}`).first();
        await reasonField.waitFor({ state: 'visible', timeout: 5000 });
        await reasonField.fill(reason);
        await this.page.locator(`xpath=${L.reassignSubmitBtn}`).first().click();
        console.log(`[${tag}] Workflow approver reassigned to NSEF Support Admin`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
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

    async selectIntakeCurrency(data) {
        const trigger = this.page.locator(IL.intakeCurrency).first();
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator(IL.intakeCurrencySearch).last();
            await searchBox.fill(data.intake.currency);
            const opt = this.page.locator(IL.intakeCurrencyOpt).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.intake.currency, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
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
        const trigger = this.page.locator(IL.intakeCXOtransaction).first();
        if (!(await trigger.isVisible({ timeout: 3000 }).catch(() => false))) return;
        let selected = false;
        while (!selected) {
            await this._openDropdown(trigger, { hasSearch: true });
            const searchBox = this.page.locator(IL.intakeCXOtransactionSearch).last();
            await searchBox.fill(data.savedCxo.code);
            await this.page.waitForTimeout(800);
            const opt = this.page.locator(`xpath=(//div[@role='option'])[1]`).first();
            await opt.waitFor({ state: 'visible', timeout: 10000 });
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.savedCxo.code, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
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

    async fillIntakeLineItem(data) {
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

        // QTY — click cell, type 100 directly via keyboard, Tab to confirm
        await this.page.locator(IL.intakeItemQty).click();
        await this.page.waitForTimeout(500);
        await this.page.keyboard.type('100');
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
            const expected = parseInt(data.intake.itemQty) * parseInt(data.intake.itemSuggestedPrice);
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
        // Step 1: Proceed through Workflow Summary
        const proceedBtn = this.page.locator(IL.intakeProceed).first();
        await proceedBtn.waitFor({ state: 'visible', timeout: 15000 });
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
                await this.page.reload({ waitUntil: 'domcontentloaded' });
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
                await this.page.reload({ waitUntil: 'domcontentloaded' });
                continue;
            }

            // No action button — the page state may be stale, or the step is
            // assigned to a different approver. Reload-retry first, then reassign
            // the workflow approver to NSEF Support Admin before giving up.
            noActionStreak++;
            if (noActionStreak <= 2) {
                console.log(`[Intake] No action button at step ${i + 1} — reloading (${noActionStreak}/2)...`);
                await this.page.reload({ waitUntil: 'domcontentloaded' });
                continue;
            }
            if (noActionStreak === 3) {
                console.log(`[Intake] Still no action button — reassigning approver to NSEF Support Admin...`);
                if (await this.reassignWorkflowApprover('Reassigned for automated testing', 'Intake')) {
                    continue;
                }
            }
            console.log(`[Intake] No action button visible at step ${i + 1} after retries — stopping.`);
            break;
        }
    }

    async assertIntakeStatusReleased() {
        await expect(this.page.locator(`xpath=${L.cxoReleasedStatus}`).first())
            .toBeVisible({ timeout: 20000 });
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

        const dataPath = path.resolve('pages/NSEFoundationData.json');
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

        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
        const dataPath = path.resolve('pages/NSEFoundationData.json');
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const code = current.savedIntake?.code;
        if (!code || code === 'unknown') {
            throw new Error('No savedIntake.code in NSEFoundationData.json — run the Intake create test first.');
        }
        return code;
    }

    // Reads savedRequisition fresh from disk (same staleness reason as above)
    getSavedRequisition() {
        const dataPath = path.resolve('pages/NSEFoundationData.json');
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        const saved = current.savedRequisition;
        if (!saved?.url) {
            throw new Error('No savedRequisition in NSEFoundationData.json — run the Award test first.');
        }
        return saved;
    }

    // Reads savedSourcingEvent fresh from disk (same staleness reason as above)
    getSavedSourcingEvent() {
        const dataPath = path.resolve('pages/NSEFoundationData.json');
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

    // After "Send for Sourcing" submit, the RFX header shows a "Pending Approval"
    // badge plus a direct Approve button (same shape as the CXO flow). It only
    // goes live (suppliers can Submit Quote) once approved. Mirror the CXO pattern:
    // each round, stop when no longer Pending Approval; otherwise find Approve
    // (reloading if stale), and if it never shows, reassign the approver to NSEF
    // Support Admin and retry, then approve.
    async approveSourcingUntilReleased(comments = 'Approved by automation') {
        const maxStages = 10;
        for (let i = 0; i < maxStages; i++) {
            if (!(await this._isSourcingPendingApproval(2000))) {
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

    async selectQuotePreferredCurrency(data) {
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
                await searchBox.fill(data.sourcing.preferredCurrency);
                await this.page.waitForTimeout(400);
            }
            const opt = this.page.locator(`xpath=//div[@role='option'][contains(normalize-space(.),'${data.sourcing.preferredCurrency}')]`).first();
            if (!(await opt.isVisible({ timeout: 3000 }).catch(() => false))) {
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(300);
                continue;
            }
            await opt.click();
            await this.page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 0, { timeout: 3000 }).catch(() => {});
            try { await expect(trigger).toContainText(data.sourcing.preferredCurrency, { timeout: 4000 }); selected = true; } catch { await this.page.waitForTimeout(300); }
        }
        console.log(`[Quote] Preferred Currency set to ${data.sourcing.preferredCurrency}`);
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
        // Status may need a reload to reflect
        for (let i = 0; i < 4; i++) {
            const quoted = await this.page.locator(`xpath=${L.quotedStatusBadge}`).first()
                .isVisible({ timeout: 5000 }).catch(() => false);
            if (quoted) {
                console.log('[Quote] Sourcing status is Quoted');
                return;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);
        }
        await expect(this.page.locator(`xpath=${L.quotedStatusBadge}`).first()).toBeVisible({ timeout: 10000 });
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
            await this.page.reload({ waitUntil: 'domcontentloaded' });
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

    async clickAwardBackArrow() {
        const back = this.page.locator(`xpath=${L.awardBackArrow}`).first();
        await back.waitFor({ state: 'visible', timeout: 15000 });
        await back.click();
        console.log('[Award] Clicked back button beside award code');
        await this.page.waitForTimeout(2000);
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
            await this.page.reload({ waitUntil: 'domcontentloaded' });
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

        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
    async waitForPrStatus(status, { intervalMs = 10000, maxAttempts = 60 } = {}) {
        for (let i = 0; i < maxAttempts; i++) {
            const badge = this.page.locator(`xpath=${L.prStatusBadge(status)}`).first();
            if (await badge.isVisible().catch(() => false)) {
                console.log(`[PR] Status is "${status}".`);
                return;
            }
            console.log(`[PR] Status not "${status}" yet — reloading in ${intervalMs / 1000}s (${i + 1}/${maxAttempts})...`);
            await this.page.waitForTimeout(intervalMs);
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(3000);
        }
        throw new Error(`PR status did not reach "${status}" after ${maxAttempts} reloads`);
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

        const dataPath = path.resolve('pages/NSEFoundationData.json');
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

        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(2500);
    }

    // Approve the PO through all stages until the "Create" dropdown appears
    // (status → Submitted). Reassigns approver to NSEF Support Admin if Approve
    // disappears before completion (same pattern as CXO/award).
    async approvePoUntilSubmitted(comments = 'Approved by automation') {
        const createReady = async (t = 1000) =>
            await this.page.locator(`xpath=${L.poCreateBtn}`).first().isVisible({ timeout: t }).catch(() => false);

        for (let i = 0; i < 10; i++) {
            if (await createReady()) {
                console.log(`[PO] Approvals complete (Create available) after ${i} approval(s).`);
                return;
            }
            const approveVisible = await this.page.locator(`xpath=${L.poApproveBtn}`).first()
                .isVisible({ timeout: 4000 }).catch(() => false);
            if (approveVisible) {
                console.log(`[PO] Approving stage ${i + 1}...`);
                await this._approveWithNotes(comments, 'PO');
            } else {
                if (await createReady()) return;
                console.log('[PO] Approve missing — reassigning approver to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'PO'))) break;
            }
        }
        if (!(await createReady())) throw new Error('PO did not reach approved/Submitted (Create) state');
    }

    async clickPoCreateGrn() {
        await this.page.locator(`xpath=${L.poCreateBtn}`).first().click();
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
        const dataPath = path.resolve('pages/NSEFoundationData.json');
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.savedGrn = { code, id: idMatch ? idMatch[1] : null, url };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[GRN] Saved to NSEFoundationData.json → savedGrn.code = "${code}"`);
        return code;
    }

    // ── PO → Invoice (create, match the PO's GRN, approve until Pending Sync) ──

    // Open the saved PO directly (re-login on the capp domain if redirected).
    async openSavedPurchaseOrder(data) {
        const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
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
        await this.page.locator(`xpath=${L.poCreateBtn}`).first().click();
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
        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
    async matchGrnInItemMatching() {
        const fix = this.page.locator(`xpath=${L.invoiceFixBtn}`).first();
        await fix.scrollIntoViewIfNeeded();
        await fix.click();
        console.log('[INV] Clicked FIX → Item Matching');
        await this.page.waitForTimeout(2000);

        // GRN created for this PO
        const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
        const grnCode = fresh.savedGrn && fresh.savedGrn.code;

        const addGrn = this.page.locator(`xpath=${L.itemMatchingAddGrnField}`).first();
        await addGrn.waitFor({ state: 'visible', timeout: 10000 });
        await addGrn.click();
        await this.page.waitForTimeout(1000);
        const opt = grnCode
            ? this.page.locator(`xpath=${L.itemMatchingGrnOption(grnCode)}`).first()
            : this.page.locator(`xpath=//li[@role='option'][contains(normalize-space(.),'INW-')]`).first();
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
        console.log(`[INV] Selected GRN ${grnCode || '(first)'} in Item Matching`);
        await this.page.waitForTimeout(800);

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
        await this.page.waitForURL(/\/invoices\/\d+/, { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log(`[INV] Invoice created → ${this.page.url()}`);
    }

    // Approve the invoice through all stages until it reaches "Pending Sync".
    // After the final approval the Approve button disappears and the status flips
    // to "Pending Sync" — the terminal state for this test. (It only becomes
    // "Accounted" after an external acknowledgement, which is out of scope.)
    async approveInvoiceUntilPendingSync(comments = 'Approved by automation') {
        const pendingSync = async (t = 1500) =>
            await this.page.locator(`xpath=${L.invoicePendingSyncStatus}`).first().isVisible({ timeout: t }).catch(() => false);
        const pendingApproval = async (t = 1500) =>
            await this.page.locator(`xpath=${L.invoicePendingApprovalStatus}`).first().isVisible({ timeout: t }).catch(() => false);

        for (let i = 0; i < 12; i++) {
            if (await pendingSync()) {
                console.log(`[INV] Status Pending Sync after ${i} approval(s).`);
                return;
            }
            const approveVisible = await this.page.locator(`xpath=${L.poApproveBtn}`).first()
                .isVisible({ timeout: 4000 }).catch(() => false);
            if (approveVisible) {
                console.log(`[INV] Approving stage ${i + 1}...`);
                await this._approveWithNotes(comments, 'INV');
                continue;
            }
            // No Approve button. If still Pending Approval, the approver isn't us —
            // reassign and retry. Otherwise the badge may be mid-transition; reload.
            if (await pendingApproval(1500)) {
                console.log('[INV] Approve missing while Pending Approval — reassigning to NSEF Support Admin...');
                if (!(await this.reassignWorkflowApprover('Reassigned for automated testing', 'INV'))) break;
                continue;
            }
            console.log('[INV] No Approve button and not Pending Approval — reloading to re-check status...');
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(3000);
        }
        if (!(await pendingSync())) throw new Error('Invoice did not reach Pending Sync status');
    }

    async assertInvoicePendingSync() {
        await expect(this.page.locator(`xpath=${L.invoicePendingSyncStatus}`).first())
            .toBeVisible({ timeout: 15000 });
        console.log('[INV] Status is Pending Sync');
    }

    async saveInvoiceCode() {
        const url = this.page.url();
        const bodyText = await this.page.locator('body').textContent() ?? '';
        const m = bodyText.match(/Invoice-[A-Z0-9\-]*\d+/i);
        const code = m ? m[0].trim() : null;
        const idMatch = url.match(/\/invoices\/(\d+)/);
        const dataPath = path.resolve('pages/NSEFoundationData.json');
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
        const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
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
        const resp = await this.page.request.post(data.invoice.ackUrl, {
            headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
            data: payload,
        });
        const body = await resp.text().catch(() => '');
        console.log(`[ACK] Response ${resp.status()}: ${body.slice(0, 300)}`);
        expect(resp.ok(), `Ack API returned ${resp.status()}: ${body}`).toBeTruthy();
        await this.page.waitForTimeout(2000); // let the backend apply the status change
        return resp;
    }

    /** Open the invoice created by the last flow (capp domain — re-login if redirected). */
    async openSavedInvoice(data) {
        const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
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
    async assertInvoiceAccounted() {
        const accounted = async (t = 2000) =>
            await this.page.locator(`xpath=${L.invoiceAccountedStatus}`).first().isVisible({ timeout: t }).catch(() => false);
        for (let i = 0; i < 6; i++) {
            if (await accounted(2000)) { console.log('[INV] Status is Accounted'); return; }
            console.log(`[INV] Not Accounted yet — reloading (${i + 1}/6)...`);
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(3000);
        }
        await expect(this.page.locator(`xpath=${L.invoiceAccountedStatus}`).first())
            .toBeVisible({ timeout: 5000 });
    }

}
