import { test, expect } from '@playwright/test';
import { prCloneActions } from '../pages/prCloneActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Requisition CLONE — Budget Exceeded (sheet scenario 48)
//
//   "Verify that an Awarded PR that has been edited and submitted displays a
//    Budget Exceeded error when the PR is cloned."
//
// QA's steps: pick up any Completed PR → open it → Clone from the view page →
// the Budget Exceeded error is displayed during submission.
//
// WHY A COMPLETED PR IS THE RIGHT PRECONDITION
// -------------------------------------------
// "Awarded, edited and submitted" is the history that PRODUCES a Completed PR
// in this tenant: every PR here is award- or intake-sourced, gets edited and
// submitted, and ends Completed. Probed live 2026-09-15 — the listing's first
// page held 19 Completed PRs and 1 Cancelled, nothing else, and all 19 were
// "HG Automation NSEF Intake". So Completed is both the scenario's state and
// the only state that offers Clone.
//
// WHY THE BUDGET IS ALWAYS EXCEEDED HERE
// --------------------------------------
// The clone re-consumes its parent's full value against a budget the parent has
// ALREADY consumed, so the check fails by construction — no inflated quantity or
// price is needed, unlike scenarios 54/55 on the edit page.
//
// NON-DESTRUCTIVE. The page's Submit only opens the Workflow Summary popup; the
// PR is created by the POPUP's Submit, which this never clicks. The run ends on
// /clone with nothing created, so the parent PR is reusable indefinitely.
//
// LIVE PROBE, 2026-09-15 (PR-NSEFN-26-173 / requisition 1185):
//   More menu   → ["Clone","Reassign User","Reassign Purchaser","Download",
//                  "Regenerate Document"]
//   Clone       → /requisitions/1185/clone, form fully pre-filled
//   Submit      → Workflow Summary popup carrying "Budget Amount is exceeded",
//                 a mandatory "* Budget Amend Request", and a DISABLED Submit
//   Budget row  → Dont Touch | approved ₹9,99,99,99,99,999 |
//                 available ₹9,99,82,67,45,099 | value ₹2,00,000 |
//                 additional ₹-9,99,82,65,45,099
//
// ONE CAVEAT worth keeping in view: that budget row shows FAR more available
// budget than the clone's value, yet the app still refuses it. The refusal is
// what scenario 48 asks for and what this test asserts, but the arithmetic on
// screen does not explain it — flagged to QA rather than silently blessed here.
// The popup also says "There are no approvers configured for this flow", which
// would disable Submit on its own, so the DISABLED button is only ever reported
// as corroboration; the banner text is the assertion.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Requisition clone — Budget Exceeded', () => {

    // Listing → detail → clone form (slow MUI + ag-Grid render) → submit.
    test.describe.configure({ timeout: 300000 });

    /** @type {prCloneActions} */
    let pr;

    test.beforeEach(async ({ page }) => {
        pr = new prCloneActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    test('cloning a Completed PR is refused with Budget Exceeded @PR @Clone @Budget @S48',
        async ({ page }) => {

        // Belt and braces on the budget: describe.configure({timeout}) did NOT
        // take effect on this suite (the first run died on the global 30s cap
        // mid-submit), so the per-test call is the one that actually holds.
        test.setTimeout(300000);

        // ── pick up any Completed PR ──────────────────────────────────────────
        const target = await pr.pickCompleted({ baseUrl: data.baseUrl });
        test.skip(!target, 'no Completed "HG Automation" requisition on the first listing page');
        console.log(`[S48] parent PR ${target.code} (requisition ${target.id})`);

        // ── open it ───────────────────────────────────────────────────────────
        await pr.openDetail(target.id, data.baseUrl);
        const status = await pr.readStatusChip();
        expect(status, `PR ${target.code} is not Completed`).toMatch(/completed/i);

        // ── clone from the view page ──────────────────────────────────────────
        const menu = await pr.getMoreMenuItems();
        expect(menu, 'the Completed PR offers no Clone action').toContain('Clone');

        await pr.startClone(target.id);

        // The clone must actually carry the parent's line items — an empty form
        // would submit against no value at all and the budget check would be
        // meaningless.
        const lineItems = await pr.getLineItemCount();
        expect(lineItems, 'the clone form carries no line items').toBeGreaterThan(0);
        console.log(`[S48] clone form carries ${lineItems} line item(s)`);

        // ── during submission the Budget Exceeded error is displayed ──────────
        await pr.submitExpectingWorkflowSummary();
        const banner = await pr.assertBudgetExceeded();
        // Asserted against the LEAF error node, so this is the message itself and
        // not the whole dialog's text — see BUDGET_ERROR_LEAF in prCloneActions.
        expect(banner, 'the popup error is not the budget one')
            .toMatch(/Budget Amount is exceeded/i);

        const disabled = await pr.popupSubmitDisabled();
        console.log(`[S48] popup Submit disabled: ${disabled} (corroboration only)`);

        // ── and nothing was created ───────────────────────────────────────────
        await pr.assertNothingCreated(target.id);
        await pr.discardWorkflowSummary();

        console.log(`[S48] PASS — clone of ${target.code} blocked by: "${banner}"`);
    });
});
