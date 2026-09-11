import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildRfxToForeclose } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Award → reject → cancel → re-award — sheet scenario 7
//
//   "Verify that an RFX Award created from a CXO Intake can be cancelled and a
//    new Award can be created successfully."
//
// QA's steps (2026-09-10): create CXO → Intake → convert to RFX → quote →
// foreclose → award → REJECT the award during approvals → CANCEL the award from
// the More dropdown → back to the RFX's Analysis tab → award again → approve →
// assert the PR draft.
//
// WHAT THIS ACTUALLY PROVES
// -------------------------
// A rejected-then-cancelled award must not leave the RFX stuck: its quantity has
// to return to the pool so a second award can allocate it and produce a PR. The
// re-award is therefore driven through the SAME path as the first (Analysis tab
// → Award → allocate → submit), and the run only passes if the second award
// reaches a requisition. A test that merely asserted "status = Cancelled" would
// miss the case where the qty stays locked and no further award is possible.
//
// The first award is deliberately NOT approved — rejecting it mid-workflow is
// the scenario. Note the award workflow frequently assigns its first stage to
// another user (completeAwardApprovals hits the same thing), so rejectAward
// reassigns to NSEF Support Admin and retries before giving up.
// ─────────────────────────────────────────────────────────────────────────────

// Resume from an award that has ALREADY been rejected, skipping the ~8 min
// CXO → Intake → RFX → quote → foreclose → award → reject build:
//
//   S7_AWARD_URL=https://nse-capp-v4-uat.aerchain.io/rfx/1533/awards/752 \
//   S7_RFX_CODE=RFX-26-296 S7_RFX_ID=1533 \
//     npx playwright test tests/testSuiteAwardCancelReaward.spec.js --project=nsef-tests
//
// Use it when the CANCEL or RE-AWARD half is what needs re-testing — rebuilding
// the whole chain to reach it wastes the work already done.
// Skip straight to the RE-AWARD half against an RFX whose award is already
// Cancelled — the part this scenario really tests:
//   S7_REAWARD_ONLY=1 S7_RFX_CODE=RFX-26-296 S7_RFX_ID=1533 npx playwright test ...
const REAWARD_ONLY = process.env.S7_REAWARD_ONLY === '1';

const RESUME_AWARD = process.env.S7_AWARD_URL
    ? {
        awardUrl: process.env.S7_AWARD_URL,
        rfx: {
            code: process.env.S7_RFX_CODE,
            id: process.env.S7_RFX_ID,
            url: `https://nse-capp-v4-uat.aerchain.io/quote-requests/${process.env.S7_RFX_ID}/overview`,
        },
    }
    : null;

let dataSnapshot = null;

