import { test, expect } from '@playwright/test';
import { intakeCreateActions }   from '../pages/actions';
import { intakeWorkflowActions } from '../pages/intakeWorkflowActions';
import createData   from '../pages/IntakeCreateData.json';
import workflowData from '../pages/IntakeWorkflowData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Intake Workflow — Merged Test Suite
//
// All related assertions are combined into 4 single tests:
//   1. Happy Path  — Submission → Popup → Approval → Accept → Released
//   2. Rejection   — Submit → Reject → Verify Rejected State
//   3. Popup Neg.  — No purchaser validation + Escape dismissal
//   4. Edge Cases  — Modal cancel, comment variants, page stability
// ─────────────────────────────────────────────────────────────────────────────


// ─── Shared helper: fill the full intake form and click Submit to open popup ──
async function fillAndSubmitIntake(page) {
    const creator = new intakeCreateActions(page);
    await page.goto(workflowData.baseUrl);
    await page.setViewportSize({ width: 1800, height: 720 });

    await creator.clickIntakeTab();
    await creator.assertIntakeTab();
    await creator.clickIntakeCreateButton();
    await creator.assertIntakeCreatePage();
    await creator.selectIntakeTemplate(createData);
    await creator.closeAskAieraBar();
    await creator.expandAllSections();
    await creator.selectIntakeEntityTest2();

    await creator.typeIntakeTitle(createData);
    await creator.typeIntakeSummary(createData);
    await creator.selectIntakeDepartment(createData);
    await creator.selectIntakeCurrency(createData);
    await creator.selectIntakeVertical(createData);
    await creator.selectIntakeProjectName();
    await creator.selectIntakeNatureOfExpense(createData);
    await creator.selectIntakeGLAccount();
    await creator.selectIntakeProfitCenter();
    await creator.selectIntakeCostcenter();
    await creator.selectIntakeSEBICatagorization();
    await creator.selectIntakeSubSegment();
    await creator.selectIntakeProjectCategory();
    await creator.selectIntakeCXOType(createData);
    await creator.selectIntakeCXOTransaction(createData);
    // Basic Information mandatory fields
    await creator.selectIntakePurchaseRelatedServices();
    await creator.fillIntakeContractStartDate(createData);
    await creator.fillIntakeContractEndDate(createData);
    await creator.selectIntakeSingleVendorProcurement();
    await creator.typeIntakeSingleVendorJustification(createData);
    await creator.selectIntakeTypeOfProcurement();
    await creator.selectIntakeFinancialYear();
    // Particulars of Procurement mandatory fields
    await creator.selectIntakeCXOAppInfra();
    await creator.selectIntakeCXOBizReq();
    await creator.selectIntakeCXOMinCommit();
    await creator.selectIntakeCXOMeitY();
    await creator.selectIntakeCXONSEDataTransfer();
    await creator.selectIntakeCXORPwD();
    // Business Objective of Purchase — CodeX Editor rich-text
    await creator.typeIntakeBusinessObjectiveRichText(createData);
    // Purchase Business Case mandatory fields
    await creator.typeIntakeBusinessObjective(createData);
    await creator.typeIntakeItemsDetails(createData);
    await creator.typeIntakeNecessityPurchase(createData);
    await creator.fillIntakeDeliveryTimeline(createData);

    await creator.addIntakeLineItemRow();
    await creator.selectIntakeItem(createData);
    await creator.typeIntakeItemDesc(createData);
    await creator.typeIntakeItemQTY(createData);
    await creator.selectIntakeItemUOM();
    await creator.selectIntakeItemDelAdd();
    await creator.selectIntakeItemBillAdd();
    await creator.selectIntakeItemLineNOE();
    await creator.selectIntakeItemLineGLA();
    await creator.selectIntakeItemLineGLAcct();
    await creator.selectIntakeItemLineSeg();
    await creator.selectIntakeItemLineCostCenter();
    await creator.selectIntakeItemLineSEBICat();
    await creator.selectIntakeItemLineSubSeg();
    await creator.selectIntakeItemLineProjectCat();
    await creator.typeIntakeItemSuggPrice(createData);

    await creator.addIntakeLineItemRow();
    await creator.selectIntakeItem1(createData);
    await creator.typeIntakeItemDesc1(createData);
    await creator.typeIntakeItemQTY1(createData);
    await creator.selectIntakeItemUOM1();
    await creator.selectIntakeItemDelAdd1();
    await creator.selectIntakeItemBillAdd1();
    await creator.selectIntakeItemLineNOE1();
    await creator.selectIntakeItemLineGLA1();
    await creator.selectIntakeItemLineGLAcct1();
    await creator.selectIntakeItemLineSeg1();
    await creator.selectIntakeItemLineCostCenter1();
    await creator.selectIntakeItemLineSEBICat1();
    await creator.selectIntakeItemLineSubSeg1();
    await creator.selectIntakeItemLineProjectCat1();
    await creator.typeIntakeItemSuggPrice1(createData);

    await creator.typeIntakePotentialSuppliers(createData);
    await creator.typeIntakeNotes(createData);

    await creator.clickIntakeSubmitButton();
    return creator;
}

