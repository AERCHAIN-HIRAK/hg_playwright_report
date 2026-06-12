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

    // ── CXO Approval Workflow ─────────────────────────────────────────────────

    async _approveStage(comments = 'Approved by automation') {
        await this.page.locator("//button[normalize-space(text())='Approve']").first().click();
        await this.page.locator('[placeholder="Enter your comments..."]')
            .waitFor({ state: 'visible', timeout: 10000 });
        await this.page.locator('[placeholder="Enter your comments..."]').fill(comments);
        await this.page.locator("(//button[normalize-space(text())='Approve'])[2]").click();
        await this.page.waitForTimeout(1500);
    }

    async approveAllStages(comments = 'Approved by automation') {
        const maxStages = 10;
        const maxReloads = 5;
        for (let i = 0; i < maxStages; i++) {
            // Wait for the Approve button — if it doesn't show within 4s the page
            // state is stale (button exists in real UI), so reload and retry
            const approveBtn = this.page.locator("//button[normalize-space(text())='Approve']").first();
            let visible = false;
            for (let attempt = 0; attempt <= maxReloads; attempt++) {
                visible = await approveBtn.waitFor({ state: 'visible', timeout: 4000 })
                    .then(() => true).catch(() => false);
                if (visible) break;

                // If status already moved to Released, no button is expected — stop retrying
                const released = await this.page.locator(
                    '//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]'
                ).first().isVisible({ timeout: 1000 }).catch(() => false);
                if (released) break;

                if (attempt < maxReloads) {
                    console.log(`[CXO] Approve button not visible for 4s at stage ${i + 1} — reloading (${attempt + 1}/${maxReloads})...`);
                    await this.page.reload({ waitUntil: 'domcontentloaded' });
                    await this.page.waitForTimeout(2000);
                }
            }

            if (!visible) {
                console.log(`[CXO] Approve button not visible at stage ${i + 1} after ${maxReloads} reloads — stopping.`);
                break;
            }

            console.log(`[CXO] Approving stage ${i + 1}...`);
            await this._approveStage(comments);
            await this.page.waitForTimeout(2000);

            // Reload to get latest status
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);

            const released = await this.page.locator(
                '//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]'
            ).first().isVisible({ timeout: 3000 }).catch(() => false);

            if (released) {
                console.log(`[CXO] Status Released after ${i + 1} approval(s).`);
                break;
            }
        }
    }

    async assertCxoStatusReleased() {
        await expect(this.page.locator(
            '//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]'
        ).first()).toBeVisible({ timeout: 20000 });
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
        for (let i = 0; i < maxIter; i++) {
            await this.page.waitForTimeout(2000);

            // Check Released/Active
            const released = await this.page.locator(
                `xpath=//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]`
            ).first().isVisible({ timeout: 3000 }).catch(() => false);
            if (released) {
                console.log(`[Intake] Status Released/Active after ${i} step(s).`);
                break;
            }

            // Approve
            const approveBtn = this.page.locator(IL.intakeApprove1).first();
            if (await approveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
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

            console.log(`[Intake] No action button visible at step ${i + 1} — stopping.`);
            break;
        }
    }

    async assertIntakeStatusReleased() {
        await expect(this.page.locator(
            `xpath=//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]`
        ).first()).toBeVisible({ timeout: 20000 });
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

    async _approveAwardOnce(comments) {
        const approveBtn = this.page.locator("//button[normalize-space(text())='Approve']").first();
        await approveBtn.click();
        const commentsField = this.page.locator('[placeholder="Enter your comments..."]');
        if (await commentsField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await commentsField.fill(comments);
            await this.page.locator("(//button[normalize-space(text())='Approve'])[2]").click();
        }
        await this.page.waitForTimeout(2000);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(2000);
    }

    // Opens Workflow Stages, reads the OVERALL workflow badge (not per-stage
    // statuses — completed stages also say "Completed"), closes by clicking outside.
    // The popup sometimes opens empty while its data loads — close and reopen.
    async _isWorkflowCompleted() {
        for (let attempt = 0; attempt < 4; attempt++) {
            const stagesBtn = this.page.locator(`xpath=${L.workflowStagesBtn}`).first();
            await stagesBtn.waitFor({ state: 'visible', timeout: 20000 });
            await stagesBtn.click();
            await this.page.waitForTimeout(1500);

            const badge = this.page.locator(`xpath=${L.workflowOverallStatusBadge}`).first();
            const hasData = await badge.waitFor({ state: 'visible', timeout: 8000 })
                .then(() => true).catch(() => false);

            if (!hasData) {
                console.log(`[Award] Workflow Stages popup is empty — closing and reopening (${attempt + 1}/4)...`);
                await this.page.mouse.click(5, 500);
                await this.page.waitForTimeout(2000);
                continue;
            }

            const statusText = (await badge.textContent() ?? '').trim();
            const completed = /completed/i.test(statusText);

            // Close the popup by clicking outside it
            await this.page.mouse.click(5, 500);
            await this.page.waitForTimeout(1000);

            console.log(`[Award] Workflow Stages → overall status: "${statusText}" → ${completed ? 'Completed' : 'NOT completed'}`);
            return completed;
        }
        throw new Error('Workflow Stages popup never loaded its data');
    }

    async reassignAwardApprover(reason = 'Reassigned for automated testing') {
        const moreBtn = this.page.locator(`xpath=${L.rfxMoreBtn}`).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
        await moreBtn.click();
        await this.page.waitForTimeout(800);

        const opt = this.page.locator(`xpath=${L.reassignApproverOption}`).first();
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();
        await this.page.waitForTimeout(1500);

        // Pick "NSEF Support Admin" in the user picker
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
        console.log('[Award] Workflow approver reassigned to NSEF Support Admin');
        await this.page.waitForTimeout(2500);
    }

    async completeAwardApprovals(comments = 'Approved by automation') {
        // Each round: read the OVERALL status in Workflow Stages. Only "Completed"
        // ends the loop (the badge shows e.g. "Active" otherwise — never
        // "Not Completed"). Anything else → look for Approve; if no Approve
        // button, reassign to NSEF Support Admin, then approve.
        const maxRounds = 12;
        for (let round = 0; round < maxRounds; round++) {
            if (await this._isWorkflowCompleted()) return;

            const approveBtn = this.page.locator("//button[normalize-space(text())='Approve']").first();
            const visible = await approveBtn.waitFor({ state: 'visible', timeout: 6000 })
                .then(() => true).catch(() => false);

            if (!visible) {
                console.log('[Award] No Approve button — reassigning approver to NSEF Support Admin...');
                await this.reassignAwardApprover();
                await this.page.reload({ waitUntil: 'domcontentloaded' });
                await this.page.waitForTimeout(2000);
                await approveBtn.waitFor({ state: 'visible', timeout: 15000 });
            }

            console.log(`[Award] Approving (round ${round + 1})...`);
            await this._approveAwardOnce(comments);
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

}
