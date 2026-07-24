import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier-Portal E2E — the full happy path, but the three supplier-facing
// actions are performed from the Supplier Portal (SAPP) instead of CAPP:
//
//   • Quote the RFX     → SAPP: Accept → Submit Quote → Commercial → Submit
//   • Create the GRN    → SAPP: Accept PO → Create → GRN   (lands Pending Review in CAPP)
//   • Create the Invoice→ SAPP: Create → Invoice          (lands Pending Review in CAPP)
//
// Everything else (CXO → Intake → Sourcing → Foreclose → Award → PR → PRC → PO →
// approvals → acknowledge) reuses NSEFoundationActions on CAPP. After each SAPP
// creation a CAPP user reviews the Pending-Review doc, then the normal workflow
// (approvals) runs until Inwarded / Pending Sync.
//
// Payments are intentionally excluded (known bug).
//
// Session: combined CAPP+SAPP storageState (auth.supplier.json) via supplier-setup.
// ─────────────────────────────────────────────────────────────────────────────

async function loginAndOpenCxoCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    await a.clickCxoTab();
    await a.assertCxoListingPage();
    await a.clickCreateCxo();
    await a.assertCxoCreatePage();
    return a;
}

async function loginAndOpenIntakeCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    await a.clickIntakeTab();
    await a.clickCreateIntake();
    await a.assertIntakeCreatePage();
    return a;
}