test.describe('RFX Award — reject, cancel, then award again', () => {

    // ~120 interactions against a slow shared UAT; the global 5s actionTimeout is
    // tuned for short suites and loses races on this app's header re-renders.
    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // The chain rewrites savedCxo … savedRequisition, which other suites read as
    // fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S7' }); });

    test('a rejected award can be cancelled and the RFX awarded again to a fresh PR '
        + '@RFX @Award @Cancel @S7 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000); // 60 min — CXO → … → award, twice over

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        let awardUrl;
        if (REAWARD_ONLY) {
            const fixture = path.resolve('pages/NSEFoundationData.json');
            const cfg = JSON.parse(fs.readFileSync(fixture, 'utf-8'));
            cfg.savedSourcingEvent = {
                code: process.env.S7_RFX_CODE,
                id: process.env.S7_RFX_ID,
                url: `https://nse-capp-v4-uat.aerchain.io/quote-requests/${process.env.S7_RFX_ID}/overview`,
            };
            fs.writeFileSync(fixture, JSON.stringify(cfg, null, 4), 'utf-8');
            console.log(`[S7] re-award only, on ${process.env.S7_RFX_CODE} (award already cancelled)`);
            await a.hoverSourcingTab();
            await a.clickQuoteRequestMenu();
            await a.openSavedSourcingEventFromListing();
            const before = await a.readAwardSummary({ navigate: true });
            expect(before.status, 'this path expects an already-cancelled award')
                .toMatch(/Cancelled/i);
            await a.clickAnalysisTab();
        } else if (RESUME_AWARD) {
            // Point the fixture at the existing RFX so the Awards-tab reader and
            // the listing lookup both resolve to it.
            const fixture = path.resolve('pages/NSEFoundationData.json');
            const cfg = JSON.parse(fs.readFileSync(fixture, 'utf-8'));
            cfg.savedSourcingEvent = RESUME_AWARD.rfx;
            fs.writeFileSync(fixture, JSON.stringify(cfg, null, 4), 'utf-8');
            awardUrl = RESUME_AWARD.awardUrl;
            console.log(`[S7] resuming from rejected award ${awardUrl} on ${RESUME_AWARD.rfx.code}`);
        } else {
            // ── CXO → Intake → RFX → quote → foreclose ──────────────────────
            await buildRfxToForeclose(a, data);
            console.log(`[S7] CXO ${a.getSavedCxoCode()} | RFX ${a.getSavedSourcingEvent().code}`);
            await a.takeScreenshot('s7_foreclosed');

            // ── Award #1 — submitted into its workflow, NOT approved ────────
            await a.clickAnalysisTab();
            await a.clickAwardButton();
            await a.fillAllocatedQuantity();
            await a.clickAwardButton();
            await a.submitWorkflowSummary();
            awardUrl = page.url();
            console.log(`[S7] award #1 submitted → ${awardUrl}`);
            await a.takeScreenshot('s7_award1_submitted');

            // ── Reject it during approvals ──────────────────────────────────
            await a.rejectAward('Rejected by automation — scenario 7');
        }

        if (!REAWARD_ONLY) {
        // ── Cancel it from the More dropdown, ON THE SAME AWARD PAGE ────────
        // Per QA (2026-09-10): after rejecting, stay on the award approvals page
        // and go straight to More → Cancel. Navigating away to read a status
        // first and coming back is NOT the flow under test — the More menu is
        // exercised in the state the reject leaves the page in.
        if (RESUME_AWARD) {
            await page.goto(awardUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
        }
        // Evidence of the state the reject left behind, captured without leaving
        // the page (the award's own status is not shown here — see below).
        console.log(`[S7] actions on the rejected award page: `
            + JSON.stringify(await a.listPageActions()));
        await a.takeScreenshot('s7_award1_rejected');

        await a.cancelAward('Cancelled by automation — scenario 7');
        await a.takeScreenshot('s7_award1_cancelled');

        // ── Back arrow beside the award code → the RFX's Awards view ────────
        // Per QA (2026-09-10): use the UI back button, assert the cancellation
        // THERE, then go to Analysis. That view is the only place the AWARD's own
        // status is shown — the award detail page renders the parent RFX's badge
        // and the line item's Status, both of which read "Awarded" on an award
        // that is in fact Rejected (verified on AWD-FNSE-26-198).
        await a.clickAwardBackArrow();
        const afterCancel = await a.readAwardSummary({ navigate: false });
        expect(afterCancel.status, 'the Awards view must report a status').toBeTruthy();
        expect(afterCancel.status, `award #1 should read Cancelled, not "${afterCancel.status}"`)
            .toMatch(/Cancelled/i);
        expect(afterCancel.requisition, 'a cancelled award must not have produced a PR')
            .toMatch(/^-?$/);
        console.log(`[S7] award #1 final status: "${afterCancel.status}"`);
        await a.takeScreenshot('s7_award1_cancelled_verified');

        // ── Analysis tab → award again ──────────────────────────────────────
        await a.clickAnalysisTab();
        await a.takeScreenshot('s7_analysis_after_cancel');
        }

        // The whole point: the cancelled award released its quantity, so a new
        // award can allocate it. fillAllocatedQuantity throws if nothing is
        // pending, which is exactly the failure this scenario guards against.
        await a.clickAwardButton();
        await a.fillAllocatedQuantity();
        await a.clickAwardButton();
        await a.submitWorkflowSummary();
        console.log('[S7] award #2 submitted');
        await a.takeScreenshot('s7_award2_submitted');

        // ── Approve award #2 through to a requisition ───────────────────────
        await a.completeAwardApprovals('Approved by automation — scenario 7');
        await a.clickAwardBackArrow();
        const prCode = await a.waitForRequisitionCode();
        console.log(`[S7] award #2 produced requisition: ${prCode}`);
        expect(prCode, 'the re-award must produce a requisition').toBeTruthy();
        expect(prCode, `requisition code "${prCode}" should look like a PR`)
            .toMatch(/PR/i);
        await a.takeScreenshot('s7_award2_pr_created');
    });

});
