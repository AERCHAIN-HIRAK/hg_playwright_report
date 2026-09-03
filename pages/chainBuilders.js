import defaultData from './NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Shared chain builders.
//
// Extracted from testSuiteallmodulesrejectedit.spec.js on 2026-09-03 so the
// chain-heavy scenarios do not each re-implement a ~40-step build. The body is
// unchanged — only the export and an explicit `data` parameter were added, so
// the reject-edit suite behaves exactly as before.
//
// This chain CREATES REAL RECORDS on UAT every run (one CXO, Intake, RFX, award,
// PR, PRC and PO), which is the price of not depending on ambient data. All are
// subjected "HG Automation …" so automation-made records are obvious.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared: CAPP-only chain CXO → … → PO, leaving the PO open in its tab ─────────
// Mirrors the NSEFhappyPATHS suite (quote is submitted from CAPP, not SAPP).
// `data` shadows the module import rather than reassigning it — an imported
// binding is const in ESM, so `data = cfg` would throw at runtime.
export async function buildToPoViaCapp(a, data = defaultData) {
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
