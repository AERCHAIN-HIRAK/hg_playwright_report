import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// Intake → RFX from two tabs at once — sheet scenario 18
//
//   "Verify if Intake is converted to RFX from two different tabs in a span of
//    5 seconds then the later tab should throw error"
//
// QA's steps (2026-09-11): open the SAME intake in two tabs, take both as far as
// the Workflow Summary dialog and leave it open in each, click Submit in tab 1,
// wait 5 seconds, then click Submit in tab 2.
//
// WHY THE DIALOG IS THE RACE POINT
// --------------------------------
// Scenario 17 established that the Workflow Summary Submit is where the
// conversion actually commits: the sourcing form itself validates nothing, and a
// refusal arrives as a transient bottom-right toast with NO network request.
// So both tabs are parked on that dialog and only the final click is staggered —
// which is the race QA described, not a "click Submit twice quickly" approximation.
//
// submitSourcingEvent() cannot be used: it clicks Submit and confirms the dialog
// in one motion, which would commit tab 1 before tab 2 was ever parked.
//
// WHAT IT ASSERTS
// ---------------
// Primary, per the scenario: the LATER tab must show an error.
// Corroborating, and the invariant that actually matters: the intake must end up
// with exactly ONE RFX. A silent second conversion is the real damage; an error
// that appears while two RFXs are created would still be a bug.
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE_QTY = Number(data.intake.itemQty);
const GAP_MS = 5000;

let dataSnapshot = null;

