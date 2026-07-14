import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Intake Negative — negative & edge cases for the Intake create page.
//
// Uses the shared NSEF login (nsefsupport@demo.com) via the nsef-setup project
// (auth.nsef.json), same as the NSEF happy-paths suite.
//
// Confirmed behaviour of the Intake create page on an invalid Submit:
//   • It does NOT navigate away or fire a toast.
//   • It stays on /intakes/create and shows per-section "N errors!" badges
//     (e.g. Header Details "19 errors!", Item Details "1 error!").
//   • Expanding a section reveals red-bordered fields + "<field> is empty" text.
//   • Line-item Qty/Price inputs strip the minus sign and non-numeric chars.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared helper: login + navigate to a fresh Intake create page ────────────
async function loginAndOpenIntakeCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    await a.openApp(data);

    await a.clickIntakeTab();
    await a.clickCreateIntake();
    await a.assertIntakeCreatePage();
    await a.waitForCreatePageLoaded();

    return a;
}

test.describe('Intake Negative', () => {

    // ── Empty / mandatory-field validation ───────────────────────────────────

    test('Submit empty intake → blocked on create page with section error badges @IntakeNegative @Validation', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.submitIntakeExpectingError();

        // Stays on the create page — no navigation, no submission popup.
        await a.assertStillOnIntakeCreatePage();
        await a.assertNoIntakeSubmissionPopup();

        // Both mandatory sections are flagged.
        await a.assertAnyErrorBadgeVisible();
        await a.assertIntakeSectionErrorBadge('Header Details');
        await a.assertIntakeSectionErrorBadge('Item Details');

        await a.takeScreenshot('intake_neg_empty_submit');
    });

    test('Empty submit → expanded sections show red borders + "is empty" messages @IntakeNegative @Validation', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.submitIntakeExpectingError();
        await a.expandIntakeSections();

        // ~17 mandatory header fields are flagged red with "<field> is empty".
        await a.assertIntakeMandatoryFieldsFlagged(15);

        await a.takeScreenshot('intake_neg_mandatory_flagged');
    });

    test('Title + summary only → still blocked (mandatory fields missing) @IntakeNegative @Validation', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.fillIntakeTitle(data);
        await a.fillIntakeSummary(data);

        await a.submitIntakeExpectingError();

        await a.assertStillOnIntakeCreatePage();
        await a.assertIntakeSectionErrorBadge('Header Details');

        await a.takeScreenshot('intake_neg_title_only');
    });

    // ── Title field edge cases ───────────────────────────────────────────────

    test('Whitespace-only title is treated as empty @IntakeNegative @Title', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.typeIntakeTitle('        ');
        const value = await a.getIntakeTitleValue();

        // The title holds only whitespace → semantically empty.
        expect(value.trim(), 'whitespace-only title should be semantically empty').toBe('');

        // And it does not let an otherwise-empty form through.
        await a.submitIntakeExpectingError();
        await a.assertStillOnIntakeCreatePage();
        await a.assertIntakeSectionErrorBadge('Header Details');
    });

    test('Very long title is accepted without breaking the form @IntakeNegative @Title', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        const longTitle = 'A'.repeat(600);
        await a.typeIntakeTitle(longTitle);
        const value = await a.getIntakeTitleValue();

        // Field stored a non-empty value, capped at most at what we typed, and
        // the create page is still intact (no crash / navigation).
        expect(value.length).toBeGreaterThan(0);
        expect(value.length).toBeLessThanOrEqual(longTitle.length);
        await a.assertStillOnIntakeCreatePage();

        await a.takeScreenshot('intake_neg_long_title');
    });

    test('Special characters / HTML in title are stored literally @IntakeNegative @Title', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        // No alert/dialog is triggered — this is plain text in a <textarea>.
        const special = `<b>x</b> & "quotes" 'apos' #@%* — 日本語`;
        await a.typeIntakeTitle(special);
        const value = await a.getIntakeTitleValue();

        expect(value, 'title should store the special characters verbatim').toBe(special);
        await a.assertStillOnIntakeCreatePage();

        await a.takeScreenshot('intake_neg_special_title');
    });

    // ── Line-item (Item Details) numeric edge cases ──────────────────────────

    test('Line-item Qty rejects negatives, accepts decimals @IntakeNegative @LineItem', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        // Item Details is collapsed by default — expand so the grid + Add row render.
        await a.expandIntakeSections();
        await a.addIntakeLineRow();

        // Negative sign is stripped → positive number kept.
        const neg = await a.typeIntakeQtyAndRead('-5');
        expect(neg, 'minus sign should be stripped').not.toContain('-');
        expect(neg).toBe('5');

        // Decimal point is accepted while typing.
        const dec = await a.typeIntakeQtyAndRead('3.75');
        expect(dec, 'decimal should be accepted in the editor').toContain('.');

        await a.takeScreenshot('intake_neg_qty_edge');
    });

    test('Line-item Qty rejects zero / non-numeric only input @IntakeNegative @LineItem', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        // Item Details is collapsed by default — expand so the grid + Add row render.
        await a.expandIntakeSections();
        await a.addIntakeLineRow();

        // Pure-alphabetic input leaves the field empty (nothing accepted).
        const alpha = await a.typeIntakeQtyAndRead('abc');
        expect(alpha, 'pure letters should leave Qty empty').toBe('');

        // Zero is accepted by the input but is not a valid Qty — submitting an
        // otherwise-empty row keeps the Item Details section flagged.
        await a.typeIntakeQtyAndRead('0');
        await a.submitIntakeExpectingError();
        await a.assertStillOnIntakeCreatePage();
        await a.assertIntakeSectionErrorBadge('Item Details');

        await a.takeScreenshot('intake_neg_qty_zero');
    });

    test('Line-item Suggested Price rejects negative values @IntakeNegative @LineItem', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        // Item Details is collapsed by default — expand so the grid + Add row render.
        await a.expandIntakeSections();
        await a.addIntakeLineRow();

        const neg = await a.typeIntakePriceAndRead('-100');
        expect(neg, 'minus sign should be stripped from Price').not.toContain('-');
        if (neg) expect(neg).toBe('100');

        await a.takeScreenshot('intake_neg_price_negative');
    });

    // ── Reject (from the pending-approval page) ──────────────────────────────

    test('Create + submit intake → Reject with reason → status Rejected @IntakeNegative @Reject', async ({ page }) => {
        test.setTimeout(300000); // 5 min — full create + submit + reject

        const a = await loginAndOpenIntakeCreate(page);

        // Build a fresh intake and submit it so it lands in Pending Approval.
        await a.createAndSubmitIntake(data);
        await a.takeScreenshot('intake_neg_submitted_for_reject');

        // Reject it from the pending-approval page with a reason.
        await a.rejectIntake('Rejected by automation');

        // Status flips to Rejected.
        await a.assertIntakeStatusRejected();
        await a.takeScreenshot('intake_neg_rejected');
    });

    // ── Recall → Draft → edit → resubmit → new workflow ──────────────────────

    test('Create + submit → Recall → Draft → edit → resubmit re-triggers the workflow @IntakeNegative @Recall', async ({ page }) => {
        test.setTimeout(420000); // 7 min — create + submit + recall + edit + resubmit + verify

        const a = await loginAndOpenIntakeCreate(page);

        // Build a fresh intake and submit it → Pending Approval.
        await a.createAndSubmitIntake(data);
        await a.takeScreenshot('intake_neg_submitted_for_recall');

        // Baseline: how many workflow runs after the first submit (expect 1).
        await a.openWorkflowStages();
        const beforeCount = await a.getWorkflowCount();
        console.log(`[Recall] Workflow runs after first submit: ${beforeCount}`);
        await a.closeWorkflowStages();

        // Recall from the pending-approval page → status becomes Draft.
        await a.recallIntake('Recalled by automation');
        await a.assertIntakeStatusDraft();
        await a.takeScreenshot('intake_neg_recalled_draft');

        // Before editing: the recalled Draft's workflow runs must all show
        // Inactive (none Active) in the Workflow Stages panel.
        await a.openWorkflowStages();
        await a.assertWorkflowsInactive();
        await a.takeScreenshot('intake_neg_draft_workflows_inactive');
        await a.closeWorkflowStages();

        // Edit the draft and resubmit → back to Pending Approval.
        await a.editAndResubmitDraftIntake(data);
        await a.takeScreenshot('intake_neg_resubmitted');

        // A new workflow run was triggered → the Workflow Steps count increased.
        await a.openWorkflowStages();
        const afterCount = await a.getWorkflowCount();
        console.log(`[Recall] Workflow runs after resubmit: ${afterCount}`);
        expect(afterCount, 'resubmitting a recalled draft should add a new workflow run')
            .toBeGreaterThan(beforeCount);
        await a.takeScreenshot('intake_neg_workflow_retriggered');
    });

    // ── More dropdown: Regenerate Document → Download Document (per status) ────
    // Flow per status: reach the status → Regenerate Document → refresh →
    // Download Document → parse the PDF → assert the Status line and that the
    // header field values are displayed correctly.

    // Field values that must render in every intake PDF (from the shared data).
    const DOC_FIELDS = [
        data.intake.title,           // Subject
        'Premises',                  // Department
        'Non-CSR Process',           // Expense Nature
        'INR - Indian Rupee',        // Currency
        'Legal',                     // Function / Vertical
        'Opex',                      // Nature of expense
        'Non-Financial',             // CXO Type
    ];

    test('Pending Approval: Regenerate → Download → PDF shows correct status + fields @IntakeNegative @Document', async ({ page }) => {
        test.setTimeout(300000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.createAndSubmitIntake(data); // → Pending Approval

        await a.regenerateIntakeDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertIntakeDocumentStatusAndFields('Pending Approval', DOC_FIELDS);
        await a.takeScreenshot('intake_doc_pending_approval');
    });

    test('Rejected: Regenerate → Download → PDF shows correct status + fields @IntakeNegative @Document', async ({ page }) => {
        test.setTimeout(360000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.createAndSubmitIntake(data);
        await a.rejectIntake('Rejected by automation'); // → Rejected

        await a.regenerateIntakeDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertIntakeDocumentStatusAndFields('Rejected', DOC_FIELDS);
        await a.takeScreenshot('intake_doc_rejected');
    });

    test('Draft: Regenerate → Download → PDF shows correct status + fields @IntakeNegative @Document', async ({ page }) => {
        test.setTimeout(360000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.createAndSubmitIntake(data);
        await a.recallIntake('Recalled by automation'); // → Draft
        await a.assertIntakeStatusDraft();

        await a.regenerateIntakeDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertIntakeDocumentStatusAndFields('Draft', DOC_FIELDS);
        await a.takeScreenshot('intake_doc_draft');
    });

    test('Released: Regenerate → Download → PDF shows correct status + fields @IntakeNegative @Document', async ({ page }) => {
        test.setTimeout(600000); // 10 min — full approval to Released
        const a = await loginAndOpenIntakeCreate(page);

        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation'); // → Released
        await a.assertIntakeStatusReleased();

        await a.regenerateIntakeDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertIntakeDocumentStatusAndFields('Released', DOC_FIELDS);
        await a.takeScreenshot('intake_doc_released');
    });

    // ── More dropdown: Clone ──────────────────────────────────────────────────
    // Clone creates a brand-new intake pre-filled from the source (this template
    // has no empty date fields). Submitting it triggers a fresh approval workflow;
    // the clone's Workflow Stages shows only its own new workflows, not the
    // source's. We then approve the clone through to Released.

    test('Clone an intake → new intake → submit → approve to Released → only its own new workflows @IntakeNegative @Clone', async ({ page }) => {
        test.setTimeout(600000); // 10 min — source create + clone + full approval

        const a = await loginAndOpenIntakeCreate(page);

        // Source intake → Pending Approval.
        await a.createAndSubmitIntake(data);
        const sourceCode = await a.getCurrentIntakeCode();
        console.log(`[Clone] Source intake: ${sourceCode}`);
        await a.takeScreenshot('intake_clone_source');

        // Clone → a fully pre-filled new intake → submit (no date fields to fill).
        await a.cloneIntake();
        const cloneCode = await a.getCurrentIntakeCode();
        console.log(`[Clone] Cloned intake: ${cloneCode}`);
        expect(cloneCode, 'clone must be a brand-new intake with a different code').not.toBe(sourceCode);
        await a.takeScreenshot('intake_clone_created');

        // The clone's own (newly-triggered) approval workflow → approve to Released.
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();

        // Workflow Stages on the clone shows only its own new workflow run(s).
        await a.openWorkflowStages();
        const wfCount = await a.getWorkflowCount();
        console.log(`[Clone] Clone workflow runs displayed: ${wfCount}`);
        expect(wfCount, 'clone should display its own newly-triggered workflow(s)').toBeGreaterThanOrEqual(1);
        await a.closeWorkflowStages();

        await a.takeScreenshot('intake_clone_released');
    });

    // ── More dropdown: Amend (Released intake) ────────────────────────────────
    // Amend is available once an intake is Released. It opens an editable
    // pre-filled form; we change the line-item qty and the title, submit, then
    // complete the amend approval workflow and confirm it shows Completed.

    test('Amend a Released intake → change qty + title → submit → complete workflow → Workflow Stages Completed @IntakeNegative @Amend', async ({ page }) => {
        test.setTimeout(900000); // 15 min — create + approve to Released + amend + amend approval

        const a = await loginAndOpenIntakeCreate(page);

        // Get an intake to Released (Amend is only offered on Released intakes).
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.takeScreenshot('intake_amend_source_released');

        // Amend → change qty + append title → submit → amend workflow triggered.
        await a.amendIntake(data, '150');
        await a.takeScreenshot('intake_amend_submitted');

        // Complete the amend approval workflow.
        await a.approveIntakeUntilReleased(data, 'Approved by automation');

        // Workflow Stages shows the amend workflow as Completed.
        await a.openWorkflowStages();
        await a.assertWorkflowCompleted();
        await a.closeWorkflowStages();
        await a.takeScreenshot('intake_amend_completed');

        // Audit Logs records the amend changes (subject + line-item Qty) as From → To.
        await a.openIntakeAuditLogs();
        await a.assertAuditLogShowsAmendChanges(data, '100', '150');
        await a.takeScreenshot('intake_amend_audit_logs');
        await a.closeIntakeAuditLogs();
    });

    // ── More dropdown: Reassign Purchaser (Released intake) ───────────────────
    // Reassign #1: add two purchasers (multi-select → reason → Reassign → toast).
    // Reassign #2: Replace Purchaser dropdown lists the previously-added users;
    // replace one + add a new purchaser. Then the Activity Log (clock icon) must
    // capture both reassignment events (verified via their distinct reasons).

    test('Reassign Purchaser on a Released intake → add two, then replace → Activity Log captures both @IntakeNegative @Reassign', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + 2 reassignments

        const a = await loginAndOpenIntakeCreate(page);

        // Reassign Purchaser is only offered on Released intakes.
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();

        // Reassignment #1 — add two purchasers.
        const added = await a.reassignPurchaserAddTwo('Reassign add by automation');
        await a.takeScreenshot('intake_reassign_added');

        // Reassignment #2 — Replace dropdown shows the added users; replace one +
        // add a new purchaser. Returns the newly-added purchaser's name.
        const replacedWith = await a.reassignPurchaserReplace('Reassign replace by automation', added);
        await a.takeScreenshot('intake_reassign_replaced');

        // Reopen → the Replace dropdown now lists the newly-added purchaser.
        await a.verifyReplaceDropdownHasUser(replacedWith);

        // Activity Log (clock icon) must capture both reassignments (add + replace).
        await a.openActivityLog();
        await a.assertActivityLogContains(['Reassign add by automation', 'Reassign replace by automation']);
        await a.takeScreenshot('intake_reassign_activity_log');
    });

    // ── More dropdown: Reassign User (Released intake) ────────────────────────
    // Reassign User → "Select a user" → pick a user → reason → Submit → toast
    // "Intake request reassigned successfully".

    test('Reassign User on a Released intake → select user + reason → Submit @IntakeNegative @ReassignUser', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + reassign user

        const a = await loginAndOpenIntakeCreate(page);

        // Reassign User is only offered on Released intakes.
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();

        // Reassign the intake to a user (asserts the success toast internally).
        await a.reassignUser('Reassigned user by automation');
        await a.takeScreenshot('intake_reassign_user_done');

        // Activity Log (clock icon) must capture the user reassignment.
        await a.openActivityLog();
        await a.assertActivityLogContains(['Reassigned user by automation']);
        await a.takeScreenshot('intake_reassign_user_activity_log');
    });

    // ── More dropdown: Mark Processed (Released intake) ───────────────────────
    // Mark Processed → reason → Submit → status becomes Processed; the Activity
    // Log records "Intake marked processed by ..." (the reason itself isn't logged).

    test('Mark Processed on a Released intake → status Processed → Activity Log captures it @IntakeNegative @MarkProcessed', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + mark processed

        const a = await loginAndOpenIntakeCreate(page);

        // Mark Processed is only offered on Released intakes.
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();

        // More → Mark Processed → reason → Submit → status Processed.
        await a.markIntakeProcessed('Marked processed by automation');
        await a.assertIntakeStatusProcessed();
        await a.takeScreenshot('intake_mark_processed');

        // Activity Log captures the mark-processed action.
        await a.openActivityLog();
        await a.assertActivityLogContains(['Intake marked processed']);
        await a.takeScreenshot('intake_mark_processed_activity_log');
    });

    // ── Cancel ───────────────────────────────────────────────────────────────

    test('Cancel a partially-filled intake discards and leaves the create page @IntakeNegative @Cancel', async ({ page }) => {
        test.setTimeout(120000);
        const a = await loginAndOpenIntakeCreate(page);

        await a.fillIntakeTitle(data);
        await a.fillIntakeSummary(data);

        await a.cancelIntakeCreate();

        // cancelIntakeCreate already asserts we left /intakes/create.
        await a.takeScreenshot('intake_neg_cancelled');
    });

});
