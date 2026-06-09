import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// NSE Foundation — CXO → Direct PO → GRN → Invoice → Workflow
//
// Uses a separate login (nsefsupport@demo.com) — overrides the shared auth.json
// ─────────────────────────────────────────────────────────────────────────────

// Clear inherited storageState so we do a fresh login for this user
test.use({ storageState: undefined });

// ── Shared helper: login + navigate to CXO create page ───────────────────────
async function loginAndOpenCxoCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    // Login
    await a.navigateToApp(data);
    await a.fillLoginEmail(data);
    await a.clickLoginContinue();
    await a.fillLoginPassword(data);
    await a.clickLoginSubmit();
    await a.assertLoggedIn();

    // Navigate to CXO → Create
    await a.clickCxoTab();
    await a.assertCxoListingPage();
    await a.clickCreateCxo();
    await a.assertCxoCreatePage();

    return a;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('CXO → Direct PO → GRN → Invoice Workflow', () => {

    test('Create CXO with all mandatory fields → verify BRF auto-populate → Submit @CXO @Smoke', async ({ page }) => {

        const a = await loginAndOpenCxoCreate(page);

        // Expand ALL sections at once (user-confirmed locator)
        await a.expandAllSections();

        // Step 3: Title and Summary
        await a.fillCxoTitle(data);
        await a.fillCxoSummary(data);

        // Steps 4–10: Header Details
        await a.selectCxoCompany();                     // Step 4: first (only) option
        await a.selectCxoDepartment(data);              // Step 5: Premises
        await a.selectCxoFunction(data);                // Step 6: Legal
        await a.selectCxoCurrency(data);                // Step 7: INR
        await a.selectCxoType(data);                    // Step 8: Non-Financial
        await a.selectCxoTransactionFlowType(data);     // Step 9: PO Based
        await a.selectCxoExpenseNature(data);           // Step 10: Non-CSR Process

        // Step 11: Basic Information mandatory fields
        await a.fillCxoStartDate(data);
        await a.fillCxoEndDate(data);
        await a.selectCxoTypeOfProcurement(data);
        await a.selectCxoFinancialYear(data);

        // Step 11 (cont): Particulars of Procurement mandatory fields
        await a.selectExistingApplications(data);
        await a.selectBusinessOrCompliance(data);
        await a.fillMinimumCommitmentPeriod(data);
        await a.selectCloudExposure(data);
        await a.selectMeitYVendors(data);
        await a.fillDetailsOtherAgency(data);
        await a.selectSebiOutsourcingCircular(data);
        await a.fillNatureOfDataShared(data);
        await a.selectRpwdCompliance(data);

        // Step 12: Add Row in Item Details
        await a.clickAddRow();                          // Step 12: Add row

        // Steps 13–23: Fill line item fields
        await a.fillItemName(data);                     // Step 13: Name 1
        await a.fillItemQty(data);                      // Step 14: 100
        await a.fillItemSuggestedPrice(data);           // Step 14: 2000
        await a.fillItemProjectName(data);              // Step 15: NA
        await a.fillItemVertical(data);                 // Step 16: Legal
        await a.fillItemGlAccount(data);                // Step 17: NA
        await a.fillItemProfitCenter(data);             // Step 18: NA
        await a.fillItemCostCenter(data);               // Step 19: NA
        await a.fillItemSebiCategorization(data);       // Step 20: NA
        await a.fillItemSubSegment(data);               // Step 21: NA
        await a.fillItemProjectCategory(data);          // Step 22: NA
        await a.fillItemNatureOfExpense(data);          // Step 23: Opex

        // Fill Potential Suppliers (mandatory field in Suggested Suppliers section)
        await a.fillPotentialSuppliers(data);

        // Step 24: Assert BRF field auto-populated with "Dont Touch"
        await a.assertBrfAutoPopulated(data);

        // Step 25: Submit
        await a.clickSubmit();
        await a.assertCxoSubmittedSuccessfully();

        await a.takeScreenshot('cxo_submitted');

    });

});
