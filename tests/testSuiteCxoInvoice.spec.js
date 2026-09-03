import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Non-PO ("CXO") Invoice — §4 of the NSE Customer Flow Document
//
// CXO → direct Invoice: no Intake, no RFX, no PO. This is the only invoice type
// that consumes budget straight from the CXO, so it is also where the §2.4 hard
// parent check (Budget Exceeded) is enforced.
//
// Flow per NSE: create CXO → approve till Released → Home → all-modules →
// Invoice → Create New → upload document → select CXO invoice template →
// select the created CXO → fill details → Submit → approve till Pending Sync →
// acknowledgement API → Accounted → back to the CXO to verify consumption.
//
// Runs on the nsef-tests project (NSEF login, auth.nsef.json).
// ─────────────────────────────────────────────────────────────────────────────

// The flow crosses from V4 (nse-capp-v4-uat) to the slower V3 Ant app
// (nse-capp-uat); the repo-wide 5s nav/action timeouts are too tight for it.
test.use({ navigationTimeout: 60000, actionTimeout: 20000 });

/** Login → CXO create page. */
async function openCxoCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    await a.clickCxoTab();
    await a.assertCxoListingPage();
    await a.clickCreateCxo();
    await a.assertCxoCreatePage();
    return a;
}

/** Create + release a CXO, then land on the Non-PO invoice create form with the
 *  template chosen and that CXO selected. Returns { a, cxoCode }. */
async function cxoThenInvoiceForm(page) {
    const a = await openCxoCreate(page);

    // Steps 1–2: create the CXO and approve every stage until Released.
    await a.createAndReleaseCxo(data);
    const cxoCode = a.getSavedCxoCode();

    // Steps 3–6: Home → all modules → Invoice → Create New → upload → template.
    await a.openNonPoInvoiceCreatePage();
    await a.uploadNonPoInvoiceDocument(data);
    await a.selectNonPoTemplate(data);
    // Sections render collapsed (MUI Accordion) — their fields are present but
    // visibility:hidden until expanded.
    await a.expandNonPoSections();

    // Step 7: select the CXO just released.
    await a.selectNonPoCxo(cxoCode);

    return { a, cxoCode };
}

