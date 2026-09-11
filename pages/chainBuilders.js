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
// ── Shared: CXO → Intake → RFX → quote → FORECLOSE, stopping before the award ──
//
// Extracted from buildToPoViaCapp on 2026-09-07 so scenario 21 (award
// justification hover) can reach the award FORM and drive the award itself,
// instead of buildToPoViaCapp awarding for it. buildToPoViaCapp now calls this
// and continues, so there is exactly one copy of these ~35 steps.
//
// Stopping at foreclose matters: on a still-Quoted RFX the award form's section
// rows are READ-ONLY (verified 2026-09-07 on RFX-26-251 — clicking a value cell
// leaves document.activeElement as <body>), so justification text can only be
// entered after foreclose.
// Options accepted by buildRfxToForeclose (and threaded through by the builders
// that call it):
//   intakeQty  — line-item qty for the intake (default: data.intake.itemQty).
//   rfxQty     — qty to convert on the New Sourcing event form. Converts only
//                PART of the intake, leaving the rest for a later transaction
//                (sheet scenario 6). Default: convert the whole intake.
//   skipCxo    — the caller already has a Released CXO recorded in the fixture
//                (savedCxo); start at the intake. Lets several intakes hang off
//                ONE CXO (sheet scenarios 1 and 6).
//   quoteLock  — async wrapper serialising the QUOTE block against other chains
//                running concurrently. Two surrogate quotes submitted at the
//                same moment as the SAME supplier silently lose one: observed
//                2026-09-09 in scenario 1, where RFX-26-268's quote form closed
//                "successfully" yet the RFX stayed Released at
//                "0 out of 1 Supplier" while RFX-26-267 quoted fine. Everything
//                else in the chain parallelises safely.
export async function buildRfxToForeclose(a, data = defaultData,
    { intakeQty = null, rfxQty = null, skipCxo = false, quoteLock = null } = {}) {
    // CXO → Released.
    if (!skipCxo) {
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
    }

    // Intake → Released.
    await a.clickIntakeTab();
    await a.clickCreateIntake();
    await a.assertIntakeCreatePage();
    await a.waitForCreatePageLoaded();
    await a.createAndSubmitIntake(data, { qty: intakeQty });
    await a.approveIntakeUntilReleased(data, 'Approved by automation');
    await a.assertIntakeStatusReleased();
    await a.saveIntakeCode();

    // Intake → Process → Send for Sourcing → RFX live.
    await a.clickIntakeTab();
    await a.openSavedIntakeFromListing();
    await a.clickIntakeProcess();
    await a.clickSendForSourcing();
    await a.expandSourcingSections();
    // Convert only part of the intake when asked (scenario 6). The grid's
    // Quantity cell is click-to-edit and pre-filled with the intake qty.
    if (rfxQty != null) await a.setSourcingLineItemQty(rfxQty);
    await a.selectSourcingPaymentTerms();
    await a.fillSourcingCommercialBidDueDate(data);
    await a.fillSourcingTechnicalBidDueDate(data);
    await a.fillSourcingExpectedDeliveryDate(data);
    await a.addSourcingSupplier(data);
    await a.submitSourcingEvent();
    await a.approveSourcingUntilReleased();
    await a.saveSourcingEventCode();

    // Quote the RFX from CAPP (supplier row → Submit Quote → Commercial).
    const quote = async () => {
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
    };
    await (quoteLock ? quoteLock(quote) : quote());

    // Foreclose (fresh app state so the Sourcing hover menu works).
    await a.openApp(data);
    await a.hoverSourcingTab();
    await a.clickQuoteRequestMenu();
    await a.openSavedSourcingEventFromListing();
    await a.forecloseRfx(data);
}

// ── Award a foreclosed RFX → auto PR → edit it → submit ──────────────────────
//
// Split out of buildToPoViaCapp on 2026-09-09 for sheet scenario 6, which runs
// this twice against ONE CXO and stops at "PR submitted" both times — it never
// needs the PRC/PO the full chain goes on to build.
//
// Leaves savedRequisition pointing at the PR and the browser on the PR page.
export async function buildAwardToPrSubmitted(a, data = defaultData) {
    // Award → auto PR.
    await a.clickAnalysisTab();
    await a.clickAwardButton();
    await a.fillAllocatedQuantity();
    await a.clickAwardButton();
    await a.submitWorkflowSummary();
    await a.completeAwardApprovals('Approved by automation');
    await a.clickAwardBackArrow();
    await a.waitForRequisitionCode();
    await a.openRequisitionAndSaveCode();

    // PR edit → submit.
    await a.openSavedRequisition(data);
    await a.clickPrEdit();
    await a.fillPrEffectiveFromDate();
    await a.fillPrEffectiveToDate(data);
    await a.selectPrPurchaseType(data);
    await a.selectPrInwardRequiredYes();
    await a.selectPrInwardMatchingQuantity();
    await a.submitPr();
    await a.assertPrSubmitted();
    return await a.saveRequisitionCode();
}

