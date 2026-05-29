import { expect } from '@playwright/test';
import { intakeWorkflow_Locators as WL } from './intakeWorkflowLocators';
import { intakeCreate_Locators as CL } from './allLocators';
import { intakeCreateActions } from './actions';
import createData from './IntakeCreateData.json';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// intakeWorkflowActions
// Handles everything from the submission popup onward:
//   • Popup verification (workflow summary + purchaser assignment)
//   • Popup completion (proceed + assign purchaser + final submit)
//   • Approval step   (approve / reject with comments)
//   • Review step     (click review → edit page → submit)
//   • Acknowledgement step
//   • Purchaser Accept step
//   • Overview status assertions
// ─────────────────────────────────────────────────────────────────────────────

export class intakeWorkflowActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    async takeScreenshot(name) {
        const timestamp = Date.now();
        await this.page.screenshot({
            path: `screenshots/workflow_${name}_${timestamp}.png`,
            fullPage: true,
        });
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    async _waitForStable(ms = 800) {
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(ms);
    }

    async _optionalClick(locator, timeout = 3000) {
        const el = this.page.locator(locator).first();
        const visible = await el.isVisible({ timeout }).catch(() => false);
        if (visible) await el.click();
        return visible;
    }

    // ── Submission Popup helpers ──────────────────────────────────────────────

    /** Wait for the submission popup to become visible. */
    async waitForPopupVisible() {
        await this.page.locator(WL.submissionPopup).first()
            .waitFor({ state: 'visible', timeout: 30000 });
    }

    /** Wait for the submission popup to close (after final submit). */
    async waitForPopupClosed() {
        await this.page.locator(WL.submissionPopup).first()
            .waitFor({ state: 'hidden', timeout: 20000 });
    }

    // ── Popup Step 1 — Workflow Summary assertions ────────────────────────────

    async verifyPopupIsOpen() {
        await expect(this.page.locator(WL.submissionPopup).first())
            .toBeVisible({ timeout: 15000 });
    }

    async verifyWorkflowSummaryHeadingVisible() {
        await expect(this.page.locator(WL.popupWorkflowSummaryHeading).first())
            .toBeVisible({ timeout: 10000 });
    }

    async verifyApprovalStepListedInPopup() {
        await expect(this.page.locator(WL.popupStep_Approval).first())
            .toBeVisible({ timeout: 10000 });
    }

    async verifyReviewStepListedInPopup() {
        await expect(this.page.locator(WL.popupStep_Review).first())
            .toBeVisible({ timeout: 10000 });
    }

    async verifyAcknowledgementStepListedInPopup() {
        await expect(this.page.locator(WL.popupStep_Acknowledgement).first())
            .toBeVisible({ timeout: 10000 });
    }

    /**
     * Verify that workflow steps appear in the correct top-to-bottom order
     * inside the popup: Approval → Review → Acknowledgement → Purchaser.
     */
    async verifyWorkflowStepsSequentialOrder() {
        const popup = this.page.locator(WL.submissionPopup).first();
        const text = await popup.textContent();
        const t = text || '';

        const approvalIdx     = t.indexOf('Approval');
        const reviewIdx       = t.indexOf('Review');
        const ackIdx          = Math.max(t.indexOf('Acknowledgement'), t.indexOf('Acknowledgment'));
        const purchaserIdx    = t.indexOf('Purchaser');

        // Only assert on steps actually present in the popup
        if (approvalIdx >= 0 && reviewIdx >= 0) {
            expect(approvalIdx, 'Approval must appear before Review').toBeLessThan(reviewIdx);
        }
        if (reviewIdx >= 0 && ackIdx >= 0) {
            expect(reviewIdx, 'Review must appear before Acknowledgement').toBeLessThan(ackIdx);
        }
        if (ackIdx >= 0 && purchaserIdx >= 0) {
            expect(ackIdx, 'Acknowledgement must appear before Purchaser').toBeLessThan(purchaserIdx);
        }
    }

    // ── Popup Step 2 — Purchaser Assignment assertions ─────────────────────────

    async verifyPurchaserSectionVisible() {
        await expect(this.page.locator(WL.popupPurchaserHeading).first())
            .toBeVisible({ timeout: 10000 });
    }

