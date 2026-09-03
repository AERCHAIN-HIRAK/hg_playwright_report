import { expect } from '@playwright/test';
import { prEdit_Locators as L } from './prEditLocators';

const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// Page object for the v3 Requisition EDIT page (/requisitions/{id}/edit).
//
// Sheet scenarios: 53 (line-item search), 54 (price increase → Budget
// Exceeded), 55 (quantity increase → Budget Exceeded in the Workflow Summary
// popup — absorbs the retired scenario 16).
export class prEditActions {

    constructor(page) {
        this.page = page;
    }

    // ── Finding an editable PR ────────────────────────────────────────────────

    /**
     * Read the Draft tab of the Requisition listing.
     *
     * Every draft's Code cell reads the literal "PR-DRAFT" (no code is assigned
     * until submit), so rows are identified by the id in their anchor href.
     * Returns [{ id, subject, source, value }] — `source` is "awards" or
     * "intakes", which is the only way to tell an award-created PR from an
     * intake-created one.
     */
    async listDraftRequisitions(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/requisitions`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(6000);

        await this.page.locator(`xpath=${L.listingTab('Draft')}`).first().click();
        await this.page.waitForTimeout(6000);

        const headers = await this.page.$$eval(L.listingHeaders,
            ths => ths.map(t => (t.innerText || '').trim()));
        const iSource = headers.indexOf('Source');
        const iValue  = headers.indexOf('PR Value');

        const rows = await this.page.$$eval(L.listingRows, (trs, idx) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            return {
                id:      (href.match(/\/requisitions\/(\d+)/) || [])[1] || null,
                subject: (tds[2]?.innerText || '').trim(),
                source:  idx.iSource >= 0 ? (tds[idx.iSource]?.innerText || '').trim() : '',
                value:   idx.iValue  >= 0 ? (tds[idx.iValue]?.innerText  || '').trim() : '',
            };
        }).filter(r => r.id), { iSource, iValue });

        console.log(`[PR edit] ${rows.length} draft requisition(s): ` +
            rows.map(r => `${r.id}(${r.source},${r.subject})`).join(' · '));
        return rows;
    }

    /**
     * Pick a draft PR that is SAFE to drive.
     *
     * Safety rule, same convention as the RFX cancel test: only ever touch a
     * record whose Subject contains "HG Automation", so a run can never consume
     * a draft somebody set up by hand.
     *
     * `preferSource` is a preference, not a filter — scenario 55 absorbed the
     * retired scenario 16, whose precondition was an AWARD-created PR, so an
     * award-sourced draft is used when one exists and an intake-sourced one
     * otherwise (the assertion is identical either way).
     */
    async pickSafeDraft({ preferSource = null, minLineItems = 0, baseUrl = V3_BASE_URL } = {}) {
        const drafts = (await this.listDraftRequisitions(baseUrl))
            .filter(r => /HG Automation/i.test(r.subject));

        if (!drafts.length) return null;

        const ordered = preferSource
            ? [...drafts.filter(r => r.source === preferSource),
               ...drafts.filter(r => r.source !== preferSource)]
            : drafts;

        if (!minLineItems) return ordered[0];

        // Line-item count is not on the listing, so it costs a page open each.
        for (const d of ordered) {
            await this.openEdit(d.id, baseUrl);
            const n = await this.getLineItemCount();
            if (n >= minLineItems) {
                console.log(`[PR edit] draft ${d.id} has ${n} line items (need ${minLineItems})`);
                return d;
            }
            console.log(`[PR edit] draft ${d.id} has only ${n} line items — looking further`);
        }
        return null;
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async openEdit(id, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/requisitions/${id}/edit`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        // The MUI form + ag-Grid render slowly; the grid is the last thing in.
        await this.page.locator(L.gridCenterRows).first()
            .waitFor({ state: 'visible', timeout: 60000 });
        await this.page.waitForTimeout(3000);
        console.log(`[PR edit] on ${this.page.url()}`);
    }

