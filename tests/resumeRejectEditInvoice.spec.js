import { test } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// RESUME helpers for the Invoice case of testSuiteallmodulesrejectedit (test 5).
//
// They skip the ~15 min CXO → … → PO build and start from the
// savedPurchaseOrder / savedGrn / savedInvoice already in NSEFoundationData.json.
// A full run cannot feed them: test 5 overwrites those keys with documents it has
// driven to Accounted (whole-suite run 2026-08-25: 5b found its PO fully
// consumed, 5c clicked a greyed-out Edit on an Accounted invoice). So this file
// lives outside the full run — playwright.config.js only loads it, as the
// `nsef-resume` project, when RESUME=1 or RESUME_GRN=1 is set:
//
//   RESUME=1     npx playwright test --project=nsef-resume -g "@InvoiceOnly"
//   RESUME=1     npx playwright test --project=nsef-resume -g "@InvoiceEditOnly"
//   RESUME_GRN=1 npx playwright test --project=nsef-resume -g "@GrnResume"
// ─────────────────────────────────────────────────────────────────────────────

const LOWER_QTY = '50';   // same decrease as test 5
const RESUME = process.env.RESUME === '1';
const RESUME_GRN = process.env.RESUME_GRN === '1';

async function openApp(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    return a;
}

test.describe('Invoice reject → edit — resume helpers', () => {
    // ── 5a-bis. Invoice (resume from the saved PO, starting at GRN create) ──────
    // Same as test 5 but SKIPS the CXO -> ... -> PO build, resuming at GRN CREATION
    // against savedPurchaseOrder. Added 2026-09-17: the full run's GRN passed all
    // three approval stages and then landed on SYNC FAILED, where the header drops
    // Approve and offers Re-Initiate, so approveGrnUntilInwarded threw "GRN did not
    // reach Inwarded status". QA cancelled that GRN (INW-NSEFN-26-162) and asked to
    // continue from GRN creation on the same PO rather than rebuild the ~15 min chain.
    // Requires: savedPurchaseOrder is an OPEN PO with no live GRN consuming its qty.
    test('Invoice (resume from saved PO, from GRN create): GRN -> Invoice -> reject -> edit (qty-) -> reduced qty available @RejectEdit @GrnResume',
        async ({ page }) => {
            test.skip(!RESUME_GRN, 'resume helper — needs an OPEN savedPurchaseOrder; run with RESUME_GRN=1');
            test.setTimeout(2400000); // 40 min — GRN + invoice + reject + edit + approvals + ack
            const a = await openApp(page);

            // GRN against the saved PO — create + inward it.
            await a.openSavedPurchaseOrder(data);
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
            await a.takeScreenshot('re_inv_grnresume_created');

            // Reject the Invoice during approval — the invoice must be OPEN first.
            await a.openSavedInvoice(data);
            await a.rejectCappDoc('Rejected by automation', 'INV');
            await a.takeScreenshot('re_inv_grnresume_rejected');

            // Edit -> lower the qty + annotate -> resubmit.
            await a.editInvoiceLowerQtyAndSubmit(LOWER_QTY);
            await a.takeScreenshot('re_inv_grnresume_edited');

            // Resubmit re-triggers approvals -> Pending Sync -> acknowledge -> Accounted.
            await a.approveInvoiceUntilPendingSync('Approved by automation');
            await a.assertInvoicePendingSync();
            await a.acknowledgeInvoice(data);
            await a.openSavedInvoice(data);
            await a.assertInvoiceAccounted();
            await a.takeScreenshot('re_inv_grnresume_accounted');

            // Confirm the reduced qty is available for creating an Invoice on the PO.
            await a.assertPoQtyAvailableForInvoice(LOWER_QTY, data);
            await a.takeScreenshot('re_inv_grnresume_qty_available');
        });

    // ── 5b. Invoice (resume) ────────────────────────────────────────────────────
    // Same as test 5 but SKIPS the CXO → … → PO → GRN build, resuming from the
    // Invoice-creation step against the PO/GRN already saved in
    // NSEFoundationData.json (savedPurchaseOrder / savedGrn). Use for iterating on
    // the invoice reject → edit → re-invoice portion without the ~15 min chain.
    // Requires: savedPurchaseOrder points at an open PO whose savedGrn is Inwarded.
    test('Invoice (resume from saved PO): create Invoice → reject → edit (qty↓) → reduced qty available @RejectEdit @InvoiceOnly', async ({ page }) => {
        test.skip(!RESUME, 'resume helper — needs savedPurchaseOrder to be an OPEN PO with an Inwarded savedGrn; run with RESUME=1');
        test.setTimeout(1200000); // 20 min — create + reject + edit + approvals + ack
        const a = await openApp(page);

        // Create the Invoice against the saved PO (matched to its saved GRN).
        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.fillInvoiceDetails(data);
        await a.setInvoiceGeneralDetailsNo();

        // 2nd invoice on a partially consumed PO: the form defaults to the FULL PO
        // qty, which the app then refuses to submit silently (stays on
        // /invoices/new with no error), so lower it to the PO's remaining balance
        // first. Item Matching can push the GRN's qty back in, hence the re-assert.
        await a.setInvoiceQty(LOWER_QTY);
        await a.matchGrnInItemMatching();
        await a.ensureInvoiceQty(LOWER_QTY);

        await a.submitInvoice();
        await a.saveInvoiceCode();
        await a.takeScreenshot('re_inv_resume_created');

        // Reject the Invoice during approval. The invoice must be OPEN first: after
        // submitInvoice/saveInvoiceCode the browser is still on the PR/PO page, so the
        // header 'Reject' never renders and the reject step timed out on the wrong doc.
        await a.openSavedInvoice(data);
        await a.rejectCappDoc('Rejected by automation', 'INV');
        await a.takeScreenshot('re_inv_resume_rejected');

        // Edit → lower the qty + annotate → resubmit.
        await a.editInvoiceLowerQtyAndSubmit(LOWER_QTY);
        await a.takeScreenshot('re_inv_resume_edited');

        // Resubmit re-triggers approvals → approve to Pending Sync → acknowledge
        // via the external API → Accounted.
        await a.approveInvoiceUntilPendingSync('Approved by automation');
        await a.assertInvoicePendingSync();
        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();
        await a.takeScreenshot('re_inv_resume_accounted');

        // Confirm the reduced qty is available for creating an Invoice on the PO.
        await a.assertPoQtyAvailableForInvoice(LOWER_QTY, data);
        await a.takeScreenshot('re_inv_resume_qty_available');
    });

    // ── 5c. Invoice (resume from the rejected invoice) ───────────────────────────
    // Starts at the EDIT step on the already-rejected invoice saved in
    // NSEFoundationData.json (savedInvoice) — no build, no create, no reject. Use
    // for iterating on the edit → re-match → resubmit → approve → ack portion.
    // Requires: savedInvoice is Rejected and belongs to savedPurchaseOrder/savedGrn.
    test('Invoice (resume from rejected invoice): edit (qty↓) → resubmit → approve → ack → reduced qty available @RejectEdit @InvoiceEditOnly', async ({ page }) => {
        test.skip(!RESUME, 'resume helper — needs savedInvoice to be a REJECTED invoice; run with RESUME=1');
        test.setTimeout(900000); // 15 min
        const a = await openApp(page);

        // Open the rejected invoice, then edit → lower the qty + re-match → resubmit.
        await a.openSavedInvoice(data);
        // Precondition check: a non-Rejected invoice has its Edit greyed out, which
        // otherwise surfaces as an opaque "element is not enabled" click timeout.
        await a.assertCappDocStatus('Rejected', 'INV');
        await a.editInvoiceLowerQtyAndSubmit(LOWER_QTY);
        await a.takeScreenshot('re_inv_edit_only_edited');

        // Resubmit re-triggers approvals → approve to Pending Sync → acknowledge
        // via the external API → Accounted.
        await a.approveInvoiceUntilPendingSync('Approved by automation');
        await a.assertInvoicePendingSync();
        await a.acknowledgeInvoice(data);
        await a.openSavedInvoice(data);
        await a.assertInvoiceAccounted();
        await a.takeScreenshot('re_inv_edit_only_accounted');

        // Confirm the reduced qty is available for creating an Invoice on the PO.
        await a.assertPoQtyAvailableForInvoice(LOWER_QTY, data);
        await a.takeScreenshot('re_inv_edit_only_qty_available');
    });
});