    // ── Popup completion  ─────────────────────────────────────────────────────

    /**
     * Click "Proceed" in the workflow-summary step of the popup.
     * This re-uses the existing intakeProceed locator from allLocators.js.
     */
    async proceedThroughWorkflowSummary() {
        await this.page.locator(CL.intakeProceed).click();
        await this._waitForStable();
    }

    /**
     * Select a purchaser and click Final Submit.
     * Purchaser dropdown + option locators are dialog-scoped (no positional index).
     */
    async selectPurchaserAndFinalSubmit() {
        // Wait for the purchaser dropdown to be visible inside the dialog
        const dropdown = this.page.locator(CL.intakePurAsignDropdown).first();
        await dropdown.waitFor({ state: 'visible', timeout: 15000 });
        await dropdown.scrollIntoViewIfNeeded();
        // force:true bypasses any invisible overlay on the Radix UI dialog backdrop
        await dropdown.click({ force: true });
        await this.page.waitForTimeout(600);

        // Select "Aerchain NSE Admin" from the people-picker
        const opt = this.page.locator(CL.intakepurAsignOpt);
        await opt.waitFor({ state: 'visible', timeout: 10000 });
        await opt.click();
        await this.page.waitForTimeout(400);

        // Final Submit is scoped to the dialog so positional index never breaks
        const finalSubmit = this.page.locator(CL.intakeFinalSubmit).first();
        await finalSubmit.waitFor({ state: 'visible', timeout: 10000 });
        await finalSubmit.click();
    }

    /**
     * Full popup completion: proceed + select purchaser + final submit.
     * Waits for the overview page URL before returning.
     */
    async completeSubmissionPopup() {
        await this.proceedThroughWorkflowSummary();
        await this.selectPurchaserAndFinalSubmit();
        await this.waitForOverviewPage();
    }

    // ── Overview page ─────────────────────────────────────────────────────────

    async waitForOverviewPage() {
        await expect(this.page).toHaveURL(/overview/, { timeout: 20000 });
        await this._waitForStable(1000);
    }

    async verifyOnOverviewPage() {
        await expect(this.page).toHaveURL(/overview/, { timeout: 15000 });
    }

    async verifyIntakeStatusIsAwaitingActions() {
        await expect(this.page.locator(WL.overviewStatus_AwaitingActions).first())
            .toBeVisible({ timeout: 15000 });
    }

    async verifyIntakeStatusIsReleased() {
        await expect(this.page.locator(WL.overviewStatus_ActiveReleased).first())
            .toBeVisible({ timeout: 15000 });
    }

    async verifyIntakeStatusIsRejected() {
        // In the NSE workflow, after one approver rejects the intake is "sent back"
        // to the submitter — the status badge may stay as "Pending Approval" but the
        // Approve / Reject action buttons are removed.  Use button absence as the
        // canonical rejection signal; also try the status text as a fallback.
        const approveGone = await this.page.locator(WL.btn_Approve).first()
            .isHidden({ timeout: 15000 }).catch(() => false);
        if (approveGone) return; // Approve button hidden → rejection reflected

        // Fallback: look for a status badge that indicates rejected / cancelled
        await expect(this.page.locator(WL.overviewStatus_CancelledRejected).first())
            .toBeVisible({ timeout: 5000 });
    }

    // ── Approval Step ─────────────────────────────────────────────────────────

    async waitForApproveButton() {
        // Wait 10s for Approve button. If not visible, the intake may be assigned
        // to a different approver role — use More → Reassign Workflow Approver → Admin.
        const approveVisible = await this.page.locator(WL.btn_Approve).first()
            .waitFor({ state: 'visible', timeout: 10000 })
            .then(() => true).catch(() => false);
        if (!approveVisible) {
            console.log('[Workflow] Approve button not visible after 10s — reassigning Workflow Approver to Admin...');
            await this.reassignWorkflowApproverToAdmin();
            await this.page.locator(WL.btn_Approve).first()
                .waitFor({ state: 'visible', timeout: 15000 });
        }
    }