export async function buildToPoViaCapp(a, data = defaultData,
    { approvePo = true, ...rfxOpts } = {}) {
    // CXO → Intake → RFX → quote → foreclose.
    await buildRfxToForeclose(a, data, rfxOpts);

    // Award → auto PR → PR edit → submit.
    await buildAwardToPrSubmitted(a, data);

    // The submitted PR auto-processes into a PRC and then a PO.
    // "Processed" is TRANSIENT — a fast backend hop to Completed between polls
    // would strand this wait on a PR that has already moved on (measured
    // 2026-09-10: 54 polls for "Processed" while PR-NSEFN-26-167 sat Completed).
    await a.waitForPrStatus(['Processed', 'Completed']);
    await a.waitForPrStatus('Completed');

    // Open the auto-created PO via the PR → PRC conversion → approve to Submitted.
    await a.openSavedRequisition(data);
    await a.clickPrTransactionsTab();
    await a.expandPrConversionsSection();
    await a.openPrcFromConversions();
    await a.openPoFromConversionViewInNewTab();
    // approvePo:false leaves the PO in PENDING APPROVAL, which is the only status
    // that offers Recall (sheet scenario 65) — confirmed live 2026-09-08:
    // PO-NSEFN-26-213 (Pending Approval) offers Clone / Recall / Reassign User /
    // Reassign Workflow Approver / Regenerate Document, while the approved
    // PO-NSEFN-26-220 offers only Clone / Reassign User / Regenerate Document.
    // Approving here is what had hidden Recall from every earlier probe.
    if (approvePo) await a.approvePoUntilSubmitted('Approved by automation');
}

// ── Multi-currency RFX chain: CXO → Intake → RFX(INR+USD) → quote USD → foreclose ──
//
// Purpose-built for sheet scenario 20. The stock chain quotes in INR, which is
// also the base currency, so "Show in base currency" can never change a figure
// and the assertion is unfalsifiable. Per QA (2026-09-04) the real flow is:
//
//   CXO → Intake → convert to RFX, selecting INR *and* USD in the Currencies
//   field of Event Information → quote with Preferred Currency = USD →
//   foreclose → Analysis tab shows USD → toggle base currency → shows INR.
//
// Stops at foreclose: award/PR/PO add nothing to the currency assertion and
// would add several more minutes plus more permanent UAT records.
export async function buildMultiCurrencyRfxToForeclose(a, data = defaultData) {
    const cfg = data.multiCurrencyRfx;

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

    // Intake → Process → Send for Sourcing, allowing BOTH currencies.
    await a.clickIntakeTab();
    await a.openSavedIntakeFromListing();
    await a.clickIntakeProcess();
    await a.clickSendForSourcing();
    await a.expandSourcingSections();
    await a.selectSourcingCurrencies(cfg.currencies);   // ← the step that makes 20 provable
    await a.selectSourcingPaymentTerms();
    await a.fillSourcingCommercialBidDueDate(data);
    await a.fillSourcingTechnicalBidDueDate(data);
    await a.fillSourcingExpectedDeliveryDate(data);
    await a.addSourcingSupplier(data);
    await a.submitSourcingEvent();
    await a.approveSourcingUntilReleased();
    await a.saveSourcingEventCode();

    // Quote from CAPP in USD, not the fixture default.
    await a.openApp(data);
    await a.hoverSourcingTab();
    await a.clickQuoteRequestMenu();
    await a.openSavedSourcingEventFromListing();
    await a.clickSupplierSubmitQuote();
    await a.clickCommercialQuoteOption();
    await a.selectQuotePreferredCurrency(data, cfg.quoteCurrency);
    await a.fillQuoteUnitRate(data);
    await a.submitQuote();
    await a.assertSourcingStatusQuoted();

    // Foreclose so the Analysis tab is populated and comparable.
    await a.openApp(data);
    await a.hoverSourcingTab();
    await a.clickQuoteRequestMenu();
    await a.openSavedSourcingEventFromListing();
    await a.forecloseRfx(data);
}

