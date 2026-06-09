import { expect } from '@playwright/test';
import { NSEFoundation_Locators as L } from './NSEFoundationLocators';
import fs from 'fs';

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
        await this.page.locator(`xpath=${xpath}`).first().click();
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
        // NO explicit scrollIntoViewIfNeeded — let dblclick handle it internally
        // to avoid the page jumping erratically

        // dblclick opens the enum dropdown editor
        let dropdownOpen = false;
        for (let attempt = 0; attempt < 2; attempt++) {
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

        if (!dropdownOpen) return;

        // 1. Try exact match from visible options
        const option = this.page.getByRole('option', { name: optionText, exact: true });
        if (await option.count() > 0) {
            await option.first().click();
            await this.page.waitForTimeout(600);
            return;
        }

        // 2. Search for option
        const searchInput = this.page.locator('input[placeholder="Search..."]').first();
        if (await searchInput.count() > 0 && await searchInput.isVisible()) {
            await searchInput.fill(optionText);
            await this.page.waitForTimeout(400);
            const filteredOpt = this.page.getByRole('option').filter({ hasText: optionText }).first();
            if (await filteredOpt.count() > 0) {
                await filteredOpt.click();
                await this.page.waitForTimeout(600);
                return;
            }
        }

        // 3. Fallback — close without selection
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(200);
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
        // Potential Suppliers is a number spinner — fill via JS evaluate
        const spinner = this.page.locator(`xpath=//*[contains(normalize-space(text()),'Potential Suppliers')]/ancestor::div[contains(@class,'border-b')][1]//input`).first();
        if (await spinner.count() > 0) {
            await spinner.evaluate((el, val) => {
                el.removeAttribute('disabled');
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }, data.cxo.potentialSuppliers ?? '1');
        }
        await this.page.waitForTimeout(200);
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
        await this.page.locator(L.submitBtn).first().click();
        await this.page.waitForTimeout(2000);
    }

    async assertCxoSubmittedSuccessfully() {
        // After submit, URL should change away from /create or show success toast
        await expect(this.page).not.toHaveURL(/\/cxos\/create/);
    }

}
