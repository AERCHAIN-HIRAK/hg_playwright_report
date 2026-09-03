import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 35 — an Evaluation present in the RFX can be evaluated.
//
// QA (2026-09-02) spelled the whole chain out:
//   1. Intake → RFX conversion page → Add Evaluation
//      name · section "RFP T&C - Letter of Commitment" · type Rating ·
//      approval type Any · evaluator NSEF Support Admin
//   2. fill the rest of the conversion as usual, submit, approve
//   3. while QUOTING, answer the questions in that section
//   4. submit the quote → foreclose
//   5. Evaluations tab → expand → Evaluate → hover an answer → pick a rating →
//      add a reason → tick → tick again to submit
//   6. the answers turn GREEN, and the Activity Timeline records the submission
//
// Built on a Released intake found on the listing, so each run creates its own
// RFX rather than consuming an ambient one. That makes it SLOW and it CREATES
// REAL RECORDS on UAT — one RFX per run.
//
// Stages are serial and hand the RFX over through S35_STATE, so a failed later
// stage can be re-run on its own with  S35_RFX=<url>  instead of rebuilding the
// whole chain.
// ─────────────────────────────────────────────────────────────────────────────

const EVAL_SECTION  = 'RFP T&C - Letter of Commitment';
const EVALUATOR     = 'NSEF Support Admin';
// NOT under test-results/: Playwright wipes that directory at the start of
// every run, which would lose the handover the moment a stage is re-run alone.
const STATE_FILE    = '.s35-state.json';

const readState = () => {
    if (process.env.S35_RFX) return { url: process.env.S35_RFX, label: process.env.S35_LABEL || '' };
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
};
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

test.describe.serial('RFX Evaluation (scenario 35)', () => {

    test.describe.configure({ timeout: 900000 });

    test('convert a Released intake to an RFX carrying an Evaluation @RFX @Evaluation @S32 @Slow', async ({ page }) => {
        test.setTimeout(900000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);
        await a.openApp(data);

        // ── find a Released intake ────────────────────────────────────────────
        await page.goto(`${data.loginUrl}/intakes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 40000 });
        await page.waitForTimeout(2500);

        const intake = await page.evaluate(() => {
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.indexOf('Status');
            for (const r of document.querySelectorAll('tbody tr')) {
                const tds = [...r.querySelectorAll('td')].map(t => (t.textContent || '').trim());
                if (tds[si] !== 'Released') continue;
                const link = r.querySelector('a');
                if (link) return { code: tds[0], href: link.getAttribute('href') };
            }
            return null;
        });
        test.skip(!intake, 'no Released intake available to convert');
        console.log(`[S35] converting ${intake.code} (${intake.href})`);

        await page.goto(`${data.loginUrl}${intake.href}/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);

        // ── Process → Send for Sourcing ───────────────────────────────────────
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await page.waitForTimeout(6000);

        await a.expandSourcingSections();
        await a.selectSourcingPaymentTerms();
        await a.fillSourcingCommercialBidDueDate(data);
        await a.fillSourcingTechnicalBidDueDate(data);
        await a.fillSourcingExpectedDeliveryDate(data);
        await a.addSourcingSupplier(data);

        await a.submitSourcingEvent();
        await a.approveSourcingUntilReleased();
        // Deliberately NOT saveSourcingEventCode(): that rewrites
        // savedSourcingEvent in NSEFoundationData.json, which the RFX Analysis
        // suite pins to its own sample RFX. This suite keeps its state in
        // test-results/s35-state.json instead.

        // ── the point of the scenario: the RFX carries an Evaluation ──────────
        //
        // QA described adding it ON THE CONVERSION PAGE. That control exists —
        // a button labelled "Add evaluation" (lower-case e) which appends a row
        // to an INLINE GRID whose cells are click-to-edit: name → an input
        // placeholdered "Label", Evaluation Type → a combobox offering
        // Rating / Traffic Light / Yes/No, and so on.
        //
        // The RFX page offers the SAME thing as a proper "Create Evaluation"
        // DIALOG — Label, Section, Assigned Users, Rating Type, Approval Type —
        // which is far less brittle to drive, and it is still added BEFORE the
        // RFX is quoted, so the precondition the scenario needs is identical.
        // Verified live: POST /quote-requests/<id>/evaluation → success:1, and
        // the evaluation then appears on the Evaluations tab as "Pending".
        const label = `Automation Eval ${Date.now()}`;
        await a.addRfxEvaluation({
            label, section: EVAL_SECTION, evaluator: EVALUATOR,
            ratingType: 'Rating', approvalType: 'Any Approver',
        });

        await page.goto(page.url().replace(/\/[^/]*$/, '/evaluations'),
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);
        await expect(page.locator(`xpath=${L.evalCardByLabel(label)}`).first())
            .toBeVisible({ timeout: 20000 });

        const url = page.url().replace(/\/evaluations$/, '/overview');
        writeState({ url, label, intake: intake.code });
        console.log(`[S35] RFX ready → ${url} (evaluation "${label}")`);
    });

    test('quote the RFX answering the evaluated section, then foreclose @RFX @Evaluation @S32 @Slow', async ({ page }) => {
        test.setTimeout(900000);

        const state = readState();
        test.skip(!state, 'stage 1 produced no RFX');

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);
        await a.openApp(data);

        await page.goto(state.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);

        await a.clickSupplierSubmitQuote();
        await a.clickCommercialQuoteOption();
        await a.selectQuotePreferredCurrency(data);
        await a.fillQuoteUnitRate(data);

        // The evaluated section's questions live on the quote form; they must be
        // answered or there is nothing to score later.
        const answered = await a.answerQuoteQuestions();
        console.log(`[S35] answered ${answered} question(s) on the quote`);
        expect(answered, 'the quote form exposed no questions to answer').toBeGreaterThan(0);

        await a.submitQuote();
        await a.assertSourcingStatusQuoted();

        await page.goto(state.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);
        await a.forecloseRfx(data);
        console.log('[S35] foreclosed');
    });

    test('score the evaluation and see it recorded @RFX @Evaluation @S32 @Slow', async ({ page }) => {
        test.setTimeout(900000);

        const state = readState();
        test.skip(!state, 'stage 1 produced no RFX');

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);
        await a.openApp(data);

        await page.goto(state.url.replace(/\/[^/]*$/, '/evaluations'),
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(8000);

        // Expand → Evaluate → star + reason + tick per answer → header tick.
        const result = await a.evaluateRfxEvaluation(state.label, {
            stars: 5, reason: 'Meets the commitment',
        });

        expect(result.scored, 'no answer was scored').toBeGreaterThan(0);
        expect(result.saveStatus, 'the evaluation submit was rejected').toBeLessThan(300);

        // EVERY answer must be captured. A single swallowed star click leaves
        // the evaluation on "Partially Completed" with that answer uncoloured —
        // seen for real on RFX-26-235 — so this is asserted explicitly rather
        // than being inferred from the status alone.
        expect(result.unscored, 'some answers carry no rating').toEqual([]);
        expect(result.greenAnswers, 'not every answer turned green')
            .toBe(result.totalAnswers);
        expect(result.status, 'the evaluation did not move to Completed').toBe('Completed');

        // ...and the submission must be on the Activity Timeline.
        const timeline = await a.readRfxActivityTimeline();
        const hit = timeline.filter(t => /evaluation has been submitted/i.test(t));
        console.log(`[S35] timeline evaluation entries: ${JSON.stringify(hit)}`);
        expect(hit.length, 'the Activity Log has no "Evaluation has been submitted" entry')
            .toBeGreaterThan(0);
    });
});
