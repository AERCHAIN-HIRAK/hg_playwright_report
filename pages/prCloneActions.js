import { expect } from '@playwright/test';
import { prEdit_Locators as PL } from './prEditLocators';
import { v3Detail_Locators as DL } from './v3DetailLocators';

const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// The clone page carries TWO buttons reading "Submit": the header one, and a
// permanently DISABLED one at the very end of the DOM. Playwright computes the
// accessible name "Submit" for the disabled one ONLY, so
// getByRole('button', {name:'Submit'}) resolves exclusively to the dead button
// and the click retries until the test times out (observed 2026-09-15).
// Match by text in DOM order instead, skip anything disabled, and exclude the
// dialog so a retry can never hit the POPUP's Submit — that button is what
// would actually create the requisition.
const PAGE_SUBMIT = '//button[not(@disabled)][normalize-space()="Submit"]'
    + '[not(ancestor::*[contains(@class,"MuiDialog-root")])]';

// The LEAF node carrying the budget error, not an ancestor of it.
// prEditLocators.budgetExceededBanner matches every ancestor too, and .first()
// then resolves to the outermost one — effectively the whole dialog, whose text
// begins "Approvers". Asserting /budget/i against that passes on any dialog
// that merely mentions budget anywhere, which is no assertion at all. The
// not(.//*) predicate keeps only the innermost match, the way poAmendActions
// already does it.
const BUDGET_ERROR_LEAF = '//*[contains(@class,"MuiDialog-root")]'
    + '//*[contains(normalize-space(),"Budget Amount is exceeded")]'
    + '[not(.//*[contains(normalize-space(),"Budget Amount is exceeded")])]';

// ─────────────────────────────────────────────────────────────────────────────
// Requisition CLONE — /requisitions/{id}/clone (v3, nse-capp-uat)
//
// Sheet scenario 48: an Awarded PR that has been edited and submitted shows a
// Budget Exceeded error when it is cloned.
//
// The clone form is NOT the edit form. A draft PR carries Payment Terms, the
// three dates, Purchase Type and the two Inward radios EMPTY, so prEditActions
// has to fill six mandatory fields before the budget check will even run. A
// clone arrives fully pre-filled from its parent — verified live on
// /requisitions/1185/clone, whose only empty inputs were Terms and Condition,
// the template/supplier search boxes and the rich-text editor's resize fields,
// none of them mandatory. So the clone submits untouched and the budget
// validation fires on the first click.
//
// NON-DESTRUCTIVE BY CONSTRUCTION. The page's own Submit only opens the
// Workflow Summary popup; the record is created by the POPUP's Submit, which
// this never clicks. An over-budget clone leaves the browser on /clone with no
// PR created, so the same parent PR is reusable run after run.
// ─────────────────────────────────────────────────────────────────────────────
export class prCloneActions {

    constructor(page) {
        this.page = page;
    }

    // ── Finding a Completed PR ────────────────────────────────────────────────

