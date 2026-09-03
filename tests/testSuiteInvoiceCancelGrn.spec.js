import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { v3DetailActions } from '../pages/v3DetailActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';
import v3data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling an Invoice releases its GRN match
//
// Sheet scenarios, all satisfied by ONE chain:
//   66   cancelling the Invoice changes the GRN status back to Unmatched
//   122  …and releases the matched quantity
//   151  …and restores the PO balance so the PO can be invoiced again
//
// ⚠️ THIS BUILDS ITS OWN DATA AND CREATES REAL RECORDS ON UAT — one CXO, Intake,
// RFX, award, PR, PRC, PO, GRN and Invoice per run, all subjected
// "HG Automation …". That is deliberate: every existing PO in this tenant is
// consumed (Create → GRN is a silent no-op on them) and `savedGrn` already
// points at a GRN matched to INV-AUTO-001, so the RESUME shortcut cannot be
// used. Verified 2026-09-03.
//
// The cancellation IS performed here — unlike scenario 81, which withholds it.
// The difference is ownership: 81 would reverse a pre-existing posted invoice,
// whereas this invoice was created by this test seconds earlier and exists only
// to be cancelled.
//
// Match state is read from the GRN listing's "Matched" column ICON
// (span.progress-completed / span.progress-pending) — that column renders no
// text at all, so innerText reads '' for every row.
// ─────────────────────────────────────────────────────────────────────────────

// RESUME=1 skips the 15-minute build and starts at invoice creation, against the
// PO/GRN already in NSEFoundationData.json. Requires savedPurchaseOrder to be an
// OPEN PO whose savedGrn is Inwarded and NOT already matched — which is exactly
// the state this test leaves behind, so a passing run sets up its own resume.
// Mirrors the convention in testSuiteallmodulesrejectedit.
const RESUME = process.env.RESUME === '1';

test.describe('Invoice cancellation releases the GRN match', () => {

    test('cancelling a matched Invoice returns its GRN to Unmatched and frees the qty @Invoice @Grn @Cancel @S66 @S122 @S151 @Slow', async ({ page }) => {
        test.setTimeout(2700000); // 45 min — full CXO → … → PO → GRN → Invoice build

        const a = new NSEFoundationActions(page);
        const grnListing = new v3DetailActions(page, v3data.modules.grn);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        let grnCode;

        if (RESUME) {
            // Re-read from DISK, never from the module import — the import is a
            // snapshot from before any run wrote to it.
            const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
            grnCode = fresh.savedGrn?.code;
            expect(grnCode, 'RESUME needs savedGrn in NSEFoundationData.json').toBeTruthy();
            console.log(`[S66] RESUME — reusing PO ${fresh.savedPurchaseOrder?.code} / GRN ${grnCode}`);
        } else {
            // ── Build CXO → Intake → RFX → award → PR → PRC → PO ──────────────
            await buildToPoViaCapp(a);

            // ── GRN against the PO ────────────────────────────────────────────
            await a.clickPoCreateGrn();
            await a.submitSelectPoItemsPopup();
            await a.fillGrnGeneralDetails(data);
            await a.fillGrnDocumentDetails(data);
            await a.submitGrn();

            // CAPTURE what saveGrnCode() RETURNS. There is no getSavedGrn()
            // getter, and reading `data.savedGrn.code` gets the module-level JSON
            // import — a snapshot taken at import time, BEFORE this run wrote to
            // it. That cost a 14-minute run: a previous run's GRN
            // (INW-NSEFN-26-106, already matched to INV-AUTO-001) was read
            // instead of the one this chain had just created, and the baseline
            // assertion failed claiming the fresh GRN was "already matched".
            grnCode = await a.saveGrnCode();
            expect(grnCode, 'saveGrnCode() returned no GRN code').toBeTruthy();

            await a.approveGrnUntilInwarded('Approved by automation');
            await a.assertGrnInwarded();
        }
        console.log(`[S66] GRN under test: ${grnCode}`);

        // Baseline — a freshly inwarded GRN must NOT be matched yet, otherwise
        // "it became unmatched after cancelling" would prove nothing.
        const before = (await grnListing.listGrnsWithMatchState(v3data.baseUrl))
            .find(g => g.code === grnCode);
        expect(before, `${grnCode} is not on the GRN listing`).toBeTruthy();
        expect(before.matched, `${grnCode} was already matched before any invoice existed`)
            .not.toBe('completed');

        // ── Invoice against the PO, matched to that GRN ───────────────────────
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

        // ── 66 precondition: the GRN is now matched ───────────────────────────
        const matched = (await grnListing.listGrnsWithMatchState(v3data.baseUrl))
            .find(g => g.code === grnCode);
        expect(matched?.matched,
            `${grnCode} did not become matched after the invoice was submitted`)
            .toBe('completed');
        console.log(`[S66] ${grnCode} is matched — cancelling the invoice`);

        // ── Recall, then cancel ───────────────────────────────────────────────
        // A Pending-Approval invoice has NO Cancel action — its More menu holds
        // Reassign Workflow Approver / Reassign User / Recall / Download /
        // Regenerate, and nothing else. Cancel appears only once the invoice is
        // Rejected or Accounted. Recall is the cheap route: its dialog says
        // outright "Transaction will be kept in Rejected Status", after which a
        // top-level Cancel appears. Verified live on Invoice-FNSE-26-363.
        await a.openSavedInvoice(data);
        const recalled = await a.recallInvoice('Recalled by automation — scenario 66/122/151');
        expect(recalled, 'the invoice offered no Recall, so it cannot be made cancellable').toBeTruthy();
        await a.cancelInvoice('Cancelled by automation — scenario 66/122/151');

        // ── 66: the GRN returns to Unmatched ──────────────────────────────────
        const after = (await grnListing.listGrnsWithMatchState(v3data.baseUrl))
            .find(g => g.code === grnCode);
        expect(after, `${grnCode} vanished from the GRN listing after the cancel`).toBeTruthy();
        expect(after.matched,
            `${grnCode} is still matched after its only invoice was cancelled`)
            .not.toBe('completed');
        console.log(`[S66] ${grnCode} match state after cancel: "${after.matched || 'unmatched'}"`);

        // ── 122 / 151: the quantity and PO balance are released ───────────────
        // The observable proof that the qty came back is that the PO will once
        // again offer the FULL line quantity for a NEW invoice. `intake.itemQty`
        // is what the chain raises the line item with (100), so that is the
        // quantity that must reappear once the cancelled invoice stops holding
        // it. (data.grn has no qty key — it carries only document references.)
        const fullQty = data.intake.itemQty;
        expect(fullQty, 'intake.itemQty is missing from NSEFoundationData.json').toBeTruthy();
        await a.assertPoQtyAvailableForInvoice(fullQty, data);
        console.log(`[S122/S151] the PO offers ${fullQty} for invoicing again`);
    });
});