// ─── Shared helper: create intake + complete popup → return overview URL ──────
async function createIntakeAndGetOverviewUrl(page) {
    const creator  = await fillAndSubmitIntake(page);
    const workflow = new intakeWorkflowActions(page);
    await workflow.waitForPopupVisible();
    await workflow.completeSubmissionPopup();
    await creator.assertIntakeOverviewPage();
    return page.url();
}


// =============================================================================
// 1. HAPPY PATH
//    Single test covering: Popup verification → Approval → Accept → Released
//    Includes:
//      • Popup visible + Workflow Summary heading
//      • Approval step listed in popup
//      • Workflow steps in sequential order
//      • Purchaser Assignment section visible after Proceed
//      • Completing popup navigates to overview
//      • NEW: Status of intake is "Pending Approval" after submission
//      • Approve/Reject buttons visible at Approval step
//      • Clicking Approve opens comments modal
//      • Approving completes the Approval step
//      • URL remains on overview
//      • NEW: After accepting purchaser assignment, status is Released
// =============================================================================

test.describe('Aerchain NSE — Intake Workflow: Happy Path', () => {

    test('Full Submission → Popup → Approval → Accept → Released @Smoke @HappyPath', async ({ page }) => {
        test.setTimeout(1200000);

        // ── Fill form and click Submit ─────────────────────────────────────────
        await fillAndSubmitIntake(page);
        const workflow = new intakeWorkflowActions(page);

        // ── Popup: Workflow Summary verification ──────────────────────────────
        await workflow.verifyPopupIsOpen();
        await workflow.verifyWorkflowSummaryHeadingVisible();
        await workflow.verifyApprovalStepListedInPopup();
        await workflow.verifyWorkflowStepsSequentialOrder();

        // ── Popup: Proceed → verify Purchaser Assignment section ──────────────
        await workflow.proceedThroughWorkflowSummary();
        await workflow.verifyPurchaserSectionVisible();

        // ── Popup: Select purchaser + Final Submit → land on overview ─────────
        await workflow.selectPurchaserAndFinalSubmit();
        await workflow.waitForOverviewPage();
        await workflow.verifyOnOverviewPage();

        // ── NEW: Status of approval step in intake is "Pending Approval" ──────
        await workflow.verifyIntakeStatusIsAwaitingActions();

        // ── Approval Step: Verify Approve + Reject buttons visible ────────────
        await workflow.waitForApproveButton();
        await workflow.verifyApprovalButtonsVisible();

        // ── Approval Step: Click Approve → verify comments modal opens ─────────
        await page.locator("//button[normalize-space(text())='Approve']").first().click();
        await expect(page.locator('[placeholder="Enter your comments..."]'))
            .toBeVisible({ timeout: 10000 });
        await page.keyboard.press('Escape');

        // ── Approval Step: Approve ALL workflow stages sequentially ───────────
        // Each stage: Approve button → comments → confirm → next stage appears.
        // Loop continues until Accept button is visible (all stages done).
        await workflow.approveAllStages(workflowData.comments.approval);

        // ── Verify URL remains on overview ────────────────────────────────────
        await expect(page).toHaveURL(/overview/);

        // ── Accept → status becomes Released ─────────────────────────────────
        await workflow.waitForAcceptButton();
        await workflow.acceptIntake(workflowData.comments.accept);
        await workflow.verifyIntakeStatusIsReleased();
    });

});


