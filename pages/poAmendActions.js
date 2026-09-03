import { expect } from '@playwright/test';

const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// Page object for the v3 Purchase Order AMEND / EDIT page
// (/purchase-orders/{id}/amend, which /edit also serves).
//
// Sheet scenario 71: increasing quantity or price while amending a PO must show
// a Budget Exceeded error on submission.
//
// Same overall shape as the PR edit page (ag-Grid + Submit + a budget popup),
// but three things differ and each one breaks a naive port of the PR code:
//   · column ids are line_items_product_price / line_items_amount, NOT
//     line_items_suggested_price / line_items_total_price;
//   · cell values are FORMATTED — "100.000", "2,000.000", and after editing
//     "99,99,99,999.000" in Indian digit grouping — so an equality check against
//     the typed string always fails. Compare numerically;
//   · the popup is titled "Workflow Summary", where the PR's is "Approvers".
export class poAmendActions {

    constructor(page) {
        this.page = page;
    }

    /** "99,99,99,999.000" → 999999999 */
    static num(text) {
        return Number(String(text ?? '').replace(/,/g, '').trim());
    }

    // ── Finding an amendable PO ───────────────────────────────────────────────

    async listPurchaseOrders(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/purchase-orders`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // Wait for ROWS, never a fixed delay — this listing carries charts and
        // ~30 columns, and an empty read is indistinguishable from "no data".
        await this.page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(2500);

        const headers = await this.page.$$eval('thead th', ths => ths.map(t => (t.innerText || '').trim()));
        const iStatus = headers.indexOf('Status');

        return this.page.$$eval('tbody tr', (trs, iStatus) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            return {
                id: (href.match(/\/purchase-orders\/(\d+)/) || [])[1] || null,
                code: (tds[0]?.innerText || '').trim(),
                status: iStatus >= 0 ? (tds[iStatus]?.innerText || '').trim() : '',
            };
        }).filter(r => r.id), iStatus);
    }

    /** Open the amend form; returns false when this PO's state offers none. */
    async openAmend(id, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/purchase-orders/${id}/amend`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        const grid = this.page.locator('.ag-center-cols-container div.ag-row').first();
        const ok = await grid.waitFor({ state: 'visible', timeout: 45000 }).then(() => true).catch(() => false);
        if (ok) await this.page.waitForTimeout(3500);
        console.log(`[PO] amend form for ${id}: ${ok ? 'open' : 'NOT available'} (${this.page.url()})`);
        return ok;
    }

    /** First PO whose amend form actually opens. Cancelled/Completed states do not. */
    async openAnyAmendablePo(baseUrl = V3_BASE_URL, max = 6) {
        const pos = (await this.listPurchaseOrders(baseUrl))
            .filter(p => !/cancelled/i.test(p.status));
        for (const po of pos.slice(0, max)) {
            if (await this.openAmend(po.id, baseUrl)) return po;
        }
        return null;
    }

    // ── Grid ──────────────────────────────────────────────────────────────────

    _cell(i, colId) {
        return this.page.locator('.ag-center-cols-container div.ag-row').nth(i)
            .locator(`[col-id="${colId}"]`);
    }

    async readCell(i, colId) {
        return ((await this._cell(i, colId).innerText()) || '').trim();
    }

    async readCellNumber(i, colId) {
        return poAmendActions.num(await this.readCell(i, colId));
    }

    /**
     * Overwrite an editable ag-Grid cell and confirm it took, NUMERICALLY —
     * the cell re-renders as "99,99,99,999.000", so a string comparison against
     * the typed "999999999" would fail even though the edit succeeded.
     *
     * ControlOrMeta+a, not Control+a: on macOS Control+a moves the caret to the
     * line start and the typed digits are appended to the old value.
     */
    async setCell(i, colId, value) {
        const cell = this._cell(i, colId);
        await cell.scrollIntoViewIfNeeded();
        await cell.dblclick();
        await this.page.waitForTimeout(700);
        await this.page.keyboard.press('ControlOrMeta+a');
        await this.page.keyboard.type(String(value));
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(2500);

        const got = await this.readCellNumber(i, colId);
        expect(got, `${colId} on row ${i + 1} did not accept ${value} (reads "${await this.readCell(i, colId)}")`)
            .toBe(Number(value));
        return got;
    }

    // ── Submit → Workflow Summary popup ───────────────────────────────────────

    /**
     * Blur the grid, submit, and wait for the popup.
     *
     * Leaving a cell in edit mode swallows the Submit click silently — the same
     * trap as the PR edit page.
     */
    async submitExpectingWorkflowSummary() {
        await this.page.locator('body').click({ position: { x: 5, y: 5 } });
        await this.page.waitForTimeout(1200);
        await this.page.locator('//button[normalize-space()="Submit"]').first().click();
        console.log('[PO] clicked Submit');

        const dialog = this.page.locator('.MuiDialog-root').first();
        // MUI dialogs are position:fixed, so offsetParent is null for them — a
        // hand-rolled visibility check written that way reports "no popup" while
        // it is on screen. toBeVisible() measures the bounding box.
        await expect(dialog, 'the Workflow Summary popup did not open')
            .toBeVisible({ timeout: 40000 });
        await this.page.waitForTimeout(2000);
        return dialog;
    }

    async assertBudgetExceeded() {
        // Target the LEAF that holds the message, not any ancestor that merely
        // contains it: `//*[contains(., "…")]` matches the dialog root too, and
        // .first() then returns the whole dialog — the assertion still passes but
        // the logged "banner" is the entire popup, which is useless in a failure
        // report. `not(.//*[contains(...)])` keeps only the innermost match.
        const banner = this.page.locator(
            '//*[contains(@class,"MuiDialog-root")]' +
            '//*[contains(normalize-space(),"Budget Amount is exceeded")]' +
            '[not(.//*[contains(normalize-space(),"Budget Amount is exceeded")])]').first();
        await expect(banner, 'the Workflow Summary popup shows no Budget Exceeded error')
            .toBeVisible({ timeout: 20000 });
        const text = ((await banner.innerText()) || '').trim();
        console.log(`[PO] budget banner: "${text}"`);
        return text;
    }

    async discard() {
        const discard = this.page.locator(
            '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Discard"]').first();
        if (await discard.isVisible({ timeout: 5000 }).catch(() => false)) {
            await discard.click();
            await this.page.waitForTimeout(1500);
            console.log('[PO] discarded the Workflow Summary popup');
        }
    }
}