    /**
     * Read the Requisition listing as [{ id, code, status, subject }].
     *
     * Columns are resolved by HEADER NAME, never by index: this listing carries
     * 28 columns and Status sits at 9, far past anything worth hardcoding.
     */
    async listRequisitions(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/requisitions`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 60000 });
        await this.page.waitForTimeout(2500);

        const rows = await this.page.$$eval('tbody tr', trs => {
            const ths = [...document.querySelectorAll('thead th')]
                .map(t => (t.innerText || '').trim());
            const iCode    = ths.indexOf('Code');
            const iStatus  = ths.indexOf('Status');
            const iSubject = ths.indexOf('Subject');
            return trs.map(tr => {
                const tds = tr.querySelectorAll('td');
                const href = tr.querySelector('a')?.getAttribute('href') || '';
                const cell = i => (i >= 0 ? (tds[i]?.innerText || '').trim() : '');
                return {
                    id:      (href.match(/\/requisitions\/(\d+)/) || [])[1] || null,
                    code:    cell(iCode),
                    status:  cell(iStatus),
                    subject: cell(iSubject),
                };
            }).filter(r => r.id);
        });

        console.log(`[PR clone] ${rows.length} requisition(s) on page 1`);
        return rows;
    }

    /**
     * Newest Completed PR that is SAFE to drive.
     *
     * Same safety rule as the PR edit and RFX cancel tests: only ever touch a
     * record whose Subject contains "HG Automation", so a run can never build a
     * clone off something set up by hand. Returns null when the visible page
     * holds none — callers skip rather than fail, since UAT data is not
     * guaranteed.
     */
    async pickCompleted({ safeSubject = /HG Automation/i, baseUrl = V3_BASE_URL } = {}) {
        const rows = await this.listRequisitions(baseUrl);
        const completed = rows.filter(r => /^completed$/i.test(r.status)
            && safeSubject.test(r.subject));
        console.log(`[PR clone] ${completed.length} safe Completed PR(s): ` +
            completed.slice(0, 5).map(r => `${r.code}(${r.id})`).join(' · '));
        return completed[0] || null;
    }

    // ── Detail page ───────────────────────────────────────────────────────────

    async openDetail(id, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/requisitions/${id}`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await expect(this.page.getByRole('button', { name: 'More' }).first(),
            'the PR detail header never rendered').toBeVisible({ timeout: 60000 });
        await this.page.waitForTimeout(2500);
        console.log(`[PR clone] on ${this.page.url()}`);
    }

    /** Header status chip text, e.g. "Completed". */
    async readStatusChip() {
        const chip = this.page.locator(DL.statusChip).first();
        await chip.waitFor({ state: 'visible', timeout: 30000 });
        return ((await chip.innerText()) || '').trim();
    }

    /**
     * Menu items must be scoped to VISIBLE nodes — these pages keep an
     * unrelated MUI menu permanently mounted with visibility:hidden, and an
     * unscoped li[role=menuitem] resolves to that hidden node instead.
     */
    _visibleMenuItems() {
        return this.page.locator('li[role="menuitem"]').locator('visible=true');
    }

    async openMoreMenu() {
        if (await this._visibleMenuItems().count() > 0) return;
        await this.page.getByRole('button', { name: 'More' }).first()
            .click({ timeout: 20000 });
        await expect(this._visibleMenuItems().first(),
            'the More dropdown did not open').toBeVisible({ timeout: 20000 });
        await this.page.waitForTimeout(800);
    }

