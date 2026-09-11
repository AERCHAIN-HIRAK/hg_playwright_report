import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import nsefData from '../pages/NSEFoundationData.json';
import fs from 'fs';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// PO Recall — sheet scenario 65
//
//   "Verify that a PO can be recalled successfully and its status is updated
//    accordingly to draft"
//
// THE SHEET'S "DRAFT" IS WRONG. QA, 2026-09-08: Recall opens a popup with a
// MANDATORY REASON, and after submitting it the transaction goes to REJECTED.
// The test asserts Rejected and tolerates Draft, so it still passes if the app
// ever changes to match the sheet — but it will not pass on nothing happening,
// which is what the first attempt produced when it submitted with no reason.
//
// CORRECTION (2026-09-08). This was recorded as "NOT COVERED (action absent) —
// no Recall action was found in any PO menu at any status checked". That was
// wrong, and the reason is instructive: every probe looked at Submitted /
// In-progress POs, because the chain builder APPROVES the PO the moment it is
// created, so the one status that offers Recall never survived long enough to
// inspect.
//
// QA (2026-09-08): the PO is in Pending Approval right after it is auto-created,
// and Recall is there while it is. Verified live by reading both menus:
//
//   PO-NSEFN-26-213  Pending Approval  ->  Clone · RECALL · Reassign User ·
//                                          Reassign Workflow Approver ·
//                                          Regenerate Document
//   PO-NSEFN-26-220  approved/active   ->  Clone · Reassign User ·
//                                          Regenerate Document      (no Recall)
//
// So Recall is status-gated, not absent. The companion test in
// testSuitePurchaseOrder.spec.js that asserts Recall is absent from an ACTIVE
// PO's menu stays correct and is left alone — it is scoped to Submitted /
// In-progress, which is exactly where Recall should not appear.
//
// Builds its own PO with { approvePo: false } rather than reusing an ambient
// Pending-Approval one: recalling is DESTRUCTIVE, and PO-NSEFN-26-213 is the
// fixture scenario 71 (PO amend budget) reads.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
let dataSnapshot = null;

test.describe('Purchase Order — Recall', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // The chain rewrites savedCxo … savedPurchaseOrder, which other suites read
    // as fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => {
        restoreFixtures(dataSnapshot, { tag: 'S65' });
    });

    test('a Pending-Approval PO offers Recall; recalling it with a reason rejects the PO '
        + '@PO @Recall @S65', async ({ page }) => {
        test.setTimeout(2400000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(nsefData);

        // DEBUG FAST PATH. Set S65_PO_ID to the CAPP id of a PO already sitting in
        // Pending Approval to skip the ~20 min chain build. Not for CI — it depends
        // on ambient data, and a recalled PO is single-use, so the default path
        // below builds its own.
        const reuseId = process.env.S65_PO_ID;
        let poCode = null;
        if (reuseId) {
            console.log(`[S65] FAST PATH — reusing PO id ${reuseId}, skipping the chain build`);
            await page.goto(`https://nse-capp-uat.aerchain.io/purchase-orders/${reuseId}`,
                { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForTimeout(13000);
            poCode = await page.evaluate(() =>
                ((document.body.innerText || '').match(/PO-[A-Z0-9\-]*\d+/) || [])[0] || null);
        } else {
            // Stop before approving — that is the whole point.
            await buildToPoViaCapp(a, nsefData, { approvePo: false });
            poCode = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedPurchaseOrder?.code;
        }
        console.log(`[S65] target PO ${poCode}`);

        const before = await a.readPoStatus();
        expect(before, 'the freshly created PO should be Pending Approval, which is the only '
            + `status that offers Recall — it reads "${before}"`)
            .toMatch(/pending[-\s]?approval/i);

        const after = await a.recallPoWithReason('Recalled by automation');
        console.log(`[S65] ${poCode}: ${before} → ${after}`);
        // Rejected is what QA confirmed; Draft is tolerated so this still passes if
        // the app is ever changed to match the sheet's wording.
        expect(after, `the recalled PO settled on "${after}" — expected Rejected (per QA) or Draft `
            + '(per the sheet wording)').toMatch(/rejected|draft/i);
    });
});