    /**
     * More → Reassign Workflow Approver → Aerchain NSE Admin → reason → Submit.
     * Fallback used when the Approve button is assigned to a different approver role.
     */
    async reassignWorkflowApproverToAdmin(reason = 'Reassigned for automated testing') {
        const moreBtn = this.page.locator(WL.btn_More).first();
        const moreVisible = await moreBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (!moreVisible) return false;

        await moreBtn.click();
        await this.page.waitForTimeout(500);

        const reassignOpt = this.page.locator(WL.menu_ReassignWorkflowApprover).first();
        await reassignOpt.waitFor({ state: 'visible', timeout: 5000 });
        await reassignOpt.click();
        await this._waitForStable();

        // Select "Aerchain NSE Admin" from user picker
        const userDropdown = this.page.locator(WL.reassign_UserDropdown).first();
        await userDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await userDropdown.click({ force: true });
        await this.page.waitForTimeout(600);

        const adminOpt = this.page.locator(WL.reassign_AdminOption).first();
        await adminOpt.waitFor({ state: 'visible', timeout: 10000 });
        await adminOpt.click();
        await this.page.waitForTimeout(400);

        // Fill reason
        const reasonField = this.page.locator(WL.reassign_ReasonField).first();
        await reasonField.waitFor({ state: 'visible', timeout: 5000 });
        await reasonField.fill(reason);

        // Submit
        await this.page.locator(WL.reassign_SubmitBtn).first().click();
        await this._waitForStable(1500);

        return true;
    }

    async verifyApproveButtonIsVisible() {
        await expect(this.page.locator(WL.btn_Approve).first()).toBeVisible({ timeout: 15000 });
    }

    async verifyRejectButtonIsVisible() {
        await expect(this.page.locator(WL.btn_Reject).first()).toBeVisible({ timeout: 15000 });
    }

    async verifyApprovalButtonsVisible() {
        await this.verifyApproveButtonIsVisible();
        await this.verifyRejectButtonIsVisible();
    }

    /**
     * Click Approve → wait for comments modal → optionally fill comments → confirm.
     * @param {string} comments  Leave blank to test empty-comment edge case.
     */
    async approveIntake(comments = 'Approved by automation') {
        await this.page.locator(WL.btn_Approve).first().click();
        await this.page.locator(WL.commentsField)
            .waitFor({ state: 'visible', timeout: 10000 });
        if (comments) {
            await this.page.locator(WL.commentsField).fill(comments);
        }
        await this.page.locator(WL.modal_ApproveConfirm).click();
        await this._waitForStable(1200);
    }

    /**
     * Click Reject → wait for comments modal → fill comments → confirm.
     * @param {string} comments  Rejection reason (required for negative test data).
     */
    async rejectIntake(comments = 'Rejected by automation') {
        await this.page.locator(WL.btn_Reject).first().click();
        await this.page.locator(WL.commentsField)
            .waitFor({ state: 'visible', timeout: 10000 });
        if (comments) {
            await this.page.locator(WL.commentsField).fill(comments);
        }
        await this.page.locator(WL.modal_RejectConfirm).click();
        await this._waitForStable(1200);
    }

    /** Open the approve modal then dismiss it without confirming. */
    async openApproveModalThenCancel() {
        await this.page.locator(WL.btn_Approve).first().click();
        await this.page.locator(WL.commentsField)
            .waitFor({ state: 'visible', timeout: 10000 });
        // Try Cancel button; fall back to Escape
        const cancelled = await this._optionalClick(WL.modal_Cancel);
        if (!cancelled) await this.page.keyboard.press('Escape');
        await this._waitForStable();
    }

    /** Open the reject modal then dismiss it without confirming. */
    async openRejectModalThenCancel() {
        await this.page.locator(WL.btn_Reject).first().click();
        await this.page.locator(WL.commentsField)
            .waitFor({ state: 'visible', timeout: 10000 });
        const cancelled = await this._optionalClick(WL.modal_Cancel);
        if (!cancelled) await this.page.keyboard.press('Escape');
        await this._waitForStable();
    }