// Serial: each step depends on the previous one (Sourcing mints the RFX, SAPP
// quotes it, Award forecloses+awards it, …). If any step fails, the rest are
// skipped — so a failed quote never lets the Award step foreclose an un-quoted RFX.
test.describe.serial('Supplier Portal Happy Path', () => {

    // ── 1. CXO ────────────────────────────────────────────────────────────────
    test('Create CXO with all mandatory fields → Submit → Released @Supplier @CXO', async ({ page }) => {
        test.setTimeout(300000);
        const a = await loginAndOpenCxoCreate(page);

        await a.expandAllSections();
        await a.fillCxoTitle(data);
        await a.fillCxoSummary(data);
        await a.selectCxoCompany();
        await a.selectCxoDepartment(data);
        await a.selectCxoFunction(data);
        await a.selectCxoCurrency(data);
        await a.selectCxoType(data);
        await a.selectCxoTransactionFlowType(data);
        await a.selectCxoExpenseNature(data);
        await a.fillCxoStartDate(data);
        await a.fillCxoEndDate(data);
        await a.selectCxoTypeOfProcurement(data);
        await a.selectCxoFinancialYear(data);
        await a.selectExistingApplications(data);
        await a.selectBusinessOrCompliance(data);
        await a.fillMinimumCommitmentPeriod(data);
        await a.selectCloudExposure(data);
        await a.selectMeitYVendors(data);
        await a.fillDetailsOtherAgency(data);
        await a.selectSebiOutsourcingCircular(data);
        await a.fillNatureOfDataShared(data);
        await a.selectRpwdCompliance(data);
        await a.fillDetailsOfItemsServices(data);
        await a.fillNecessityOfPurchase(data);
        await a.selectEmergencyProcurement(data);
        await a.fillDeliveryTimeline(data);
        await a.clickAddRow();
        await a.fillItemName(data);
        await a.fillItemQty(data);
        await a.fillItemSuggestedPrice(data);
        await a.fillItemProjectName(data);
        await a.fillItemVertical(data);
        await a.fillItemGlAccount(data);
        await a.fillItemProfitCenter(data);
        await a.fillItemCostCenter(data);
        await a.fillItemSebiCategorization(data);
        await a.fillItemSubSegment(data);
        await a.fillItemProjectCategory(data);
        await a.fillItemNatureOfExpense(data);
        await a.fillPotentialSuppliers(data);
        await a.assertBrfAutoPopulated(data);
        await a.clickSubmit();
        await a.assertCxoSubmittedSuccessfully();
        await a.approveAllStages('Approved by automation');
        await a.assertCxoStatusReleased();
        await a.saveCxoCode();
    });

    // ── 2. Intake ───────────────────────────────────────────────────────────────
    test('Create Intake → fill all → Submit → Released @Supplier @Intake', async ({ page }) => {
        test.setTimeout(300000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.closeAskAieraIfVisible();
        await a.expandIntakeSections();
        await a.fillIntakeTitle(data);
        await a.fillIntakeSummary(data);
        await a.selectIntakeCompany1();
        await a.selectIntakeCompany2();
        await a.selectIntakeDepartment(data);
        await a.selectIntakeExpenseNatureApproval(data);
        await a.selectIntakeCurrency(data);
        await a.selectIntakeFunction(data);
        await a.selectIntakeVertical(data);
        await a.selectIntakeProjectName();
        await a.selectIntakeNatureOfExpense(data);
        await a.selectIntakeGLAccount();
        await a.selectIntakeProfitCenter();
        await a.selectIntakeCostCenter();
        await a.selectIntakeSEBICategorization();
        await a.selectIntakeSubSegment();
        await a.selectIntakeProjectCategory();
        await a.selectIntakeCXOType(data);
        await a.selectIntakeCXOTransaction(data);
        await a.assertIntakeBRFAutoPopulated();
        await a.addIntakeLineRow();
        await a.fillIntakeLineItem(data);
        await a.fillIntakePotentialSuppliers(data);
        await a.submitIntake();
        await a.completeIntakeSubmissionPopup();
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();
    });

    // ── 3. Sourcing ──────────────────────────────────────────────────────────────
    test('Open Intake → Process → Send for Sourcing → RFX live @Supplier @Sourcing', async ({ page }) => {
        test.setTimeout(180000);
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.expandSourcingSections();
        await a.selectSourcingPaymentTerms();
        await a.fillSourcingCommercialBidDueDate(data);
        await a.fillSourcingTechnicalBidDueDate(data);
        await a.fillSourcingExpectedDeliveryDate(data);
        await a.addSourcingSupplier(data);
        await a.submitSourcingEvent();
        await a.approveSourcingUntilReleased();
        await a.saveSourcingEventCode();
    });

    // ── 4. [SAPP] Quote the RFX ──────────────────────────────────────────────────
    test('[SAPP] Quote the RFX → Accept → Commercial Quote → Submit @Supplier @SAPP @Quote', async ({ page }) => {
        test.setTimeout(300000);
        const s = new SupplierPortalActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        await s.openRfxListing();
        await s.openSavedRfxFromListing();
        await s.takeScreenshot('rfx_opened');

        await s.acceptRfx();
        await s.takeScreenshot('rfx_accepted');

        await s.submitCommercialQuote();
        await s.takeScreenshot('rfx_quote_submitted');

        await s.assertRfxQuoted();
        await s.takeScreenshot('rfx_quoted');
    });

    // ── 5. Award (foreclose → award → PR created) ─────────────────────────────────
    test('Award the RFX → foreclose → auto-created PR @Supplier @Award', async ({ page }) => {
        test.setTimeout(600000);
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.hoverSourcingTab();
        await a.clickQuoteRequestMenu();
        await a.openSavedSourcingEventFromListing();
        await a.forecloseRfx(data);
        await a.clickAnalysisTab();
        await a.clickAwardButton();
        await a.fillAllocatedQuantity();
        await a.clickAwardButton();
        await a.submitWorkflowSummary();
        await a.completeAwardApprovals('Approved by automation');
        await a.clickAwardBackArrow();
        await a.waitForRequisitionCode();
        await a.openRequisitionAndSaveCode();
    });

    // ── 6. PR edit → submit ────────────────────────────────────────────────────────
    test('PR edit → submit → Submitted @Supplier @PR', async ({ page }) => {
        test.setTimeout(300000);
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.openSavedRequisition(data);
        await a.clickPrEdit();
        await a.fillPrEffectiveFromDate();
        await a.fillPrEffectiveToDate(data);
        await a.selectPrPurchaseType(data);
        await a.selectPrInwardRequiredYes();
        await a.selectPrInwardMatchingQuantity();
        await a.submitPr();
        await a.assertPrSubmitted();
        await a.saveRequisitionCode();
    });

    // ── 7. PR → PRC → PO ─────────────────────────────────────────────────────────
    test('Submitted PR → PRC (Processed) → PO (Completed) @Supplier @PRC @PO', async ({ page }) => {
        test.setTimeout(900000);
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.openSavedRequisition(data);
        await a.waitForPrStatus('Processed');
        await a.waitForPrStatus('Completed');
    });

    // ── 8. PO approve → [SAPP] Accept PO → [CAPP] Create GRN → Inwarded ────────────
    // GRN is a buyer-side action: the SAPP supplier Create menu offers only
    // Invoice / Request Advance (no GRN), so the goods receipt is created in CAPP.
    // The supplier still accepts the PO in SAPP first.
    test('PO approve → [SAPP] Accept PO → [CAPP] Create GRN → Inwarded @Supplier @SAPP @GRN', async ({ page }) => {
        test.setTimeout(900000);
        const a = new NSEFoundationActions(page);
        const s = new SupplierPortalActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // CAPP: open the PO (via PR → PRC conversion) and approve it so it is sent
        // to the supplier. openPoFromConversionViewInNewTab saves savedPurchaseOrder.
        await a.openSavedRequisition(data);
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        await a.openPoFromConversionViewInNewTab();
        await a.approvePoUntilSubmitted('Approved by automation');
        await a.takeScreenshot('po_approved_for_supplier');

        // SAPP: the PO now shows as Submitted → the supplier Accepts it.
        await s.openPoListing();
        await s.openSavedPoFromListing();
        await s.acceptPo();
        await s.takeScreenshot('sapp_po_accepted');

        // CAPP: the buyer creates the GRN (Stock Inward) against the PO, then
        // approves the Stock Inward workflow until Inwarded.
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.takeScreenshot('grn_create_page');
        await a.fillGrnGeneralDetails(data);
        await a.fillGrnDocumentDetails(data);
        await a.assertGrnReceivedMatchesPoQty();
        await a.takeScreenshot('grn_filled');
        await a.submitGrn();
        await a.saveGrnCode();
        await a.approveGrnUntilInwarded('Approved by automation');
        await a.assertGrnInwarded();
        await a.takeScreenshot('grn_inwarded');
    });

    // ── 9. [SAPP] Create Invoice → [CAPP] review → approve until Pending Sync ──────
    test('[SAPP] Create Invoice for PO → [CAPP] review → Pending Sync @Supplier @SAPP @Invoice', async ({ page }) => {
        test.setTimeout(900000);
        const a = new NSEFoundationActions(page);
        const s = new SupplierPortalActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // SAPP: open the PO → Accept → Create → Invoice → fill the form → Submit.
        // The invoice lands in CAPP as Pending Review; createInvoiceFromPo saves
        // savedInvoice (code + CAPP url) so the CAPP steps below open the right one.
        await s.openPoListing();
        await s.openSavedPoFromListing();
        await s.acceptPo();
        await s.createInvoiceFromPo(data);
        await s.takeScreenshot('sapp_invoice_created');

        // CAPP: open the invoice, review the Pending-Review doc, then approve the
        // workflow until Pending Sync.
        await a.openSavedInvoice(data);
        await s.reviewAndSubmitPendingReview('INV');
        await a.approveInvoiceUntilPendingSync('Approved by automation');
        await a.assertInvoicePendingSync();
        await a.takeScreenshot('invoice_pending_sync');
    });

    // ── 10. Acknowledge → Accounted ───────────────────────────────────────────────
    test('Acknowledge the Pending Sync invoice via API → Accounted @Supplier @Ack', async ({ page }) => {
        test.setTimeout(180000);
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();
        await a.takeScreenshot('invoice_accounted');
    });

    // Payments intentionally excluded — known payment-creation bug.
});
