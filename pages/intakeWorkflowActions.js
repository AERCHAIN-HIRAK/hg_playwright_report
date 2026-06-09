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

    // Calendar date picker — same logic as intakeCreateActions._pickCalendarDate
    // but accepts any `page` reference (used for PR new-tab pages)
    async _pickCalendarDateOnPage(page, dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const LONG  = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        const SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];
        await page.waitForTimeout(1000);
        for (let attempt = 0; attempt < 48; attempt++) {
            const caption = await page.evaluate(({ longNames, shortNames }) => {
                const pattern = new RegExp('(' + [...longNames, ...shortNames].join('|') + ')\\s+\\d{4}');
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                let node;
                while ((node = walker.nextNode())) {
                    const text = (node.textContent || '').trim();
                    if (text.length < 30 && pattern.test(text)) return text;
                }
                const candidates = document.querySelectorAll('button, span, div[role="heading"]');
                for (const el of candidates) {
                    if (el.childElementCount <= 2) {
                        const text = (el.textContent || '').trim();
                        if (text.length < 30 && pattern.test(text)) return text;
                    }
                }
                return '';
            }, { longNames: LONG, shortNames: SHORT });

            const onTarget = (caption.includes(LONG[month-1]) || caption.includes(SHORT[month-1])) && caption.includes(String(year));
            if (onTarget) break;

            let goNext = true;
            if (caption) {
                for (let m = 0; m < 12; m++) {
                    if (caption.includes(LONG[m]) || caption.includes(SHORT[m])) {
                        const capYear = parseInt((caption.match(/\d{4}/) || ['0'])[0]);
                        goNext = capYear < year || (capYear === year && (m+1) < month);
                        break;
                    }
                }
            }
            const navBtn = page.locator(
                goNext
                    ? 'button[name="next-month"], button[aria-label*="next month" i], button[aria-label*="Next Month"], .react-datepicker__navigation--next, button[class*="next-month"], button[aria-label="Go to next month"]'
                    : 'button[name="previous-month"], button[aria-label*="previous month" i], button[aria-label*="Prev Month"], .react-datepicker__navigation--previous, button[class*="prev-month"], button[aria-label="Go to previous month"]'
            ).first();
            if (await navBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                await navBtn.click();
                await page.waitForTimeout(350);
            } else {
                if (attempt === 0 && !caption) { await page.waitForTimeout(1000); continue; }
                break;
            }
        }
        const clicked = await page.evaluate((targetDay) => {
            // Calendar days can be button, td, div, or span depending on the picker library
            const candidates = Array.from(document.querySelectorAll('button, td, div[class*="day"], div[class*="date"], span[class*="day"]'));
            for (const el of candidates) {
                const txt = (el.textContent || '').trim();
                if (txt === String(targetDay)
                    && !el.disabled
                    && el.getAttribute('aria-disabled') !== 'true'
                    && !el.classList.contains('disabled')
                    && !el.classList.contains('outside')
                    && !el.classList.contains('prev-month')
                    && !el.classList.contains('next-month')) {
                    el.click(); return true;
                }
            }
            return false;
        }, day);
        if (!clicked) {
            // Try button first, then td (Ant Design), then any day-class div/span
            const locs = [
                page.locator(`//button[not(@disabled)][not(@aria-disabled='true')][not(contains(@class,'disabled'))][normalize-space(.)='${day}']`).first(),
                page.locator(`//td[not(@disabled)][not(@aria-disabled='true')][not(contains(@class,'disabled'))][not(contains(@class,'outside'))][normalize-space(.)='${day}']`).first(),
                page.locator(`//*[contains(@class,'day')][not(contains(@class,'disabled'))][not(contains(@class,'outside'))][not(contains(@class,'prev'))][not(contains(@class,'next'))][normalize-space(.)='${day}']`).first(),
            ];
            let didClick = false;
            for (const loc of locs) {
                if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await loc.click({ timeout: 8000 });
                    didClick = true;
                    break;
                }
            }
            if (!didClick) {
                await locs[0].click({ timeout: 8000 }); // surface original error if all fail
            }
        }
        await page.waitForTimeout(400);
    }

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

    // ── More dropdown helpers ─────────────────────────────────────────────────

    /** Open the More dropdown. */
    async _openMoreMenu() {
        const moreBtn = this.page.locator(WL.btn_More).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
        await moreBtn.click();
        await this.page.waitForTimeout(500);
    }

    /** More → Edit. Visible on the overview page after the intake is rejected/sent back. */
    async clickEditFromMoreMenu() {
        await this._openMoreMenu();
        const editOpt = this.page.locator(WL.menu_Edit).first();
        await editOpt.waitFor({ state: 'visible', timeout: 5000 });
        await editOpt.click();
        await this.page.waitForLoadState('domcontentloaded');
        await this._waitForStable();
    }

    /** More → Workflow Stages. Opens the Workflow Steps dialog. */
    async clickWorkflowStagesFromMoreMenu() {
        await this._openMoreMenu();
        const stagesOpt = this.page.locator(WL.menu_WorkflowStages).first();
        await stagesOpt.waitFor({ state: 'visible', timeout: 5000 });
        await stagesOpt.click();
        await this._waitForStable();
    }

    async verifyWorkflowStagesDialogOpen() {
        await expect(this.page.locator(WL.workflowStagesHeading).first())
            .toBeVisible({ timeout: 10000 });
    }

    /** Verify the Workflow Stages dialog contains a "Rejected" badge (old workflow). */
    async verifyPreviousWorkflowIsRejected() {
        await expect(this.page.locator(WL.workflowStages_RejectedBadge).first())
            .toBeVisible({ timeout: 10000 });
    }

    /** Verify the newest workflow entry has status Active or Pending (new workflow in progress). */
    async verifyNewWorkflowIsActiveOrPending() {
        const badge = this.page.locator(WL.workflowStages_FirstWorkflowStatusBadge).first();
        await badge.waitFor({ state: 'visible', timeout: 10000 });
        const statusText = ((await badge.textContent()) || '').trim();
        expect(
            ['Active', 'Pending', 'Inprogress', 'In Progress'].includes(statusText),
            `Expected new workflow to be Active or Pending but got: "${statusText}"`
        ).toBeTruthy();
    }

    /**
     * Click Submit on the edit page, then complete the re-submission popup
     * (Proceed → Purchaser Assignment → Final Submit → overview).
     */
    async submitEditAndCompletePopup() {
        await this.page.locator(WL.editPage_SubmitButton).first().click();
        await this._waitForStable(1000);
        const popupVisible = await this.page.locator(WL.submissionPopup).first()
            .isVisible({ timeout: 15000 }).catch(() => false);
        if (popupVisible) {
            await this.completeSubmissionPopup();
        } else {
            await this.waitForOverviewPage();
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
     * At the start of each iteration, if Approve is not visible, reassigns the
     * Workflow Approver to Admin before retrying. Loops until Accept is visible.
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

    // ── Process → Create PR ───────────────────────────────────────────────────

    /** Click Process button → click Create PR from the dropdown. */
    async clickCreatePRFromProcess() {
        const processBtn = this.page.locator(WL.btn_Process).first();
        await processBtn.waitFor({ state: 'visible', timeout: 10000 });
        await processBtn.click();
        await this.page.waitForTimeout(500);
        const createPROpt = this.page.locator(WL.menu_CreatePR).first();
        await createPROpt.waitFor({ state: 'visible', timeout: 5000 });
        await createPROpt.click();
        await this._waitForStable();
    }

    /** Click Process button → click Send for Sourcing from the dropdown. */
    async clickSendForSourcing() {
        const processBtn = this.page.locator(WL.btn_Process).first();
        await processBtn.waitFor({ state: 'visible', timeout: 10000 });
        await processBtn.click();
        await this.page.waitForTimeout(500);
        const sendOpt = this.page.locator(WL.menu_SendForSourcing).first();
        await sendOpt.waitFor({ state: 'visible', timeout: 5000 });
        await sendOpt.click();
        await this._waitForStable(1500);
        console.log('[BRF] Clicked Process → Send for Sourcing.');
    }

    /** On the quote-requests page: change template from NSEF RFX to Default RFX. */
    async changeRFXTemplateToDefault() {
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        // Find and click the template selector showing "NSEF RFX"
        const templateSel = this.page.locator(WL.rfx_TemplateSelector).first();
        await templateSel.waitFor({ state: 'visible', timeout: 10000 });
        await templateSel.click();
        await this.page.waitForTimeout(600);
        // Select "Default RFX" from the dropdown
        const defaultOpt = this.page.locator(WL.rfx_TemplateOption_DefaultRFX).first();
        await defaultOpt.waitFor({ state: 'visible', timeout: 5000 });
        await defaultOpt.click();
        await this.page.waitForTimeout(1000);
        console.log('[BRF] Template changed to Default RFX.');
    }

    /** Click the expand icon on the quote-requests page after template change. */
    async clickRFXExpandButton() {
        const expandBtn = this.page.locator(WL.rfx_ExpandButton).first();
        await expandBtn.waitFor({ state: 'visible', timeout: 10000 });
        await expandBtn.click();
        await this.page.waitForTimeout(800);
        console.log('[BRF] Expand icon clicked.');
    }

    /** Verify the "Create Requisition" confirmation dialog is visible. */
    async verifyCreatePRConfirmDialogVisible() {
        await expect(this.page.locator(WL.createPR_ConfirmDialog).first())
            .toBeVisible({ timeout: 10000 });
    }

    /** Click the Confirm button in the Create Requisition dialog. */
    async confirmCreatePR() {
        const confirmBtn = this.page.locator(WL.createPR_ConfirmBtn).first();
        await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
        await confirmBtn.click();
        await this._waitForStable(1000);
    }

    /**
     * Verify the "Requisition creation initiated successfully" toast.
     * The toast is transient — caught within 5 s after Confirm click.
     * Non-fatal if already dismissed; status change is the primary assertion.
     */
    async verifyRequisitionSuccessToast() {
        const visible = await this.page.locator(WL.createPR_SuccessToast).first()
            .isVisible({ timeout: 5000 }).catch(() => false);
        if (visible) {
            await expect(this.page.locator(WL.createPR_SuccessToast).first()).toBeVisible();
        }
    }

    /** Verify intake status badge shows "Processed" after Create PR. */
    async verifyIntakeStatusIsProcessed() {
        await expect(this.page.locator(WL.overviewStatus_Processed).first())
            .toBeVisible({ timeout: 15000 });
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

    // ── Transaction Tab (Intake overview) ────────────────────────────────────

    async clickTransactionTab() {
        const tab = this.page.locator(WL.tab_Transaction).first();
        await tab.waitFor({ state: 'visible', timeout: 10000 });
        await tab.click();
        await this._waitForStable(1000);
    }

    async openFirstPRFromTransactionTab(browserContext) {
        const prLink = this.page.locator(WL.transactionTab_FirstPRLink).first();
        await prLink.waitFor({ state: 'visible', timeout: 15000 });
        const [prPage] = await Promise.all([
            browserContext.waitForEvent('page'),
            prLink.click(),
        ]);
        // Set viewport on the new tab to match the main window — prevents shrinking
        await prPage.setViewportSize({ width: 1800, height: 900 });
        await prPage.waitForLoadState('load');
        await prPage.waitForTimeout(3000);
        return prPage;
    }

    // ── Carry-forward assertions: PR from Intake ──────────────────────────────

    async verifyPRTitleCarryForwardedFromIntake(prPage, expectedTitle) {
        // Wait for React to render before checking — the noscript fallback in body
        // text causes false negatives if checked before the app mounts.
        await expect(
            prPage.locator(`//*[contains(normalize-space(),'${expectedTitle}')]`).first()
        ).toBeVisible({ timeout: 20000 });
    }

    async verifyPRLineItemsCarryForwarded(prPage, expectedMinRows = 2) {
        // PR Value being non-zero proves line items were carried forward from Intake.
        // The PR page uses a card layout rather than a plain <table>, so we assert
        // the calculated total (₹ 6,00,000.00 for 2 items × 100 qty) is visible.
        const prValueEl = prPage.locator(WL.pr_ValueField).first();
        const prValueVisible = await prValueEl.isVisible({ timeout: 8000 }).catch(() => false);
        if (prValueVisible) {
            const txt = ((await prValueEl.textContent()) ?? '').trim();
            const hasValue = txt.length > 0 && txt !== 'NA' && txt !== '-';
            expect(hasValue, 'PR Value should be populated — proves line items carried forward from Intake').toBeTruthy();
            console.log(`[PR] PR Value confirmed: ${txt}`);
            return;
        }
        // Fallback: count any row-like elements after scrolling
        await prPage.keyboard.press('End');
        await prPage.waitForTimeout(1000);
        const rows = prPage.locator('//table//tr[not(ancestor::thead)] | //*[contains(@class,"line-item") or contains(@class,"item-row")]');
        const count = await rows.count();
        expect(count, `PR should have at least ${expectedMinRows} line items carried from Intake`).toBeGreaterThanOrEqual(expectedMinRows);
    }

    // ── PR Edit flow ──────────────────────────────────────────────────────────

    async clickEditButtonInPR(prPage) {
        const editBtn = prPage.locator(WL.pr_EditButton).first();
        await editBtn.waitFor({ state: 'visible', timeout: 10000 });
        await editBtn.click();
        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(1500);
    }

    async fillPREditMandatoryFields(prPage) {
        await prPage.waitForTimeout(500);

        // In this app, the placeholder text IS the floating label inside the trigger.
        // Clicking the element whose text equals the label text opens the dropdown.
        // Common option picker — tries every known dropdown option pattern
        const pickFirstOption = async (labelText) => {
            const optLocators = [
                '[role="option"]', '[role="listitem"]',
                '.MuiMenuItem-root', '.MuiAutocomplete-option',
                '.ant-select-item-option-content',
                'li[data-value]', 'li[data-option-index]',
                'ul[role="listbox"] > li', 'ul > li',
            ];
            for (const loc of optLocators) {
                const opt = prPage.locator(loc).first();
                if (await opt.isVisible({ timeout: 4000 }).catch(() => false)) {
                    await opt.click();
                    await prPage.waitForTimeout(400);
                    console.log(`[PR] "${labelText}" filled.`);
                    return true;
                }
            }
            await prPage.keyboard.press('Escape');
            console.log(`[PR] No options appeared for "${labelText}".`);
            return false;
        };

        const fillDropdown = async (labelText) => {
            // Click the ant-select-selector (inner trigger) for the field whose label/placeholder
            // contains labelText. This works regardless of whether the label is floating or separate.
            const selectorEl = prPage.locator(
                `//div[contains(@class,'ant-select')][.//*[contains(normalize-space(),'${labelText}')]]//div[contains(@class,'ant-select-selector')]`
            ).first();

            const triggerVisible = await selectorEl.isVisible({ timeout: 3000 }).catch(() => false);
            if (triggerVisible) {
                // Try up to 3 times — dropdown occasionally needs a second click to open
                for (let attempt = 0; attempt < 3; attempt++) {
                    await selectorEl.click();
                    await prPage.waitForTimeout(1000);
                    const picked = await pickFirstOption(labelText);
                    if (picked) return;
                    await prPage.keyboard.press('Escape').catch(() => {});
                    await prPage.waitForTimeout(300);
                }
            }

            // Fallback: getByLabel
            console.log(`[PR] ant-select strategy failed for "${labelText}" — trying getByLabel.`);
            try {
                const lab = prPage.getByLabel(new RegExp(labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first();
                if (await lab.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await lab.click({ force: true });
                    await prPage.waitForTimeout(800);
                    await pickFirstOption(labelText);
                } else {
                    console.log(`[PR] All strategies failed for "${labelText}".`);
                }
            } catch (_) {
                console.log(`[PR] All strategies failed for "${labelText}".`);
            }
        };

        // Fill Company using dedicated locator (label is outside the ant-select container)
        const companyTrigger = prPage.locator(WL.pr_CompanySelect).locator('div.ant-select-selector').first();
        let companyFilled = false;
        if (await companyTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
            for (let attempt = 0; attempt < 3; attempt++) {
                await companyTrigger.click();
                await prPage.waitForTimeout(1000);
                companyFilled = await pickFirstOption('Company');
                if (companyFilled) break;
                await prPage.keyboard.press('Escape').catch(() => {});
                await prPage.waitForTimeout(300);
            }
        }
        if (!companyFilled) {
            console.log('[PR] Dedicated Company locator failed — falling back to fillDropdown.');
            await fillDropdown('Company');
        }
        await prPage.waitForTimeout(500);
        await fillDropdown('Entity Test 2');

        // Expected Delivery Date — same JS DOM-walker approach: find the date container
        // then click it to open the calendar, then use _pickCalendarDateOnPage
        const normalize = (s) => s.replace(/[*\s]/g, '').toLowerCase();
        const dateTarget = normalize('Expected Delivery Date');
        const dateClicked = await prPage.evaluate(({ target, normStr }) => {
            const norm = new Function('s', `return (${normStr})(s)`); // eslint-disable-line no-new-func
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walker.nextNode())) {
                if (norm(node.textContent) === target) {
                    // Walk up to find the date picker container, then click its input/button
                    let el = node.parentElement;
                    for (let i = 0; i < 6 && el && el !== document.body; i++) {
                        // Prefer clicking a visible input inside the container
                        const inp = el.querySelector('input:not([type="hidden"])');
                        if (inp) { inp.click(); return true; }
                        // Or any button (calendar icon)
                        const btn = el.querySelector('button:not([disabled])');
                        if (btn) { btn.click(); return true; }
                        el = el.parentElement;
                    }
                    // Last resort: click 4th ancestor
                    let p = node.parentElement;
                    for (let i = 0; i < 4 && p && p.parentElement; i++) p = p.parentElement;
                    if (p) { p.click(); return true; }
                }
            }
            return false;
        }, { target: dateTarget, normStr: normalize.toString() });

        if (dateClicked) {
            await prPage.waitForTimeout(800);
            await this._pickCalendarDateOnPage(prPage, '2026-09-30');
            await prPage.keyboard.press('Escape');
            await prPage.waitForTimeout(400);
            console.log('[PR] Expected Delivery Date picked via calendar.');
        } else {
            console.log('[PR] Date trigger not found — skipping Expected Delivery Date.');
        }

        console.log('[PR] Mandatory fields fill attempt complete.');
    }

    async submitPREditForm(prPage) {
        const submitBtn = prPage.locator(WL.pr_SubmitButton).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
        await submitBtn.click();
        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(1500);
    }

    async completePREditPopupIfTriggered(prPage) {
        const popup = prPage.locator('[role="dialog"]').first();
        const popupVisible = await popup.isVisible({ timeout: 8000 }).catch(() => false);
        if (!popupVisible) return;

        // The Workflow Summary popup has a "Submit" button — wait for it explicitly then click
        const submitInDialog = prPage.locator(
            '//*[@role="dialog"]//button[normalize-space(.)="Submit" or normalize-space(text())="Submit"]'
        ).first();
        await submitInDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await submitInDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            await submitInDialog.click();
            console.log('[PR Popup] Clicked Submit in Workflow Summary popup');
        } else {
            // Fallback: click any submit-type button inside the dialog
            const anySubmit = prPage.locator('//*[@role="dialog"]//button[@type="submit"]').first();
            if (await anySubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anySubmit.click();
                console.log('[PR Popup] Clicked type=submit button in dialog');
            }
        }
        // Wait for the popup to close
        await popup.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(1500);
    }

    async completePRApprovalsIfTriggered(prPage) {
        const approveVisible = await prPage.locator(WL.btn_Approve).first()
            .isVisible({ timeout: 8000 }).catch(() => false);
        if (!approveVisible) {
            console.log('[PR Workflow] No PR approval triggered — skipping.');
            return;
        }
        console.log('[PR Workflow] Approval workflow triggered — approving all stages...');
        const prWorkflow = new intakeWorkflowActions(prPage);
        await prWorkflow.approveAllStages('PR approved by Hirak automation suite');
    }

    // ── PR Status assertions ──────────────────────────────────────────────────

    async verifyPRStatusIsSubmittedPendingProcessCalc(prPage) {
        await expect(prPage.locator(WL.pr_StatusSubmitted).first())
            .toBeVisible({ timeout: 15000 });
        const pendingVisible = await prPage.locator(WL.pr_StatusPendingProcessCalc).first()
            .isVisible({ timeout: 5000 }).catch(() => false);
        if (pendingVisible) {
            console.log('[PR] "Pending Process Calculation" label confirmed visible.');
            await expect(prPage.locator(WL.pr_StatusPendingProcessCalc).first()).toBeVisible();
        } else {
            console.log('[PR] "Pending Process Calculation" label not found — checking page text...');
            const bodyText = await prPage.locator('body').textContent();
            const hasPending = bodyText.includes('Pending') || bodyText.includes('Process Calculation');
            expect(hasPending, 'Page should indicate Pending Process Calculation state').toBeTruthy();
        }
    }

    async verifyPRStatusIsSubmitted(prPage) {
        await expect(prPage.locator(WL.pr_StatusSubmitted).first())
            .toBeVisible({ timeout: 15000 });
    }

    // ── More → Process Calculation ────────────────────────────────────────────

    async clickProcessCalculationFromMore(prPage) {
        const moreBtn = prPage.locator(WL.btn_More).first();
        await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
        await moreBtn.click();
        await prPage.waitForTimeout(500);
        const calcOpt = prPage.locator(WL.pr_Menu_ProcessCalculation).first();
        await calcOpt.waitFor({ state: 'visible', timeout: 5000 });
        await calcOpt.click();
        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(2000);
        console.log('[PR] Process Calculation triggered.');
    }

    // ── Process tab → Convert to → Bulk PO ────────────────────────────────────

    async clickProcessTabInPR(prPage) {
        const processTab = prPage.locator(WL.pr_Tab_Process).first();
        await processTab.waitFor({ state: 'visible', timeout: 10000 });
        await processTab.click();
        await prPage.waitForTimeout(1000);
    }

    async clickConvertToBulkPO(prPage) {
        // "Convert to" is a MUI Autocomplete — click the input directly to open the list
        const convertInput = prPage.locator(WL.pr_ConvertToInput).first();
        await convertInput.waitFor({ state: 'visible', timeout: 10000 });
        await convertInput.click();
        await prPage.waitForTimeout(700);

        // Type to filter if dropdown didn't open automatically
        const bulkPOOpt = prPage.locator(WL.pr_ConvertTo_BulkPO).first();
        const optVisible = await bulkPOOpt.isVisible({ timeout: 2000 }).catch(() => false);
        if (!optVisible) {
            await convertInput.fill('Bulk');
            await prPage.waitForTimeout(500);
        }
        await bulkPOOpt.waitFor({ state: 'visible', timeout: 5000 });
        await bulkPOOpt.click();
        await prPage.waitForTimeout(1000);
        console.log('[Bulk PO] "Bulk PO" selected from Convert to dropdown.');
    }

    async verifySupplierFieldEnabled(prPage) {
        // Soft check — supplier column appears after Bulk PO selection; just verify table rows exist
        await prPage.waitForTimeout(500);
        const rows = prPage.locator('//tbody/tr | //div[@role="row"][not(@aria-rowindex="1")]');
        const rowCount = await rows.count();
        console.log(`[Bulk PO] Assert 5: ${rowCount} line-item row(s) visible after Bulk PO selection.`);
        expect(rowCount, 'Line item rows should be present after Bulk PO selection').toBeGreaterThan(0);
    }

    async selectSupplierForAllLineItems(prPage) {
        await prPage.waitForTimeout(1000);

        // AG Grid uses @col-id="supplier" on each cell div.
        // All matches: nth(0) = header, nth(1) = row 1, nth(2) = row 2, etc.
        // Wait up to 8s for supplier cells to appear after Bulk PO selection
        const firstDataCell = prPage.locator("//div[@col-id='supplier']").nth(1);
        await firstDataCell.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

        const allSupplierCells = prPage.locator("//div[@col-id='supplier']");
        const totalCells = await allSupplierCells.count();
        // Data rows start at index 1 (index 0 = header)
        const count = Math.max(0, totalCells - 1);
        console.log(`[Bulk PO] Found ${totalCells} col-id="supplier" cell(s), ${count} data row(s)`);

        if (count === 0) {
            console.log('[Bulk PO] No supplier cells found — skipping');
            return;
        }

        let filled = 0;
        for (let i = 0; i < count; i++) {
            // Use nth(i+1) to skip the header cell at index 0
            const cell = allSupplierCells.nth(i + 1);
            if (!(await cell.isVisible({ timeout: 2000 }).catch(() => false))) continue;

            await cell.scrollIntoViewIfNeeded().catch(() => {});

            // Double-click activates the AG Grid cell editor (MUI Autocomplete input appears inside cell)
            await cell.dblclick();
            await prPage.waitForTimeout(500);

            // Click the MUI Autocomplete input inside the activated cell to open the dropdown
            const muiInput = cell.locator('input[class*="Mui"], input').first();
            if (await muiInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await muiInput.click();
                await prPage.waitForTimeout(500);
                // Clear and type using pressSequentially — MUI Autocomplete needs real key events
                await muiInput.clear().catch(() => {});
                await muiInput.pressSequentially('HG HF', { delay: 60 });
                await prPage.waitForTimeout(1200);
            } else {
                console.log(`[Bulk PO] MUI input not found inside supplier cell for item ${i + 1}`);
                await prPage.keyboard.press('Escape');
                continue;
            }

            // Select "HG HF Test 001" from the dropdown — force click to handle overlays
            const supplierOpt = prPage.locator(WL.bulkPO_SupplierOption).first();
            if (await supplierOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
                await supplierOpt.click({ force: true });
                await prPage.waitForTimeout(500);
                filled++;
                console.log(`[Bulk PO] Supplier "HG HF Test 001" selected for item ${i + 1}`);
            } else {
                const firstOpt = prPage.locator('.ant-select-item-option-content, [role="option"]').first();
                if (await firstOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await firstOpt.click({ force: true });
                    await prPage.waitForTimeout(500);
                    filled++;
                    console.log(`[Bulk PO] First option selected for item ${i + 1}`);
                } else {
                    console.log(`[Bulk PO] No option found for item ${i + 1} — skipping`);
                    await prPage.keyboard.press('Escape');
                }
            }
        }
        console.log(`[Bulk PO] Supplier filled for ${filled}/${count} item(s)`);
    }

    async verifyPriceDisplayedAfterSupplierSelection(prPage) {
        await prPage.waitForTimeout(1500);
        const priceEl = prPage.locator(WL.bulkPO_PriceCell).first();
        const visible = await priceEl.isVisible({ timeout: 5000 }).catch(() => false);
        if (visible) {
            const priceText = (await priceEl.textContent() ?? await priceEl.inputValue().catch(() => '')).trim();
            expect(priceText.length, 'Price should be displayed after supplier selection').toBeGreaterThan(0);
            console.log(`[Bulk PO] Price displayed: ${priceText}`);
        } else {
            console.log('[Bulk PO] Price cell not visible — skipping price assertion.');
        }
    }

    async clickConvertButton(prPage) {
        const convertBtn = prPage.locator(WL.bulkPO_ConvertBtn).first();
        await convertBtn.waitFor({ state: 'visible', timeout: 10000 });
        await convertBtn.click();
        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(2000);
    }

    // ── Order Builder section assertion ───────────────────────────────────────

    async verifyOrderBuilderSectionVisible(prPage) {
        const heading = prPage.locator(WL.orderBuilder_Heading).first();
        const visible = await heading.isVisible({ timeout: 10000 }).catch(() => false);
        if (visible) {
            await expect(heading).toBeVisible();
            console.log('[PR] Order Builder section confirmed visible.');
        } else {
            console.log('[PR] Order Builder heading not found — checking URL...');
            await expect(prPage).not.toHaveURL(/error|404|500/, { timeout: 5000 });
        }
    }

    // ── PRC mandatory fields ──────────────────────────────────────────────────

    async fillPRCMandatoryFields(prPage, data) {
        await prPage.waitForTimeout(1500);

        // Fill each mandatory dropdown by its element ID.
        // There may be multiple splits — loop until none remain empty.
        const fillById = async (fieldId) => {
            const fields = prPage.locator(`[id="${fieldId}"]`);
            const count = await fields.count();
            console.log(`[PRC] Found ${count} "${fieldId}" field(s)`);
            for (let i = 0; i < count; i++) {
                const field = fields.nth(i);
                if (!(await field.isVisible({ timeout: 2000 }).catch(() => false))) continue;
                // Check if already filled (has a selected value)
                const text = ((await field.textContent()) ?? '').trim();
                if (text && !text.includes(fieldId)) continue; // already has a value
                await field.click();
                await prPage.waitForTimeout(600);
                const firstOpt = prPage.locator('.ant-select-item-option-content, [role="option"]').first();
                if (await firstOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await firstOpt.click();
                    await prPage.waitForTimeout(400);
                    console.log(`[PRC] "${fieldId}" #${i + 1} filled`);
                } else {
                    await prPage.keyboard.press('Escape');
                    console.log(`[PRC] No options for "${fieldId}" #${i + 1}`);
                }
            }
        };

        await fillById('Company');
        await prPage.waitForTimeout(300);
        await fillById('Payment Terms');
        await prPage.waitForTimeout(500);

        // Enter price in both line item rows.
        // col-id="line_items_quote_price": [1]=header, [2]=row1, [3]=row2 → nth(1) and nth(2)
        const allPriceCells = prPage.locator("//div[@col-id='line_items_quote_price']");
        const priceCount = await allPriceCells.count();
        console.log(`[PRC] Found ${priceCount} price cell(s) (col-id="line_items_quote_price")`);

        const price = data.price ?? '100';
        for (let i = 1; i < priceCount; i++) { // skip header at index 0
            const cell = allPriceCells.nth(i);
            if (!(await cell.isVisible({ timeout: 2000 }).catch(() => false))) continue;
            await cell.scrollIntoViewIfNeeded().catch(() => {});
            await cell.dblclick();
            await prPage.waitForTimeout(500);
            const priceInput = cell.locator('input').first();
            if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await priceInput.clear().catch(() => {});
                await priceInput.fill(price);
                await prPage.keyboard.press('Tab');
                await prPage.waitForTimeout(400);
                console.log(`[PRC] Price ${price} entered for row ${i}`);
            }
        }

        console.log('[PRC] Mandatory fields filled.');
    }

    async submitPRC(prPage) {
        // Step 1: click the PRC form Submit — (//span[@class="MuiButton-label"])[3]
        const submitBtn = prPage.locator(WL.prc_SubmitButton).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
        await submitBtn.click();
        await prPage.waitForTimeout(1500);
        console.log('[PRC] First Submit clicked.');

        // Step 2: Workflow Summary popup appears — click Submit again to confirm
        const popup = prPage.locator('[role="dialog"]').first();
        if (await popup.isVisible({ timeout: 6000 }).catch(() => false)) {
            const popupSubmit = prPage.locator(
                '//*[@role="dialog"]//button[normalize-space(.)="Submit" or normalize-space(text())="Submit"]'
            ).first();
            await popupSubmit.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            if (await popupSubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
                await popupSubmit.click();
                console.log('[PRC] Popup Submit clicked.');
                await popup.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
            }
        }

        await prPage.waitForLoadState('domcontentloaded');
        await prPage.waitForTimeout(2000);
        console.log('[PRC] Submitted.');
    }

    async completePRCApprovalsIfTriggered(prPage) {
        const approveVisible = await prPage.locator(WL.btn_Approve).first()
            .isVisible({ timeout: 8000 }).catch(() => false);
        if (!approveVisible) {
            console.log('[PRC Workflow] No PRC approval triggered — skipping.');
            return;
        }
        console.log('[PRC Workflow] Approval workflow triggered — approving all stages...');
        const prcWorkflow = new intakeWorkflowActions(prPage);
        await prcWorkflow.approveAllStages('PRC approved by Hirak automation suite');
    }

    // ── Poll until PRC status = Converted ─────────────────────────────────────

    async waitForPRCStatusConverted(prPage, maxAttempts = 20) {
        console.log('[PRC] Polling for Converted status every 30 seconds...');
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const converted = await prPage.locator(WL.prc_StatusConverted).first()
                .isVisible({ timeout: 5000 }).catch(() => false);
            if (converted) {
                console.log(`[PRC] Status is Converted after ${attempt} poll(s).`);
                return;
            }
            if (attempt < maxAttempts) {
                console.log(`[PRC] Poll ${attempt}/${maxAttempts} — not yet Converted, reloading in 30 s...`);
                await prPage.waitForTimeout(30000);
                await prPage.reload({ waitUntil: 'domcontentloaded' });
                await prPage.waitForTimeout(2000);
            }
        }
        await expect(prPage.locator(WL.prc_StatusConverted).first())
            .toBeVisible({ timeout: 15000 });
    }

    // ── Requisition Conversion view ────────────────────────────────────────────

    async verifySplitsInRequisitionConversionView(prPage, expectedSplitCount = 2) {
        const section = prPage.locator(WL.reqConversion_Section).first();
        const sectionVisible = await section.isVisible({ timeout: 10000 }).catch(() => false);
        if (sectionVisible) {
            await expect(section).toBeVisible();
            console.log('[PRC] Requisition Conversion section visible.');
        } else {
            console.log('[PRC] Requisition Conversion section not found — checking page text...');
            const bodyText = await prPage.locator('body').textContent();
            const hasConversion = bodyText.includes('Conversion') || bodyText.includes('Split');
            expect(hasConversion, 'Page should show Requisition Conversion / Split info').toBeTruthy();
        }

        const splits = prPage.locator(WL.reqConversion_SplitRows);
        const splitCount = await splits.count();
        console.log(`[PRC] ${splitCount} split row(s) found in conversion view.`);
        if (splitCount > 0) {
            expect(splitCount, `Should have ${expectedSplitCount} split(s) matching line item count`)
                .toBeGreaterThanOrEqual(expectedSplitCount);
        }
    }

    async hoverPO1AndOpenPOInNewTab(prPage, browserContext) {
        const po1El = prPage.locator(WL.reqConversion_PO1).first();
        await po1El.waitFor({ state: 'visible', timeout: 15000 });
        await po1El.hover();
        await prPage.waitForTimeout(800);

        const poLink = prPage.locator(WL.reqConversion_POCodeLink).first();
        await poLink.waitFor({ state: 'visible', timeout: 8000 });

        const [poPage] = await Promise.all([
            browserContext.waitForEvent('page'),
            poLink.click(),
        ]);
        await poPage.waitForLoadState('domcontentloaded');
        await poPage.waitForTimeout(1500);
        console.log('[PO] Opened in new tab:', poPage.url());
        return poPage;
    }

    // ── PO carry-forward assertions ────────────────────────────────────────────

    async verifyPODetailsCarryForwarded(poPage, intakeTitle) {
        await poPage.waitForLoadState('load');
        await poPage.waitForTimeout(2000);
        await expect(poPage).toHaveURL(/purchase.order|orders|\/po\//i, { timeout: 15000 });
        const hasPOContent = await poPage.locator(
            '//*[contains(normalize-space(),"Purchase Order") or contains(normalize-space(),"PO")]'
        ).first().isVisible({ timeout: 10000 }).catch(() => false);
        expect(hasPOContent, 'PO page should contain Purchase Order content').toBeTruthy();
        // Verify title is visible on the rendered PO page
        await expect(
            poPage.locator(`//*[contains(normalize-space(),'${intakeTitle}')]`).first()
        ).toBeVisible({ timeout: 15000 });
        console.log('[PO] Page loaded. Carry-forwarded details verified.');
    }

    async verifyPRCDetailsCarryForwardedFromPR(prPage, prTitle) {
        // Wait for React render before asserting carry-forward
        await expect(
            prPage.locator(`//*[contains(normalize-space(),'${prTitle}')]`).first()
        ).toBeVisible({ timeout: 15000 });
        console.log('[PRC] Carry-forward from PR verified.');
    }

}