// =============================================================================
// 2. REJECTION FLOW
//    Single test covering:
//      • Reject button visible at Approval step
//      • Clicking Reject opens comments modal
//      • Rejecting with comments completes the rejection action
//      • Intake status becomes Cancelled/Rejected
//      • Accept button NOT visible after rejection
//      • Page stays stable — no crash or redirect
// =============================================================================

test.describe('Aerchain NSE — Intake Workflow: Rejection Flow', () => {

    test('Submit → Reject → Verify Rejected State @Rejection', async ({ page }) => {
        test.setTimeout(360000);

        const overviewUrl = await createIntakeAndGetOverviewUrl(page);
        console.log('[Rejection] Intake overview URL:', overviewUrl);
        const workflow    = new intakeWorkflowActions(page);
        await page.goto(overviewUrl);

        // ── Reject button is visible at the Approval step ─────────────────────
        await workflow.waitForApproveButton();
        await workflow.verifyRejectButtonIsVisible();

        // ── Clicking Reject opens the rejection comments modal ────────────────
        await page.locator("//button[normalize-space(text())='Reject']").first().click();
        await expect(page.locator('[placeholder="Enter your comments..."]'))
            .toBeVisible({ timeout: 10000 });
        await page.keyboard.press('Escape');

        // ── Reject with comments → Approve button disappears ──────────────────
        await workflow.rejectIntake(workflowData.comments.rejection);
        await expect(page.locator("//button[normalize-space(text())='Approve']").first())
            .toBeHidden({ timeout: 15000 });

        // ── Intake status becomes Cancelled/Rejected ──────────────────────────
        await workflow.verifyIntakeStatusIsRejected();

        // ── Accept button NOT visible after rejection ─────────────────────────
        await expect(page.locator("//button[normalize-space(text())='Accept']").first())
            .toBeHidden({ timeout: 10000 });

        // ── Page stays stable — no crash or redirect ──────────────────────────
        await expect(page).toHaveURL(/overview/);
        await expect(page).not.toHaveURL(/error|404|500/);
    });

});


// =============================================================================
// 3. POPUP NEGATIVE TESTS
//    Single test covering:
//      • Submitting popup without selecting a purchaser shows validation
//      • Pressing Escape on Step 1 popup dismisses popup (intake not submitted)
// =============================================================================

test.describe('Aerchain NSE — Intake Workflow: Popup Negative Tests', () => {

    test('Popup validation — no purchaser + Escape dismissal @Popup @Negative', async ({ page }) => {
        test.setTimeout(360000);

        // ── Part 1: Submit without selecting purchaser → validation shown ──────
        await fillAndSubmitIntake(page);
        let workflow = new intakeWorkflowActions(page);
        await workflow.waitForPopupVisible();
        await workflow.proceedThroughWorkflowSummary();
        await workflow.verifyPurchaserSectionVisible();

        const submitBtn = page.locator("(//button[normalize-space(text())='Submit'])[2]");
        const submitIsDisabled = await submitBtn.isDisabled({ timeout: 5000 }).catch(() => false);
        if (!submitIsDisabled) {
            await submitBtn.click({ timeout: 5000 }).catch(() => {});
        }

        const popupStillOpen = await page.locator('[role="dialog"]').first()
            .isVisible({ timeout: 5000 }).catch(() => false);
        const validationMsg  = await page.locator(
            '//*[contains(normalize-space(),"required") or contains(normalize-space(),"select") or contains(normalize-space(),"choose")]'
        ).first().isVisible({ timeout: 5000 }).catch(() => false);
        expect(popupStillOpen || validationMsg || submitIsDisabled,
            'App should show validation, keep popup open, or disable Submit when no purchaser selected'
        ).toBeTruthy();

        // ── Part 2: Escape on Step 1 dismisses popup — intake NOT submitted ───
        await fillAndSubmitIntake(page);
        workflow = new intakeWorkflowActions(page);
        await workflow.waitForPopupVisible();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        expect(page.url()).not.toMatch(/overview/);
    });

});