    /**
     * Approve every workflow stage sequentially until the Accept button appears.
     * After each approval the next stage's Approve button replaces the previous one.
     * Loops until Accept is visible (all stages done) or no Approve button within timeout.
     */
    async approveAllStages(comments = 'Approved by automation') {
        const maxStages = 10;
        for (let i = 0; i < maxStages; i++) {
            // Wait 10s for Approve button; if absent reassign Workflow Approver to Admin
            let approveVisible = await this.page.locator(WL.btn_Approve).first()
                .waitFor({ state: 'visible', timeout: 10000 })
                .then(() => true).catch(() => false);

            if (!approveVisible) {
                console.log(`[Workflow] Stage ${i + 1}: Approve not visible — reassigning Workflow Approver to Admin...`);
                await this.reassignWorkflowApproverToAdmin();
                approveVisible = await this.page.locator(WL.btn_Approve).first()
                    .waitFor({ state: 'visible', timeout: 15000 })
                    .then(() => true).catch(() => false);
            }
            if (!approveVisible) break;

            console.log(`[Workflow] Approving stage ${i + 1}...`);
            await this.approveIntake(comments);
            await this.page.waitForTimeout(2000);

            const acceptVisible = await this.page.locator(WL.btn_Accept).first()
                .isVisible({ timeout: 3000 }).catch(() => false);
            if (acceptVisible) {
                console.log(`[Workflow] All stages approved after ${i + 1} approval(s). Accept button visible.`);
                break;
            }
        }
    }

    /**
     * Verify that the approval action was processed.
     *
     * NSE uses a multi-approver workflow: the header Approve button stays visible
     * after one approver acts (others still need to vote).  The reliable signal
     * that the approval was accepted is that the comments modal has closed and the
     * page has not navigated to an error URL.
     *
     * If the Approve button does disappear (sole-approver config or step fully
     * complete), that is also accepted.
     */
    async verifyApprovalStepCompleted() {
        // Case 1: sole approver — button disappears when step completes
        const isHidden = await this.page.locator(WL.btn_Approve).first()
            .isHidden({ timeout: 3000 }).catch(() => false);
        if (isHidden) return;

        // Case 2: multi-approver — modal closed and page stable confirms vote recorded
        await expect(this.page.locator(WL.commentsField))
            .toBeHidden({ timeout: 5000 });
        await expect(this.page).not.toHaveURL(/error|500/);
    }

    // ── Review Step ───────────────────────────────────────────────────────────

    async waitForReviewButton() {
        // Server may need a moment after approval to unlock the Review step.
        // If not visible within 20 s, reload once and try for another 40 s.
        try {
            await this.page.locator(WL.btn_Review).first()
                .waitFor({ state: 'visible', timeout: 20000 });
        } catch {
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.locator(WL.btn_Review).first()
                .waitFor({ state: 'visible', timeout: 40000 });
        }
    }

    async verifyReviewButtonIsVisible() {
        await expect(this.page.locator(WL.btn_Review).first())
            .toBeVisible({ timeout: 15000 });
    }

    async clickReviewButton() {
        await this.page.locator(WL.btn_Review).first().click();
        await this.page.waitForLoadState('domcontentloaded');
        await this._waitForStable();
    }

    /**
     * Verify the review edit page is open.
     * URL typically ends with /edit or /review; check both variants.
     */
    async verifyReviewEditPageOpen() {
        await expect(this.page).toHaveURL(
            /intakes\/\d+\/(edit|review|update)/,
            { timeout: 12000 }
        );
    }

    /**
     * Verify the edit page title field is pre-filled with the expected intake title.
     */
    async verifyEditPageIsPreFilled(expectedTitle) {
        const titleField = this.page.locator(WL.editPage_TitleField);
        await expect(titleField).toHaveValue(expectedTitle, { timeout: 10000 });
    }

