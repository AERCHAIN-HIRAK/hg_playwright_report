import { expect } from '@playwright/test';
import { intakeCreate_Locators } from './allLocators';
import fs from 'fs';

export class intakeCreateActions{

    constructor(page) {

        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });  

    }

    async takeScreenshot(name) {

        const timestamp = Date.now();

        await this.page.screenshot({

            path: `screenshots/${name}_${timestamp}.png`,
            fullPage: true

        });
        
    }

    async screenshot(name = 'NSE_V4_Dashboard') {

        await this.takeScreenshot(name);
    
    }

    async clickIntakeTab() {

        await this.page.locator(intakeCreate_Locators.intakeTab).click()

    }

    async assertIntakeTab() {

        await expect(this.page).toHaveURL(/intakes/);

    }

    async screenshot(name = 'NSE_INTAKE_Listing') {

        await this.takeScreenshot(name);
    
    }

    async clickIntakeCreateButton() {

        await this.page.locator(intakeCreate_Locators.intakeCreateButton).click();

    }

    async assertIntakeCreatePage() {

        await expect(this.page).toHaveURL(/intakes\/create/);

    }

    async selectIntakeTemplate(data) {

        // The template dropdown defaults to "NSEF Intakes".
        // Options have no title attr — match by exact visible text.
        await this.page.locator(intakeCreate_Locators.intakeTemplate).click();
        const opt = this.page.getByRole('option', { name: data.template, exact: true });
        await opt.waitFor({ state: 'visible', timeout: 20000 });
        await opt.click();
        // Wait for the form to re-render with the new template's fields
        await this.page.waitForTimeout(800);

    }

    async screenshot(name = 'NSE_INTAKE_Create_Page') {

        await this.takeScreenshot(name);
    
    }

    async closeAskAieraBar() {

        await this.page.locator(intakeCreate_Locators.askAieraCross).click();

    }

    async expandAllSections() {

        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(400);

        // Click button[1] inside EVERY section-header div so all sections expand,
        // not just the globally-first one.  Selector without outer (...)[n] wrapping
        // matches the first button within each individual div[@class='flex gap-[7px]'].
        const expandBtns = this.page.locator("//div[@class='flex gap-[7px]']/button[1]");
        const count = await expandBtns.count();
        for (let i = 0; i < count; i++) {
            const btn = expandBtns.nth(i);
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await btn.click();
                await this.page.waitForTimeout(250);
            }
        }
        await this.page.waitForTimeout(600);

    }

    async screenshot(name = 'NSE_INTAKE_CREATE_Expanded_Sections') {

        await this.takeScreenshot(name);
    
    }

    async typeIntakeTitle(data) {

        await this.page.locator(intakeCreate_Locators.intakeTitle).fill(data.title);

    }

    async typeIntakeSummary(data) {

        await this.page.locator(intakeCreate_Locators.intakeSummary).fill(data.summary);

    }

    async selectDropdown(dropdown, search, option, value, useLast = false) {

        await this.page.locator(dropdown).click();
        const searchBox = this.page.locator(search);
        if (useLast) {

            await searchBox.last().fill(value);

        } else {

            await searchBox.fill(value);

        }
        await this.page.locator(option).click();

    }

    // ── Entity Test 2 — new required field in "NSE - Intake + CXO" template ────
    async selectIntakeEntityTest2() {

        const el = this.page.locator(intakeCreate_Locators.intakeEntityTest2).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeEntityTest2Opt);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    async selectIntakeDepartment(data) {

        await this.selectDropdown(

            intakeCreate_Locators.intakeDepartment,
            intakeCreate_Locators.intakeDepartmentSearch,
            intakeCreate_Locators.intakeDepartmentOpt,
            data.department

        );

    }

    async selectIntakeCurrency(data) {

        await this.selectDropdown(

            intakeCreate_Locators.intakeCurrency,
            intakeCreate_Locators.intakeCurrencySearch,
            intakeCreate_Locators.intakeCurrencyOpt,
            data.currency,
            true // because you used .last()

        );

    }

    async selectIntakeVertical(data) {

        await this.page.locator(intakeCreate_Locators.intakeVertical).click();
        // Dropdown has a search box — type to filter the long options list
        const searchBox = this.page.locator('[placeholder="Search..."]').last();
        await searchBox.waitFor({ state: 'visible', timeout: 5000 });
        await searchBox.fill(data.vertical);
        // Wait for the exact-title option and click it
        const opt = this.page.locator(`[title="${data.vertical}"]`).first();
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    async selectIntakeProjectName() {

        const el = this.page.locator(intakeCreate_Locators.intakeProjectName).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeProjectNameOpt).click();

    }

    async selectIntakeNatureOfExpense(data) {

        await this.page.locator(intakeCreate_Locators.intakeNatureOfExpense).click();
        // Use exact title selector so the right option is always picked
        const opt = this.page.locator(`[title="${data.natureOfExpense}"]`).first();
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    async selectIntakeGLAccount() {

        const el = this.page.locator(intakeCreate_Locators.intakeGLAccount).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeGLAccountOpt).click();

    }

    async selectIntakeProfitCenter() {

        const el = this.page.locator(intakeCreate_Locators.intakeProfitCenter).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeProfitCenterOpt).click();

    }

    async selectIntakeCostcenter() {

        const el = this.page.locator(intakeCreate_Locators.intakeCostCentre).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeCostCentreOpt).click();

    }

    async selectIntakeSEBICatagorization() {

        const el = this.page.locator(intakeCreate_Locators.intakeSEBIcategorization).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeSEBIcategorizationOpt).click();

    }

    async selectIntakeSubSegment() {

        const el = this.page.locator(intakeCreate_Locators.intakeSubSegment).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeSubSegmentOpt).click();

    }

    async selectIntakeProjectCategory() {

        const el = this.page.locator(intakeCreate_Locators.intakeProjectCategory).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.click();
        await this.page.locator(intakeCreate_Locators.intakeProjectCategoryOpt).click();

    }

    async selectIntakeCXOType(data) {

        await this.page.locator(intakeCreate_Locators.intakeCXOtype).click();
        // Use exact title selector so the right option is always picked.
        // Timeout raised to 15 s — late-in-session tests can be slower to render.
        const opt = this.page.locator(`[title="${data.CXOtype}"]`).first();
        await opt.waitFor({ state: 'visible', timeout: 15000 });
        await opt.click();

    }

    async selectIntakeCXOTransaction(data) {

        const el = this.page.locator(intakeCreate_Locators.intakeCXOtransaction).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await this.selectDropdown(

            intakeCreate_Locators.intakeCXOtransaction,
            intakeCreate_Locators.intakeCXOtransactionSearch,
            intakeCreate_Locators.intakeCXOtransactionOpt,
            data.CXOtransaction,
            true

        );

    }

    // Basic Information — Purchase Related Services (dropdown)
    async selectIntakePurchaseRelatedServices() {
        await this.page.waitForTimeout(300);
        const el = this.page.locator(intakeCreate_Locators.intakePurchaseRelatedServices).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Purchase Related Services combobox not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakePurchaseRelatedServicesOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // Basic Information — Single Vendor Procurement (dropdown)
    async selectIntakeSingleVendorProcurement() {
        await this.page.waitForTimeout(300);
        const el = this.page.locator(intakeCreate_Locators.intakeSingleVendorProcurement).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Single Vendor Procurement combobox not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeSingleVendorProcurementOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // Basic Information — Single Vendor Justification (text input — only enabled for certain SV Procurement selections)
    async typeIntakeSingleVendorJustification(data) {
        await this.page.waitForTimeout(300);
        const el = this.page.locator(intakeCreate_Locators.intakeSingleVendorJustification).first();
        if (!(await el.isVisible({ timeout: 4000 }).catch(() => false))) return;
        // Field is disabled when SV Procurement selection does not require justification — skip silently
        const isEnabled = await el.isEnabled({ timeout: 2000 }).catch(() => false);
        if (!isEnabled) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await el.fill(data.singleVendorJustification);
    }

    // Basic Information — Type of Procurement (dropdown)
    async selectIntakeTypeOfProcurement() {
        await this.page.waitForTimeout(300);
        const el = this.page.locator(intakeCreate_Locators.intakeTypeOfProcurement).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Type of Procurement combobox not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeTypeOfProcurementOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // Basic Information — Financial Year (dropdown)
    async selectIntakeFinancialYear() {
        await this.page.waitForTimeout(300);
        const el = this.page.locator(intakeCreate_Locators.intakeFinancialYear).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Financial Year combobox not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeFinancialYearOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // ── Generic calendar-popup date picker ───────────────────────────────────
    // Call this AFTER clicking the trigger that opens the calendar popup.
    // Navigates to the correct month/year then clicks the day cell.
    // @param {string} dateStr  "YYYY-MM-DD"
    async _pickCalendarDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const LONG  = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        const SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

        // Wait for the calendar popup to render (extra time for slow renders)
        await this.page.waitForTimeout(1000);

        // ── Navigate to the correct month/year (up to 48 arrow clicks) ──────
        for (let attempt = 0; attempt < 48; attempt++) {

            // Use a JS text-walker (plus button text fallback) to find the month caption.
            const caption = await this.page.evaluate(({ longNames, shortNames }) => {
                const pattern = new RegExp(
                    '(' + [...longNames, ...shortNames].join('|') + ')\\s+\\d{4}'
                );
                // Primary: walk text nodes
                const walker = document.createTreeWalker(
                    document.body, NodeFilter.SHOW_TEXT, null
                );
                let node;
                while ((node = walker.nextNode())) {
                    const text = (node.textContent || '').trim();
                    if (text.length < 30 && pattern.test(text)) return text;
                }
                // Fallback: check button and span element textContent
                const candidates = document.querySelectorAll('button, span, div[role="heading"]');
                for (const el of candidates) {
                    // Only look at leaf-ish elements (not huge containers)
                    if ((el.childElementCount === 0 || el.childElementCount <= 2)) {
                        const text = (el.textContent || '').trim();
                        if (text.length < 30 && pattern.test(text)) return text;
                    }
                }
                return '';
            }, { longNames: LONG, shortNames: SHORT });

            const onTarget =
                (caption.includes(LONG[month - 1]) || caption.includes(SHORT[month - 1]))
                && caption.includes(String(year));
            if (onTarget) break;

            // Decide direction: forward or backward
            let goNext = true;
            if (caption) {
                for (let m = 0; m < 12; m++) {
                    if (caption.includes(LONG[m]) || caption.includes(SHORT[m])) {
                        const capYear  = parseInt((caption.match(/\d{4}/) || ['0'])[0]);
                        const capMonth = m + 1;
                        goNext = capYear < year || (capYear === year && capMonth < month);
                        break;
                    }
                }
            }
            // If caption is still empty, fall back to calculating from today's date
            if (!caption) {
                const now   = new Date();
                const nowY  = now.getFullYear();
                const nowM  = now.getMonth() + 1;
                goNext = nowY < year || (nowY === year && nowM < month);
            }

            const navBtn = this.page.locator(
                goNext
                    ? 'button[name="next-month"], button[aria-label*="next month" i], ' +
                      'button[aria-label*="Next Month"], .react-datepicker__navigation--next, ' +
                      'button[class*="next-month"], button[class*="nextMonth"], ' +
                      'button[aria-label="Go to next month"]'
                    : 'button[name="previous-month"], button[aria-label*="previous month" i], ' +
                      'button[aria-label*="Prev Month"], .react-datepicker__navigation--previous, ' +
                      'button[class*="prev-month"], button[class*="prevMonth"], ' +
                      'button[aria-label="Go to previous month"]'
            ).first();

            if (await navBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                await navBtn.click();
                await this.page.waitForTimeout(350);
            } else {
                // On first attempt with empty caption: wait more and retry before giving up
                if (attempt === 0 && !caption) {
                    console.log('[INFO] Calendar not yet rendered on attempt 0 — waiting extra 1 s');
                    await this.page.waitForTimeout(1000);
                    continue;
                }
                console.log(`[WARN] Calendar nav button not found — stopped at: "${caption}"`);
                break;
            }
        }

        // ── Click the target day ─────────────────────────────────────────────
        // Use JS to find and click the exact day button to avoid ambiguous XPath matches
        const clicked = await this.page.evaluate((targetDay) => {
            const allBtns = Array.from(document.querySelectorAll('button'));
            for (const btn of allBtns) {
                const txt = (btn.textContent || '').trim();
                if (txt === String(targetDay) &&
                    !btn.disabled &&
                    btn.getAttribute('aria-disabled') !== 'true') {
                    btn.click();
                    return true;
                }
            }
            return false;
        }, day);

        if (!clicked) {
            // Fallback: XPath click
            await this.page.locator(
                `//button[not(@disabled)][not(@aria-disabled='true')][normalize-space(.)='${day}']`
            ).first().click({ timeout: 8000 });
        }

        await this.page.waitForTimeout(400);
    }

    // Basic Information — Contract Start Date (calendar picker)
    async fillIntakeContractStartDate(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeContractStartDate).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Contract Start Date trigger not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this._pickCalendarDate(data.contractStartDate);
        // Ensure the calendar closes before opening the next date picker
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
    }

    // Basic Information — Contract End Date (calendar picker)
    async fillIntakeContractEndDate(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeContractEndDate).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Contract End Date trigger not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this._pickCalendarDate(data.contractEndDate);
        // Ensure the calendar closes before moving on
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
    }

    // "Business Objective of Purchase" section — CodeX Editor (ce-paragraph contenteditable)
    // This rich-text block is separate from the textbox fields inside "Purchase Business Case".
    // Editor.js does not accept .fill() — must click to focus then keyboard.type().
    async typeIntakeBusinessObjectiveRichText(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeBusinessObjectiveRichText).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) {
            console.log('[WARN] Business Objective rich-text block not found — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this.page.waitForTimeout(300);
        // Select-all then type to replace any existing content
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.type(data.businessObjective);
    }

    // Purchase Business Case — Business Objective of Purchase
    async typeIntakeBusinessObjective(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeBusinessObjectivePurchase).first();
        const count = await el.count();
        if (count === 0) {
            console.log('[WARN] Business Objective field not found — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click({ force: true });
        await el.clear();
        await el.fill(data.businessObjective);
    }

    // Purchase Business Case — Details of Items/Services
    async typeIntakeItemsDetails(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeItemsDetailsPurchase).first();
        const count = await el.count();
        if (count === 0) {
            console.log('[WARN] Items Details field not found — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click({ force: true });
        await el.clear();
        await el.fill(data.itemsDetails);
    }

    // Purchase Business Case — Necessity of the purchase
    async typeIntakeNecessityPurchase(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeNecessityPurchase).first();
        const count = await el.count();
        if (count === 0) {
            console.log('[WARN] Necessity of Purchase field not found — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click({ force: true });
        await el.clear();
        await el.fill(data.necessityPurchase);
    }

    // Purchase Business Case — Delivery timelines (calendar picker)
    async fillIntakeDeliveryTimeline(data) {
        const el = this.page.locator(intakeCreate_Locators.intakeDeliveryTimeline).first();
        if (!(await el.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log('[WARN] Delivery Timeline trigger not visible — skipping');
            return;
        }
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this._pickCalendarDate(data.deliveryTimeline);
        // Ensure the calendar closes after selecting the date
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
    }

    // CXO mandatory: "Are any existing applications/infrastructure available..."
    async selectIntakeCXOAppInfra() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXOAppInfra).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXOAppInfraOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        // Small stability pause — cmdk options can briefly detach during list render
        await this.page.waitForTimeout(200);
        await opt.click();
    }

    // CXO mandatory: "Whether said request is a business requirement or compliance requirement..."
    async selectIntakeCXOBizReq() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXOBizReq).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXOBizReqOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // CXO mandatory: "Any minimum commitment period for the services/arrangement?"
    async selectIntakeCXOMinCommit() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXOMinCommit).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXOMinCommitOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // PoP required: "Whether all the vendors are MeitY empaneled CSPs' data centers holding valid STQC..."
    async selectIntakeCXOMeitY() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXOMeitY).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXOMeitYOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    // PoP required: "Whether the services/arrangements will require transfer or sharing of NSE data with the vendor"
    async selectIntakeCXONSEDataTransfer() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXONSEDataTransfer).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXONSEDataTransferOpt);
        if (!(await opt.isVisible({ timeout: 5000 }).catch(() => false))) {
            await el.click(); // retry once if dropdown didn't open
        }
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();
    }

    // PoP required: SEBI Circular RPwD Act 2016 — Rights of Persons with Disabilities compliance
    async selectIntakeCXORPwD() {
        const el = this.page.locator(intakeCreate_Locators.intakeCXORPwD).first();
        if (!(await el.isVisible({ timeout: 5000 }).catch(() => false))) return;
        await el.scrollIntoViewIfNeeded();
        await el.click();
        const opt = this.page.locator(intakeCreate_Locators.intakeCXORPwDOpt);
        await opt.waitFor({ state: 'visible', timeout: 8000 });
        await opt.click();
    }

    async addIntakeLineItemRow() {

        await this.page.locator(intakeCreate_Locators.intakeAddLineRow).click();

    }

    async selectIntakeItem(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemName).click();
        await this.page.locator(intakeCreate_Locators.intakeItemNameSearch).fill(data.itemName);
        await this.page.locator(intakeCreate_Locators.intakeItemNameOpt).click();

    }

    async typeIntakeItemDesc(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemDesc).click();
        await this.page.locator(intakeCreate_Locators.intakeItemDescField).fill(data.itemDesc);

    }

    async typeIntakeItemQTY(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemQty).dblclick({force:true})
        await this.page.locator(intakeCreate_Locators.intakeItemQtyField).fill(data.itemQty)

}

    async selectIntakeItemUOM() {

        await this.page.locator(intakeCreate_Locators.intakeItemUOM).dblclick();
        await this.page.waitForTimeout(800);
        await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');

    }

    async selectIntakeItemDelAdd() {

        await this.page.locator(intakeCreate_Locators.intakeItemDelAdd).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemDelAddOpt).click();

    }

    async selectIntakeItemBillAdd() {

        await this.page.locator(intakeCreate_Locators.intakeItemBilAdd).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemBilAddOpt).click();
        // Wait for the cell editor to commit before the next column is activated
        await this.page.waitForTimeout(500);

    }

    // Row-level Nature of Expense (new required column in NSE - Intake + CXO template)
    async selectIntakeItemLineNOE() {

        await this.page.locator(intakeCreate_Locators.intakeItemLineNOE).dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineNOEOpt);
        await opt.waitFor({ state: 'visible', timeout: 20000 });
        await opt.click();

    }

    // Row-level Nature of Expense (new required column in NSE - Intake + CXO template)
    async selectIntakeItemLineGLA() {

        const el = this.page.locator(intakeCreate_Locators.intakeItemLineGLA).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineGLAOpt);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    // Row-level GL Account (new required column in NSE - Intake + CXO template)
    async selectIntakeItemLineGLAcct() {

        const el = this.page.locator(intakeCreate_Locators.intakeItemLineGLAcct).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineGLAcctOpt);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    // Row 1 — Profit Center (col [9])
    async selectIntakeItemLineSeg() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSeg).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSegOpt);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 1 — Cost Center (col [10])
    async selectIntakeItemLineCostCenter() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineCostCenter).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineCostCenterOpt);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 1 — SEBI Categorization (col [11])
    async selectIntakeItemLineSEBICat() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSEBICat).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSEBICatOpt);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 1 — Sub Segment (col [12])
    async selectIntakeItemLineSubSeg() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSubSeg).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSubSegOpt);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 1 — Project Category (col [13])
    async selectIntakeItemLineProjectCat() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineProjectCat).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineProjectCatOpt);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    async typeIntakeItemSuggPrice(data) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        const cell = this.page.locator(intakeCreate_Locators.intakeItemSuggPrice);
        await cell.scrollIntoViewIfNeeded();
        // Retry dblclick up to 3 times — the input field may take a moment to appear
        for (let i = 0; i < 3; i++) {
            await cell.dblclick({ force: true });
            await this.page.waitForTimeout(400);
            const field = this.page.locator(intakeCreate_Locators.intakeItemSuggPriceField);
            if (await field.isVisible({ timeout: 3000 }).catch(() => false)) {
                await field.fill(data.itemSuggestedPrice);
                return;
            }
            // Close any stray popup before retrying
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(300);
        }
        // Final attempt with generous timeout
        await cell.dblclick({ force: true });
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPriceField)
            .fill(data.itemSuggestedPrice, { timeout: 15000 });
    }

    async selectIntakeItem1(data) {

        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
        const el1 = this.page.locator(intakeCreate_Locators.intakeItemName1);
        await el1.scrollIntoViewIfNeeded();
        await el1.click();

        const search1 = this.page.locator(intakeCreate_Locators.intakeItemNameSearch1);
        await search1.waitFor({ state: 'visible', timeout: 10000 });
        await search1.fill(data.itemName);
        await this.page.locator(intakeCreate_Locators.intakeItemNameOpt1).click();

    }

    async typeIntakeItemDesc1(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemDesc1).click();
        await this.page.locator(intakeCreate_Locators.intakeItemDescField).fill(data.itemDesc);

    }

    async typeIntakeItemQTY1(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemQty1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemQtyField).fill(data.itemQty);

    }

    async selectIntakeItemUOM1() {

        await this.page.locator(intakeCreate_Locators.intakeItemUOM1).dblclick();
        await this.page.waitForTimeout(800);
        await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');

    }

    async selectIntakeItemDelAdd1() {

        await this.page.locator(intakeCreate_Locators.intakeItemDelAdd1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemDelAddOpt1).click();

    }

    async selectIntakeItemBillAdd1() {

        await this.page.locator(intakeCreate_Locators.intakeItemBilAdd1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemBilAddOpt1).click();
        await this.page.waitForTimeout(500);

    }

    // Row 2 — Project Name (position [6] relative offset for row 2)
    async selectIntakeItemLineNOE1() {

        await this.page.locator(intakeCreate_Locators.intakeItemLineNOE1).dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineNOEOpt1);
        await opt.waitFor({ state: 'visible', timeout: 20000 });
        await opt.click();

    }

    // Row 2 — Nature of Expense
    async selectIntakeItemLineGLA1() {

        const el = this.page.locator(intakeCreate_Locators.intakeItemLineGLA1).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineGLAOpt1);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    // Row 2 — GL Account
    async selectIntakeItemLineGLAcct1() {

        const el = this.page.locator(intakeCreate_Locators.intakeItemLineGLAcct1).first();
        if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) return;
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineGLAcctOpt1);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();

    }

    // Row 2 — Profit Center (col [28])
    async selectIntakeItemLineSeg1() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSeg1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSegOpt1);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 2 — Cost Center (col [29])
    async selectIntakeItemLineCostCenter1() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineCostCenter1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineCostCenterOpt1);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            try { await this.page.keyboard.press('Escape'); } catch { /* page may already be closed */ }
        }
    }

    // Row 2 — SEBI Categorization (col [30])
    async selectIntakeItemLineSEBICat1() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSEBICat1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSEBICatOpt1);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 2 — Sub Segment (col [31])
    async selectIntakeItemLineSubSeg1() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineSubSeg1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineSubSegOpt1);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    // Row 2 — Project Category (col [32])
    async selectIntakeItemLineProjectCat1() {
        const el = this.page.locator(intakeCreate_Locators.intakeItemLineProjectCat1).first();
        if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) return;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(400);
        await el.scrollIntoViewIfNeeded();
        await el.dblclick({ force: true });
        const opt = this.page.locator(intakeCreate_Locators.intakeItemLineProjectCatOpt1);
        try {
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
        } catch {
            await this.page.keyboard.press('Escape');
        }
    }

    async typeIntakeItemSuggPrice1(data) {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500); // Extra time for prior dropdown to fully close
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPrice1).scrollIntoViewIfNeeded();
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPrice1).dblclick();
        // Timeout raised: inline-edit input may take a moment to mount after dblclick
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPriceField).fill(data.itemSuggestedPrice1, { timeout: 15000 });
    }

    async typeIntakePotentialSuppliers(data) {

        await this.page.locator(intakeCreate_Locators.intakePotentialSuppliers).fill(data.potentialSuppliers);

    }

    async typeIntakeNotes(data) {

        await this.page.locator(intakeCreate_Locators.intakeNotes).fill(data.notes);

    }

    async screenshot(name = 'NSE_INTAKE_CREATE_All_Data_Filled') {

        await this.takeScreenshot(name);
    
    }

    async clickIntakeSubmitButton() {

        // Always capture the form state before Submit for debugging
        await this.takeScreenshot('before_submit_fullpage');
        await this.page.locator(intakeCreate_Locators.intakeSubmit).click();
        await this.page.waitForTimeout(2000);
        await this.takeScreenshot('after_submit_fullpage');

    }

    async screenshot(name = 'NSE_INTAKE_CREATE_Approval_Popup') {

        await this.takeScreenshot(name);
    
    }

    async clickIntakeProceed() {

        await this.page.locator(intakeCreate_Locators.intakeProceed).click();

    }

    async screenshot(name = 'NSE_INTAKE_CREATE_Purchaser_Popup') {

        await this.takeScreenshot(name);
    
    }

    async clickIntakePurAsignDropdown() {

        await this.page.locator(intakeCreate_Locators.intakePurAsignDropdown).click();

    }

    async clickIntakePurAsignOpt() {

        await this.page.locator(intakeCreate_Locators.intakepurAsignOpt).click();

    }

    async clickIntakeFinalSubmit() {

        await this.page.locator(intakeCreate_Locators.intakeFinalSubmit).click();

    }

    async assertIntakeOverviewPage() {

        await expect(this.page).toHaveURL(/overview/, { timeout: 15000 });
        await expect(this.page).toHaveURL(/overview/);

    }

    async assertIntakeDetailsAreDisplayedCorrect(data) {

        const title = await this.page.locator(intakeCreate_Locators.intakeOverviewTitle).textContent();
        expect((title || '').trim()).toBe(data.title);

  
        const summary = await this.page.locator(intakeCreate_Locators.intakeOverviewSummary).textContent();
        expect((summary || '').trim()).toBe(data.summary);
  
        const total = (Number(data.itemQty) * Number(data.itemSuggestedPrice)) + 
                      (Number(data.itemQty) * Number(data.itemSuggestedPrice1));

        const totalText = await this.page.locator(intakeCreate_Locators.intakeOverviewTotal).textContent();
        const storedTotal = Number((totalText || '').replace(/[₹,\s]/g, ''));

        expect(storedTotal).toBe(total);

        const supplier = await this.page.locator(intakeCreate_Locators.intakeOverviewPotentialSupplier).textContent();
        expect((supplier || '').trim()).toBe(data.potentialSuppliers);

        const notes = await this.page.locator(intakeCreate_Locators.intakeOverviewNotes).textContent();
        expect((notes || '').trim()).toBe(data.notes);

    }

    async screenshot(name = 'NSE_INTAKE_Overview_Page') {

        await this.takeScreenshot(name);
    
    }

}