import { expect } from '@playwright/test';
import { SupplierPortal_Locators as S } from './SupplierPortalLocators';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// SupplierPortalActions
// Drives the NSE Supplier Portal (SAPP) for the three supplier-facing steps of
// the E2E flow:
//   1. Quote an RFX  : Accept → Submit Quote → Commercial → fill Unit Rate → Submit
//   2. Create a GRN  : open PO → Accept → Create → GRN → fill → Submit (Pending Review in CAPP)
//   3. Create Invoice: open PO → Create → Invoice → fill → Submit (Pending Review in CAPP)
//
// The CAPP-side steps (review the Pending-Review GRN/Invoice, approvals, award,
// PR, acknowledge, …) are handled by NSEFoundationActions. Both portals share one
// combined session (auth.supplier.json) — capp + sapp cookies coexist on
// `.aerchain.io`.
// ─────────────────────────────────────────────────────────────────────────────

export class SupplierPortalActions {

    constructor(page) {
        this.page = page;
        fs.mkdirSync('screenshots', { recursive: true });
    }

    async takeScreenshot(name) {
        await this.page.screenshot({
            path: `screenshots/sapp_${name}_${Date.now()}.png`,
            fullPage: true,
        });
    }

    // ── Data helpers (read fresh from disk each time) ───────────────────────────
    _data() {
        return JSON.parse(fs.readFileSync(path.resolve('pages/NSEFoundationData.json'), 'utf-8'));
    }
    getSupplierConfig() {
        return this._data().supplierPortal;
    }
    getSavedSourcingEvent() {
        return this._data().savedSourcingEvent;
    }
    getSavedPurchaseOrder() {
        return this._data().savedPurchaseOrder;
    }

    // ── Login ───────────────────────────────────────────────────────────────────

    async navigateToSappLogin() {
        const cfg = this.getSupplierConfig();
        await this.page.goto(`${cfg.authUrl}?`);
        await this.page.waitForSelector(S.loginEmailField, { timeout: 20000 });
    }

    async fillLoginAndSubmit() {
        const cfg = this.getSupplierConfig();
        await this.page.locator(S.loginEmailField).fill(cfg.login.email);
        await this.page.locator(S.loginPasswordField).fill(cfg.login.password);
        await this.page.locator(`xpath=${S.loginSubmitBtn}`).click();
        await this.page.waitForURL(/nse-sapp-uat\.aerchain\.io/, { timeout: 30000 });
    }

    async assertLoggedIn() {
        await expect(this.page).toHaveURL(/nse-sapp(-v4)?-uat\.aerchain\.io/);
    }

    /**
     * Log into SAPP once. Used by the combined setup and as a safety net inside
     * tests when the stored session is missing.
     */
    async login() {
        await this.navigateToSappLogin();
        await this.fillLoginAndSubmit();
        await this.assertLoggedIn();
        await this.page.waitForLoadState('networkidle').catch(() => {});
    }

