import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// REJECT → EDIT → RESUBMIT across all modules.
//
// One test per module. Each builds its own document, gets it Rejected during its
// approval workflow, re-opens it (More → Edit), lowers the line-item quantity,
// appends " reject edit" to the title/subject, resubmits, and verifies a fresh
// approval workflow was re-triggered (a new "Workflow N" run).
//
//   1. CXO     — reject → edit (qty↑, title) → resubmit → new workflow.
//   2. Intake  — reject → edit (qty↑, title) → resubmit → new workflow.
//   3. RFX     — intake → sourcing → reject → edit (qty↓, title) → resubmit →
//                new workflow → intake re-convertible at the lowered qty.
//   4. GRN     — CAPP chain to PO → GRN → reject → edit (qty↓) → reduced qty
//                available for GRN creation.
//   5. Invoice — CAPP chain to PO → GRN(inwarded) → Invoice → reject → edit
//                (qty↓) → reduced qty available for Invoice creation.
//
// Session: NSEF login (auth.nsef.json) via nsef-setup — the same project the
// CXO / Intake / RFX / happy-path suites use. No supplier-portal (SAPP) step:
// the RFX quote is submitted from CAPP, exactly like NSEFhappyPATHS.
//
// NOTE: tests 4–5 drive old-capp GRN/Invoice reject + edit UI not previously
// automated; those helpers/selectors are PROVISIONAL and log field/button dumps
// on a miss to aid discovery — expect a live-DOM tightening pass.
// ─────────────────────────────────────────────────────────────────────────────

// Original line-item qty in the data is 100. CXO/Intake just "change" the qty
// (→ 200); RFX/PR/PO must "lower/decrease" it (→ 50) because the downstream
// checks (RFX re-awardable, PRC re-opens) depend on a genuine decrease.
const CHANGE_QTY = '200'; // CXO & Intake — change quantity
const LOWER_QTY = '50';   // RFX, Requisition, PO — decrease quantity

async function openApp(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    return a;
}

test.describe('All-modules reject → edit → resubmit', () => {

    // ── 1. CXO ────────────────────────────────────────────────────────────────
    test('CXO: reject → edit (qty↓, title) → resubmit → new workflow @RejectEdit @CXO', async ({ page }) => {
        test.setTimeout(600000); // 10 min
        const a = await openApp(page);

        // Build + submit a CXO → Pending Approval.
        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.createAndSubmitCxo(data);

        // Reject during the approval workflow.
        await a.rejectCxo('Rejected by automation');
        await a.assertCxoStatusRejected();
        await a.takeScreenshot('re_cxo_rejected');

        // Snapshot the workflow-run count (the original, now-inactive workflow).
        const before = await a.snapshotWorkflowCount();

        // More → Edit → lower qty, append " reject edit" to title → resubmit.
        await a.editAndResubmitRejectedCxo(data, CHANGE_QTY);
        await a.assertCxoStatusPendingApproval();
        await a.takeScreenshot('re_cxo_resubmitted');

        // A new approval workflow must have been triggered.
        await a.assertNewWorkflowTriggered(before);
    });

    // ── 2. Intake ─────────────────────────────────────────────────────────────
    test('Intake: reject → edit (qty↓, title) → resubmit → new workflow @RejectEdit @Intake', async ({ page }) => {
        test.setTimeout(900000); // 15 min — release a CXO first, then the intake
        const a = await openApp(page);

        // An intake must link a Released CXO transaction. The CXO test may have
        // left the saved CXO at Pending Approval (not linkable), so create +
        // release a fresh CXO first — this also refreshes the saved CXO code.
        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.createAndReleaseCxo(data);

        // Build + submit an intake → Pending Approval.
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.createAndSubmitIntake(data);
        await a.saveIntakeCode();

        // Reject during the approval workflow.
        await a.rejectIntake('Rejected by automation');
        await a.assertIntakeStatusRejected();
        await a.takeScreenshot('re_intake_rejected');

        const before = await a.snapshotWorkflowCount();

        // More → Edit → lower qty, append " reject edit" to title → resubmit.
        await a.editAndResubmitRejectedIntake(data, CHANGE_QTY);
        await a.takeScreenshot('re_intake_resubmitted');

        await a.assertNewWorkflowTriggered(before);
    });

    // ── 3. RFX / Sourcing ──────────────────────────────────────────────────────
    test('RFX: intake → sourcing → reject → edit (qty↓) → resubmit → intake re-convertible @RejectEdit @RFX', async ({ page }) => {
        test.setTimeout(1500000); // 25 min
        const a = await openApp(page);

        // Release a CXO first so the intake can link a Released CXO transaction.
        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.createAndReleaseCxo(data);

        // Build + approve an intake to Released so it can be sent for sourcing.
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();

        // Reopen intake → Process → Send For Sourcing → fill + submit the event.
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
        await a.saveSourcingEventCode();

        // Reject during the sourcing approval workflow.
        await a.rejectRfx('Rejected by automation');
        await a.assertSourcingStatusRejected();
        await a.takeScreenshot('re_rfx_rejected');

        const before = await a.snapshotWorkflowCount();

        // More → Edit → lower qty, append " reject edit" → resubmit the event.
        await a.editAndResubmitRejectedRfxLowerQty(LOWER_QTY);
        await a.takeScreenshot('re_rfx_resubmitted');
        await a.assertNewWorkflowTriggered(before);

        // Navigate back to the intake (now Partially Processed) and confirm it can
        // still be sent for sourcing (converted to RFX) — the New Sourcing event's
        // Item Table shows the decreased quantity.
        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.assertSourcingLineItemQty(LOWER_QTY);
        await a.takeScreenshot('re_rfx_intake_reconvertible');
    });

    // ── 4. GRN ──────────────────────────────────────────────────────────────────
    // CAPP-only (like NSEFhappyPATHS — quote from CAPP): build CXO → … → PO → GRN,
    // reject the GRN during its Stock-Inward approval, edit it (lower Received qty
    // + " reject edit"), then confirm the reduced qty is available to create a GRN.
    test('GRN: build to GRN → reject → edit (qty↓) → reduced qty available for GRN @RejectEdit @GRN', async ({ page }) => {
        test.setTimeout(2400000); // 40 min — full CAPP chain to PO + GRN + reject-edit
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // CXO → Intake → RFX → CAPP quote → foreclose → award → PR → PRC → PO (open).
        await buildToPoViaCapp(a);

        // Create the GRN against the PO.
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.fillGrnGeneralDetails(data);
        await a.fillGrnDocumentDetails(data);
        await a.submitGrn();
        await a.saveGrnCode();
        await a.takeScreenshot('re_grn_created');

        // Reject the GRN during its Stock-Inward approval workflow.
        await a.rejectCappDoc('Rejected by automation', 'GRN');
        await a.takeScreenshot('re_grn_rejected');

        // Edit → lower the Received qty + annotate → resubmit.
        await a.editGrnReceivedLowerQtyAndSubmit(LOWER_QTY);
        await a.takeScreenshot('re_grn_edited');

        // Confirm the reduced qty is available for creating a GRN on the PO.
        await a.assertPoQtyAvailableForGrn(LOWER_QTY, data);
        await a.takeScreenshot('re_grn_qty_available');
    });

    // ── 5. Invoice ──────────────────────────────────────────────────────────────
    // CAPP-only (Invoice created from CAPP): build CXO → … → PO → Invoice, reject
    // the Invoice during approval, edit it (lower qty + " reject edit"), then
    // confirm the reduced qty is available to create an Invoice.
    test('Invoice: build to Invoice → reject → edit (qty↓) → reduced qty available for Invoice @RejectEdit @Invoice', async ({ page }) => {
        test.setTimeout(2400000); // 40 min
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // CXO → Intake → RFX → CAPP quote → foreclose → award → PR → PRC → PO (open).
        await buildToPoViaCapp(a);

        // A GRN is required before an invoice can be matched — create + inward it.
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.fillGrnGeneralDetails(data);
        await a.fillGrnDocumentDetails(data);
        await a.submitGrn();
        await a.saveGrnCode();
        await a.approveGrnUntilInwarded('Approved by automation');
        await a.assertGrnInwarded();

        // Create the Invoice against the PO (matched to its GRN).
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.fillInvoiceDetails(data);
        await a.setInvoiceGeneralDetailsNo();
        await a.matchGrnInItemMatching();
        await a.submitInvoice();
        await a.saveInvoiceCode();
        await a.takeScreenshot('re_inv_created');

        // Reject the Invoice during approval.
        await a.rejectCappDoc('Rejected by automation', 'INV');
        await a.takeScreenshot('re_inv_rejected');

        // Edit → lower the qty + annotate → resubmit.
        await a.editInvoiceLowerQtyAndSubmit(LOWER_QTY);
        await a.takeScreenshot('re_inv_edited');

        // Confirm the reduced qty is available for creating an Invoice on the PO.
        await a.assertPoQtyAvailableForInvoice(LOWER_QTY, data);
        await a.takeScreenshot('re_inv_qty_available');
    });
});

