import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// Over-quantity on Intake → RFX — sheet scenario 17
//
//   "Verify if RFX to Intake is done more than the Intake quantity then error is
//    displayed properly"
//
// QA's steps (2026-09-11): create an Intake the normal way — ONE line item, not
// the 100-line bulk one — convert it to RFX, set a quantity higher than the
// intake's, and check the error.
//
// The CXO is REUSED, not created (QA, 2026-09-11): the flow never submits the
// RFX, and CXO budget is consumed at PR submit, so the stored CXO is never drawn
// down by this test.
//
// WHERE THE ERROR LIVES IS THE OPEN QUESTION
// ------------------------------------------
// The app could guard this in three places: refuse the keystroke in the grid,
// complain on blur, or reject on submit. So this asserts the GUARD, not a
// particular message: the over-quantity must be stopped somewhere, and the run
// logs exactly where so the assertion can be tightened to that afterwards.
//
// It deliberately does NOT use setSourcingLineItemQty, which asserts the cell
// now holds the typed value — correct when LOWERING a qty (scenario 6), and
// self-defeating here, where the app is supposed to refuse. That helper would
// fail on its own assertion and tell us nothing about the app's error handling.
//
// The test fails only if the over-quantity is accepted with no complaint
// anywhere AND the RFX submits — which is the defect this scenario guards.
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE_QTY = Number(data.intake.itemQty);   // 100
const OVER_QTY   = INTAKE_QTY + 50;               // 150 — more than the intake

let dataSnapshot = null;

