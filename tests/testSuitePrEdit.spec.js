import { test, expect } from '@playwright/test';
import { prEditActions } from '../pages/prEditActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Requisition EDIT page — /requisitions/{id}/edit (v3, nse-capp-uat)
//
// Sheet scenarios:
//   53  search any line item in the line-item section
//   54  price increased during PR edit → budget exceeded error
//   55  quantity increased during PR edit → budget exceeded error
//
// Scenario 16 (qty increased on an auto-created PR from an Award → Budget
// Exceeded in the Workflow Summary popup) was RETIRED into 55 on 2026-09-03:
// the assertion is identical, and 55's test already targets that very popup.
// 16's only extra condition was the PR being award-created, so `pickSafeDraft`
// PREFERS an award-sourced draft and falls back to an intake-sourced one.
//
// Why the EDIT page and not the view page: the PR view page renders a
// read-only ag-Grid with no search control and no editable cells — which is why
// 53 was previously logged as "no search box renders on a single-line-item PR".
// The search lives in the edit page's Line Items header.
//
// Data shape these need: a DRAFT requisition. Every other PR in this tenant is
// Completed and offers no Edit at all. Safety rule — only drafts whose Subject
// contains "HG Automation" are ever driven, so a run cannot consume a record
// set up by hand.
//
// Non-destructive by construction: an over-budget submit stops AT the Workflow
// Summary popup behind a mandatory "Budget Amend Request", the app issues no
// write to the requisition (verified: only POST .../approvers and
// POST .../budget-items/{id}/validate fire), and the tests click Discard rather
// than the popup's Submit. The inflated qty/price lives only in the browser, so
// a reload throws it away and the draft is reusable.
// ─────────────────────────────────────────────────────────────────────────────

// Absurd values so "exceeded" cannot depend on how much budget happens to be
// left: 99,999,999 × ₹2,000 ≈ ₹200bn against an approved budget of ₹10tn.
const HUGE_QTY   = '99999999';
const HUGE_PRICE = '99999999999';

test.describe('Requisition edit — line-item search and budget validation', () => {

    // Each test opens the listing, switches tab, opens the edit form (slow MUI +
    // ag-Grid render) and fills six mandatory fields before it can even submit.
    test.describe.configure({ timeout: 240000 });

    /** @type {prEditActions} */
    let pr;

    test.beforeEach(async ({ page }) => {
        pr = new prEditActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    // ── 53 — line-item search ─────────────────────────────────────────────────

    test('line items can be searched in the line-item section @PrEdit @LineItems @S53', async () => {
        const draft = await pr.pickSafeDraft({ minLineItems: 2, baseUrl: data.baseUrl });
        test.skip(!draft, 'no HG Automation draft requisition with 2+ line items to search');

        // pickSafeDraft already left us on this draft's edit page.
        const all = await pr.getProductNames();
        expect(all.length, 'need at least 2 line items to prove filtering').toBeGreaterThan(1);

        await pr.openLineItemSearch();

        // Search a distinctive fragment of the FIRST product that is not shared
        // with any sibling, so "one row" is a real filter and not a coincidence.
        const term = all.find(n => all.filter(o => o.includes(n.split(' ')[0])).length === 1)
            ?.split(' ')[0] ?? all[0].split(' ')[0];

        const matched = await pr.searchLineItems(term);
        expect(matched.length, `searching "${term}" did not narrow the grid`).toBeLessThan(all.length);
        expect(matched.length, `searching "${term}" matched nothing`).toBeGreaterThan(0);
        for (const name of matched) {
            expect(name.toLowerCase(), `"${name}" does not match the search term`)
                .toContain(term.toLowerCase());
        }

        // Clearing restores every row. Order is NOT asserted — the grid
        // reorders rows after a filter is cleared (observed live), so compare
        // as sets.
        const restored = await pr.searchLineItems('');
        expect(restored.sort(), 'clearing the search did not restore all line items')
            .toEqual([...all].sort());

        // A term matching nothing must empty the grid rather than silently
        // ignore the filter.
        const none = await pr.searchLineItems(data.negativeSearch.nonExistent);
        expect(none, 'a non-matching search term left rows in the grid').toEqual([]);
    });

    // ── 55 — quantity increase → Budget Exceeded (absorbs 16) ────────────────

    test('quantity increased during edit raises Budget Exceeded in the Workflow Summary popup @PrEdit @Budget @S55', async () => {
        const draft = await pr.pickSafeDraft({ preferSource: 'awards', baseUrl: data.baseUrl });
        test.skip(!draft, 'no HG Automation draft requisition available to edit');
        console.log(`[S55] driving draft ${draft.id} (source=${draft.source}, value=${draft.value})`);

        await pr.openEdit(draft.id, data.baseUrl);
        await pr.fillMandatoryDetails();

        const before = await pr.readCell(0, 'line_items_quantity');
        await pr.setCell(0, 'line_items_quantity', HUGE_QTY);
        expect(Number(HUGE_QTY), 'the test must actually INCREASE the quantity')
            .toBeGreaterThan(Number(before));

        // Total Price is an f(x) column — proves the grid recalculated rather
        // than just painting the typed digits.
        const total = await pr.readCell(0, 'line_items_total_price');
        expect(Number(total), 'Total Price did not recalculate from the new quantity')
            .toBeGreaterThan(Number(before) * Number(await pr.readCell(0, 'line_items_suggested_price')) - 1);

        await pr.submitExpectingWorkflowSummary();
        const banner = await pr.assertBudgetExceeded();
        expect(banner).toMatch(/Budget Amount is exceeded/i);

        await pr.discardWorkflowSummary();
    });

    // ── 54 — price increase → Budget Exceeded ────────────────────────────────

    test('price increased during edit raises Budget Exceeded in the Workflow Summary popup @PrEdit @Budget @S54', async () => {
        const draft = await pr.pickSafeDraft({ baseUrl: data.baseUrl });
        test.skip(!draft, 'no HG Automation draft requisition available to edit');
        console.log(`[S54] driving draft ${draft.id} (source=${draft.source}, value=${draft.value})`);

        await pr.openEdit(draft.id, data.baseUrl);
        await pr.fillMandatoryDetails();

        // Quantity is left ALONE here — otherwise this test would not be
        // distinguishable from 55.
        const qtyBefore = await pr.readCell(0, 'line_items_quantity');
        const priceBefore = await pr.readCell(0, 'line_items_suggested_price');
        await pr.setCell(0, 'line_items_suggested_price', HUGE_PRICE);
        expect(Number(HUGE_PRICE), 'the test must actually INCREASE the price')
            .toBeGreaterThan(Number(priceBefore));
        expect(await pr.readCell(0, 'line_items_quantity'),
            'quantity changed too — this would duplicate scenario 55').toBe(qtyBefore);

        await pr.submitExpectingWorkflowSummary();
        const banner = await pr.assertBudgetExceeded();
        expect(banner).toMatch(/Budget Amount is exceeded/i);

        await pr.discardWorkflowSummary();
    });
});
