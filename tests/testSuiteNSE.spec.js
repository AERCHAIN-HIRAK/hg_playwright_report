import { test } from '@playwright/test';
import { intakeCreateActions } from '../pages/actions';
import data from '../pages/IntakeCreateData.json';

test.describe('Aerchain - NSE', () => {

    test.beforeEach(async ({ page }) => {

        await page.goto('https://nse-capp-v4-uat.aerchain.io');

    });

    test('Intake Create @Positive', async ({ page }) => {

        const NSEIntakeCreate = new intakeCreateActions(page);

        await page.setViewportSize({ width: 1800, height: 720 });

        // await NSEIntakeCreate.takeScreenshot('NSE_Intake_Dashboard');

        await NSEIntakeCreate.clickIntakeTab();
        await NSEIntakeCreate.assertIntakeTab();

        // await NSEIntakeCreate.takeScreenshot('NSE_Intake_Listing');

        await NSEIntakeCreate.clickIntakeCreateButton();
        await NSEIntakeCreate.assertIntakeCreatePage();

        // await NSEIntakeCreate.takeScreenshot('NSE_Intake_Create');

        await NSEIntakeCreate.closeAskAieraBar();
        await NSEIntakeCreate.expandAllSections();

        // await NSEIntakeCreate.takeScreenshot('NSE_Intake_Create_Expanded');

        await NSEIntakeCreate.typeIntakeTitle(data);
        await NSEIntakeCreate.typeIntakeSummary(data);

        await NSEIntakeCreate.selectIntakeDepartment(data);
        await NSEIntakeCreate.selectIntakeCurrency(data);
        await NSEIntakeCreate.selectIntakeVertical();
        await NSEIntakeCreate.selectIntakeProjectName();
        await NSEIntakeCreate.selectIntakeNatureOfExpense();
        await NSEIntakeCreate.selectIntakeGLAccount();
        await NSEIntakeCreate.selectIntakeProfitCenter();
        await NSEIntakeCreate.selectIntakeCostcenter();
        await NSEIntakeCreate.selectIntakeSEBICatagorization();
        await NSEIntakeCreate.selectIntakeSubSegment();
        await NSEIntakeCreate.selectIntakeProjectCategory();
        await NSEIntakeCreate.selectIntakeCXOType();
        await NSEIntakeCreate.selectIntakeCXOTransaction(data);

        await NSEIntakeCreate.addIntakeLineItemRow();

        await NSEIntakeCreate.selectIntakeItem(data);
        await NSEIntakeCreate.typeIntakeItemDesc(data);
        await NSEIntakeCreate.typeIntakeItemQTY(data);
        await NSEIntakeCreate.selectIntakeItemUOM();
        await NSEIntakeCreate.selectIntakeItemDelAdd();
        await NSEIntakeCreate.selectIntakeItemBillAdd();
        await NSEIntakeCreate.typeIntakeItemSuggPrice(data);

        await NSEIntakeCreate.addIntakeLineItemRow();

        await NSEIntakeCreate.selectIntakeItem1(data);
        await NSEIntakeCreate.typeIntakeItemDesc1(data);
        await NSEIntakeCreate.typeIntakeItemQTY1(data);
        await NSEIntakeCreate.selectIntakeItemUOM1();
        await NSEIntakeCreate.selectIntakeItemDelAdd1();
        await NSEIntakeCreate.selectIntakeItemBillAdd1();
        await NSEIntakeCreate.typeIntakeItemSuggPrice1(data);

        await NSEIntakeCreate.typeIntakePotentialSuppliers(data);
        await NSEIntakeCreate.typeIntakeNotes(data);

        // await NSEIntakeCreate.takeScreenshot('NSE_All_Data_Filled');

        await NSEIntakeCreate.clickIntakeSubmitButton();

        // await NSEIntakeCreate.takeScreenshot('NSE_Approval_Popup');

        await NSEIntakeCreate.clickIntakeProceed();

        // await NSEIntakeCreate.takeScreenshot('NSE_Purchaser_Popup');

        await NSEIntakeCreate.clickIntakePurAsignDropdown();
        await NSEIntakeCreate.clickIntakePurAsignOpt();

        await NSEIntakeCreate.clickIntakeFinalSubmit();

        await NSEIntakeCreate.assertIntakeOverviewPage();
        await NSEIntakeCreate.assertIntakeDetailsAreDisplayedCorrect(data);

        // await NSEIntakeCreate.takeScreenshot('NSE_Overview_Page');

    });

});