test.describe('Intake → RFX — same intake converted from two tabs', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S18' }); });

    test('the second tab to submit the conversion is rejected '
        + '@Intake @RFX @Negative @Concurrency @S18 @Slow', async ({ page, context }) => {
        test.setTimeout(2_400_000); // 40 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // Stored CXO, as for scenario 17 — this flow does not draw it down.
        const cxoCode = a.getSavedCxoCode();
        expect(cxoCode, 'no stored CXO in NSEFoundationData.json').toBeTruthy();
        console.log(`[S18] reusing stored CXO ${cxoCode}`);

        // ── One intake, one line, Released ──────────────────────────────────
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.createAndSubmitIntake(data, { qty: INTAKE_QTY });
        await a.approveIntakeUntilReleased(data, 'Approved by automation — scenario 18');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();
        const intakeCode = a.getSavedIntakeCode();
        const intakeId = (page.url().match(/\/intakes\/(\d+)/) || [])[1];
        console.log(`[S18] intake ${intakeCode} (id ${intakeId}) released`);

        // ── Second tab, same session ────────────────────────────────────────
        const page2 = await context.newPage();
        await page2.setViewportSize({ width: 1800, height: 950 });
        const b = new NSEFoundationActions(page2);
        await b.openApp(data);

        // ── Park BOTH tabs on the open Workflow Summary ─────────────────────
        const parkOnWorkflowSummary = async (act, tag) => {
            await act.clickIntakeTab();
            await act.openSavedIntakeFromListing();
            await act.clickIntakeProcess();
            await act.clickSendForSourcing();
            await act.expandSourcingSections();
            await act.selectSourcingPaymentTerms();
            await act.fillSourcingCommercialBidDueDate(data);
            await act.fillSourcingTechnicalBidDueDate(data);
            await act.fillSourcingExpectedDeliveryDate(data);
            await act.addSourcingSupplier(data);
            await act.startErrorRecorder();          // toasts are transient — see S17
            await act.openSourcingWorkflowSummary();
            console.log(`[S18]${tag} parked on the Workflow Summary`);
        };
        await parkOnWorkflowSummary(a, ' [tab1]');
        await parkOnWorkflowSummary(b, ' [tab2]');

        // ── The race: tab 1, then tab 2 five seconds later ──────────────────
        const r1 = await a.clickWorkflowSummarySubmit(' [tab1]');
        console.log(`[S18] tab1 submit: ${JSON.stringify(r1)}`);
        await page.waitForTimeout(GAP_MS);
        const r2 = await b.clickWorkflowSummarySubmit(' [tab2]');
        console.log(`[S18] tab2 submit (+${GAP_MS / 1000}s): ${JSON.stringify(r2)}`);
        await page.waitForTimeout(10000);

        const tab1Errors = await a.readRecordedErrors();
        const tab2Errors = await b.readRecordedErrors();
        console.log(`[S18] tab1 recorded: ${JSON.stringify(tab1Errors)}`);
        console.log(`[S18] tab2 recorded: ${JSON.stringify(tab2Errors)}`);
        await a.takeScreenshot('s18_tab1_after');
        await b.takeScreenshot('s18_tab2_after');

        // ── How many RFXs did this intake actually produce? ─────────────────
        //
        // NOT by scraping /intakes/<id>/quote-requests: that route does not
        // exist and silently falls back to the intake Overview, which never
        // carries an RFX code. Run 1 read it once and saw [], run 2 retried it
        // ten times and saw [] — a wrong page, patiently re-read.
        //
        // The winner's own URL is the direct evidence: a successful conversion
        // lands the tab on /quote-requests/<id>/overview. The loser must NOT
        // have gone there.
        const rfxIdTab1 = (page.url().match(/\/quote-requests\/(\d+)/) || [])[1] ?? null;
        const rfxIdTab2 = (page2.url().match(/\/quote-requests\/(\d+)/) || [])[1] ?? null;
        console.log(`[S18] tab1 landed on RFX ${rfxIdTab1} | tab2 RFX ${rfxIdTab2}`);

        expect(rfxIdTab1,
            `tab1 won the race but did not land on an RFX — it ended on ${page.url()}`)
            .toBeTruthy();
        expect(rfxIdTab2,
            `the losing tab also produced an RFX (${rfxIdTab2}) — the same intake was `
            + 'converted twice')
            .toBeNull();

        // Corroborate on the intake's Transactions tab, which is where the
        // conversion is actually listed.
        await page.goto(`${data.loginUrl}/intakes/${intakeId}/overview`,
            { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        const txnTab = page.locator(
            `xpath=//*[@role='tab' or @data-slot='tabs-trigger'][contains(normalize-space(.),'Transactions')]`).first();
        let rfxCodes = [];
        if (await txnTab.isVisible({ timeout: 8000 }).catch(() => false)) {
            await txnTab.click();
            for (let i = 0; i < 6; i++) {
                await page.waitForTimeout(3000);
                rfxCodes = await page.evaluate(() =>
                    [...new Set((document.body.innerText.match(/RFX-\d+-\d+/g) || []))]);
                if (rfxCodes.length) break;
            }
        } else {
            console.log('[S18] no Transactions tab found on the intake');
        }
        console.log(`[S18] RFXs listed on the intake Transactions tab: ${JSON.stringify(rfxCodes)}`);
        expect(rfxCodes.length,
            `the intake should list exactly ONE RFX after the race; found ${rfxCodes.length} `
            + `(${rfxCodes.join(', ') || 'none'})`)
            .toBe(1);

        // And per the scenario, the later tab must SAY so rather than fail silently.
        // The real message, captured live 2026-09-11:
        //   "One or more line items are already part of an existing RFX"
        // Asserting the text, not merely "something error-ish appeared", is what
        // makes this a regression test — a future build that blocks the second
        // tab silently, or with a message that does not explain why, now fails.
        const ERRORISH = /already part of an existing rfx|already (been )?(converted|processed)|duplicate/i;
        const tab2Error = tab2Errors.find(t => ERRORISH.test(t)) ?? null;
        expect(tab2Error,
            'the second tab submitted the same conversion 5s later and showed no error. '
            + `tab2 recorded: ${JSON.stringify(tab2Errors)}`)
            .toBeTruthy();
        console.log(`[S18] later tab rejected with: "${tab2Error}"`);

        // The race is only meaningful if tab 1 actually WON. Without this, a run
        // where both tabs failed would still satisfy "tab2 showed an error".
        expect(tab1Errors.join(' | '),
            `tab1 was supposed to win the race but recorded: ${JSON.stringify(tab1Errors)}`)
            .toMatch(/created successfully/i);
    });

});
