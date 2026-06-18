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

// ── Shared helper: login + navigate to Intake create page ────────────────────
async function loginAndOpenIntakeCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    await a.navigateToApp(data);
    await a.fillLoginEmail(data);
    await a.clickLoginContinue();
    await a.fillLoginPassword(data);
    await a.clickLoginSubmit();
    await a.assertLoggedIn();

    await a.clickIntakeTab();
    await a.clickCreateIntake();
    await a.assertIntakeCreatePage();

    return a;
}

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
        test.setTimeout(300000); // 5 min — covers create + 4 approval stages + save

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

        // Purchase Business Case mandatory fields
        await a.fillDetailsOfItemsServices(data);
        await a.fillNecessityOfPurchase(data);
        await a.selectEmergencyProcurement(data);
        await a.fillDeliveryTimeline(data);

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

        // Step 26: Approve through all workflow stages until Released
        await a.approveAllStages('Approved by automation');
        await a.assertCxoStatusReleased();
        await a.takeScreenshot('cxo_released');

        // Step 27: Save CXO code for use in Direct PO / GRN / Invoice steps
        await a.saveCxoCode();

    });

    test('Create Intake → fill all details → Submit → approve until Released @Intake @Smoke', async ({ page }) => {
        test.setTimeout(300000); // 5 min — covers create + popup + approvals

        const a = await loginAndOpenIntakeCreate(page);

        // Initial setup
        await a.closeAskAieraIfVisible();
        await a.expandIntakeSections();

        // Header Details
        await a.fillIntakeTitle(data);
        await a.fillIntakeSummary(data);
        await a.selectIntakeCompany1();               // First Company dropdown
        await a.selectIntakeCompany2();               // Second Company dropdown
        await a.selectIntakeDepartment(data);         // Premises
        await a.selectIntakeExpenseNatureApproval(data); // Non-CSR Process
        await a.selectIntakeCurrency(data);           // INR
        await a.selectIntakeFunction(data);           // Legal
        await a.selectIntakeVertical(data);           // Legal
        await a.selectIntakeProjectName();            // first available option
        await a.selectIntakeNatureOfExpense(data);    // Opex
        await a.selectIntakeGLAccount();              // first available option
        await a.selectIntakeProfitCenter();           // first available option
        await a.selectIntakeCostCenter();             // first available option
        await a.selectIntakeSEBICategorization();     // first available option
        await a.selectIntakeSubSegment();             // first available option
        await a.selectIntakeProjectCategory();        // first available option
        await a.selectIntakeCXOType(data);            // Non-Financial
        await a.selectIntakeCXOTransaction(data);     // Link to saved CXO
        await a.assertIntakeBRFAutoPopulated();       // BRF No. header → "Dont Touch"

        // Line Item — Add row → Manpower (T&M) → assert EA in UOM → Qty/Address/Price
        await a.addIntakeLineRow();
        await a.fillIntakeLineItem(data);

        await a.fillIntakePotentialSuppliers(data);

        await a.takeScreenshot('intake_before_submit');

        // Submit → handle popup
        await a.submitIntake();
        await a.completeIntakeSubmissionPopup();
        await a.takeScreenshot('intake_submitted');

        // Approve all stages until Released
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.takeScreenshot('intake_released');

        // Save Intake code for use in downstream steps
        await a.saveIntakeCode();
    });

    test('Open saved Intake from listing → Process → Send for Sourcing @Intake @Sourcing', async ({ page }) => {
        test.setTimeout(180000); // 3 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Intake listing → open the intake created in the previous test (saved code)
        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.takeScreenshot('intake_opened_from_listing');

        // Process → Send for Sourcing
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.takeScreenshot('intake_sent_for_sourcing');

        // New Sourcing event page → expand all sections
        await a.expandSourcingSections();
        await a.takeScreenshot('sourcing_sections_expanded');

        // Event Information — fill the fields not auto-populated from the Intake
        await a.selectSourcingPaymentTerms();
        await a.fillSourcingCommercialBidDueDate(data);
        await a.fillSourcingTechnicalBidDueDate(data);
        await a.fillSourcingExpectedDeliveryDate(data);
        await a.takeScreenshot('sourcing_event_info_filled');

        // Supplier Selection — Add Supplier popup → search → select → submit popup
        await a.addSourcingSupplier(data);
        await a.takeScreenshot('sourcing_supplier_added');

        // Submit the sourcing event
        await a.submitSourcingEvent();
        await a.takeScreenshot('sourcing_event_submitted');

        // Approve the RFX workflow (reassign to NSEF Support Admin if the Approve
        // button is missing, same as CXO/Intake) until it is live — otherwise the
        // supplier "Submit Quote" button never appears in the next test.
        await a.approveSourcingUntilReleased();
        await a.takeScreenshot('sourcing_event_approved');

        // Save Sourcing Event code for use in downstream steps
        await a.saveSourcingEventCode();
    });

    test('Quote the RFX → foreclose @Sourcing @Quote', async ({ page }) => {
        test.setTimeout(300000); // 5 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Hover Sourcing → Quote Request → search saved RFX code → open it
        await a.hoverSourcingTab();
        await a.clickQuoteRequestMenu();
        await a.openSavedSourcingEventFromListing();
        await a.takeScreenshot('rfx_opened_from_listing');

        // Supplier row → Submit Quote → Commercial Quote
        await a.clickSupplierSubmitQuote();
        await a.clickCommercialQuoteOption();

        // Quote page → Preferred Currency INR → Unit Rate → Submit Quote
        await a.selectQuotePreferredCurrency(data);
        await a.fillQuoteUnitRate(data);
        await a.takeScreenshot('quote_filled');
        await a.submitQuote();

        // Sourcing status should change to Quoted
        await a.assertSourcingStatusQuoted();
        await a.takeScreenshot('rfx_quoted');

        // TODO: foreclose steps (to be provided)
    });

    test('Award the RFX → wait for auto-created Purchase Requisition @Sourcing @Award', async ({ page }) => {
        test.setTimeout(600000); // 10 min — covers award + approvals + PR auto-creation polling

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Open the quoted RFX from the Quote Request listing
        await a.hoverSourcingTab();
        await a.clickQuoteRequestMenu();
        await a.openSavedSourcingEventFromListing();
        await a.takeScreenshot('rfx_opened_for_award');

        // More → Foreclose → reason → Submit
        await a.forecloseRfx(data);
        await a.takeScreenshot('rfx_foreclosed');

        // Analysis tab → Award → fill allocated qty → Award → Workflow Summary submit
        await a.clickAnalysisTab();
        await a.clickAwardButton();
        await a.fillAllocatedQuantity();
        await a.takeScreenshot('award_allocation_filled');
        await a.clickAwardButton();
        await a.submitWorkflowSummary();
        await a.takeScreenshot('award_submitted');

        // Approve as many times as needed; when Approve is missing check Workflow
        // Stages — if not Completed, reassign approver (NSEF Support Admin) and
        // approve again, until Workflow Stages shows Completed
        await a.completeAwardApprovals('Approved by automation');
        await a.takeScreenshot('award_workflow_completed');

        // Back button beside the AWD code
        await a.clickAwardBackArrow();
        await a.takeScreenshot('back_from_award');

        // Reload every 30s until the Requisition field shows the PR code
        await a.waitForRequisitionCode();
        await a.takeScreenshot('requisition_code_displayed');

        // Click the code → requisition opens in a new tab → save its code
        await a.openRequisitionAndSaveCode();
    });

    test('PR edit → submit → status Submitted @Requisition @PR', async ({ page }) => {
        test.setTimeout(300000); // 5 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Open the saved requisition (re-login on the capp domain if redirected)
        await a.openSavedRequisition(data);
        await a.takeScreenshot('pr_opened');

        // Edit → General details: 5 mandatory fields
        await a.clickPrEdit();
        await a.fillPrEffectiveFromDate();          // today (script execution date)
        await a.fillPrEffectiveToDate(data);        // 2026-12-31
        await a.selectPrPurchaseType(data);         // First time/New
        await a.selectPrInwardRequiredYes();
        await a.selectPrInwardMatchingQuantity();
        await a.takeScreenshot('pr_general_details_filled');

        // Submit → assert Submitted status → save the real PR code
        await a.submitPr();
        await a.assertPrSubmitted();
        await a.takeScreenshot('pr_submitted');
        await a.saveRequisitionCode();
    });

    test('Submitted PR auto-processes → PRC (Processed) → PO (Completed) @Requisition @PRC @PO', async ({ page }) => {
        test.setTimeout(900000); // 15 min — covers two long auto-processing waits

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Open the saved submitted requisition (re-login on capp domain if redirected)
        await a.openSavedRequisition(data);
        await a.takeScreenshot('pr_opened_for_prc');

        // Reload every 30s until status = Processed → PRC auto-created
        await a.waitForPrStatus('Processed');
        await a.takeScreenshot('pr_processed_prc_created');

        // Keep reloading until status = Completed → PO auto-created
        await a.waitForPrStatus('Completed');
        await a.takeScreenshot('pr_completed_po_created');
    });

    test('Completed PR → open PO via conversion → GRN → approve until Inwarded @PO @GRN', async ({ page }) => {
        test.setTimeout(900000); // 15 min — PO approval stages + GRN create + approval

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        // Login
        await a.navigateToApp(data);
        await a.fillLoginEmail(data);
        await a.clickLoginContinue();
        await a.fillLoginPassword(data);
        await a.clickLoginSubmit();
        await a.assertLoggedIn();

        // Open the saved (Completed) requisition
        await a.openSavedRequisition(data);
        await a.takeScreenshot('pr_opened_for_grn');

        // Transactions tab → expand Conversions → open PRC → Requisition Conversion View
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        await a.takeScreenshot('prc_conversion_view');

        // Hover PO(s) → click PO code → PO opens in a new (same-size) tab
        await a.openPoFromConversionViewInNewTab();
        await a.takeScreenshot('po_opened_new_tab');

        // Approve the PO through all stages until the Create dropdown is available
        await a.approvePoUntilSubmitted('Approved by automation');
        await a.takeScreenshot('po_approved');

        // Create → GRN → submit the Select PO Items popup → Create GRN page
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.takeScreenshot('grn_create_page');

        // General Details: Invoice Number + Delivery challan
        await a.fillGrnGeneralDetails(data);
        // Document Details: Delivery Note Reference + Document Date (today)
        await a.fillGrnDocumentDetails(data);
        // Line items: Received quantity must equal PO Quantity
        await a.assertGrnReceivedMatchesPoQty();
        await a.takeScreenshot('grn_filled');

        // Submit → Workflow Summary popup → Submit → GRN created
        await a.submitGrn();
        await a.takeScreenshot('grn_submitted');
        await a.saveGrnCode();

        // Approve the GRN (Stock Inward) until status = Inwarded
        await a.approveGrnUntilInwarded('Approved by automation');
        await a.assertGrnInwarded();
        await a.takeScreenshot('grn_inwarded');
    });

});
