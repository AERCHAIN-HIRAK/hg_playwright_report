import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { budgetSpendActions } from '../pages/budgetSpendActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// A cancelled CXO gives its budget back — sheet scenario 149
//
// QA's steps (2026-09-23):
//   1. read Estimated Spend on the budget
//   2. create the CXO
//   3. Estimated Spend == baseline + the CXO's total value
//   4. cancel the CXO
//   5. Estimated Spend == the baseline again
//
// NOTE ON WORDING: the sheet says "budget consumption is released when a CXO is
// REJECTED at a workflow approval stage"; the steps dictated here CANCEL the CXO
// instead. The steps are what is automated. Rejection at an approval stage is a
// different lever and, if it matters, is worth its own scenario.
//
// WHICH FIGURE — the trap scenario 60 documented at length. Three budget numbers
// are on screen and they disagree. This one tracks ESTIMATED Spend on the PARENT
// budget page, which is what a CXO moves; the PR-submit consumption that 60
// tracks lands on ACTUAL Spend. Read live 2026-09-23 on /budgets/369:
//     Actual Spend     ₹24,33,09,79,329.98
//     Estimated Spend  ₹24,44,07,81,900
//
// THE BUDGET IS SHARED, and these figures settle asynchronously — Actual Spend
// was measured taking ~60s after a short close. So both checks POLL rather than
// read once, and every observation is kept: a figure that drifted because of
// someone else's activity and one that never moved at all produce very different
// failure output, and only the second is this scenario's bug.
//
// The budget is pinned because the baseline must be read BEFORE any CXO exists,
// so there is no transaction to drill down from. /budgets/369 is "HG Auomation
// PURPOSE", the parent of the "Dont Touch" budget item this automation's CXOs
// use. Override with S149_BUDGET_URL.
// ─────────────────────────────────────────────────────────────────────────────

const BUDGET_URL = process.env.S149_BUDGET_URL
    || 'https://nse-capp-uat.aerchain.io/budgets/369';
const DATA_PATH = path.resolve('pages/NSEFoundationData.json');

let dataSnapshot = null;

test.describe('CXO cancel — the budget estimate is released', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S149' }); });

    test('creating a CXO raises Estimated Spend by its value and cancelling it gives that back '
        + '@CXO @Budget @Cancel @S149 @Slow', async ({ page }) => {
        test.setTimeout(2_400_000); // 40 min — two settling waits plus the CXO build

        const a = new NSEFoundationActions(page);
        const b = new budgetSpendActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });

        // The CXO's value, derived from the same fixture that builds it rather than
        // hardcoded, so a fixture change cannot silently invalidate the assertion.
        const qty = parseFloat(data.lineItem.quantity);
        const price = parseFloat(data.lineItem.suggestedPrice);
        const cxoValue = qty * price;
        expect(Number.isFinite(cxoValue) && cxoValue > 0,
            `could not derive the CXO value from the fixture (qty=${data.lineItem.quantity}, `
            + `price=${data.lineItem.suggestedPrice})`).toBeTruthy();
        console.log(`[S149] the CXO to be created is worth ${cxoValue} (${qty} x ${price})`);

        // ── (1) Baseline ────────────────────────────────────────────────────
        const baseline = await b.readEstimatedSpendAt(BUDGET_URL, 'S149-baseline');

        // ── (2) Create the CXO, through to Released ─────────────────────────
        await a.openApp(data);
        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.fillAllCxoSections(data);
        await a.clickSubmit();
        await a.assertCxoSubmittedSuccessfully();
        await a.approveAllStages('Approved by automation');
        await a.assertCxoStatusReleased();
        await a.saveCxoCode();
        const created = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedCxo;
        console.log(`[S149] created CXO ${created?.code} @ ${created?.url}`);
        expect(created?.url, 'the CXO was created but its url was not saved').toBeTruthy();

        // ── (3) Estimated Spend must rise by exactly the CXO's value ────────
        const afterCreate = await b.waitForEstimatedSpend(BUDGET_URL, baseline + cxoValue,
            { tag: 'S149-created' });
        expect(afterCreate.settled,
            `Estimated Spend did not rise to ${baseline + cxoValue} (baseline ${baseline} + CXO `
            + `${cxoValue}) after creating ${created?.code}. Observed: ${JSON.stringify(afterCreate.seen)}. `
            + 'If the readings drift upward the budget is being written by something else; if they never '
            + 'move at all, the CXO is not reserving budget.')
            .toBeTruthy();
        console.log(`[S149] Estimated Spend rose ${baseline} -> ${afterCreate.value}`);

        // ── (4) Cancel the CXO ──────────────────────────────────────────────
        await page.goto(created.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(8000);
        await a.cancelCxo('Cancelled by automation — scenario 149');
        await a.assertCxoStatusCancelled();
        console.log(`[S149] ${created.code} is Cancelled`);

        // ── (5) …and the estimate returns to the baseline ───────────────────
        const afterCancel = await b.waitForEstimatedSpend(BUDGET_URL, baseline,
            { tag: 'S149-cancelled' });
        expect(afterCancel.settled,
            `Estimated Spend did not return to the baseline ${baseline} after cancelling `
            + `${created.code} — it reads ${afterCancel.value}, still holding `
            + `${(afterCancel.value - baseline).toFixed(2)} of the cancelled CXO. `
            + `Observed: ${JSON.stringify(afterCancel.seen)}`)
            .toBeTruthy();

        console.log(`[S149] ${baseline} -> ${afterCreate.value} -> ${afterCancel.value} — released`);
    });

});