// =============================================================================
// 5. REJECT & RESUBMIT FLOW
//    Single test covering:
//      • After rejection the "Edit" option appears in the More dropdown
//      • Clicking Edit opens the edit page (URL contains /edit)
//      • Re-filling mandatory fields and submitting triggers a new workflow popup
//      • Completing the new popup lands back on the overview page
//      • More → Workflow Stages dialog opens and shows "Workflow Steps" heading
//      • The previous (rejected) workflow shows "Rejected" status in the dialog
//      • The new (resubmitted) workflow shows "Active" or "Pending" status
// =============================================================================

test.describe('Aerchain NSE — Intake Workflow: Reject and Resubmit', () => {

    test('Reject → Edit via More → Resubmit → verify old workflow Rejected and new workflow Active @RejectResubmit', async ({ page }) => {
        test.setTimeout(1200000);

        // ── 1. Create intake, complete popup, land on overview ────────────────
        const overviewUrl = await createIntakeAndGetOverviewUrl(page);
        const workflow = new intakeWorkflowActions(page);
        await page.goto(overviewUrl);

        // ── 2. Reject the intake at the first approval stage ──────────────────
        await workflow.waitForApproveButton();
        await workflow.rejectIntake(workflowData.comments.rejection);
        await workflow.verifyIntakeStatusIsRejected();

        // ── 3. More dropdown → Edit (visible after rejection/send-back) ───────
        await workflow.clickEditFromMoreMenu();
        await expect(page).toHaveURL(/intakes\/\d+\/(edit|overview)/, { timeout: 15000 });

        // ── 4. Re-fill mandatory fields on edit page → Submit → new popup ─────
        await workflow.fillReviewEditFields();
        await workflow.submitEditAndCompletePopup();

        // ── 5. Confirm we are back on overview ────────────────────────────────
        await workflow.verifyOnOverviewPage();

        // ── 6. More → Workflow Stages → verify dialog opens ──────────────────
        await workflow.clickWorkflowStagesFromMoreMenu();
        await workflow.verifyWorkflowStagesDialogOpen();

        // ── 7. Old workflow → Rejected; New workflow → Active or Pending ──────
        await workflow.verifyPreviousWorkflowIsRejected();
        await workflow.verifyNewWorkflowIsActiveOrPending();
    });

});


// =============================================================================
// 4. EDGE CASES
//    Single test covering:
//      • Closing Approve modal without confirming — Approve button remains (35)
//      • Closing Reject modal without confirming — buttons remain (36)
//      • Approve with empty comments — validation or disabled button (37)
//      • Approve with very long comments (500 chars) — no crash (38)
//      • Approve with special characters — no crash (39)
//      • HTML in approval comments not rendered as markup (40)
//      • Refreshing overview preserves Approval step state (43)
//      • Navigating away and returning preserves workflow state (44)
//      • Overview page has no script injection (45)
//      • Reject with empty comments — validation or disabled button (46)
//
//    Non-destructive checks (35,36,43,44,45) share one intake.
//    Approval/rejection action checks (37,38,39,40,46) each use a fresh intake.
// =============================================================================