    /**
     * Click Submit on the edit/review page and handle the optional popup
     * that may re-appear (same Proceed + Final Submit flow as original submission).
     */
    async submitReviewEdit() {
        await this.page.locator(WL.editPage_SubmitButton).first().click();
        await this._waitForStable(1000);

        // If a submission popup re-appears, complete it
        const popup = this.page.locator(WL.submissionPopup);
        if (await popup.count() > 0 && await popup.first().isVisible({ timeout: 3000 }).catch(() => false)) {
            const proceedBtn = this.page.locator(CL.intakeProceed);
            if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await proceedBtn.click();
                await this._waitForStable();
            }
            const finalBtn = this.page.locator(CL.intakeFinalSubmit);
            if (await finalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await finalBtn.click();
            }
        }
        await this._waitForStable(1200);
    }

    /**
     * Re-fill all mandatory sections on the review edit page before submitting.
     * The edit page opens pre-populated but field validation still runs on submit —
     * so we must explicitly fill: Basic Information, Particulars of Procurement,
     * Business Objective of Purchase, and Purchase Business Case sections.
     */
    async fillReviewEditFields() {
        const creator = new intakeCreateActions(this.page);

        // ── Basic Information mandatory fields ────────────────────────────────
        await creator.selectIntakePurchaseRelatedServices();
        await creator.fillIntakeContractStartDate(createData);
        await creator.fillIntakeContractEndDate(createData);
        await creator.selectIntakeSingleVendorProcurement();
        await creator.typeIntakeSingleVendorJustification(createData);
        await creator.selectIntakeTypeOfProcurement();
        await creator.selectIntakeFinancialYear();

        // ── Particulars of Procurement mandatory fields ───────────────────────
        await creator.selectIntakeCXOAppInfra();
        await creator.selectIntakeCXOBizReq();
        await creator.selectIntakeCXOMinCommit();
        await creator.selectIntakeCXOMeitY();
        await creator.selectIntakeCXONSEDataTransfer();
        await creator.selectIntakeCXORPwD();

        // ── Business Objective of Purchase section — CodeX Editor rich-text ──
        await creator.typeIntakeBusinessObjectiveRichText(createData);

        // ── Business Objective of Purchase / Purchase Business Case ───────────
        await creator.typeIntakeBusinessObjective(createData);
        await creator.typeIntakeItemsDetails(createData);
        await creator.typeIntakeNecessityPurchase(createData);
        await creator.fillIntakeDeliveryTimeline(createData);
    }

    /** End-to-end: click Review → edit page → fill mandatory sections → submit → back to overview. */
    async completeReviewStep() {
        await this.clickReviewButton();
        await this.fillReviewEditFields();
        await this.submitReviewEdit();
        await this.waitForOverviewPage();
    }

    async verifyReviewStepCompleted() {
        await expect(this.page.locator(WL.btn_Review).first())
            .toBeHidden({ timeout: 15000 });
    }

    // ── Acknowledgement Step ──────────────────────────────────────────────────

    async waitForAcknowledgeButton() {
        await this.page.locator(WL.btn_Acknowledge).first()
            .waitFor({ state: 'visible', timeout: 20000 });
    }

    async verifyAcknowledgeButtonIsVisible() {
        await expect(this.page.locator(WL.btn_Acknowledge).first())
            .toBeVisible({ timeout: 15000 });
    }

    /**
     * Click Acknowledge and handle an optional confirmation modal.
     */
    async acknowledgeIntake(comments = '') {
        await this.page.locator(WL.btn_Acknowledge).first().click();
        await this._waitForStable();

        // Some implementations show a comments modal; handle it if present
        const commentsField = this.page.locator(WL.commentsField);
        if (await commentsField.isVisible({ timeout: 3000 }).catch(() => false)) {
            if (comments) await commentsField.fill(comments);
            const confirmBtn = this.page.locator(WL.modal_AcknowledgeConfirm);
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
            }
        }
        await this._waitForStable(1200);
    }

    async verifyAcknowledgementStepCompleted() {
        await expect(this.page.locator(WL.btn_Acknowledge).first())
            .toBeHidden({ timeout: 15000 });
    }

    // ── Accept (Purchaser) Step ───────────────────────────────────────────────

    async waitForAcceptButton() {
        await this.page.locator(WL.btn_Accept).first()
            .waitFor({ state: 'visible', timeout: 20000 });
    }

    async verifyAcceptButtonIsVisible() {
        await expect(this.page.locator(WL.btn_Accept).first())
            .toBeVisible({ timeout: 15000 });
    }

    /**
     * Click Accept and handle an optional confirmation dialog.
     */
    async acceptIntake(comments = '') {
        await this.page.locator(WL.btn_Accept).first().click();
        await this._waitForStable();

        // Some apps show a confirm dialog with a second Accept button
        const confirmBtn = this.page.locator(WL.modal_AcceptConfirm);
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            if (comments) {
                const cf = this.page.locator(WL.commentsField);
                if (await cf.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await cf.fill(comments);
                }
            }
            await confirmBtn.click();
        }
        await this._waitForStable(1200);
    }

}