// ── Shared: CAPP-only chain CXO → … → PO, leaving the PO open in its tab ─────────
// Mirrors the NSEFhappyPATHS suite (quote is submitted from CAPP, not SAPP).
async function buildToPoViaCapp(a) {
    // CXO → Released.
    await a.clickCxoTab();
    await a.assertCxoListingPage();
    await a.clickCreateCxo();
    await a.assertCxoCreatePage();
    await a.fillAllCxoSections(data);
    await a.clickSubmit();
    await a.assertCxoSubmittedSuccessfully();
    await a.approveAllStages('Approved by automation');
    await a.assertCxoStatusReleased();
    await a.saveCxoCode();

    // Intake → Released.
    await a.clickIntakeTab();
    await a.clickCreateIntake();
    await a.assertIntakeCreatePage();
    await a.waitForCreatePageLoaded();
    await a.createAndSubmitIntake(data);
    await a.approveIntakeUntilReleased(data, 'Approved by automation');
    await a.assertIntakeStatusReleased();
    await a.saveIntakeCode();

    // Intake → Process → Send for Sourcing → RFX live.
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

    // Quote the RFX from CAPP (supplier row → Submit Quote → Commercial).
    // Re-open the app first so the Sourcing-tab hover menu works from a clean
    // state (matches NSEFhappyPATHS, where the quote step is its own test).
    await a.openApp(data);
    await a.hoverSourcingTab();
    await a.clickQuoteRequestMenu();
    await a.openSavedSourcingEventFromListing();
    await a.clickSupplierSubmitQuote();
    await a.clickCommercialQuoteOption();
    await a.selectQuotePreferredCurrency(data);
    await a.fillQuoteUnitRate(data);
    await a.submitQuote();
    await a.assertSourcingStatusQuoted();

    // Foreclose → Award → auto PR (fresh app state for the hover menu again).
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

    // PR edit → submit → auto PRC → PO.
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
    await a.waitForPrStatus('Processed');
    await a.waitForPrStatus('Completed');

    // Open the auto-created PO via the PR → PRC conversion → approve to Submitted.
    await a.openSavedRequisition(data);
    await a.clickPrTransactionsTab();
    await a.expandPrConversionsSection();
    await a.openPrcFromConversions();
    await a.openPoFromConversionViewInNewTab();
    await a.approvePoUntilSubmitted('Approved by automation');
}