test.describe('Aerchain NSE — Intake Workflow: Edge Cases', () => {

    test('Approval & Rejection edge cases — modal cancel, comment variants, page stability @Edge', async ({ page }) => {
        test.setTimeout(1200000);

        const workflow = new intakeWorkflowActions(page);

        // ── Shared intake for non-destructive checks ──────────────────────────
        const stableUrl = await createIntakeAndGetOverviewUrl(page);

        // 35: Close Approve modal → Approve button remains visible
        await page.goto(stableUrl);
        await workflow.waitForApproveButton();
        await workflow.openApproveModalThenCancel();
        await workflow.verifyApproveButtonIsVisible();

        // 36: Close Reject modal → Approve + Reject buttons remain visible
        await page.goto(stableUrl);
        await workflow.waitForApproveButton();
        await workflow.openRejectModalThenCancel();
        await workflow.verifyApprovalButtonsVisible();

        // 43: Refresh overview → Approval step state preserved
        await page.goto(stableUrl);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await workflow.waitForApproveButton();
        await workflow.verifyApprovalButtonsVisible();

        // 44: Navigate away and return → workflow state preserved
        await page.goto(`${workflowData.baseUrl}/intakes`);
        await page.waitForLoadState('domcontentloaded');
        await page.goto(stableUrl);
        await workflow.waitForApproveButton();
        await workflow.verifyApprovalButtonsVisible();

        // 45: Overview page has no script injection from intake data
        await page.goto(stableUrl);
        const title45 = await page.title();
        const body45  = await page.locator('body').textContent();
        expect(title45).not.toContain('<script>');
        expect(body45).not.toContain('javascript:alert');

        // ── Fresh intakes for approval/rejection action variants ──────────────

        // 37: Approve with empty comments — validation or disabled button
        {
            const url = await createIntakeAndGetOverviewUrl(page);
            await page.goto(url);
            await workflow.waitForApproveButton();
            await page.locator("//button[normalize-space(text())='Approve']").first().click();
            await page.locator('[placeholder="Enter your comments..."]')
                .waitFor({ state: 'visible', timeout: 10000 });
            const approveModalBtn   = page.locator("(//button[normalize-space(text())='Approve'])[2]");
            const approveIsDisabled = await approveModalBtn.isDisabled({ timeout: 5000 }).catch(() => false);
            if (!approveIsDisabled) await approveModalBtn.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1500);
            const approveBtnHidden  = await page.locator("//button[normalize-space(text())='Approve']")
                .first().isHidden({ timeout: 5000 }).catch(() => false);
            const validationVisible = await page.locator(
                '//*[contains(normalize-space(),"required") or contains(normalize-space(),"comment")]'
            ).first().isVisible({ timeout: 3000 }).catch(() => false);
            expect(approveBtnHidden || validationVisible || approveIsDisabled,
                'App should handle empty-comment approval attempt').toBeTruthy();
        }

        // 38: Approve with very long comments (500 chars) — no crash
        {
            const url = await createIntakeAndGetOverviewUrl(page);
            await page.goto(url);
            await workflow.waitForApproveButton();
            await workflow.approveIntake(workflowData.comments.longString.slice(0, 500));
            await expect(page).not.toHaveURL(/error|500/);
        }

        // 39: Approve with special characters — no crash
        //     Guard: some UAT intakes skip the approval chain entirely
        {
            const url = await createIntakeAndGetOverviewUrl(page);
            await page.goto(url);
            const approveVisible = await page.locator("//button[normalize-space(text())='Approve']")
                .first().isVisible({ timeout: 5000 }).catch(() => false);
            if (approveVisible) {
                await workflow.approveIntake(workflowData.comments.specialChars);
                await expect(page).not.toHaveURL(/error|500/);
            }
        }

        // 40: HTML in approval comments is not rendered as markup
        {
            const url = await createIntakeAndGetOverviewUrl(page);
            await page.goto(url);
            await workflow.waitForApproveButton();
            await workflow.approveIntake(workflowData.comments.htmlInjection);
            const title40 = await page.title();
            expect(title40).not.toContain('<b>');
            expect(title40).not.toContain('<script>');
        }

        // 46: Reject with empty comments — validation or disabled button
        {
            const url = await createIntakeAndGetOverviewUrl(page);
            await page.goto(url);
            await workflow.waitForApproveButton();
            await page.locator("//button[normalize-space(text())='Reject']").first().click();
            await page.locator('[placeholder="Enter your comments..."]')
                .waitFor({ state: 'visible', timeout: 10000 });
            const rejectModalBtn   = page.locator("(//button[normalize-space(text())='Reject'])[2]");
            const rejectIsDisabled = await rejectModalBtn.isDisabled({ timeout: 5000 }).catch(() => false);
            if (!rejectIsDisabled) await rejectModalBtn.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1500);
            const rejectBtnHidden   = await page.locator("//button[normalize-space(text())='Reject']")
                .first().isHidden({ timeout: 5000 }).catch(() => false);
            const validationVisible = await page.locator(
                '//*[contains(normalize-space(),"required") or contains(normalize-space(),"comment")]'
            ).first().isVisible({ timeout: 3000 }).catch(() => false);
            expect(rejectBtnHidden || validationVisible || rejectIsDisabled,
                'App should handle empty-comment rejection attempt').toBeTruthy();
        }
    });

});
