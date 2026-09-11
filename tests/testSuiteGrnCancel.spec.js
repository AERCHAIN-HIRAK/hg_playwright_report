import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/V3ListingData.json';
import nsefData from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// GRN — Cancel availability vs invoice matching
//
// Sheet scenarios:
//   67  Cancel is NOT available for a GRN once it is FULLY matched with an Invoice
//   68  Cancel is NOT available for a GRN once it is PARTIALLY matched
//
// The listing's "Matched" column renders an ICON and NO TEXT:
//   <span class="progress-completed">  fully matched
//   <span class="progress-pending">    not matched
// Reading that column with innerText returns '' for every row, which is exactly
// why a first pass concluded "no GRN is matched to an invoice" when several
// were. Match state must be read from the icon class.
//
// Cancel is a TOP-LEVEL button on a GRN, not a More-menu item — the GRN More
// menu holds "Reassign User" only.
//
// Verified live 2026-09-03:
//   /inwards/553  INW-NSEFN-26-106  fully matched, INV linked → NO Cancel
//   /inwards/567  INW-NSEFN-26-108  unmatched                 → Cancel present
//   /inwards/565  INW-NSEFN-26-107  unmatched                 → NO Cancel
// That last row is the important one: an unmatched GRN does NOT necessarily
// offer Cancel either, so "Cancel is absent" on a matched GRN proves nothing on
// its own. The test therefore DISCOVERS a live baseline — an unmatched GRN that
// really does offer Cancel — and skips rather than passing hollowly if none
// exists.
//
// Read-only: nothing is cancelled.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('GRN — Cancel availability vs invoice matching', () => {

    test.describe.configure({ timeout: 300000 });

    /** @type {v3DetailActions} */
    let grn;

    test.beforeEach(async ({ page }) => {
        grn = new v3DetailActions(page, data.modules.grn);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    test('Cancel is unavailable once a GRN is fully matched with an Invoice @Grn @Cancel @S67', async () => {
        const rows = await grn.listGrnsWithMatchState(data.baseUrl);

        // Only the ICON is trustworthy here — the listing's INV Code column reads
        // '-' even for matched GRNs, so requiring it would skip every time.
        // The invoice linkage is confirmed on the GRN's own page below.
        const matched = rows.filter(r => r.matched === 'completed');
        test.skip(!matched.length,
            'no GRN carries the "progress-completed" match icon on page 1');

        // Baseline first: prove Cancel is offered SOMEWHERE in the unmatched
        // state, otherwise its absence on a matched GRN is not evidence.
        let baseline = null;
        for (const row of rows.filter(r => r.matched !== 'completed' && !r.invoice).slice(0, 6)) {
            const actions = await grn.readGrnActions(row.id, data.baseUrl);
            if (grn.grnCanBeCancelled(actions)) { baseline = { row, actions }; break; }
        }
        test.skip(!baseline,
            'no unmatched GRN offers Cancel either, so its absence on a matched GRN would prove nothing');
        console.log(`[S67] baseline: ${baseline.row.code} (unmatched) DOES offer Cancel`);

        // Now the assertion proper.
        // Take the first matched GRN that really does link an invoice on its own
        // page — that is the precondition scenario 67 describes.
        let target = null, actions = null;
        for (const row of matched.slice(0, 6)) {
            const a = await grn.readGrnActions(row.id, data.baseUrl);
            if (a.invoiceCodes.length) { target = row; actions = a; break; }
        }
        test.skip(!target,
            'GRNs carry the matched icon but none links an invoice on its detail page');
        console.log(`[S67] target: ${target.code} matched to ${actions.invoiceCodes.join(', ')}`);

        expect(grn.grnCanBeCancelled(actions),
            `${target.code} is fully matched to ${actions.invoiceCodes.join(', ')} but still offers Cancel`)
            .toBeFalsy();
    });

    // ── 68: build the partial match, then prove Cancel is withheld ───────────
    //
    // QA's flow (2026-09-07): CXO → … → PO, GRN for the FULL 100, Invoice for
    // 50 matched to that GRN, approve + acknowledge until Accounted, then open
    // the GRN and confirm Cancel is gone.
    //
    // This REPLACES the earlier discovery-based version, which could only skip:
    // the GRN listing's Matched column renders just progress-completed or
    // progress-pending, so a partially-matched GRN is indistinguishable from an
    // unmatched one there and no amount of searching can identify one. The only
    // way to have a GRN matched for LESS than its quantity is to build it.
    //
    // The BASELINE is the point of the design. Verified live 2026-09-03,
    // /inwards/565 was unmatched and still offered no Cancel — so "Cancel is
    // absent" proves nothing on its own. Here the baseline is taken on THE SAME
    // GRN while it is still unmatched, which is far stronger than comparing two
    // different GRNs: the only thing that changes between the two reads is the
    // partial match.
    //
    // ⚠️ CREATES REAL RECORDS on UAT: one CXO, Intake, RFX, award, PR, PRC, PO,
    // GRN and Invoice per run, all subjected "HG Automation …".
    //
    // Cross-frontend on purpose: the chain runs on v4 (nse-capp-v4-uat) while
    // the GRN cancel state is read on v3 (nse-capp-uat), where the button
    // inventory was verified. Same backend — the pattern testSuiteInvoiceCancelGrn
    // already uses.
    test('a GRN partially matched to an Accounted Invoice cannot be cancelled @Grn @Cancel @S68 @S117 @Slow', async ({ page }) => {
        test.setTimeout(2700000);   // 45 min — full CXO → … → PO → GRN → Invoice build

        const a = new NSEFoundationActions(page);
        await a.openApp(nsefData);

        // S68_RESUME=1 skips the ~40 minute build and picks up the GRN/Invoice the
        // last run left in NSEFoundationData.json. Read from DISK, never the module
        // import — the import is a snapshot taken before any run wrote to it.
        // NOTE: resuming CANNOT re-establish the baseline (the invoice already
        // exists, so the GRN is no longer unmatched), so a resumed run verifies the
        // tail of the flow only and says so.
        const RESUME = process.env.S68_RESUME === '1';
        let grnCode, listed, invCode;

        if (RESUME) {
            const fresh = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
            grnCode = fresh.savedGrn?.code;
            invCode = fresh.savedInvoice?.code;
            expect(grnCode, 'S68_RESUME needs savedGrn in NSEFoundationData.json').toBeTruthy();
            console.log(`[S68] RESUME — GRN ${grnCode}, invoice ${invCode} (baseline NOT re-established)`);
            listed = (await grn.listGrnsWithMatchState(data.baseUrl)).find(g => g.code === grnCode);
            expect(listed, `${grnCode} is not on the v3 GRN listing`).toBeTruthy();
            await a.openSavedInvoice(nsefData);
        } else {

        // ── CXO → Intake → RFX → award → PR → PRC → PO ────────────────────────
        await buildToPoViaCapp(a);

        // ── 117: the PO code must be shown correctly at every step ────────────
        // Read from DISK — the module import is a snapshot from before this run
        // wrote savedPurchaseOrder.
        const poCode = JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'))
            .savedPurchaseOrder?.code;
        expect(poCode, 'buildToPoViaCapp left no savedPurchaseOrder.code').toBeTruthy();
        await a.assertPoCodeVisible(poCode, 'PO view page');

        // ── GRN for the FULL PO quantity (100) ────────────────────────────────
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.fillGrnGeneralDetails(nsefData);
        await a.fillGrnDocumentDetails(nsefData);
        await a.assertPoCodeVisible(poCode, 'GRN creation page');
        // The GRN must cover the WHOLE line, otherwise the later 50-qty invoice
        // would be a FULL match of a 50 GRN rather than a partial match of 100.
        await a.assertGrnReceivedMatchesPoQty();
        await a.submitGrn();
        grnCode = await a.saveGrnCode();
        expect(grnCode, 'saveGrnCode() returned no GRN code').toBeTruthy();
        await a.approveGrnUntilInwarded('Approved by automation — scenario 68');
        await a.assertGrnInwarded();
        await a.assertPoCodeVisible(poCode, 'GRN view page (post-approval)');
        console.log(`[S68] GRN under test: ${grnCode} (full qty ${nsefData.intake.itemQty})`);

        // ── BASELINE: while unmatched, this GRN DOES offer Cancel ──────────────
        listed = (await grn.listGrnsWithMatchState(data.baseUrl))
            .find(g => g.code === grnCode);
        expect(listed, `${grnCode} is not on the v3 GRN listing`).toBeTruthy();
        const before = await grn.readGrnActions(listed.id, data.baseUrl);
        expect(grn.grnCanBeCancelled(before),
            `${grnCode} offers no Cancel even while UNMATCHED, so its absence after partial matching `
            + 'would prove nothing — this scenario cannot be demonstrated on this GRN')
            .toBeTruthy();
        console.log(`[S68] baseline OK — ${grnCode} offers Cancel while unmatched`);

        // ── Invoice for 50 of the 100, matched to that GRN ─────────────────────
        await a.openSavedPurchaseOrder(nsefData);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(nsefData);
        await a.assertPoCodeVisible(poCode, 'Invoice creation page');
        await a.fillInvoiceDetails(nsefData);
        await a.setInvoiceGeneralDetailsNo();
        await a.setInvoiceQty('50');
        await a.matchGrnInItemMatching();
        // Item Matching can push the GRN's matched qty (100) back into the row,
        // which would turn this into a FULL match and silently invalidate the
        // scenario — re-apply 50 if that happened.
        await a.ensureInvoiceQty('50');
        await a.submitInvoice();
        invCode = await a.saveInvoiceCode();
        await a.assertPoCodeVisible(poCode, 'Invoice view page (pending approval)');
        console.log(`[S68] invoice ${invCode} raised for 50 of ${nsefData.intake.itemQty}`);

        }   // end of the non-RESUME build

        // ── Approve + acknowledge until Accounted ─────────────────────────────
        // acceptSyncFailed: this UAT has NO EBS integration, so the invoice
        // finishes its approvals on "Sync Failed" rather than "Pending Sync" —
        // verified 2026-09-07 on /invoices/1148 (buttons: Cancel · Re-Initiate ·
        // More). Without the flag the loop burns its 12 rounds reloading and
        // throws "Invoice did not reach Pending Sync status". Sync Failed is still
        // acknowledgeable through to Accounted.
        await a.approveInvoiceUntilPendingSync('Approved by automation — scenario 68',
            { acceptSyncFailed: true });
        await a.acknowledgeInvoice(nsefData);
        await a.assertInvoiceAccounted();
        console.log(`[S68] ${invCode} is Accounted`);

        // ── The GRN must now refuse to be cancelled ───────────────────────────
        const after = await grn.readGrnActions(listed.id, data.baseUrl);
        console.log(`[S68] ${grnCode} after partial match — invoices on page: `
            + `${after.invoiceCodes.join(', ') || 'none'}`);
        expect(grn.grnCanBeCancelled(after),
            `${grnCode} is partially matched to an Accounted invoice (${invCode}, 50 of `
            + `${nsefData.intake.itemQty}) but still offers Cancel`)
            .toBeFalsy();
    });
});