    // ── Line items ────────────────────────────────────────────────────────────

    /** Real line-item count — the pinned-left container omits ag-Grid's blank
     *  trailing "new row", which the center container includes. */
    async getLineItemCount() {
        return this.page.locator(L.gridProductCells).count();
    }

    async getProductNames() {
        const names = await this.page.$$eval(L.gridProductCells,
            els => els.map(e => (e.innerText || '').trim()).filter(Boolean));
        return names;
    }

    /** Cell locator for row `i` (0-based) of the center container. */
    _cell(i, colId) {
        return this.page.locator(L.gridCenterRows).nth(i).locator(L.cellInRow(colId));
    }

    async readCell(i, colId) {
        return ((await this._cell(i, colId).innerText()) || '').trim();
    }

    /**
     * Overwrite an editable ag-Grid cell.
     *
     * Two macOS traps, both hit live:
     *  - `Control+a` does NOT select-all on macOS; it moves the caret to the
     *    line start and the typed digits get APPENDED. Use ControlOrMeta+a.
     *  - the inline editor input carries no stable selector here
     *    (`.ag-cell-inline-editing input` never matched), so the value is typed
     *    through the keyboard rather than via fill() on a located input.
     */
    async setCell(i, colId, value) {
        const cell = this._cell(i, colId);
        await cell.scrollIntoViewIfNeeded();
        await cell.dblclick();
        await this.page.waitForTimeout(700);
        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.type(String(value));
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(2000);

        const got = await this.readCell(i, colId);
        expect(got, `${colId} on row ${i + 1} did not accept "${value}"`).toBe(String(value));
        console.log(`[PR edit] row ${i + 1} ${colId} = ${got}`);
        return got;
    }

    // ── Line-item search (scenario 53) ────────────────────────────────────────

    /** Reveal the search field. The toggle is REPLACED by the input, so this is
     *  a one-way gesture — do not call it twice. */
    async openLineItemSearch() {
        const toggle = this.page.locator(`xpath=${L.searchToggle}`).first();
        await toggle.scrollIntoViewIfNeeded();
        await toggle.click();
        const input = this.page.locator(L.searchInput).first();
        await expect(input, 'search icon did not reveal a search input').toBeVisible({ timeout: 10000 });
        await this.page.waitForTimeout(500);
        return input;
    }

    async searchLineItems(term) {
        const input = this.page.locator(L.searchInput).first();
        await input.fill(term);
        // Client-side ag-Grid filter — no network call to wait on.
        await this.page.waitForTimeout(2500);
        const names = await this.getProductNames();
        console.log(`[PR edit] search "${term}" → ${names.length} row(s): ${names.join(' | ') || '(none)'}`);
        return names;
    }

    // ── Mandatory General Details ─────────────────────────────────────────────

    /**
     * react-datepicker: open the field's calendar, step to the NEXT month and
     * pick `day`.
     *
     * Always next month, never the current one: a draft can be reopened on any
     * date, and picking a day number in the current month silently lands in the
     * PAST once the month is far enough along — which the form then rejects as a
     * mandatory-field error, so the budget check never runs and the test would
     * "pass" having proved nothing.
     */
    async _pickNextMonthDay(selector, day) {
        const input = this.page.locator(selector).first();
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await this.page.locator(L.calendar).last()
            .waitFor({ state: 'visible', timeout: 10000 });
        await this.page.locator(L.calendarNextMonth).last().click();
        await this.page.waitForTimeout(500);
        await this.page.locator(L.calendarDay(day)).last().click();
        await this.page.waitForTimeout(800);
        const value = await input.inputValue();
        expect(value, `date field ${selector} stayed empty`).not.toBe('');
        return value;
    }

    async _selectFirstOption(selector, label) {
        const input = this.page.locator(selector).first();
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await this.page.waitForTimeout(1200);
        await this.page.locator(L.autocompleteOption).first().click();
        await this.page.waitForTimeout(700);
        const value = await input.inputValue();
        expect(value, `${label} stayed empty`).not.toBe('');
        console.log(`[PR edit] ${label} = ${value}`);
        return value;
    }