// ── SAPP chain: CXO → Intake → RFX → SAPP quote → award → PR → PRC → PO → GRN ──
//
// Built 2026-09-08 for sheet scenario 126(b). buildToPoViaCapp CANNOT stand in:
// it quotes from CAPP, so the awarded supplier is not necessarily the Supplier
// Portal login, and a PO the SAPP session cannot see is useless here. This one
// quotes from SAPP (step 4 of the Supplier Portal happy path), so the resulting
// PO belongs to the portal supplier and is Acceptable there.
//
// Why it must run at all, rather than reusing data.savedPurchaseOrder: a PO that
// already carries an invoice hits the known "2nd invoice sends the full PO qty"
// bug, whose symptom is the Approvers dialog silently refusing to close — proven
// on PO-NSEFN-26-220 on 2026-09-08, where the SAPP submit stalled there through
// four click attempts and no invoice was created. QA: the SAPP flow needs a
// FRESH PO built from CXO.
//
// Why it goes as far as the GRN: the PO is created with Inward Required = Yes,
// and the CAPP review of a SAPP invoice matches its line items to the PO's GRN.
// Stopping at the PO would leave nothing to match.
//
// Leaves savedCxo / savedIntake / savedSourcingEvent / savedRequisition /
// savedPurchaseOrder / savedGrn in NSEFoundationData.json, and the PO with its
// FULL quantity uninvoiced. Creates a complete set of real UAT records per run.
//
// `a` = NSEFoundationActions, `s` = SupplierPortalActions, both on the SAME page
// (the supplier-tests project's combined CAPP+SAPP session).
export async function buildToGrnViaSapp(a, s, data = defaultData) {
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

    // [SAPP] the supplier accepts the RFX and quotes it — this is what ties the
    // eventual PO to the portal login.
    await s.openRfxListing();
    await s.openSavedRfxFromListing();
    await s.acceptRfx();
    await s.submitCommercialQuote();
    await s.assertRfxQuoted();

    // [CAPP] foreclose → award → auto PR.
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

    // PR edit → submit → auto PRC → PO. Inward Required = Yes is what makes the
    // GRN below a precondition of invoice matching.
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
    // "Processed" is TRANSIENT — a fast backend hop to Completed between polls
    // would strand this wait on a PR that has already moved on (measured
    // 2026-09-10: 54 polls for "Processed" while PR-NSEFN-26-167 sat Completed).
    await a.waitForPrStatus(['Processed', 'Completed']);
    await a.waitForPrStatus('Completed');

    // PO via the PR → PRC conversion → approve to Submitted → [SAPP] Accept.
    await a.openSavedRequisition(data);
    await a.clickPrTransactionsTab();
    await a.expandPrConversionsSection();
    await a.openPrcFromConversions();
    await a.openPoFromConversionViewInNewTab();
    await a.approvePoUntilSubmitted('Approved by automation');
    await s.openPoListing();
    await s.openSavedPoFromListing();
    await s.acceptPo();

    // [CAPP] GRN (buyer-side: the SAPP Create menu offers no GRN) → Inwarded.
    await a.openSavedPurchaseOrder(data);
    await a.clickPoCreateGrn();
    await a.submitSelectPoItemsPopup();
    await a.fillGrnGeneralDetails(data);
    await a.fillGrnDocumentDetails(data);
    await a.assertGrnReceivedMatchesPoQty();
    await a.submitGrn();
    await a.saveGrnCode();
    await a.approveGrnUntilInwarded('Approved by automation');
    await a.assertGrnInwarded();
}


// ── CAPP chain: CXO → … → PO → GRN, with an optional PARTIAL receipt ─────────
//
// Built 2026-09-08 for the Disputed scenarios (13, 69, 70). Differs from
// buildToGrnViaSapp in two ways: the quote is submitted from CAPP (so no SAPP
// session is needed), and the GRN's Received qty can be set BELOW the PO qty,
// which is what scenario 13 turns on.
//
// grnQty:  null -> receive the full PO quantity (asserted, as the happy path does)
//          e.g. 50 -> partial receipt, leaving the PO over-invoiceable
export async function buildToGrnViaCapp(a, data = defaultData,
    { grnQty = null, ...poOpts } = {}) {
    await buildToPoViaCapp(a, data, poOpts);

    await a.openSavedPurchaseOrder(data);
    await a.clickPoCreateGrn();
    await a.submitSelectPoItemsPopup();
    await a.fillGrnGeneralDetails(data);
    await a.fillGrnDocumentDetails(data);
    if (grnQty == null) await a.assertGrnReceivedMatchesPoQty();
    else await a.setGrnReceivedQty(grnQty);
    await a.submitGrn();
    await a.saveGrnCode();
    await a.approveGrnUntilInwarded('Approved by automation');
    await a.assertGrnInwarded();
}

