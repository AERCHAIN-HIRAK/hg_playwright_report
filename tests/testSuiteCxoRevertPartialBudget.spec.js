import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildRfxToForeclose, buildAwardToPrSubmitted } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// Revert Pending Budget on a PARTIALLY PROCESSED CXO — sheet scenario 2
//
//   "Verify revert pending budget can be done for the partially processed CXO"
//
// QA's steps (2026-09-09): CXO for 200,000 → an intake for 100,000 → revert the
// pending budget from the CXO VIEW PAGE.
//
// WHY THE CHAIN GOES PAST THE INTAKE
// ----------------------------------
// A released intake consumes NOTHING. Nor does the award. Budget is consumed
// when the PR is SUBMITTED. Measured live 2026-09-09 on CXO-FNSE-26-406, whose
// award (AWD-FNSE-26-170, 100,000) left requisition 1134 sitting in Pending
// Review as "PR-DRAFT":
//
//   before the PR was submitted ... transaction 200,000 / consumed 0       / pending 200,000
//   after  the PR was submitted ... transaction 200,000 / consumed 100,000 / pending 100,000
//
// The first run of this test stopped at the award and read consumed 0 — the
// award is NOT the trigger. Corroborating readings on other CXOs: two intakes
// merely Released, and an intake whose RFX was only Quoted, both still showed
// consumed 0 / pending 200,000.
//
// So a CXO whose intake merely exists is NOT partially processed, and reverting
// there would revert the whole 200,000 — the scenario would assert nothing. The
// intake is therefore carried through to a SUBMITTED PR, which consumes exactly
// its own 100,000 and leaves 100,000 pending. That is the state the sheet
// describes.
//
// The whole point of the test is the SPLIT, so the amounts are asserted
// explicitly rather than "some number was reverted".
// ─────────────────────────────────────────────────────────────────────────────

// CXO line: qty 100 × 2,000. Intake line: qty 50 × 2,000 — half the CXO.
const CXO_VALUE = parseInt(data.lineItem.quantity, 10) * parseInt(data.lineItem.suggestedPrice, 10);
const INTAKE_QTY = 50;
const INTAKE_VALUE = INTAKE_QTY * parseInt(data.intake.itemSuggestedPrice, 10);
const EXPECTED_PENDING = CXO_VALUE - INTAKE_VALUE;

let dataSnapshot = null;

test.describe('CXO — Revert Pending Budget on a partially processed CXO', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // The chain rewrites savedCxo … savedRequisition, which other suites read as
    // fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S2' }); });

    test('half the CXO is consumed by a submitted PR; the other half is revertable '
        + '@CXO @RevertBudget @Budget @S2 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000); // 60 min — CXO + intake + RFX + award + PR, all with approvals

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // ── Build: CXO (200,000) → intake for HALF of it → RFX → quote → foreclose
        await buildRfxToForeclose(a, data, { intakeQty: INTAKE_QTY });
        const cxoCode = a.getSavedCxoCode();
        console.log(`[S2] CXO ${cxoCode} worth ${CXO_VALUE}; intake worth ${INTAKE_VALUE}`);

        // ── Award → PR → edit → SUBMIT. The submit is what consumes the
        //    intake's 100,000; stopping at the award leaves consumed at 0.
        const pr = await buildAwardToPrSubmitted(a, data);
        console.log(`[S2] PR ${pr} submitted — the CXO should now be half consumed`);
        await a.takeScreenshot('s2_pr_submitted');

        // ── The CXO view page → More → Revert Pending Budget (read, don't submit).
        //    buildAwardToPrSubmitted leaves the browser on the capp-domain PR page.
        await a.openApp(data);
        await a.openCxoByCode(cxoCode);
        // close:true — revertPendingBudget re-opens the More menu itself, which a
        // still-open modal would swallow.
        const budget = await a.readPendingBudgetRow({ close: true });
        await a.takeScreenshot('s2_revert_dialog_partial');

        expect(budget.empty,
            `${cxoCode} reports no pending budget — the submitted PR appears to have consumed `
            + `the WHOLE ${CXO_VALUE}, not just the intake's ${INTAKE_VALUE}`).toBeFalsy();

        // The split is the scenario: half consumed by the award, half still pending.
        expect(budget.transactionValue, 'CXO transaction value').toBe(CXO_VALUE);
        expect(budget.consumed, `consumed should be the submitted PR's ${INTAKE_VALUE}`)
            .toBe(INTAKE_VALUE);
        expect(budget.pending, `pending should be the un-processed ${EXPECTED_PENDING}`)
            .toBe(EXPECTED_PENDING);
        // The dialog pre-fills Rollback Value with the full pending amount.
        expect(budget.rollbackValue, 'rollback pre-fill').toBe(EXPECTED_PENDING);

        // ── Revert that remaining half, with remarks, from the same dialog.
        const reverted = await a.revertPendingBudget({
            remarks: `Reverting the un-processed ${EXPECTED_PENDING} of ${cxoCode} (automation, scenario 2)`,
        });
        expect(parseFloat(String(reverted).replace(/,/g, '')), 'amount submitted for rollback')
            .toBe(EXPECTED_PENDING);
        await a.takeScreenshot('s2_revert_submitted');

        // ── Re-open the dialog: nothing is pending any more, and the consumed
        //    half is untouched — the PR still holds its budget.
        await a.assertPendingBudgetReverted();
        await a.takeScreenshot('s2_revert_verified');
    });

});
