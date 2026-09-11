import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp, buildToGrnViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// A REJECTED transaction must leave the approver's queue — sheet scenario 131
//
//   "Verify that rejecting or sending back an Invoice at the Review stage
//    updates its status correctly across all applicable pages and reports."
//
// QA made this concrete on 2026-09-08: after rejecting the transaction, the
// listing page's pending-approval view must NOT show it any more — and to be
// checked per module, not just for the Invoice.
//
// SCOPE: CXO, PO and Invoice ONLY, on QA's instruction. The other modules were
// probed live and simply have no such view:
//   GRN     /inwards          no approval text anywhere on the listing
//   Intake  /intakes          only "All"
//   RFX     /quote-requests   only "All"
// (An Intake tab_MyPendingApproval locator does exist in the repo, but no test
// ever exercised it and the live listing does not render it, so its presence was
// never real. Recorded here so it is not "rediscovered" later.)
//
// THE LABEL DIFFERS BY MODULE — this is the trap:
//   CXO      "My Pending Approval"   (v4, role=tab)
//   Invoice  "My Pending Approval"   (v3, plain text)
//   PO       "Pending My Approval"   (v3, plain text)  <- word order
//
// Each module builds its own transaction and rejects it, so the test proves the
// TRANSITION rather than inspecting some pre-existing rejected record.
//
// HOW FAR THE SCAN REACHES — worth knowing before trusting a pass:
//   CXO (v4)          PAGINATES. The 2026-09-08 run walked 47 codes across pages.
//   PO / Invoice (v3) ONE PAGE of 20 rows, and that is not a limitation of this
//                     helper: probed live, those views expose NO pagination
//                     control at all (no Next button, no pager icons, no
//                     "Showing X of Z" footer), so there is no page 2 to miss —
//                     but equally no way to read the queue's true size.
// The assertion therefore leans on these listings being newest-first: the
// transaction was created moments earlier, so if it were still queued it would
// sit at or near the top of the first page. Sound, but stated rather than
// assumed — if the v3 listings ever gain pagination, widen this scan.
// ─────────────────────────────────────────────────────────────────────────────

const V4 = 'https://nse-capp-v4-uat.aerchain.io';
const V3 = 'https://nse-capp-uat.aerchain.io';
const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const fresh = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

let dataSnapshot = null;

test.describe('Rejected transactions leave the pending-approval queue', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S131' }); });

    /** Switch to the module's pending-approval view and assert `code` is gone. */
    async function assertGoneFromPendingApproval(a, { url, label, code, tag }) {
        await a.openPendingApprovalView(url, label, tag);
        const codes = await a.listingCodesAcrossPages(15, tag);
        console.log(`[${tag}] looking for ${code} in "${label}" — ${codes.length} row(s) scanned`);
        expect(codes,
            `${code} was rejected but is STILL listed in "${label}"`)
            .not.toContain(code);
    }

    // ── CXO ───────────────────────────────────────────────────────────────────
    test('a rejected CXO is not in My Pending Approval @Reject @Listing @S131 @CXO',
        async ({ page }) => {
            test.setTimeout(900000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await a.clickCxoTab();
            await a.assertCxoListingPage();
            await a.clickCreateCxo();
            await a.assertCxoCreatePage();
            await a.createAndSubmitCxo(data);
            await a.saveCxoCode();
            const code = fresh().savedCxo?.code;
            expect(code, 'the CXO code was not captured').toBeTruthy();

            await a.rejectCxo('Rejected by automation');
            await a.assertCxoStatusRejected();
            console.log(`[S131-CXO] ${code} rejected`);

            await assertGoneFromPendingApproval(a, {
                url: `${V4}/cxos`, label: 'My Pending Approval', code, tag: 'S131-CXO',
            });
        });

    // ── PO ────────────────────────────────────────────────────────────────────
    test('a rejected PO is not in Pending My Approval @Reject @Listing @S131 @PO',
        async ({ page }) => {
            test.setTimeout(2400000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // approvePo:false leaves the PO in Pending Approval, i.e. actually in
            // the queue — rejecting an already-approved PO would prove nothing.
            await buildToPoViaCapp(a, data, { approvePo: false });
            const code = fresh().savedPurchaseOrder?.code;
            console.log(`[S131-PO] built ${code} in Pending Approval`);

            await a.openSavedPurchaseOrder(data);
            await a.rejectCappDoc('Rejected by automation', 'S131-PO');

            await assertGoneFromPendingApproval(a, {
                url: `${V3}/purchase-orders`, label: 'Pending My Approval', code, tag: 'S131-PO',
            });
        });

    // ── Invoice ───────────────────────────────────────────────────────────────
    test('a rejected Invoice is not in My Pending Approval @Reject @Listing @S131 @Invoice',
        async ({ page }) => {
            test.setTimeout(2700000);
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // Full-qty GRN so the invoice can be matched and reach Pending Approval
            // cleanly — an unmatched invoice goes to Disputed instead (scenario 69).
            await buildToGrnViaCapp(a, data);
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
            const code = fresh().savedInvoice?.code;
            expect(code, 'the Invoice code was not captured').toBeTruthy();
            console.log(`[S131-INV] built ${code}`);

            // The invoice must be OPEN before rejecting: after submit the browser is
            // still on the PO page, where the header Reject never renders.
            await a.openSavedInvoice(data);
            await a.rejectCappDoc('Rejected by automation', 'S131-INV');

            await assertGoneFromPendingApproval(a, {
                url: `${V3}/invoices`, label: 'My Pending Approval', code, tag: 'S131-INV',
            });
        });
});