// ── Full CAPP chain, GRN → Invoice → acknowledge → Payment (sheet scenario 1) ──
//
// The tail of testSuiteNSEFhappyPATHS, extracted so a scenario can run the WHOLE
// intake-to-payment flow without re-implementing it. The invoice only reaches
// "Accounted" after the external acknowledgement API call, and only an Accounted
// invoice can be paid — so ack sits between the two.
//
// Returns the UTR used for the payment, which is what identifies the payment row
// in the invoice's Transactions tab.
/**
 * Resume from a PR that is already Completed (its PRC and PO exist): open the
 * PO via the conversion, approve it, then GRN → Invoice → ack → Payment.
 *
 * Added 2026-09-10 so a failure in the tail does not force a re-run of the ~12
 * minutes of intake → RFX → award → PR that precede it. Expects
 * savedRequisition in this instance's fixture to point at the Completed PR.
 */
export async function buildFromCompletedPrToPayment(a, data = defaultData) {
    // PR → Transactions → Conversions → PRC → PO (new tab) → approve.
    await a.openSavedRequisition(data);
    await a.clickPrTransactionsTab();
    await a.expandPrConversionsSection();
    await a.openPrcFromConversions();
    await a.openPoFromConversionViewInNewTab();
    await a.approvePoUntilSubmitted('Approved by automation');

    // PO → GRN → approve to Inwarded.
    await a.openSavedPurchaseOrder(data);
    await a.clickPoCreateGrn();
    await a.submitSelectPoItemsPopup();
    await a.fillGrnGeneralDetails(data);
    await a.fillGrnDocumentDetails(data);
    await a.assertGrnReceivedMatchesPoQty();
    await a.submitGrn();
    await a.saveGrnCode();
    await a.approveGrnUntilInwarded('Approved by automation');
    await a.assertGrnInwarded();

    return await buildInvoiceToPayment(a, data);
}

/** PO (already saved + GRN inwarded) → Invoice → acknowledge → Payment. */
export async function buildInvoiceToPayment(a, data = defaultData) {
    // PO → Create → Invoice → match the GRN → submit → approve → Pending Sync.
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
    // PO invoices finish approvals on Pending Sync OR (seen in UAT) Sync Failed;
    // both are ackable, so accept either and let the post-ack Accounted check be
    // the real proof.
    await a.approveInvoiceUntilPendingSync('Approved by automation', { acceptSyncFailed: true });
    await a.assertInvoiceReadyForAck();

    return await buildAckToPayment(a, data);
}

/**
 * Acknowledge an invoice that has settled (Pending Sync or Sync Failed) and pay
 * it. Split out 2026-09-10 so a transport blip on the ack POST does not cost the
 * whole chain — this is resumable on its own against savedInvoice.
 */
export async function buildAckToPayment(a, data = defaultData) {
    // External acknowledgement → Accounted.
    await a.acknowledgeInvoice(data);
    await a.openSavedInvoice(data);
    await a.assertInvoiceAccounted();

    // + Payment → paid amount = invoice amount, unique UTR, today's date.
    const invoiceAmount = await a.readInvoiceAmount();
    await a.clickAddPayment();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const utr = 'UTR' + Date.now() + Math.floor(Math.random() * 1000);
    await a.fillPaymentForm(invoiceAmount, utr, today);
    await a.submitPayment();
    await a.assertPaymentSuccessToast();
    await a.openInvoiceTransactionsTab();
    await a.assertPaymentCompleted(utr);
    return { utr, invoiceAmount };
}

/** Full CAPP chain: CXO → … → GRN → Invoice → acknowledge → Payment. */
export async function buildToPaymentViaCapp(a, data = defaultData, opts = {}) {
    await buildToGrnViaCapp(a, data, opts);
    return await buildInvoiceToPayment(a, data);
}