    async getMoreMenuItems() {
        await this.openMoreMenu();
        const items = this._visibleMenuItems();
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await items.nth(i).innerText()) || '').trim());
        console.log(`[PR clone] More menu: ${JSON.stringify(out)}`);
        return out;
    }

    // ── Clone ─────────────────────────────────────────────────────────────────

    /** More → Clone → the pre-filled clone form. Asserts the URL, which is the
     *  only durable proof the form opened: the header still shows the PARENT
     *  PR's code while the clone is being drafted. */
    async startClone(id) {
        await this.openMoreMenu();
        await this._visibleMenuItems()
            .filter({ hasText: /^\s*Clone\s*$/ }).first()
            .click({ timeout: 20000 });

        await this.page.waitForURL(new RegExp(`/requisitions/${id}/clone`), { timeout: 60000 });
        // The MUI form + ag-Grid render slowly; the grid is the last thing in.
        await this.page.locator(PL.gridCenterRows).first()
            .waitFor({ state: 'visible', timeout: 60000 });
        await this.page.waitForTimeout(3000);
        console.log(`[PR clone] clone form open at ${this.page.url()}`);
    }

    async getLineItemCount() {
        return this.page.locator(PL.gridProductCells).count();
    }

    // ── Submit → Workflow Summary popup ───────────────────────────────────────

    /**
     * Click the page's Submit and wait for the Workflow Summary popup.
     *
     * Blurs the grid first: leaving an ag-Grid cell in edit mode swallows the
     * Submit click and the whole gesture is lost with no error at all.
     *
     * Retries once. The CXO clone form has a documented two-click quirk (click 1
     * runs validation, click 2 posts); this form opened the popup on the first
     * click when probed live, but one retry costs nothing and removes the
     * difference between "blocked" and "not clicked yet".
     *
     * Deliberately does NOT click the popup's Submit — that is what would
     * create the PR.
     */
    async submitExpectingWorkflowSummary() {
        await this.page.locator('body').click({ position: { x: 5, y: 5 } });
        await this.page.waitForTimeout(1200);

        const dialog = this.page.locator(PL.approversDialog).first();
        const pageSubmit = this.page.locator(`xpath=${PAGE_SUBMIT}`).first();

        // The header Submit starts DISABLED while the cloned form settles, so
        // wait for it to go live rather than clicking into a dead button.
        await expect(pageSubmit, 'the clone form never enabled its Submit button')
            .toBeEnabled({ timeout: 60000 });

        for (let attempt = 1; attempt <= 2; attempt++) {
            if (await dialog.isVisible().catch(() => false)) break;
            await pageSubmit.click({ timeout: 20000 });
            console.log(`[PR clone] clicked Submit (attempt ${attempt})`);

            const mandatory = this.page.locator(`xpath=${PL.mandatoryFieldsToast}`).first();
            if (await mandatory.isVisible({ timeout: 3000 }).catch(() => false)) {
                throw new Error('Submit was rejected with "Please fill mandatory fields" — ' +
                    'the budget check never ran, so this proves nothing. The clone form was ' +
                    'expected to arrive pre-filled from its parent.');
            }

            if (await dialog.isVisible({ timeout: 25000 }).catch(() => false)) break;
            await this.page.waitForTimeout(2000);
        }

        await expect(dialog, 'the Workflow Summary popup did not open')
            .toBeVisible({ timeout: 15000 });
        await this.page.waitForTimeout(1500);
        return dialog;
    }

    /**
     * Assert the popup carries the Budget Exceeded error and the Budget Amend
     * Request block the app raises alongside it. Returns the banner text.
     */
    async assertBudgetExceeded() {
        const banner = this.page.locator(`xpath=${BUDGET_ERROR_LEAF}`).first();
        await expect(banner, 'Workflow Summary popup shows no "Budget Amount is exceeded" error')
            .toBeVisible({ timeout: 30000 });
        const text = ((await banner.innerText()) || '').trim();
        console.log(`[PR clone] budget banner: "${text}"`);

        await expect(this.page.locator(`xpath=${PL.budgetAmendHeading}`).first(),
            'no Budget Amend Request block alongside the budget error')
            .toBeVisible({ timeout: 15000 });
        return text;
    }

    /**
     * Whether the popup's Submit is disabled.
     *
     * Reported as CORROBORATION, never as the proof of scenario 48. This tenant's
     * popup also carries "There are no approvers configured for this flow", which
     * would disable Submit on its own — so a disabled button does not by itself
     * mean the budget check fired. The banner text is the assertion.
     */
    async popupSubmitDisabled() {
        const submit = this.page.locator(`xpath=${PL.dialogSubmit}`).first();
        if (!(await submit.count())) return null;
        return submit.isDisabled().catch(() => null);
    }

    /** The clone was NOT created: the app is still sitting on /clone. */
    async assertNothingCreated(id) {
        expect(this.page.url(),
            'the clone was submitted — expected the budget error to block it')
            .toMatch(new RegExp(`/requisitions/${id}/clone`));
    }

    /** Close the popup without submitting, leaving the tenant untouched. */
    async discardWorkflowSummary() {
        const discard = this.page.locator(`xpath=${PL.dialogDiscard}`).first();
        if (await discard.isVisible({ timeout: 8000 }).catch(() => false)) {
            await discard.click({ timeout: 15000 });
            await this.page.waitForTimeout(1500);
            console.log('[PR clone] discarded the Workflow Summary popup');
        }
    }
}