    /**
     * Fill everything the form demands before it will even attempt a submit.
     *
     * A draft PR carries Payment Terms, Expected Delivery Date, Effective
     * from/to, Purchase Type and the two Inward radios EMPTY. Submitting without
     * them only raises "Please fill mandatory fields" — the budget validation
     * never fires. Verified live on /requisitions/952.
     */
    async fillMandatoryDetails() {
        await this._selectFirstOption(L.paymentTermsInput, 'Payment Terms');
        await this._pickNextMonthDay(L.expectedDeliveryInput, 15);
        await this._pickNextMonthDay(L.effectiveFromInput, 10);
        await this._pickNextMonthDay(L.effectiveToInput, 20);
        await this._selectFirstOption(L.purchaseTypeInput, 'Purchase Type');

        await this.page.locator(L.inwardRequiredYes).first().check({ force: true });
        await this.page.locator(L.inwardMatchQuantity).first().check({ force: true });
        await this.page.waitForTimeout(800);
        console.log('[PR edit] mandatory General Details filled');
    }

    // ── Submit → Workflow Summary popup ───────────────────────────────────────

    /**
     * Click the page's Submit and wait for the Workflow Summary popup (titled
     * "Approvers").
     *
     * Blurs the grid first: leaving an ag-Grid cell in edit mode swallows the
     * Submit click and the whole gesture is lost with no error at all.
     *
     * NOTE this deliberately does NOT click the popup's own Submit. For an
     * over-budget PR that button is disabled behind a mandatory "Budget Amend
     * Request", so the transaction is never created — which is what keeps these
     * tests non-destructive and re-runnable against the same draft.
     */
    async submitExpectingWorkflowSummary() {
        await this.page.locator('body').click({ position: { x: 5, y: 5 } });
        await this.page.waitForTimeout(1200);

        const submit = this.page.locator(`xpath=${L.submitButton}`).first();
        await submit.scrollIntoViewIfNeeded();
        await submit.click();
        console.log('[PR edit] clicked Submit');

        const mandatory = this.page.locator(`xpath=${L.mandatoryFieldsToast}`).first();
        if (await mandatory.isVisible({ timeout: 3000 }).catch(() => false)) {
            throw new Error('Submit was rejected with "Please fill mandatory fields" — ' +
                'the budget check never ran, so this proves nothing. Fix fillMandatoryDetails().');
        }

        const dialog = this.page.locator(L.approversDialog).first();
        await expect(dialog, 'the Workflow Summary ("Approvers") popup did not open')
            .toBeVisible({ timeout: 30000 });
        await this.page.waitForTimeout(1500);
        return dialog;
    }

    /** Assert the popup carries the Budget Exceeded error, and the Budget Amend
     *  Request block the app raises alongside it. */
    async assertBudgetExceeded() {
        const banner = this.page.locator(`xpath=${L.budgetExceededBanner}`).first();
        await expect(banner, 'Workflow Summary popup shows no "Budget Amount is exceeded" error')
            .toBeVisible({ timeout: 20000 });
        const text = ((await banner.innerText()) || '').trim();
        console.log(`[PR edit] budget banner: "${text}"`);

        await expect(this.page.locator(`xpath=${L.budgetAmendHeading}`).first(),
            'no Budget Amend Request block alongside the budget error')
            .toBeVisible({ timeout: 10000 });
        return text;
    }

    /** Close the popup without submitting, so the draft is left untouched. */
    async discardWorkflowSummary() {
        const discard = this.page.locator(`xpath=${L.dialogDiscard}`).first();
        if (await discard.isVisible({ timeout: 5000 }).catch(() => false)) {
            await discard.click();
            await this.page.waitForTimeout(1500);
            console.log('[PR edit] discarded the Workflow Summary popup');
        }
    }
}