test.describe('Intake → RFX — quantity above the intake', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S17' }); });

    test('converting more quantity than the intake holds is refused with an error '
        + '@Intake @RFX @Negative @S17 @Slow', async ({ page }) => {
        test.setTimeout(2_400_000); // 40 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── Reuse the stored CXO — do NOT create one ────────────────────────
        // Per QA (2026-09-11). This scenario never submits the RFX, and CXO
        // budget is consumed at PR SUBMIT, not at intake release — so one stored
        // CXO serves every run of this test and creating a fresh one each time
        // cost ~2-3 min and left a junk CXO behind. selectIntakeCXOTransaction
        // reads the code fresh from disk, and saveCxoCode is never called, so
        // the fixture is left exactly as found.
        const cxoCode = a.getSavedCxoCode();
        expect(cxoCode, 'no stored CXO in NSEFoundationData.json — this scenario reuses one '
            + 'rather than creating it; run a CXO-creating suite first, or set savedCxo.code')
            .toBeTruthy();
        console.log(`[S17] reusing stored CXO ${cxoCode} (none created)`);

        // ── Intake, ONE line item, qty 100 → Released ───────────────────────
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.createAndSubmitIntake(data, { qty: INTAKE_QTY });
        await a.approveIntakeUntilReleased(data, 'Approved by automation — scenario 17');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();
        console.log(`[S17] intake ${a.getSavedIntakeCode()} released with qty ${INTAKE_QTY}`);

        // ── Process → Send For Sourcing ─────────────────────────────────────
        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.expandSourcingSections();
        await a.takeScreenshot('s17_sourcing_form');

        // Record from here on. Per QA (2026-09-11) the error appears AFTER the
        // Workflow Summary Submit click and then fades - a snapshot taken
        // seconds later misses it entirely, which is what sent runs 1-5 astray.
        await a.startErrorRecorder();

        // ── Ask for more than the intake holds ──────────────────────────────
        //
        // "Is anything on screen?" is NOT an error signal. Two earlier runs proved
        // it: v1 matched the destructive-styled "Cancel" BUTTON, v2 matched the
        // ordinary "Workflow Summary" approval popup, and both reported a guard
        // the app had not shown. So the match is on error SEMANTICS about
        // quantity, and the raw evidence is always logged for inspection.
        // The exact message the app raises, captured live 2026-09-11:
        //   "Requested quantity exceeds the quantity approved in the intake for:
        //    Manpower (T&M) (requested: 150, approved: 100). Please adjust the
        //    quantity and try again."
        // Asserting the TEXT, not merely "an error appeared", is what makes this a
        // regression test: it fails if the app ever starts blocking silently, or
        // stops echoing the two quantities that make the message actionable.
        const QTY_ERROR = /requested quantity exceeds the quantity approved in the intake/i;
        const findQtyError = (e) => [...e.toasts, ...e.inline, e.dialog]
            .filter(Boolean).find(t => QTY_ERROR.test(t)) ?? null;

        const attempt = await a.attemptSourcingLineItemQty(OVER_QTY);
        await a.takeScreenshot('s17_over_qty_entered');

        let guardedAt = null;
        if (!attempt.accepted) {
            guardedAt = `the grid refused the value (cell held "${attempt.after}")`;
        } else {
            const gridErr = findQtyError(attempt.errors);
            if (gridErr) guardedAt = `an error on the sourcing grid: "${gridErr}"`;
        }

        // ── Nothing complained? Then the submit is the last line of defence ──
        let rfxCode = null;
        if (!guardedAt) {
            console.log('[S17] the grid took the over-quantity silently — pushing it to submit');
            await a.selectSourcingPaymentTerms();
            await a.fillSourcingCommercialBidDueDate(data);
            await a.fillSourcingTechnicalBidDueDate(data);
            await a.fillSourcingExpectedDeliveryDate(data);
            await a.addSourcingSupplier(data);
            await a.submitSourcingEvent()
                .catch(e => console.log(`[S17] submit threw: ${e.message.split('\n')[0]}`));
            await page.waitForTimeout(4000);

            // submitSourcingEvent confirms ONE dialog. This form then shows a
            // second "Workflow Summary" popup carrying its own Submit, and in
            // the normal chain approveSourcingUntilReleased deals with it. Run 3
            // stopped here with that popup still open and no RFX created, which
            // would have made "the guard is missing" a false accusation: a
            // server-side quantity check never got the chance to fire.
            // Instrumented, NOT swallowed. Run 4 clicked this three times with a
            // .catch(() => {}) and logged "cleared" each time while the dialog
            // never moved - hiding whether the click threw or the app refused.
            // The dialog's Submit is [cursor=pointer], i.e. not disabled, and in
            // the working chain (buildRfxToForeclose, lower qty) the same submit
            // goes through - so what the server says here is the answer.
            const netLog = [];
            const onResp = async (r) => {
                const m = r.request().method();
                if (m === 'GET') return;   // everything else, no URL guessing
                let body = ''; try { body = (await r.text()).slice(0, 400); } catch {}
                netLog.push(`${m} ${r.status()} ${r.url().split('?')[0].slice(-60)} :: ${body.replace(/\s+/g, ' ')}`);
            };
            page.on('response', onResp);

            for (let i = 0; i < 3; i++) {
                const dlgSubmit = page.locator(
                    `xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
                if (!(await dlgSubmit.isVisible({ timeout: 4000 }).catch(() => false))) {
                    console.log(`[S17] no dialog Submit visible on pass ${i + 1} - dialog is gone`);
                    break;
                }
                const enabled = await dlgSubmit.isEnabled().catch(() => null);
                try {
                    await dlgSubmit.click({ timeout: 8000 });
                    console.log(`[S17] dialog Submit clicked (pass ${i + 1}, enabled=${enabled})`);
                } catch (e) {
                    console.log(`[S17] dialog Submit click FAILED (pass ${i + 1}, enabled=${enabled}): `
                        + e.message.split('\n')[0]);
                }
                await page.waitForTimeout(6000);
            }
            page.off('response', onResp);
            console.log(`[S17] network during submit:\n  ${netLog.slice(-12).join('\n  ') || '(nothing)'}`);
            await page.waitForTimeout(4000);

            const afterSubmit = await a.collectVisibleErrors();
            const recorded = await a.readRecordedErrors();
            console.log(`[S17] evidence after submit: ${JSON.stringify(afterSubmit)}`);
            const submitErr = findQtyError({ ...afterSubmit, toasts: [...afterSubmit.toasts, ...recorded] });
            if (submitErr) guardedAt = `an error on submit: "${submitErr}"`;

            // No quantity error anywhere. Did the app actually CREATE an RFX for
            // more than the intake holds? That is the defect this scenario
            // guards, so name the record rather than reporting a bare failure.
            if (!guardedAt) {
                rfxCode = await page.evaluate(() =>
                    (document.body.innerText.match(/RFX-\d+-\d+/) || [null])[0]);
                const stillOpen = await page.evaluate(() =>
                    (document.querySelector('[role="dialog"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120));
                console.log(`[S17] no quantity error; url=${page.url()} rfxOnPage=${rfxCode} dialogStillOpen="${stillOpen}"`);

                // Only a COMPLETED submission can prove the guard is missing.
                // If the form never got through its dialogs, say so instead of
                // accusing the app.
                console.log(`[S17] recorder saw: ${JSON.stringify(await a.readRecordedErrors())}`);
                expect(stillOpen,
                    'the sourcing submission never completed, and the recorder caught no quantity '
                    + 'error either - so this run cannot say whether the app guards the over-quantity. '
                    + 'Fix the submit path, not the app.')
                    .toBe('');
            }
            await a.takeScreenshot('s17_after_submit');
        }

        expect(guardedAt,
            `an RFX quantity of ${OVER_QTY} against an intake holding only ${INTAKE_QTY} produced `
            + 'no quantity error in the grid and none on submit'
            + (rfxCode ? ` — and the RFX ${rfxCode} was created anyway` : '')
            + '. The over-quantity guard is missing.')
            .toBeTruthy();
        console.log(`[S17] over-quantity refused by: ${guardedAt}`);

        // The message must stay actionable: it names the item and BOTH quantities.
        // A bare "invalid quantity" would satisfy the regex above but leave the
        // user with nothing to act on, so assert the numbers are echoed too.
        expect(guardedAt, 'the error should echo the requested quantity')
            .toMatch(new RegExp(`requested:\\s*${OVER_QTY}`, 'i'));
        expect(guardedAt, 'the error should echo the quantity the intake approved')
            .toMatch(new RegExp(`approved:\\s*${INTAKE_QTY}`, 'i'));
        expect(guardedAt, 'the error should name the line item it rejected')
            .toContain(data.intake.itemNameOption);
    });

});
