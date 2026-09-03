import { test, expect } from '@playwright/test';
import { poAmendActions } from '../pages/poAmendActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Purchase Order amend — Budget Exceeded
//
// Sheet scenario:
//   71  increasing Quantity or Price while amending/editing a PO shows a Budget
//       Exceeded error on submission when the revised amount exceeds the
//       available budget
//
// Reached at /purchase-orders/{id}/amend (which /edit also serves). Neither is
// offered in the PO's More menu — that menu holds Clone / Recall / Reassign /
// Regenerate — so the route has to be navigated directly.
//
// Verified live 2026-09-03 on PO-NSEFN-26-210 (/purchase-orders/1043):
//   qty 100 → 999,999,999 · amount → 1,999,999,998,000
//   POST /api/capp/budget-items/703/validate → {"validate": false}
//   popup "Workflow Summary" → "Budget Amount is exceeded. Please Contact Budget User."
//
// ⚠️ THE SIZE OF THE INCREASE MATTERS, and getting it wrong makes the test lie.
// Budget item 703 ("Dont Touch") carries an allocated ₹9,99,99,99,99,999 (~₹1tn)
// with only ₹6,89,25,900 consumed. A first attempt used qty 99,999,999 → a
// transaction value of ~₹200bn, and `validate` came back **true** — correctly,
// since 200bn is well under 1tn. The PR suite gets away with that same number
// only because a PR is additionally capped by its parent CXO's remaining budget.
// A PO amend is validated against the budget item itself, so the value must
// exceed ~₹1tn outright.
//
// Non-destructive: the submit stops AT the popup behind a mandatory "Reason for
// amend", and no write is issued — verified, and additionally enforced here by
// aborting any non-GET request that is not one of the calls the popup itself
// needs (budget validation, workflow stages / eligible users).
// ─────────────────────────────────────────────────────────────────────────────

const HUGE_QTY = '999999999';

test.describe('Purchase Order amend — Budget Exceeded', () => {

    test.describe.configure({ timeout: 300000 });

    /** @type {poAmendActions} */
    let po;
    /** @type {string[]} */
    let blockedWrites;

    test.beforeEach(async ({ page }) => {
        po = new poAmendActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });

        // Let the popup's own calls through, block every other write. Without
        // the allow-list the popup cannot render at all — blocking
        // workflow/stages/eligible-users leaves the dialog empty and the test
        // fails for the wrong reason.
        blockedWrites = [];
        await page.route('**/*', route => {
            const req = route.request();
            if (req.method() === 'GET') return route.continue();
            if (/budget-items|validate|approvers|eligible-users|workflow\/stages/.test(req.url())) {
                return route.continue();
            }
            blockedWrites.push(`${req.method()} ${req.url()}`);
            return route.abort();
        });
    });

    test('increasing quantity on a PO amend raises Budget Exceeded @Po @Amend @Budget @S71', async () => {
        const target = await po.openAnyAmendablePo(data.baseUrl);
        test.skip(!target, 'no PO offers an amend form (Cancelled/Completed POs do not)');
        console.log(`[S71] amending ${target.code} (${target.status})`);

        const qtyBefore = await po.readCellNumber(0, 'line_items_quantity');
        const price = await po.readCellNumber(0, 'line_items_product_price');
        const amountBefore = await po.readCellNumber(0, 'line_items_amount');
        console.log(`[S71] before → qty ${qtyBefore} × price ${price} = ${amountBefore}`);

        await po.setCell(0, 'line_items_quantity', HUGE_QTY);
        expect(Number(HUGE_QTY), 'the test must actually INCREASE the quantity')
            .toBeGreaterThan(qtyBefore);

        // The f(x) Amount column must recompute — proof the grid took the edit
        // rather than merely painting the digits.
        const amountAfter = await po.readCellNumber(0, 'line_items_amount');
        expect(amountAfter, 'the Amount column did not recalculate from the new quantity')
            .toBeGreaterThan(amountBefore);
        console.log(`[S71] after → amount ${amountAfter}`);

        await po.submitExpectingWorkflowSummary();
        const banner = await po.assertBudgetExceeded();
        expect(banner).toMatch(/Budget Amount is exceeded/i);

        expect(blockedWrites,
            'the PO amend tried to WRITE despite the budget being exceeded')
            .toEqual([]);

        await po.discard();
    });
});
