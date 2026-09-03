import { expect } from '@playwright/test';
import { supplier_Locators as S } from './supplierLocators';

export const V3_BASE = 'https://nse-capp-uat.aerchain.io';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier module actions (v3 / MUI app).
//
// Covers the CAPP-side create → approve → Send Onboarding chain for sheet
// scenario 97, as walked through by QA on 2026-09-02.
//
// Form shapes worth knowing, all verified live:
//  · Mandatory fields are Name, Payment Spoc, Alternate Supplier Name,
//    NDA required?, plus at least one User Details row. Enumerated by submitting
//    the form empty and reading the "<field> is Mandatory" messages, which is
//    more reliable than guessing from asterisks.
//  · Plain text inputs carry a RANDOM ID SUFFIX (e.g. "Name-y9mB6lmRU7W7") so
//    they must be matched on the id prefix; the Autocompletes keep a stable id.
//  · The User Details row does not exist until "Add Item" is clicked.
//  · The form embeds a SunEditor that injects HIDDEN "Submit" buttons — an
//    XPath text match hits a dead one and the click silently does nothing.
//    Always submit through getByRole.
// ─────────────────────────────────────────────────────────────────────────────

export class supplierActions {

    constructor(page) { this.page = page; }

    async openListing() {
        await this.page.setViewportSize({ width: 1800, height: 950 });
        await this.page.goto(`${V3_BASE}${S.listingUrlPath}`, {
            waitUntil: 'domcontentloaded', timeout: 60000,
        });
        await this.page.locator(`xpath=${S.tabByName('All')}`).first().click();
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 30000 });
        await this.page.waitForTimeout(1200);
    }

    async openCreateForm() {
        await this.page.getByRole('button', { name: 'Add New' }).first().click();
        await this.page.waitForTimeout(6000);
        await expect(this.page.locator(`xpath=${S.createFormHeading}`).first()).toBeVisible();
    }

    /** Fill a plain text field, matched on its id prefix. */
    async fillText(label, value) {
        const el = this.page.locator(S.textByIdPrefix(label)).first();
        await el.scrollIntoViewIfNeeded();
        await el.fill(value);
    }

    /** Choose from a MUI Autocomplete. Without `typed`, takes the first option. */
    async pickAutocomplete(label, typed = null) {
        const el = this.page.locator(S.acById(label)).first();
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await this.page.waitForTimeout(800);
        if (typed) { await el.fill(typed); await this.page.waitForTimeout(1800); }
        const opts = this.page.locator(S.acOption);
        await opts.first().waitFor({ state: 'visible', timeout: 15000 });
        await opts.first().click();
        await this.page.waitForTimeout(900);
        return el.inputValue();
    }

    /**
     * Add one User Details row and fill it.
     *
     * The cells are click-to-edit: clicking turns the placeholder text into an
     * editor, and Tab moves to the next cell. Re-locating each cell by its
     * placeholder between fields does NOT work — once Name is committed the
     * grid re-renders and "Enter Email" is momentarily absent — so the row is
     * filled by clicking once and tabbing across.
     */
    async addUserDetailsRow({ name, email, phone }) {
        const addItem = this.page.locator(`xpath=${S.addItemBtn}`).first();
        await addItem.scrollIntoViewIfNeeded();
        await this.page.waitForTimeout(500);
        await addItem.click();
        await this.page.waitForTimeout(3000);

        const cell = this.page.locator(`xpath=${S.gridCellByPlaceholder('Enter Name')}`).last();
        await cell.scrollIntoViewIfNeeded();
        await cell.click();
        await this.page.waitForTimeout(1000);

        for (const value of [name, email, phone]) {
            await this.page.keyboard.type(value);
            await this.page.waitForTimeout(700);
            await this.page.keyboard.press('Tab');   // NOT Escape — that closes the drawer
            await this.page.waitForTimeout(1200);
        }
        console.log(`[SUPPLIER] user row: ${name} / ${email} / ${phone}`);
    }

    /** Fill every mandatory field. Returns the generated supplier name. */
    async fillMandatoryFields({ namePrefix = 'HG Auto Supplier' } = {}) {
        const stamp = Date.now().toString().slice(-8);
        const name = `${namePrefix} ${stamp}`;

        await this.fillText('Name', name);
        await this.pickAutocomplete('Payment Spoc', 'Hirak');
        await this.fillText('Alternate Supplier Name', 'NA');
        await this.pickAutocomplete('NDA required?');
        await this.addUserDetailsRow({
            name: `HG Auto User ${stamp}`,
            email: `hgauto${stamp}@mail.com`,
            phone: '9876543210',
        });

        console.log(`[SUPPLIER] mandatory fields filled for "${name}"`);
        return name;
    }

    /** Submit the create form. getByRole — see the SunEditor note above. */
    async submitCreateForm() {
        await this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();
        await this.page.waitForTimeout(8000);

        const errs = [...new Set(
            (await this.page.locator(`xpath=${S.mandatoryMessages}`).allInnerTexts())
                .map(m => m.trim()).filter(Boolean))];
        if (errs.length) throw new Error(`create was rejected, still on the form: ${JSON.stringify(errs)}`);
        console.log('[SUPPLIER] create submitted');
    }

    /** Find a supplier by name on the listing; returns its href or null. */
    async findSupplierHref(name) {
        const box = this.page.locator(`xpath=${S.searchInput}`).first();
        await box.click();
        await box.fill(name);
        await this.page.waitForTimeout(5000);
        return this.page.locator(`xpath=${S.rowLinkByName(name)}`).first()
            .getAttribute('href').catch(() => null);
    }

    /** Registration status shown beside the supplier title. */
    async readStatus() {
        for (const s of ['Registered', 'Blocked', 'Pending Approval', 'Submitted', 'Rejected', 'Draft']) {
            if (await this.page.locator(`xpath=${S.statusChip(s)}`).count()) return s;
        }
        return '(unknown)';
    }

    /** Confirm the Workflow Summary popup shown after the create Submit. */
    async confirmWorkflowSummary() {
        const wf = this.page.locator(`xpath=${S.workflowSummaryHeading}`);
        if (!await wf.count()) return false;
        const stages = await this.page.evaluate(() => [...new Set(
            [...document.querySelectorAll('*')]
                .filter(e => e.children.length === 0 && /^Sup /.test((e.textContent || '').trim()))
                .map(e => (e.textContent || '').trim()))]);
        console.log(`[SUPPLIER] workflow summary stages: ${JSON.stringify(stages)}`);
        await this.page.getByRole('button', { name: 'Submit', exact: true }).last().click();
        await this.page.waitForTimeout(12000);
        return true;
    }

    /** Approve / Acknowledge / Review until the supplier reaches Submitted. */
    async approveUntilSubmitted(id, code, notes = 'Approved by automation') {
        for (let round = 1; round <= 8; round++) {
            await this.page.goto(`${V3_BASE}/suppliers/${id}`,
                { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(8000);

            const status = await this.readSupplierStatus(code);
            if (/^(Submitted|Registered|Requested)$/.test(status || '')) {
                console.log(`[SUPPLIER] reached ${status} after ${round - 1} action(s)`);
                return status;
            }

            // "Review" is NOT a dialog step — it opens the edit drawer, which is
            // completed with its own Submit.
            if (await this.page.locator(`xpath=${S.reviewBtn}`).count()) {
                console.log(`[SUPPLIER] round ${round}: ${status} → Review (edit drawer)`);
                await this.page.locator(`xpath=${S.reviewBtn}`).first().click();
                await this.page.waitForTimeout(6000);
                await this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();
                await this.page.waitForTimeout(8000);
                await this.confirmWorkflowSummary();
                continue;
            }

            const btn = ['Approve', 'Acknowledge']
                .map(l => ({ l, loc: this.page.locator(`xpath=${l === 'Approve' ? S.approveBtn : S.acknowledgeBtn}`) }));
            let acted = false;
            for (const { l, loc } of btn) {
                if (!await loc.count()) continue;
                console.log(`[SUPPLIER] round ${round}: ${status} → ${l}`);
                await loc.first().click();
                await this.page.waitForTimeout(3000);

                const notesBox = this.page.locator(`xpath=${S.dialogApproveNotes}`).first();
                if (await notesBox.count()) await notesBox.fill(notes);
                await this.page.waitForTimeout(500);
                const confirm = this.page.locator(`xpath=${S.dialogConfirmBtn}`).first();
                if (await confirm.count()) await confirm.click();
                await this.page.waitForTimeout(10000);
                acted = true;
                break;
            }
            if (!acted) {
                console.log(`[SUPPLIER] round ${round}: ${status} — no workflow action available`);
                return status;
            }
        }
        return this.readSupplierStatus(code);
    }

    /** Status chip beside the supplier title, read by its code. */
    async readSupplierStatus(code) {
        return this.page.evaluate((c) => {
            const t = document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean);
            const i = t.findIndex(x => x.includes(`(${c})`));
            return i === -1 ? null : t[i + 1];
        }, code);
    }

    /**
     * Send Onboarding → keep the pre-selected template → Submit.
     * Returns the template name that was left untouched.
     */
    async sendOnboarding() {
        await this.page.locator(`xpath=${S.sendOnboardingBtn}`).first().click();
        await this.page.waitForTimeout(4000);

        const tpl = this.page.locator(`xpath=${S.onboardingTemplateInput}`).first();
        const template = await tpl.inputValue().catch(() => '');
        console.log(`[SUPPLIER] onboarding template (unchanged): "${template}"`);

        const posted = this.page.waitForResponse(
            r => /send-onboarding-request/.test(r.url()) && r.request().method() !== 'GET',
            { timeout: 60000 },
        ).catch(() => null);
        await this.page.getByRole('button', { name: 'Submit', exact: true }).last().click();
        const resp = await posted;
        await this.page.waitForTimeout(10000);
        return { template, status: resp ? resp.status() : null };
    }


    // ── Supplier Onboarding form (sheet scenario 97, final step) ──────────────
    //
    // Reached from a "Requested" supplier via the header **Update** button
    // (/suppliers/<id>/update). Verified live 2026-09-02 on FNSE-26-3035:
    // 98 visible fields, of which 65 are mandatory. Rather than hard-code that
    // list — it is template-driven and will drift — the form is submitted ONCE
    // empty, the resulting "<field> is Mandatory" messages are read back, and
    // only those fields are filled. The filler therefore adapts to the template.
    //
    // Field shapes:
    //   · MUI Autocomplete (29) — Yes/No questions plus real pickers
    //     (Currency Mappings, Constitution Type, Vendor Type [IT / Non IT /
    //     Foreign], State, Bank Name, Account Type, RPT Flag [Y / N]).
    //     QA: "wherever Yes/No options are there, select No" — so No / N wins
    //     when offered, otherwise the first option.
    //   · plain text (31) — id carries a random suffix, matched on the prefix.
    //   · file inputs (3) — NDA, Code of Conduct, File Upload with Template.
    //   · react-datepicker (2) — NDA Start Date / NDA Expiry Date.
    //
    // NOTE FOR SCENARIOS 74-81: **Vendor Type and RPT Flag live HERE**, on the
    // onboarding form — which is exactly what those scenarios mean by "the
    // selection in the Supplier Onboarding". They are not on any invoice
    // template, which is why the probe for them came up empty.


    // ── Onboarding form: IFSC mandatory validation (sheet scenarios 135, 136) ─
    //
    // The onboarding form at /suppliers/{id}/update is the ONLY place IFSC
    // exists — it is on neither the Create Supplier form nor the supplier's
    // Onboarding tab, which is why an earlier probe for it came up empty.
    //
    // It renders only while the supplier is still pre-Registered. A REGISTERED
    // supplier's /update REDIRECTS to /suppliers/{id} (verified on 30458), so a
    // test must not assume the URL it asked for is the URL it got.

    /** True when /suppliers/{id}/update actually rendered the editable form. */
    async isOnboardingFormOpen() {
        if (!/\/update$/.test(this.page.url())) return false;
        return (await this.page.locator('input').count()) > 20;
    }

    async openOnboardingForm(id) {
        await this.page.goto(`${V3_BASE}/suppliers/${id}/update`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(13000);
        const open = await this.isOnboardingFormOpen();
        console.log(`[SUPPLIER] onboarding form for ${id}: ${open ? 'open' : 'NOT available'} (${this.page.url()})`);
        return open;
    }

    /**
     * Find a supplier whose onboarding form is editable AND carries IFSC fields.
     *
     * Walks the listing rather than trusting a hardcoded id — the default
     * supplier listing is a pending-work view, so which suppliers appear churns.
     * `requireValue: true` additionally demands the IFSC fields already hold a
     * value, which is what makes scenario 136 an EDIT rather than a creation.
     */
    async findOnboardingSupplier({ requireValue = false, max = 6 } = {}) {
        await this.page.goto(`${V3_BASE}/suppliers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(9000);

        const headers = await this.page.$$eval('thead th',
            ths => ths.map(t => (t.innerText || '').trim()));
        const iStatus = headers.indexOf('Registration Status');

        const rows = await this.page.$$eval('tbody tr', (trs, iStatus) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            return {
                id: (href.match(/\/suppliers\/(\d+)/) || [])[1] || null,
                name: (tds[1]?.innerText || '').trim(),
                status: iStatus >= 0 ? (tds[iStatus]?.innerText || '').trim() : '',
            };
        }).filter(r => r.id), iStatus);

        for (const r of rows.slice(0, max)) {
            if (!(await this.openOnboardingForm(r.id))) continue;
            const ifsc = await this.getIfscFields();
            if (!ifsc.length) {
                console.log(`[SUPPLIER] ${r.name} (${r.id}) has no IFSC field on its template`);
                continue;
            }
            const filled = ifsc.every(f => (f.value || '').trim() !== '');
            if (requireValue && !filled) {
                console.log(`[SUPPLIER] ${r.name} (${r.id}) has IFSC fields but they are blank — need a filled one`);
                continue;
            }
            console.log(`[SUPPLIER] using ${r.name} (${r.id}, ${r.status}); IFSC fields: ` +
                ifsc.map(f => `${f.label}="${f.value}"`).join(' · '));
            return { ...r, ifsc };
        }
        return null;
    }

    /**
     * Read the IFSC fields on the open onboarding form.
     *
     * Matched on the input's ID PREFIX, not on a mandatory marker: this template
     * carries NO asterisk and no `required`/`aria-required` on the IFSC inputs
     * even though the form rejects them when blank. The ids are
     * "RTGS IFSC Code-<random>" / "NEFT IFSC Code-<random>" — the suffix is
     * regenerated on every render, so it can never be hardcoded.
     */
    async getIfscFields() {
        return this.page.$$eval('input', els => els
            .filter(e => /ifsc/i.test(e.id || ''))
            .map(e => ({ id: e.id, label: (e.id || '').split('-')[0], value: e.value })));
    }

    async setIfscFields(value) {
        const handles = await this.page.$$('input');
        const touched = [];
        for (const h of handles) {
            const id = (await h.getAttribute('id')) || '';
            if (!/ifsc/i.test(id)) continue;
            await h.fill(value);
            touched.push(id);
        }
        await this.page.waitForTimeout(1200);
        console.log(`[SUPPLIER] set ${touched.length} IFSC field(s) to "${value}"`);
        return touched;
    }

    /**
     * Submit the onboarding form and read back its validation messages.
     *
     * getByRole for the button — the form embeds a SunEditor that injects HIDDEN
     * "Submit" buttons, and an XPath text match resolves one of those, so the
     * click does nothing and the form LOOKS like it accepted the submit.
     */
    async submitOnboardingAndReadValidation() {
        await this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();
        await this.page.waitForTimeout(6000);

        const messages = await this.page.$$eval('*', els => Array.from(new Set(els
            .filter(e => e.children.length === 0 && /is Mandatory|Please fill mandatory/i.test(e.textContent || ''))
            .map(e => (e.textContent || '').trim()))));
        console.log(`[SUPPLIER] validation messages: ${JSON.stringify(messages)}`);
        return messages;
    }

    /** A plausible value for a text field, chosen from its label. */
    _onboardingTextValue(label) {
        const l = label.toLowerCase();
        if (/email/.test(l))                        return `hgauto${Date.now().toString().slice(-6)}@mail.com`;
        if (/isd|country code/.test(l))             return '91';
        if (/std|area code/.test(l))                return '22';
        if (/phone|mobile/.test(l))                 return '9876543210';
        if (/pin/.test(l))                          return '400051';
        if (/aadhar/.test(l))                       return '123456789012';
        if (/ifsc/.test(l))                         return 'HDFC0000123';
        if (/account number/.test(l))               return '123456789012345';
        if (/branch number/.test(l))                return '123';
        if (/incorporated in year|^year/.test(l))   return '2020';
        if (/number of customers/.test(l))          return '25';
        if (/city|center|location/.test(l))         return 'Mumbai';
        if (/address/.test(l))                      return 'Exchange Plaza, BKC, Mumbai';
        if (/name/.test(l))                         return 'HG Automation';
        return 'NA';
    }

    /**
     * Fill every mandatory field on the onboarding form and submit.
     * Returns a report of what was filled and anything left over.
     */
    async fillAndSubmitOnboardingForm(id, { filePath = 'fixtures/invoice_document.png', passes = 4 } = {}) {
        const path = await import('path');
        const abs = path.resolve(filePath);

        await this.page.goto(`${V3_BASE}/suppliers/${id}/update`,
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(10000);

        const done = { autocomplete: [], text: [], date: [], file: [], skipped: [] };
        let requested = 0;
        let remaining = [];

        // The form is PROGRESSIVE: answering a Yes/No question can reveal a new
        // mandatory field (answering GST = No adds "No GST Acknowledgment"), so
        // one pass is never enough. Re-provoke the validation and fill whatever
        // is still outstanding until nothing new appears.
        for (let pass = 1; pass <= passes; pass++) {
            await this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();
            await this.page.waitForTimeout(6000);

            const labels = [...new Set(
                (await this.page.locator(`xpath=${S.mandatoryMessages}`).allInnerTexts())
                    .map(m => m.trim().replace(/\s*is Mandatory.*/, '')).filter(Boolean))];
            if (pass === 1) requested = labels.length;
            console.log(`[ONBOARD] pass ${pass}: ${labels.length} mandatory field(s) outstanding`);
            if (!labels.length) { remaining = []; break; }

            let filledThisPass = 0;
            for (const label of labels) {
                if (await this._fillOnboardingField(label, abs, done)) filledThisPass++;
            }
            console.log(`[ONBOARD] pass ${pass}: filled ${filledThisPass}/${labels.length}`);
            remaining = labels;
            if (!filledThisPass) break;      // no progress — stop rather than spin
        }

        console.log(`[ONBOARD] totals — ${done.autocomplete.length} pickers, ${done.text.length} text, `
            + `${done.date.length} dates, ${done.file.length} files; ${done.skipped.length} skipped`);
        if (done.skipped.length) console.log(`[ONBOARD] skipped: ${JSON.stringify(done.skipped)}`);

        const posted = this.page.waitForResponse(
            r => /suppliers\/v2\//.test(r.url()) && r.request().method() !== 'GET',
            { timeout: 90000 },
        ).catch(() => null);
        await this.page.getByRole('button', { name: 'Submit', exact: true }).first().click();
        const resp = await posted;
        await this.page.waitForTimeout(10000);

        const stillMissing = [...new Set(
            (await this.page.locator(`xpath=${S.mandatoryMessages}`).allInnerTexts())
                .map(m => m.trim()).filter(Boolean))];

        return { requested, ...done, remaining: stillMissing, httpStatus: resp ? resp.status() : null };
    }

    /** Fill ONE mandatory field, whatever shape it is. Returns true if handled. */
    async _fillOnboardingField(label, abs, done) {
        // 1. Autocomplete — prefer No / N, else the first option.
        const ac = this.page.locator(S.acById(label)).first();
        if (await ac.count()) {
            try {
                await ac.scrollIntoViewIfNeeded();
                await ac.click();
                await this.page.waitForTimeout(1200);
                const opts = this.page.locator(S.acOption);
                await opts.first().waitFor({ state: 'visible', timeout: 8000 });
                const texts = (await opts.allInnerTexts()).map(s => s.trim());
                const i = texts.findIndex(t => /^(No|N)$/i.test(t));
                await opts.nth(i >= 0 ? i : 0).click();
                await this.page.waitForTimeout(700);
                done.autocomplete.push(`${label}=${texts[i >= 0 ? i : 0]}`);
                return true;
            } catch { done.skipped.push(`${label} (autocomplete)`); return false; }
        }

        // 2. Plain text — id prefix.
        const txt = this.page.locator(S.textByIdPrefix(label)).first();
        if (await txt.count()) {
            try {
                await txt.scrollIntoViewIfNeeded();
                await txt.fill(this._onboardingTextValue(label));
                done.text.push(label);
                return true;
            } catch { done.skipped.push(`${label} (text)`); return false; }
        }

        // 3. Date — "Enter <label>" placeholder.
        const date = this.page.getByPlaceholder(`Enter ${label}`).first();
        if (await date.count()) {
            try {
                await this._pickDate(date, /expiry/i.test(label) ? 1 : 0);
                done.date.push(label);
                return true;
            } catch (e) { done.skipped.push(`${label} (date: ${e.message.split('\n')[0]})`); return false; }
        }

        // 4. File — matched on the input's OWN label.
        if (await this._uploadByLabel(label, abs)) { done.file.push(label); return true; }

        done.skipped.push(label);
        return false;
    }

    /** Pick a date `offsetYears` from today in a react-datepicker input. */
    async _pickDate(input, offsetYears = 0) {
        await input.scrollIntoViewIfNeeded();
        await input.click();
        const cal = this.page.locator('.react-datepicker').last();
        await cal.waitFor({ state: 'visible', timeout: 10000 });
        if (offsetYears > 0) {
            for (let i = 0; i < 12 * offsetYears; i++) {
                await this.page.locator('.react-datepicker__navigation--next').last().click();
                await this.page.waitForTimeout(120);
            }
        }
        await this.page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month):not(.react-datepicker__day--disabled)')
            .nth(14).click();
        await this.page.waitForTimeout(700);
    }

    /**
     * Attach `abs` to the file input whose OWN LABEL matches `label`.
     *
     * Walking up from the error message does not work: NDA, Code of Conduct and
     * File Upload with Template all render on the same row (y=1830), so the walk
     * finds whichever input comes first and the other two silently stay empty —
     * which is exactly how NDA was missed on the first run. Each file input does
     * carry its own label in an ancestor ("* | NDA | 1", "GSTIN Certificate"),
     * so match on that instead.
     */
    async _uploadByLabel(label, abs) {
        const handle = await this.page.evaluateHandle((lab) => {
            const norm = (s) => (s || '')
                .replace(/\n+/g, ' | ')
                .replace(/^\*\s*\|\s*/, '')      // leading mandatory asterisk
                .replace(/\s*\|\s*\d+$/, '')     // trailing row counter
                .trim()
                .toLowerCase();
            for (const f of document.querySelectorAll('input[type="file"]')) {
                let n = f, own = '';
                for (let k = 0; k < 8 && n && !own; k++) {
                    n = n.parentElement;
                    if (!n) break;
                    const txt = (n.innerText || '').trim();
                    if (txt && txt.length < 90) own = txt;
                }
                if (norm(own) === norm(lab)) return f;
            }
            return null;
        }, label);

        const el = handle.asElement();
        if (!el) return false;
        try {
            await el.setInputFiles(abs);
            await this.page.waitForTimeout(3000);
            return true;
        } catch { return false; }
    }
}