    /**
     * Open a SAPP page, reusing the stored session. If the login form appears we
     * sign in, then navigate to the requested app URL.
     * @param {string} url absolute SAPP url (shell or v4)
     */
    async openSappPage(url) {
        await this.page.goto(url);
        await this.page.waitForLoadState('domcontentloaded');
        const emailField = this.page.locator(S.loginEmailField);
        if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await this.fillLoginAndSubmit();
            await this.page.goto(url);
            await this.page.waitForLoadState('domcontentloaded');
        }
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await this.page.waitForTimeout(1000);
    }

    // ── RFX / Sourcing (v4) ─────────────────────────────────────────────────────

    async openRfxListing() {
        const cfg = this.getSupplierConfig();
        await this.openSappPage(`${cfg.rfxUrl}/supplier-quote-requests`);
    }

    /**
     * Open the saved RFX from the listing. The listing search box lives outside
     * <main> and may be hidden behind an icon, so searching is best-effort — the
     * freshly-created RFX sorts to the top, making its row link directly clickable.
     */
    async openSavedRfxFromListing() {
        const { code } = this.getSavedSourcingEvent();
        console.log(`[SAPP RFX] Opening ${code}`);
        const search = this.page.locator(`xpath=${S.rfxSearchInput}`).first();
        if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
            await search.fill(code).catch(() => {});
            await search.press('Enter').catch(() => {});
            await this.page.waitForTimeout(2000);
        } else {
            console.log('[SAPP RFX] Search box not present — clicking row link directly');
        }

        const link = this.page.locator(`xpath=${S.rfxRowLinkByCode(code)}`).first();
        await link.waitFor({ state: 'visible', timeout: 15000 });
        await link.click();
        await this.page.waitForURL(/\/supplier-quote-requests\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        console.log(`[SAPP RFX] Opened ${code} → ${this.page.url()}`);
        return code;
    }

    /**
     * Accept the RFX. Accept enables only once the detail (and its linked CXO
     * transaction) finishes loading; a permanently-disabled button means the
     * backend never returned that data. Accepting opens a Terms & Conditions
     * dialog: tick the agreement checkbox, then click the dialog's Accept button.
     */
    async acceptRfx() {
        const btn = this.page.locator(`xpath=${S.rfxAcceptBtn}`).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.scrollIntoViewIfNeeded();
        let enabled = false;
        for (let i = 0; i < 15; i++) {
            if (!(await btn.isDisabled().catch(() => true))) { enabled = true; break; }
            await this.page.waitForTimeout(1000);
        }
        if (!enabled) {
            throw new Error('[SAPP RFX] Accept button stayed disabled after 15s — RFX detail did not load (check backend 404s on the linked transaction)');
        }
        await btn.click();
        console.log('[SAPP RFX] Clicked Accept');

        // Terms & Conditions dialog.
        const dialog = this.page.locator(`xpath=${S.dialogRoot}`).first();
        if (await dialog.isVisible({ timeout: 8000 }).catch(() => false)) {
            const checkbox = dialog.locator('[role=checkbox], input[type=checkbox]').first();
            if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
                await checkbox.click();
                console.log('[SAPP RFX] Agreed to Terms & Conditions');
            }
            const accept = this.page.locator(`xpath=${S.dialogAcceptBtn}`).first();
            await accept.waitFor({ state: 'visible', timeout: 5000 });
            for (let i = 0; i < 6 && await accept.isDisabled().catch(() => true); i++) {
                await this.page.waitForTimeout(500);
            }
            await accept.click();
            console.log('[SAPP RFX] Confirmed Accept');
        }

        // Accepted state → the "Submit Quote" button becomes available.
        await this.page.locator(`xpath=${S.rfxSubmitQuoteBtn}`).first()
            .waitFor({ state: 'visible', timeout: 20000 });
        await this.page.waitForTimeout(1000);
    }

    /**
     * From the accepted RFX: Submit Quote → Commercial (navigates to the quote
     * form) → set Preferred Currency (exchange rate auto-fills) → fill Unit Rate →
     * Submit Quote → confirm. Every step asserts; nothing is silently skipped.
     */
    async submitCommercialQuote() {
        const data = this._data();

        const submitQuote = this.page.locator(`xpath=${S.rfxSubmitQuoteBtn}`).first();
        await submitQuote.waitFor({ state: 'visible', timeout: 20000 });
        await submitQuote.scrollIntoViewIfNeeded();
        await submitQuote.click();
        console.log('[SAPP RFX] Clicked Submit Quote');

        const commercial = this.page.locator(`xpath=${S.rfxCommercialQuoteOption}`).first();
        await commercial.waitFor({ state: 'visible', timeout: 8000 });
        await commercial.click();
        console.log('[SAPP RFX] Selected Commercial');
        await this.page.waitForURL(/\/quote\?type=commercial/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);

        await this._setPreferredCurrency(data.sourcing.preferredCurrency);
        await this._fillUnitRate(data.sourcing.unitRate);

        const submit = this.page.locator(`xpath=${S.rfxQuoteSubmitBtn}`).first();
        await submit.scrollIntoViewIfNeeded();
        await submit.click();
        console.log('[SAPP RFX] Clicked Submit Quote (form)');

        // "Select Submission Type" confirmation dialog.
        const confirm = this.page.locator(`xpath=${S.dialogPrimaryBtn}`).first();
        await confirm.waitFor({ state: 'visible', timeout: 8000 });
        await confirm.click();
        console.log('[SAPP RFX] Confirmed submission');
        await this.page.waitForTimeout(3000);
    }

    /**
     * Select the Preferred Currency on the quote form. Once set, the Transaction
     * Currency Exchange Rate auto-fills (=1 when it matches the transaction
     * currency) and stays disabled, so it needs no input.
     */
    async _setPreferredCurrency(currency) {
        const trigger = this.page.locator(`xpath=${S.rfxPreferredCurrencyTrigger}`).first();
        await trigger.waitFor({ state: 'visible', timeout: 10000 });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await this.page.waitForTimeout(800);

        const search = this.page.locator(`xpath=${S.rfxCurrencySearch}`).last();
        if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
            await search.fill(currency);
            await this.page.waitForTimeout(500);
        }
        const opt = this.page.locator(`xpath=${S.rfxCurrencyOption(currency)}`).first();
        await opt.waitFor({ state: 'visible', timeout: 5000 });
        await opt.click();
        console.log(`[SAPP RFX] Preferred Currency = ${currency}`);
        await this.page.waitForTimeout(1000);
    }

    /**
     * Fill the Unit Rate — a click-to-edit cell in a custom flexbox grid. Cells
     * carry a per-ROW id (not per-cell), so a cell can't be addressed by selector;
     * instead resolve the row-1 cell whose horizontal span contains the "Unit Rate"
     * column-header centre, tag it in-page, then click the element (Playwright
     * scrolls it into view, sidestepping the item table's horizontal scrollbar).
     */
    async _fillUnitRate(rate) {
        await this.page.getByText(S.rfxUnitRateHeader, { exact: true }).first()
            .waitFor({ state: 'visible', timeout: 10000 });

        const tagged = await this.page.evaluate((headerText) => {
            const norm = (s) => (s || '').trim();
            const header = [...document.querySelectorAll('*')]
                .find((e) => norm(e.textContent) === headerText && e.children.length <= 2);
            if (!header) return false;
            const hr = header.getBoundingClientRect();
            const hcx = hr.left + hr.width / 2;
            const cells = [...document.querySelectorAll('[id^="cell_"]')];
            if (!cells.length) return false;
            const minTop = Math.min(...cells.map((c) => c.getBoundingClientRect().top));
            const row1 = cells.filter((c) => Math.abs(c.getBoundingClientRect().top - minTop) < 8);
            const target = row1.find((c) => {
                const r = c.getBoundingClientRect();
                return hcx >= r.left && hcx <= r.right;
            });
            if (!target) return false;
            target.setAttribute('data-qa-unitrate', '1');
            return true;
        }, S.rfxUnitRateHeader).catch(() => false);
        if (!tagged) throw new Error('[SAPP RFX] Could not locate the Unit Rate cell in the item grid');

        const cell = this.page.locator('[data-qa-unitrate="1"]').first();
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(500);
        // The cell renders an inline input on focus; fall back to keyboard typing.
        const input = cell.locator(`${S.rfxQuoteEditInput}`).first();
        if ((await input.count()) && await input.isVisible({ timeout: 1500 }).catch(() => false)) {
            await input.fill(rate);
        } else {
            await this.page.keyboard.type(rate);
        }
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(1000);

        // Verify it registered (the grid renders it as e.g. "2,000.000").
        const bare = rate.replace(/[,\s]/g, '');
        const ok = await this.page.evaluate((b) => {
            return [...document.querySelectorAll('div,td,span,input')].some((e) => {
                const t = (e.textContent || e.value || '').replace(/[,\s]/g, '');
                return t.includes(b + '.') || t === b;
            });
        }, bare).catch(() => false);
        if (!ok) throw new Error(`[SAPP RFX] Unit Rate ${rate} did not register in the grid`);
        console.log(`[SAPP RFX] Unit Rate = ${rate}`);
    }

    async assertRfxQuoted() {
        for (let i = 0; i < 4; i++) {
            if (await this.page.locator(`xpath=${S.rfxQuotedStatusBadge}`).first()
                .isVisible({ timeout: 5000 }).catch(() => false)) {
                console.log('[SAPP RFX] Status = Quoted');
                return;
            }
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);
        }
        throw new Error('RFX did not reach Quoted status');
    }

    // ── PO (shell) ──────────────────────────────────────────────────────────────

    async openPoListing() {
        const cfg = this.getSupplierConfig();
        await this.openSappPage(`${cfg.shellUrl}/purchase-orders`);
    }

    /**
     * Search the PO listing for the saved PO code and open its detail page.
     */
    async openSavedPoFromListing() {
        const { code } = this.getSavedPurchaseOrder();
        console.log(`[SAPP PO] Searching for ${code}`);
        const search = this.page.locator(`xpath=${S.poSearchInput}`).first();
        if (await search.isVisible({ timeout: 8000 }).catch(() => false)) {
            await search.fill(code);
            await search.press('Enter');
            await this.page.waitForTimeout(2000);
        }
        const cell = this.page.locator(`xpath=${S.poCodeText(code)}`).first();
        await cell.waitFor({ state: 'visible', timeout: 15000 });
        await cell.click();
        await this.page.waitForURL(/\/purchase-orders\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        console.log(`[SAPP PO] Opened ${code} → ${this.page.url()}`);
        return code;
    }

    /**
     * Accept a freshly-created (Submitted) PO. The SAPP shell PO page is heavy and
     * slow, so poll well past a single timeout before concluding it is already
     * accepted (an accepted PO shows only "Create", no "Accept"/"Regret"). Accept
     * opens a "Please confirm and accept this Purchase Order" dialog whose button
     * reads "Accept" — not matched by the generic dialogPrimaryBtn.
     */
    async acceptPo() {
        const btn = this.page.locator(`xpath=${S.poAcceptBtn}`).first();
        const create = this.page.locator(`xpath=${S.poCreateBtn}`).first();

        let visible = false;
        for (let i = 0; i < 8; i++) {
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { visible = true; break; }
            // Only conclude "already accepted" once the page has actually rendered
            // its actions (Create present) without an Accept button.
            if (await create.isVisible({ timeout: 1000 }).catch(() => false)) {
                console.log('[SAPP PO] Create present, no Accept — PO already accepted');
                return;
            }
            await this.page.waitForTimeout(2000);
        }
        if (!visible) {
            throw new Error('[SAPP PO] Neither Accept nor Create rendered — PO page did not load');
        }

        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('[SAPP PO] Clicked Accept');

        // Confirmation dialog → "Accept" (fall back to the generic primary button).
        const dialog = this.page.locator(`xpath=${S.dialogRoot}`).first();
        if (await dialog.isVisible({ timeout: 6000 }).catch(() => false)) {
            const accept = this.page.locator(`xpath=${S.dialogAcceptBtn}`).first();
            const confirm = (await accept.isVisible({ timeout: 3000 }).catch(() => false))
                ? accept
                : this.page.locator(`xpath=${S.dialogPrimaryBtn}`).first();
            await confirm.click();
            console.log('[SAPP PO] Confirmed Accept');
        }
        // Wait for the accepted state (Accept button gone, Create available).
        await create.waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(1500);
    }

    async openPoCreateMenu(itemName) {
        const create = this.page.locator(`xpath=${S.poCreateBtn}`).first();
        await create.waitFor({ state: 'visible', timeout: 15000 });
        await create.click();
        await this.page.waitForTimeout(800);
        const item = this.page.locator(`xpath=${S.poCreateMenuItem(itemName)}`).first();
        await item.waitFor({ state: 'visible', timeout: 8000 });
        await item.click();
        console.log(`[SAPP PO] Create → ${itemName}`);
        await this.page.waitForTimeout(2000);
    }

    // GRN + Invoice create-form filling are intentionally left as focused helpers
    // to be completed/healed on the first live chained run (see spec TODOs).
    async createGrnFromPo() {
        await this.openPoCreateMenu('GRN');
        // Select-PO-items popup → Create GRN page → fill received qty → Submit.
        const dialogSubmit = this.page.locator(`xpath=${S.dialogPrimaryBtn}`).first();
        if (await dialogSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
            await dialogSubmit.click();
            await this.page.waitForTimeout(2000);
        }
        const submit = this.page.locator(`xpath=${S.grnSubmitBtn}`).last();
        await submit.waitFor({ state: 'visible', timeout: 15000 });
        await submit.click();
        console.log('[SAPP GRN] Submitted GRN (→ Pending Review in CAPP)');
        const confirm = this.page.locator(`xpath=${S.dialogPrimaryBtn}`).first();
        if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
            await confirm.click();
        }
        await this.page.waitForTimeout(2500);
    }

    // Create an invoice from an accepted PO on the SAPP side. The supplier flow is:
    // Create → Invoice → "Select PO Items" (Submit) → "Confirm Invoice Creation"
    // (Proceed) → the /invoices/new form. The form has required fields that MUST be
    // filled or Submit silently fails validation (no invoice is created): Invoice
    // Number, Invoice Date (= test execution date), Period based Invoicing? (No),
    // Extra billing (No), and an uploaded document. Submit then clears a
    // "Validations" (Proceed) and an "Approvers" (Submit) popup, landing on
    // /invoices/{id}. The invoice appears in CAPP under the SAME numeric id (only
    // the domain differs), in "Pending Review", so we save a CAPP url for the
    // downstream review/approve steps. Returns the saved invoice code.
    async createInvoiceFromPo(data) {
        await this.openPoCreateMenu('Invoice');

        // "Select PO Items" dialog → Submit.
        const selectSubmit = this.page.locator(`xpath=${S.dialogPrimaryBtn}`).first();
        if (await selectSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
            await selectSubmit.click();
            console.log('[SAPP Invoice] Submitted "Select PO Items" dialog');
            await this.page.waitForTimeout(1500);
        }

        // Optional "Confirm Invoice Creation" dialog (items already invoiced) → Proceed.
        const proceed = this.page.locator(`xpath=${S.dialogProceedBtn}`).first();
        if (await proceed.isVisible({ timeout: 5000 }).catch(() => false)) {
            await proceed.click();
            console.log('[SAPP Invoice] Confirmed "Confirm Invoice Creation" → Proceed');
        }
        await this.page.waitForURL(/\/invoices\/new/, { timeout: 30000 });
        await this.page.waitForTimeout(1500);

        // ── Fill the required form fields ──
        const invoiceNumber = this._nextInvoiceNumber();
        const num = this.page.locator(`xpath=${S.invoiceNumberInput}`).first();
        await num.waitFor({ state: 'visible', timeout: 15000 });
        await num.fill(invoiceNumber);
        await this._pickTodayInvoiceDate();
        await this._selectInvoiceNo(S.invoicePeriodBasedField, 'Period based Invoicing');
        await this._selectInvoiceNo(S.invoiceExtraBillingField, 'Extra billing');
        await this.page.locator(S.invoiceUploadInput).first()
            .setInputFiles(path.resolve(data.invoice.documentPath));
        await this.page.waitForTimeout(3000); // let the document upload register
        console.log(`[SAPP Invoice] Filled form (Invoice Number=${invoiceNumber}, date=today, Period/Extra=No, document uploaded)`);

        // ── Submit → "Validations" (Proceed) → "Approvers" (Submit) ──
        // The document upload can still be processing right after setInputFiles,
        // leaving Submit a no-op; the Invoice Date label also overlays its input.
        // Retry the forced Submit click until the "Validations" popup appears.
        const submitBtn = this.page.locator(`xpath=${S.invoiceSubmitBtn}`).last();
        const validationsProceed = this.page.locator(`xpath=${S.dialogProceedBtn}`).first();
        let validationsShown = false;
        for (let i = 0; i < 5; i++) {
            await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
            await submitBtn.click({ force: true }).catch(() => {});
            console.log(`[SAPP Invoice] Clicked Submit (attempt ${i + 1})`);
            if (await validationsProceed.isVisible({ timeout: 6000 }).catch(() => false)) {
                validationsShown = true;
                break;
            }
            await this.page.waitForTimeout(2000);
        }
        if (validationsShown) {
            await validationsProceed.click();
            console.log('[SAPP Invoice] Validations popup → Proceed');
        }
        await this.page.waitForTimeout(1500);

        const approversSubmit = this.page.locator(`xpath=${S.dialogSubmitBtn}`).last();
        if (await approversSubmit.isVisible({ timeout: 15000 }).catch(() => false)) {
            await approversSubmit.click();
            console.log('[SAPP Invoice] Approvers popup → Submit');
        }
        await this.page.waitForURL(/\/invoices\/\d+$/, { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        console.log(`[SAPP Invoice] Invoice created → ${this.page.url()}`);

        return this._saveInvoiceCodeAsCapp();
    }

    // ── Invoice form helpers ────────────────────────────────────────────────────

    // Bump the persisted invoice number by 1 (the app rejects duplicates) and save.
    _nextInvoiceNumber() {
        const dataPath = path.resolve('pages/NSEFoundationData.json');
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        current.invoice = current.invoice || {};
        const prev = current.invoice.invoiceNumber || 'INV-AUTO-000';
        const m = prev.match(/^(.*?)(\d+)$/);
        const next = m
            ? m[1] + String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0')
            : `${prev}-1`;
        current.invoice.invoiceNumber = next;
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[SAPP Invoice] Invoice number bumped: ${prev} → ${next}`);
        return next;
    }

    // Invoice Date = today. The picker opens on the current month (SAPP uses
    // month/year dropdowns, not nav arrows), so just click today's day. The MUI
    // label overlays the input, so the opening click must be forced.
    async _pickTodayInvoiceDate() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(3, '0'); // react-datepicker day class is 3-digit
        const input = this.page.locator(S.invoiceDateInput).first();
        await input.scrollIntoViewIfNeeded();
        await input.click({ force: true });
        await this.page.locator('.react-datepicker').last().waitFor({ state: 'visible', timeout: 10000 });
        await this.page.locator(`.react-datepicker__day--${dd}:not(.react-datepicker__day--outside-month)`)
            .last().click();
        await this.page.waitForTimeout(600);
        console.log(`[SAPP Invoice] Invoice Date set to today (${input ? await input.inputValue() : ''})`);
    }

    // MUI Autocomplete: click the field, then pick the "No" option.
    async _selectInvoiceNo(fieldXpath, label) {
        const field = this.page.locator(`xpath=${fieldXpath}`).first();
        await field.scrollIntoViewIfNeeded();
        await field.click();
        await this.page.waitForTimeout(700);
        const no = this.page.locator(`xpath=${S.autocompleteNoOption}`).first();
        await no.waitFor({ state: 'visible', timeout: 8000 });
        await no.click();
        await this.page.waitForTimeout(500);
        console.log(`[SAPP Invoice] ${label} → No`);
    }

    // Capture the freshly-created invoice's code + id from the SAPP detail page and
    // persist it with a CAPP url (same id, capp domain) so the CAPP-side review and
    // approval steps (openSavedInvoice → reviewAndSubmitPendingReview → approve)
    // open the correct invoice.
    async _saveInvoiceCodeAsCapp() {
        const url = this.page.url();
        const id = (url.match(/\/invoices\/(\d+)/) || [])[1] || null;
        const bodyText = (await this.page.locator('body').textContent()) ?? '';
        const code = (bodyText.match(/Invoice-[A-Z0-9\-]*\d+/i) || [])[0]?.trim() || null;

        const dataPath = path.resolve('pages/NSEFoundationData.json');
        const current = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        // Derive the CAPP base from an existing capp reference (avoids hardcoding).
        const cappBase = (current.savedPurchaseOrder?.url || 'https://nse-capp-uat.aerchain.io')
            .match(/^https?:\/\/[^/]+/)[0];
        const cappUrl = id ? `${cappBase}/invoices/${id}` : url;

        current.savedInvoice = { code, id, url: cappUrl };
        fs.writeFileSync(dataPath, JSON.stringify(current, null, 4), 'utf-8');
        console.log(`[SAPP Invoice] Saved savedInvoice.code="${code}", CAPP url=${cappUrl}`);
        return code;
    }

    // ── CAPP-side review of a SAPP-created invoice ──────────────────────────────
    // A SAPP-created invoice lands in CAPP as "Pending Review" with no direct
    // Review button. The buyer must: (1) reassign the workflow approver to a
    // controllable user (NSEF Support Admin) — this unlocks the Review/Reject
    // actions; (2) match the invoice line items to the PO's GRN (Inward Required
    // POs); (3) Review → the invoice opens in edit mode, where BRF - Description is
    // carried forward from the PO — then Submit clears the "Validations" (Proceed)
    // and "Approvers" (Submit) popups, moving the invoice into Pending Approval.

    /**
     * Take a Pending-Review SAPP invoice (currently open in CAPP) into the approval
     * workflow. Returns true when it submits the review.
     */
    async reviewAndSubmitPendingReview(tag = 'INV') {
        // (1) Reassign the workflow approver → NSEF Support Admin (unlocks Review).
        await this._reassignInvoiceApprover(tag);

        // (2) Match invoice line items to the PO's GRN.
        await this._matchInvoiceLineItemToGrn(tag);

        // (3) Review → edit page → Submit → Validations/Approvers popups.
        const review = this.page.locator(`xpath=${S.invReviewBtn}`).first();
        if (!(await review.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log(`[${tag}] No Review button after reassign — may already be in workflow`);
            return false;
        }
        await review.scrollIntoViewIfNeeded();
        await review.click();
        console.log(`[${tag}] Clicked Review → opening invoice in edit mode`);
        await this.page.waitForURL(/\/invoices\/\d+\/edit/, { timeout: 20000 }).catch(() => {});
        await this.page.waitForTimeout(2500);

        // Submit the review. BRF - Description now carries forward from the PO, so
        // the form is valid; retry the forced click until the Validations popup shows.
        const submit = this.page.locator(`xpath=${S.invoiceSubmitBtn}`).first();
        const proceed = this.page.locator(`xpath=${S.dialogProceedBtn}`).first();
        let shown = false;
        for (let i = 0; i < 5; i++) {
            await submit.scrollIntoViewIfNeeded().catch(() => {});
            await submit.click({ force: true }).catch(() => {});
            console.log(`[${tag}] Clicked review Submit (attempt ${i + 1})`);
            if (await proceed.isVisible({ timeout: 6000 }).catch(() => false)) { shown = true; break; }
            await this.page.waitForTimeout(2000);
        }
        if (shown) {
            await proceed.click();
            console.log(`[${tag}] Validations popup → Proceed`);
            await this.page.waitForTimeout(1500);
            const approvers = this.page.locator(`xpath=${S.dialogSubmitBtn}`).last();
            if (await approvers.isVisible({ timeout: 10000 }).catch(() => false)) {
                await approvers.click();
                console.log(`[${tag}] Approvers popup → Submit`);
            }
        }
        await this.page.waitForTimeout(3000);
        return true;
    }

    // More → Reassign Workflow Approver → NSEF Support Admin → reason → Reassign.
    async _reassignInvoiceApprover(tag = 'INV') {
        const more = this.page.locator(`xpath=${S.moreBtn}`).first();
        if (!(await more.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log(`[${tag}] No More button — cannot reassign approver`);
            return false;
        }
        await more.click();
        await this.page.waitForTimeout(800);
        const opt = this.page.locator(`xpath=${S.reassignApproverOption}`).first();
        if (!(await opt.isVisible({ timeout: 6000 }).catch(() => false))) {
            console.log(`[${tag}] Reassign option not available`);
            await this.page.keyboard.press('Escape').catch(() => {});
            return false;
        }
        await opt.click();
        await this.page.waitForTimeout(1500);

        // Open the "New Reassign Approver" combobox and pick NSEF Support Admin.
        const field = this.page.locator(`xpath=${S.reassignApproverField}`).first();
        await field.waitFor({ state: 'visible', timeout: 10000 });
        await field.click({ force: true });
        await this.page.waitForTimeout(800);
        const admin = this.page.locator(`xpath=${S.reassignAdminOption}`).first();
        await admin.waitFor({ state: 'visible', timeout: 10000 });
        await admin.click();
        await this.page.waitForTimeout(500);

        const reason = this.page.locator(`xpath=${S.reassignReasonField}`).first();
        if (await reason.isVisible({ timeout: 4000 }).catch(() => false)) {
            await reason.fill('Reassigned for automated testing');
        }
        await this.page.locator(`xpath=${S.reassignSubmitBtn}`).first().click();
        console.log(`[${tag}] Workflow approver reassigned to NSEF Support Admin`);
        await this.page.waitForTimeout(2500);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);
        return true;
    }

    // Match Line Item → Item Matching dialog → Add the PO's GRN → Submit.
    async _matchInvoiceLineItemToGrn(tag = 'INV') {
        const match = this.page.locator(`xpath=${S.invMatchLineItemBtn}`).first();
        if (!(await match.isVisible({ timeout: 8000 }).catch(() => false))) {
            console.log(`[${tag}] No Match Line Item button — skipping GRN match`);
            return false;
        }
        await match.click();
        await this.page.waitForTimeout(2000);

        const grnCode = this._data().savedGrn?.code;
        const addGrn = this.page.locator(`xpath=${S.itemMatchingAddGrnField}`).first();
        if (await addGrn.isVisible({ timeout: 8000 }).catch(() => false)) {
            await addGrn.click();
            await this.page.waitForTimeout(1000);
            const opt = grnCode
                ? this.page.locator(`xpath=${S.itemMatchingGrnOption(grnCode)}`).first()
                : this.page.locator(`xpath=//li[@role='option'][contains(normalize-space(.),'INW-')]`).first();
            await opt.waitFor({ state: 'visible', timeout: 8000 });
            await opt.click();
            console.log(`[${tag}] Added GRN ${grnCode || '(first)'} in Item Matching`);
            await this.page.waitForTimeout(800);
            // Close the dropdown by clicking the dialog heading.
            await this.page.locator(`xpath=${S.itemMatchingHeading}`).first().click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(500);
        }
        const submit = this.page.locator(`xpath=${S.dialogSubmitBtn}`).last();
        await submit.waitFor({ state: 'visible', timeout: 10000 });
        await submit.click();
        console.log(`[${tag}] Submitted Item Matching`);
        await this.page.waitForTimeout(2500);
        return true;
    }
}
