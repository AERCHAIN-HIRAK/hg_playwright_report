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

    async screenshot(name = 'NSE_INTAKE_Create_Page') {

        await this.takeScreenshot(name);
    
    }

    async closeAskAieraBar() {

        await this.page.locator(intakeCreate_Locators.askAieraCross).click();

    }

    async expandAllSections() {

        await this.page.locator(intakeCreate_Locators.sectionExpand).waitFor({ state: 'visible' });
        await this.page.locator(intakeCreate_Locators.sectionExpand).click();

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

    async selectIntakeVertical() {

        await this.page.locator(intakeCreate_Locators.intakeVertical).click();
        await this.page.locator(intakeCreate_Locators.intakeVerticalOpt).click();

    }

    async selectIntakeProjectName() {

        await this.page.locator(intakeCreate_Locators.intakeProjectName).click();
        await this.page.locator(intakeCreate_Locators.intakeProjectNameOpt).click();

    }

    async selectIntakeNatureOfExpense() {

        await this.page.locator(intakeCreate_Locators.intakeNatureOfExpense).click();
        await this.page.locator(intakeCreate_Locators.intakeNatureOfExpenseOpt).click();

    }

    async selectIntakeGLAccount() {

        await this.page.locator(intakeCreate_Locators.intakeGLAccount).click();
        await this.page.locator(intakeCreate_Locators.intakeGLAccountOpt).click();

    }

    async selectIntakeProfitCenter() {

        await this.page.locator(intakeCreate_Locators.intakeProfitCenter).click();
        await this.page.locator(intakeCreate_Locators.intakeProfitCenterOpt).click();

    }

    async selectIntakeCostcenter() {

        await this.page.locator(intakeCreate_Locators.intakeCostCentre).click();
        await this.page.locator(intakeCreate_Locators.intakeCostCentreOpt).click();

    }

    async selectIntakeSEBICatagorization() {

        await this.page.locator(intakeCreate_Locators.intakeSEBIcategorization).click();
        await this.page.locator(intakeCreate_Locators.intakeSEBIcategorizationOpt).click();

    }

    async selectIntakeSubSegment() {

        await this.page.locator(intakeCreate_Locators.intakeSubSegment).click();
        await this.page.locator(intakeCreate_Locators.intakeSubSegmentOpt).click();

    }

    async selectIntakeProjectCategory() {

        await this.page.locator(intakeCreate_Locators.intakeProjectCategory).click();
        await this.page.locator(intakeCreate_Locators.intakeProjectCategoryOpt).click();

    }

    async selectIntakeCXOType() {

        await this.page.locator(intakeCreate_Locators.intakeCXOtype).click();
        await this.page.locator(intakeCreate_Locators.intakeCXOtypeOpt).click();

    }

    async selectIntakeCXOTransaction(data) {

        await this.selectDropdown(

            intakeCreate_Locators.intakeCXOtransaction,
            intakeCreate_Locators.intakeCXOtransactionSearch,
            intakeCreate_Locators.intakeCXOtransactionOpt,
            data.CXOtransaction,
            true

        );

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
        await this.page.locator(intakeCreate_Locators.intakeItemUOMOpt).click();

    }

    async selectIntakeItemDelAdd() {

        await this.page.locator(intakeCreate_Locators.intakeItemDelAdd).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemDelAddOpt).click();

    }

    async selectIntakeItemBillAdd() {

        await this.page.locator(intakeCreate_Locators.intakeItemBilAdd).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemBilAddOpt).click();

    }

    async typeIntakeItemSuggPrice(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemSuggPrice).scrollIntoViewIfNeeded();
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPrice).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPriceField).fill(data.itemSuggestedPrice);

    }

    async selectIntakeItem1(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemName1).scrollIntoViewIfNeeded();
        await this.page.locator(intakeCreate_Locators.intakeItemName1).click();

        await this.page.locator(intakeCreate_Locators.intakeItemNameSearch1).fill(data.itemName);
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
        await this.page.locator(intakeCreate_Locators.intakeItemUOMOpt1).click();

    }

    async selectIntakeItemDelAdd1() {

        await this.page.locator(intakeCreate_Locators.intakeItemDelAdd1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemDelAddOpt1).click();

    }

    async selectIntakeItemBillAdd1() {

        await this.page.locator(intakeCreate_Locators.intakeItemBilAdd1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemBilAddOpt1).click();

    }

    async typeIntakeItemSuggPrice1(data) {

        await this.page.locator(intakeCreate_Locators.intakeItemSuggPrice1).dblclick();
        await this.page.locator(intakeCreate_Locators.intakeItemSuggPriceField).fill(data.itemSuggestedPrice1);

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

        await this.page.locator(intakeCreate_Locators.intakeSubmit).click();

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