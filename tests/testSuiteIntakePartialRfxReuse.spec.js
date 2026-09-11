import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildRfxToForeclose, buildAwardToPrSubmitted } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// Partial RFX conversion, then reuse of the remaining CXO amount — scenario 6
//
//   "Verify that after partially processing an Intake through multiple partial
//    RFXs and marking the Intake as Processed, the remaining CXO amount is
//    correctly reusable."
//
// QA's steps (2026-09-09):
//   one CXO → intake 100 qty → create RFX for 50 qty, LOWERING it from 100 →
//   flow through to PR edit-submit → mark the intake as Processed → a NEW intake
//   on the same CXO for 50 qty → convert to RFX → flow through to PR submit.
//
// WHAT THE SECOND CHAIN ACTUALLY PROVES
// -------------------------------------
// Budget is consumed when the PR is SUBMITTED — not at intake release and not
// at the award (measured live 2026-09-09; see testSuiteCxoRevertPartialBudget
// for the before/after readings). So:
//
//   PR 1's submit consumes  50 × 2,000 = 100,000  of the CXO's 200,000
//   marking intake 1 Processed abandons its other 50 WITHOUT consuming it
//   award 2 must therefore still find 100,000 available
//
// If closing out a partially converted intake wrongly consumed or locked the
// abandoned half, the SECOND PR submit is where it would surface — as a budget
// error. That is why the test asserts a clean submit on both chains rather than
// only on the first.
//
// Both intakes hang off ONE CXO: chain 2 passes skipCxo, so buildRfxToForeclose
// links the new intake to the savedCxo chain 1 created.
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE1_QTY = 100;   // the intake carries the CXO's full quantity
const RFX1_QTY = 50;       // …but only half of it is converted to the RFX
const INTAKE2_QTY = 50;    // the remaining half, as a second intake

let dataSnapshot = null;

test.describe('Intake — partial RFX conversion leaves the rest of the CXO reusable', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // Two full chains rewrite savedCxo … savedRequisition, which other suites
    // read as fixtures. Restore them; the UAT records themselves remain.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S6' }); });

    test('half an intake is converted to an RFX, the intake is closed, and the CXO\'s '
        + 'remaining half still reaches a submitted PR @Intake @RFX @Budget @S6 @Slow',
        async ({ page }) => {
            test.setTimeout(5_400_000); // 90 min — two CXO-to-PR chains back to back

            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // ── Chain 1: CXO → intake (100) → RFX for only 50 → quote → foreclose.
            await buildRfxToForeclose(a, data, { intakeQty: INTAKE1_QTY, rfxQty: RFX1_QTY });
            const cxoCode = a.getSavedCxoCode();
            const intake1 = a.getSavedIntakeCode();
            console.log(`[S6] CXO ${cxoCode} | intake 1 ${intake1} (qty ${INTAKE1_QTY}, RFX qty ${RFX1_QTY})`);
            await a.takeScreenshot('s6_chain1_foreclosed');

            // Award → PR → edit → submit. The submit consumes 50 × 2,000 of the CXO.
            const pr1 = await buildAwardToPrSubmitted(a, data);
            console.log(`[S6] chain 1 PR submitted: ${pr1}`);
            await a.takeScreenshot('s6_chain1_pr_submitted');

            // ── Intake 1 has only half of it converted, so it should NOT be closed
            //    yet. Read the chip rather than assuming — this is the state that
            //    makes "Mark Processed" meaningful.
            await a.openApp(data);
            await a.clickIntakeTab();
            await a.openSavedIntakeFromListing();
            // Wait for the chip: read immediately after the navigation it comes back
            // "" from a half-drawn page, and "" would satisfy the not.toBe below
            // without checking anything (that is exactly what happened on the
            // 2026-09-09 run).
            const statusBeforeClose = await a.readV4StatusChip({ timeoutMs: 30000 });
            console.log(`[S6] ${intake1} status after a 50-of-100 conversion: "${statusBeforeClose}"`);
            expect(statusBeforeClose, `no status chip rendered on ${intake1} — the assertion below `
                + 'would pass vacuously').toBeTruthy();
            expect(statusBeforeClose,
                `${intake1} converted only ${RFX1_QTY} of ${INTAKE1_QTY}, so it should still be open `
                + '(Partially Processed / Released) — a fully Processed intake would mean the partial '
                + 'conversion consumed the whole line').not.toBe('Processed');

            // ── More → Mark Processed → the intake closes with its other 50 unused.
            await a.markIntakeProcessed('Closing the partially converted intake (automation, scenario 6)');
            await a.assertIntakeStatusProcessed();
            await a.takeScreenshot('s6_intake1_marked_processed');

            // ── Chain 2: a SECOND intake on the SAME CXO for the remaining 50.
            //    (buildRfxToForeclose opens the Intake tab itself.)
            await buildRfxToForeclose(a, data, { skipCxo: true, intakeQty: INTAKE2_QTY });
            const intake2 = a.getSavedIntakeCode();
            expect(intake2, 'the second intake must be a new record, not intake 1')
                .not.toBe(intake1);
            console.log(`[S6] intake 2 ${intake2} (qty ${INTAKE2_QTY}) on CXO ${cxoCode}`);
            await a.takeScreenshot('s6_chain2_foreclosed');

            // The assertion that carries the scenario: the remaining CXO amount is
            // still usable, so this award and PR submit go through cleanly too.
            const pr2 = await buildAwardToPrSubmitted(a, data);
            expect(pr2, 'the second chain must produce its own PR').not.toBe(pr1);
            console.log(`[S6] chain 2 PR submitted: ${pr2} — remaining CXO amount was reusable`);
            await a.takeScreenshot('s6_chain2_pr_submitted');
        });

});