test.describe('Non-PO (CXO) Invoice', () => {

    // ── A. Happy path ────────────────────────────────────────────────────────

    test('CXO → Non-PO invoice for the full CXO value → approve → ack → Accounted @NonPO @Smoke @Budget', async ({ page }) => {
        test.setTimeout(900000); // CXO create + 4 approvals, then invoice + approvals

        const { a, cxoCode } = await cxoThenInvoiceForm(page);

        // Invoicing the CXO in full also exercises the exact-value boundary of the
        // §2.4 parent check — and leaves the CXO fully consumed for the next test.
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.fullQty, price: data.nonPoInvoice.fullPrice });
        await a.assertNonPoGrandTotal(data.nonPoInvoice.cxoValue);

        await a.submitInvoice();
        await a.approveInvoiceUntilPendingSync('Approved by automation', { acceptSyncFailed: true });
        await a.assertNonPoInvoiceReadyForAck();
        await a.saveInvoiceCode();

        // Integration: EBS acknowledgement flips Pending Sync → Accounted.
        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();

        // Final step per NSE: open the CXO and confirm it records the invoice.
        // (The overview shows only "CXO Total Value" — there is no consumed figure
        // to read, so linkage is asserted here and the ceiling behaviourally below.)
        await a.openCxoByCode(cxoCode);
        await a.assertCxoListsInvoice(a.getSavedInvoiceCode());
    });

    test('CXO code is displayed on the invoice @NonPO @Traceability', async ({ page }) => {
        test.setTimeout(900000);

        // §4.3 "CXO Display on Invoice" — the CXO number must be visible to
        // reviewers/approvers. It is shown at the review stage, i.e. on the created
        // invoice, NOT on the blank create form (asserting there found nothing).
        const { a, cxoCode } = await cxoThenInvoiceForm(page);

        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.halfQty, price: data.nonPoInvoice.fullPrice });
        await a.submitInvoice();

        await expect(page.getByText(cxoCode, { exact: false }).first())
            .toBeVisible({ timeout: 20000 });
        console.log(`[NONPO] invoice shows its CXO ${cxoCode}`);
    });

    // ── B. Budget ceiling (§2.4 hard parent check) ───────────────────────────

    test('Invoice value above the CXO value is blocked with Budget Exceeded @NonPO @Budget', async ({ page }) => {
        test.setTimeout(900000);

        const { a } = await cxoThenInvoiceForm(page);

        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        // overPrice × fullQty = 250,000 against a 200,000 CXO.
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.fullQty, price: data.nonPoInvoice.overPrice });

        const outcome = await a.submitNonPoInvoiceExpectingRejection();
        await a.assertBudgetExceeded(outcome);
        // The invoice must not have been created.
        await expect(page).toHaveURL(/\/invoices\/new/);
    });

    test('Second invoice against a fully consumed CXO is blocked @NonPO @Budget', async ({ page }) => {
        test.setTimeout(1200000);

        // Self-contained: builds and exhausts its OWN CXO. It must not lean on the
        // happy path's leftover savedCxo — the tests between them each create a CXO
        // and overwrite savedCxo, so this would otherwise assert against a fresh,
        // unconsumed CXO and pass for the wrong reason.
        const { a, cxoCode } = await cxoThenInvoiceForm(page);

        // Invoice 1: consume the CXO in full. Budget is taken at submission (§4
        // Step 5), so the approvals are not needed to exhaust it.
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.fullQty, price: data.nonPoInvoice.fullPrice });
        await a.submitInvoice();

        // Invoice 2: nothing left on the CXO → must be refused.
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);
        await a.expandNonPoSections();
        await a.selectNonPoCxo(cxoCode);
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: '1', price: data.nonPoInvoice.fullPrice });

        const outcome = await a.submitNonPoInvoiceExpectingRejection();
        await a.assertBudgetExceeded(outcome);
    });

    test('Partial consumption reduces available value, then available+1 is blocked @NonPO @Budget', async ({ page }) => {
        test.setTimeout(1200000);

        const { a, cxoCode } = await cxoThenInvoiceForm(page);
        const half = data.nonPoInvoice.cxoValue / 2;

        // Consume half the CXO.
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.halfQty, price: data.nonPoInvoice.fullPrice });
        await a.submitInvoice();
        await a.approveInvoiceUntilPendingSync('Approved by automation', { acceptSyncFailed: true });
        await a.assertNonPoInvoiceReadyForAck();

        // The CXO must now record that invoice. The numeric reduction is not
        // readable on this page, so the remaining-value check is the blocked
        // invoice below — the behavioural equivalent.
        await a.saveInvoiceCode();
        await a.openCxoByCode(cxoCode);
        await a.assertCxoListsInvoice(a.getSavedInvoiceCode());

        // Now a second invoice for more than what remains must be blocked.
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);
        await a.selectNonPoCxo(cxoCode);
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.halfQty, price: data.nonPoInvoice.overPrice });
        const outcome = await a.submitNonPoInvoiceExpectingRejection();
        await a.assertBudgetExceeded(outcome);
    });

    // ── C. Governance ────────────────────────────────────────────────────────

    test('Only Submitted CXOs with available value are selectable @NonPO @Validation', async ({ page }) => {
        test.setTimeout(600000);

        const a = await openCxoCreate(page);
        // A Draft CXO must never appear in the invoice's CXO picker (§4 Step 2).
        await a.createCxoDraft(data);
        const draftCode = a.getSavedCxoCode();

        await a.openNonPoInvoiceCreatePage();
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);

        const codes = await a.getSelectableCxoCodes();
        expect(codes.length).toBeGreaterThan(0);
        expect(codes).not.toContain(draftCode);
    });

    test('Submitting an empty Non-PO invoice is blocked with field errors @NonPO @Validation', async ({ page }) => {
        test.setTimeout(600000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.openNonPoInvoiceCreatePage();
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);

        // No CXO, no BRF, no details — Submit must not create anything. The happy-path
        // submitInvoice() would wait for a navigation that must never happen here.
        await a.submitNonPoInvoiceExpectingRejection({ settleMs: 6000 });
        await expect(page).toHaveURL(/\/invoices\/new/);
        await a.assertNonPoMandatoryErrorsShown();
    });

    // §2.6 + FAQ Q4: a REJECTED transaction is still active, so its budget stays
    // consumed on the CXO; CANCELLING it releases that value back.
    //
    // create CXO → invoice it in FULL → reject that invoice → a 2nd invoice must
    // be refused with Budget Exceeded → cancel the rejected invoice → the same
    // value must be invoiceable again.
    test('Rejection keeps budget consumed; cancellation releases it @NonPO @Budget @Reject @Cancel', async ({ page }) => {
        test.setTimeout(1800000); // 30 min — CXO + 3 invoice attempts + reject + cancel

        const { a, cxoCode } = await cxoThenInvoiceForm(page);

        // Invoice 1, FULL CXO value. Budget is taken at submission (§4 Step 5), so
        // this exhausts the CXO without needing any approval.
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.fullQty, price: data.nonPoInvoice.fullPrice });
        await a.submitInvoice();
        await a.saveInvoiceCode();
        const rejectedInvoice = a.getSavedInvoiceCode();

        // Reject it — via rejectCappDoc, NOT rejectInvoice: the invoice's CREATOR
        // gets no Reject action, which is how the 2026-08-25 whole-suite run failed
        // here ('no "Reject" under More', the menu offering only Recall / Reassign
        // Workflow Approver / Reassign User / Generate Document). rejectCappDoc
        // reassigns the workflow approver to this user when Reject is absent, then
        // rejects — the same path the PO-invoice reject-edit suite uses successfully.
        await a.openSavedInvoice(data);
        await a.rejectCappDoc('Rejected by automation', 'NONPO-INV');
        await a.assertCappDocStatus('Rejected', 'NONPO-INV');

        // The CXO still records the rejected invoice …
        await a.openCxoByCode(cxoCode);
        await a.assertCxoListsInvoice(rejectedInvoice);

        // … and its budget is still consumed, so a 2nd invoice must be refused.
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);
        await a.expandNonPoSections();
        await a.selectNonPoCxo(cxoCode);
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: '1', price: data.nonPoInvoice.fullPrice });
        const blocked = await a.submitNonPoInvoiceExpectingRejection();
        await a.assertBudgetExceeded(blocked);
        await expect(page).toHaveURL(/\/invoices\/new/);

        // Cancel the rejected invoice → releases the consumption (§2.6).
        await a.openSavedInvoice(data);
        await a.cancelInvoice('Cancelled by automation');
        await a.assertCappDocStatus('Cancelled', 'NONPO-INV');

        // The released value must now be invoiceable again — same CXO, full value.
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);
        await a.expandNonPoSections();
        await a.selectNonPoCxo(cxoCode);
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: data.nonPoInvoice.fullQty, price: data.nonPoInvoice.fullPrice });
        await a.submitInvoice();          // must NOT be blocked this time
        await a.saveInvoiceCode();
        await expect(page).not.toHaveURL(/\/invoices\/new/);
        console.log(`[NONPO] post-cancel invoice created: ${a.getSavedInvoiceCode()}`);
    });

});
