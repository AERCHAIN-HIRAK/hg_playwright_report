import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import data from '../pages/V3ListingData.json';

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

    // ── 68 / 117 moved 2026-11-24 ────────────────────────────────────────────
    // The partial-match case now runs in testSuiteInvoiceCancelGrn.spec.js, as
    // step 4 of a serial group that shares one PO + GRN with S116 and S66.
});
