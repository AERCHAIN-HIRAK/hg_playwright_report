import { expect } from '@playwright/test';
import { NSEFoundation_Locators as L } from './NSEFoundationLocators';

export const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';
export const V4_BASE_URL = 'https://nse-capp-v4-uat.aerchain.io';

// ─────────────────────────────────────────────────────────────────────────────
// Auction suite — RFX → Auction → live bidding → Update to RFQ.
//
// The two halves live in DIFFERENT frontends (see the v3/v4 split note):
//
//   RFX       v4 shadcn   nse-capp-v4-uat.aerchain.io/quote-requests/{id}
//   Auction   v3 MUI      nse-capp-uat.aerchain.io/auction-requests/{id}
//
// Mapped live 2026-09-29 from AUC-DRAFT #1664 (converted from RFX-26-401):
//   • header icon row, left→right: refresh · Download · CLOCK (Activity
//     Timeline / Team Chat drawer) · PENCIL (edit) · More
//   • a draft's More offers only Cancel · Clone; a released one Clone · Reassign
//   • /auction-requests/{id}/edit cannot be opened by URL — it bounces back to
//     the view page. The pencil is the only way in.
//   • Supplier Response carries the four view types as buttons
//     "Bid-submitted(n) · Regretted(n) · Prebid-submitted(n) · Pending(n)" and a
//     "Search Supplier" box.
//   • the conversion writes TWO timeline entries: "Auction created and saved"
//     and "Auction created from RFX RFX-26-401".
//
// On the RFX, every supplier row carries icon buttons whose accessible names are
// "View Supplier Quote Request", "Send Reminder to Supplier" and
// "Restrict Supplier".
// ─────────────────────────────────────────────────────────────────────────────
export class auctionActions {

    constructor(page) {
        this.page = page;
    }

    // ── RFX side (v4) ─────────────────────────────────────────────────────────

    supplierRow(name) {
        return this.page.locator('tr', { hasText: name }).first();
    }

    /** Name + status text of every supplier row in Supplier Selection. */
    async readRfxSupplierRows() {
        return this.page.evaluate(() => {
            const heads = [...document.querySelectorAll('*')]
                .filter(e => e.children.length === 0 && (e.textContent || '').trim() === 'Supplier Selection');
            let host = heads[0];
            for (let i = 0; i < 10 && host && !host.querySelector('table'); i++) host = host.parentElement;
            const t = host && host.querySelector('table');
            if (!t) return [];
            return [...t.querySelectorAll('tbody tr')].map(r => {
                const tds = [...r.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim());
                return { name: tds[0] || '', cells: tds };
            });
        });
    }

    /** Restrict Supplier (lock icon on the supplier row) and confirm the dialog. */
    async restrictRfxSupplier(name, reason = 'Restricted by automation') {
        const row = this.supplierRow(name);
        await row.scrollIntoViewIfNeeded();
        const btn = row.getByRole('button', { name: 'Restrict Supplier' }).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click();
        await this.page.waitForTimeout(2000);

        const dialog = this.page.getByRole('dialog').last();
        await expect(dialog).toBeVisible({ timeout: 15000 });
        console.log(`[AUC] Restrict dialog: ${(await dialog.innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);

        const box = dialog.getByPlaceholder(/reason/i).or(dialog.locator('textarea')).first();
        if (await box.isVisible({ timeout: 2000 }).catch(() => false)) await box.fill(reason);

        // A popover, not a modal: reason box + two icon-only buttons, ✕ then ✓.
        // Neither has an accessible name, so the tick is picked by position.
        const confirm = dialog.locator('button').last();
        await confirm.click({ timeout: 15000 });
        await this.page.waitForTimeout(4000);
        console.log(`[AUC] Supplier "${name}" restricted`);
    }

    /**
     * Surrogate-quote ONE named supplier with a price per line item. The quote
     * grid shows one editable Unit Rate cell per line, in line order.
     */
    async quoteRfxSupplier(a, data, name, rates) {
        const row = this.supplierRow(name);
        await row.scrollIntoViewIfNeeded();
        const btn = row.getByRole('button', { name: /^Submit Quote$/ }).first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click();
        await this.page.waitForTimeout(1000);

        await a.clickCommercialQuoteOption();
        await a.selectQuotePreferredCurrency(data);

        const cells = this.page.locator(L.quoteUnitRateCell);
        await cells.first().waitFor({ state: 'visible', timeout: 20000 });
        const n = await cells.count();
        if (n < rates.length) {
            throw new Error(`[AUC] quote grid shows ${n} unit-rate cells for ${rates.length} line items`);
        }
        for (let i = 0; i < rates.length; i++) {
            const cell = cells.nth(i);
            const want = String(rates[i]);
            let ok = false;
            for (let attempt = 0; attempt < 3 && !ok; attempt++) {
                await cell.scrollIntoViewIfNeeded();
                await cell.click();
                await this.page.waitForTimeout(500);
                await this.page.keyboard.type(want);
                await this.page.keyboard.press('Tab');
                await this.page.waitForTimeout(800);
                ok = ((await cell.textContent()) ?? '').replace(/[,\s]/g, '').includes(want);
            }
            if (!ok) throw new Error(`[AUC] ${name} line ${i + 1}: unit rate ${want} did not register`);
        }
        console.log(`[AUC] ${name} quote rates ${JSON.stringify(rates)}`);
        await a.submitQuote();
        await this.page.waitForTimeout(3000);
    }

    /** Open the Convert to Auction dialog and report whether any line item can be picked. */
    async probeConvertToAuctionDialog(a) {
        try {
            await a.clickV4MenuItem('Convert to Auction');
        } catch (e) {
            // No menu item at all is an even stronger "cannot convert again".
            await this.page.keyboard.press('Escape').catch(() => {});
            return { lines: 0, enabled: 0, pendingAuction: 0, text: `menu item absent: ${String(e).split('\n')[0]}` };
        }
        const dialog = this.page.getByRole('dialog').filter({ hasText: /Convert to Auction/i }).first();
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await this.page.waitForTimeout(2000);
        const text = (await dialog.innerText()).replace(/\n+/g, ' | ');
        // Index 0 is the select-all header box; only the per-line boxes count.
        const boxes = dialog.getByRole('checkbox');
        const n = await boxes.count();
        let enabled = 0;
        for (let i = 1; i < n; i++) {
            const b = boxes.nth(i);
            const dis = (await b.isDisabled().catch(() => true))
                || (await b.getAttribute('data-disabled')) !== null
                || (await b.getAttribute('aria-disabled')) === 'true';
            if (!dis) enabled++;
        }
        const pendingAuction = (text.match(/Pending Auction/g) || []).length;
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(1000);
        return { lines: Math.max(n - 1, 0), enabled, pendingAuction, text };
    }

    /** The auction link(s) on the RFX Transactions tab → [{ text, href }]. */
    async readLinkedAuctions(rfxOverviewUrl) {
        await this.page.goto(rfxOverviewUrl.replace(/\/overview.*$/, '/transactions'),
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(6000);
        return this.page.evaluate(() => {
            const h = [...document.querySelectorAll('*')]
                .filter(e => e.children.length === 0 && (e.textContent || '').trim() === 'Linked Auctions')[0];
            let host = h;
            for (let i = 0; i < 10 && host && !host.querySelector('table'); i++) host = host.parentElement;
            const t = host && host.querySelector('table');
            if (!t) return [];
            return [...t.querySelectorAll('tbody tr')].map(r => {
                const a = r.querySelector('a[href]');
                return { text: (r.innerText || '').replace(/\s+/g, ' ').trim(), href: a ? a.href : null };
            });
        });
    }

    // ── Auction side (v3) ─────────────────────────────────────────────────────

    async openAuction(url) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.getByText('Supplier Response', { exact: true }).first()
            .waitFor({ state: 'visible', timeout: 60000 });
        await this.page.waitForTimeout(3000);
    }

    /**
     * The n-th TEXTLESS header icon button to the right of the Download control
     * (1 = clock/timeline, 2 = pencil/edit). Download is a split button — label
     * plus a separate arrow button — so counting raw siblings lands on the arrow
     * and opens the Download menu instead.
     */
    async _headerIconButton(n) {
        const idx = await this.page.evaluate((nth) => {
            const all = [...document.querySelectorAll('button')]
                .map((b, i) => ({ i, r: b.getBoundingClientRect(), t: (b.innerText || '').trim() }))
                .filter(x => x.r.width > 0 && x.r.top < 140 && x.r.top > 60);
            const dl = all.filter(x => /Download/.test(x.t));
            if (!dl.length) return -1;
            const dlRight = Math.max(...all.filter(x => Math.abs(x.r.top - dl[0].r.top) < 12
                && x.r.left >= dl[0].r.left && x.r.left < dl[0].r.right + 4).map(x => x.r.right));
            const icons = all.filter(x => !x.t && x.r.left > dlRight + 2)
                .sort((p, q) => p.r.left - q.r.left);
            const hit = icons[nth - 1];
            return hit ? hit.i : -1;
        }, n);
        if (idx === -1) throw new Error(`[AUC] header icon #${n} right of Download not found`);
        return this.page.locator('button').nth(idx);
    }

    /** Clock icon → "Activity Timeline / Team Chat" drawer → its lines. */
    async readAuctionTimeline() {
        // The header re-renders every second while a countdown is showing, so the
        // first click can land mid-render. Retry the open.
        const heading = this.page.getByText('Activity Timeline / Team Chat').first();
        for (let i = 0; i < 3; i++) {
            // The clock button is named "clock". While LIVE the header gains a
            // disabled "download" icon button, so position-counting picks the
            // wrong icon — use the name, and position only as a fallback.
            const named = this.page.getByRole('button', { name: 'clock', exact: true }).first();
            const clock = (await named.count()) ? named : await this._headerIconButton(1);
            await clock.click().catch(() => {});
            // isVisible() does NOT wait — a real wait is needed or every retry
            // closes a drawer that was still rendering.
            if (await heading.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) break;
            await this.page.keyboard.press('Escape').catch(() => {});
            await this.page.waitForTimeout(1500);
        }
        await heading.waitFor({ state: 'visible', timeout: 10000 });
        await this.page.waitForTimeout(2500);
        // The drawer renders AFTER the page body in DOM order, so everything
        // from its heading onward is the timeline (plus the reply box).
        const all = (await this.page.locator('body').innerText()).split('\n').map(t => t.trim()).filter(Boolean);
        const at = all.lastIndexOf('Activity Timeline / Team Chat');
        const lines = at === -1 ? [] : all.slice(at + 1);
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(1000);
        return lines;
    }

    async clickAuctionEdit() {
        const pencil = await this._headerIconButton(2);
        await pencil.click();
        await this.page.waitForURL(/\/auction-requests\/\d+\/edit/, { timeout: 60000 });
        await this.page.getByText('Bidding Rules').first().waitFor({ state: 'visible', timeout: 60000 });
        await this.page.waitForTimeout(3000);
    }

    async expandAuctionSection(title) {
        const head = this.page.getByText(title, { exact: true }).first();
        await head.scrollIntoViewIfNeeded();
        await head.click();
        await this.page.waitForTimeout(1500);
    }

    /** Text of a collapsible view-page section (expands it first). */
    async readAuctionSection(title) {
        await this.expandAuctionSection(title);
        return this.page.evaluate((t) => {
            const h = [...document.querySelectorAll('*')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim() === t);
            let host = h;
            for (let i = 0; i < 8 && host && (host.innerText || '').length < 120; i++) host = host.parentElement;
            return host ? host.innerText : '';
        }, title);
    }

    /** Supplier Response rows for a view type ("Prebid-submitted", "Pending", …). */
    async readSupplierResponse(viewType = null) {
        if (viewType) {
            // The tab text is lower-case in the DOM ("prebid-submitted(2)"); CSS
            // capitalises it on screen, so match case-insensitively.
            await this.page.getByRole('button', { name: new RegExp(`^${viewType}\\(\\d+\\)$`, 'i') }).first().click();
            await this.page.waitForTimeout(2500);
        }
        return this.page.evaluate(() => {
            const h = [...document.querySelectorAll('*')]
                .find(e => e.children.length === 0 && (e.textContent || '').trim() === 'Supplier Response');
            let host = h;
            for (let i = 0; i < 10 && host && !host.querySelector('table'); i++) host = host.parentElement;
            const t = host && host.querySelector('table');
            const counts = {};
            for (const b of (host ? host.querySelectorAll('*') : [])) {
                if (b.children.length) continue;
                const m = (b.textContent || '').replace(/[\s\u200b]/g, '').match(/^([A-Za-z-]+)\((\d+)\)$/);
                if (m) counts[m[1]] = Number(m[2]);
            }
            const rows = t ? [...t.querySelectorAll('tbody tr')].map(r => {
                const tds = [...r.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim());
                return { name: tds[0] || '', bid: tds[1] || '', status: tds[5] || '', cells: tds };
            }).filter(r => r.name) : [];
            return { counts, rows };
        });
    }

    // ── Auction edit form (v3 MUI) ────────────────────────────────────────────
    //
    // Mapped live 2026-09-29 on #1671. Radio groups carry the field label as
    // their id ("Auto Release Auction", "Accept Pre Bids", …) with inputs valued
    // 1 (Yes) / 0 (No); Supplier Market Feedback values are BRO · BRWLB · BRWAB ·
    // HOL · NONE. Autocompletes are an <input id="<label>"> (note the app's own
    // spelling "Bid Imporvement Condition"). Bid Start Time is a react-datepicker
    // with a 15-minute time list. The three extension inputs have random
    // "undefined-…" ids and are addressed in order.

    static FEEDBACK = { 'Bid Rank only': 'BRO', 'Bid Rank with Lead Bid': 'BRWLB',
        'Bid Rank with All Bids': 'BRWAB', 'Highest Or Lowest': 'HOL', 'None': 'NONE' };

    async setAuctionRadio(group, value) {
        const input = this.page.locator(`[role=radiogroup][id="${group}"] input[value="${value}"]`).first();
        await input.scrollIntoViewIfNeeded();
        await input.check({ force: true });
        await expect(input, `${group} did not take ${value}`).toBeChecked();
    }

    async selectAuctionOption(id, option) {
        const input = this.page.locator(`input[id="${id}"]`).first();
        // The sticky Submit bar overlays the bottom of the viewport, so a field
        // merely "in view" can sit under it and swallow the click.
        await input.evaluate(e => e.scrollIntoView({ block: 'center' }));
        const opt = this.page.getByRole('option', { name: option, exact: true }).first();
        for (let i = 0; i < 3; i++) {
            await input.click();
            if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) break;
            await this.page.keyboard.press('Escape').catch(() => {});
        }
        await opt.click();
        await this.page.waitForTimeout(600);
        await expect(input, `${id} did not take "${option}"`).toHaveValue(option);
    }

    async fillAuctionInput(selector, value) {
        const input = this.page.locator(selector).first();
        await input.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await input.click();
        await input.fill(String(value));
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(400);
    }

    /**
     * Bid Start Time = the first selectable 15-minute slot at least `minutes`
     * from now. Returns the Date picked.
     */
    async pickBidStartTime(minutes, inputSelector = 'input[placeholder="Enter Bid Start Time"]') {
        const t = new Date(Date.now() + minutes * 60000);
        t.setSeconds(0, 0);
        t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15);
        const input = this.page.locator(inputSelector).last();
        await input.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await input.click();
        const pop = this.page.locator('.react-datepicker-popper').first();
        await pop.waitFor({ state: 'visible', timeout: 10000 });

        const monthName = t.toLocaleString('en-US', { month: 'long' });
        for (let i = 0; i < 3; i++) {
            const head = (await pop.locator('.react-datepicker__current-month').first().innerText()).trim();
            if (head === `${monthName} ${t.getFullYear()}`) break;
            await pop.locator('.react-datepicker__navigation--next').first().click();
            await this.page.waitForTimeout(500);
        }
        const d = t.getDate();
        const sfx = (d % 10 === 1 && d !== 11) ? 'st' : (d % 10 === 2 && d !== 12) ? 'nd' : (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
        const wd = t.toLocaleString('en-US', { weekday: 'long' });
        await pop.locator(`.react-datepicker__day[aria-label="Choose ${wd}, ${monthName} ${d}${sfx}, ${t.getFullYear()}"]`).first().click();
        await this.page.waitForTimeout(600);

        const slot = t.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const li = pop.locator('.react-datepicker__time-list-item:not(.react-datepicker__time-list-item--disabled)', { hasText: slot }).first();
        if (await li.count() === 0) {
            // the popper may have closed after the day click — reopen for the time list
            await input.click();
            await this.page.waitForTimeout(600);
        }
        const li2 = this.page.locator('.react-datepicker__time-list-item:not(.react-datepicker__time-list-item--disabled)')
            .filter({ hasText: new RegExp(`^${slot}$`) }).first();
        await li2.scrollIntoViewIfNeeded();
        await li2.click();
        await this.page.waitForTimeout(800);
        await this.page.keyboard.press('Escape').catch(() => {});
        const val = await input.inputValue();
        console.log(`[AUC] Bid Start Time → "${val}" (wanted ${t.toString()})`);
        if (!val) throw new Error('[AUC] Bid Start Time stayed empty');
        return t;
    }

    /** "Auction will be extended by [a] minutes, if the bid rank up to [b] changes in the last [c] minutes" + Max Extensions. */
    async setAuctionExtension(byMin, rankUpTo, lastMin, maxExt) {
        const boxes = this.page.locator('input[id^="undefined-"]');
        await expect(boxes.nth(2)).toBeVisible({ timeout: 10000 });
        for (const [i, v] of [[0, byMin], [1, rankUpTo], [2, lastMin]]) {
            const b = boxes.nth(i);
            await b.evaluate(e => e.scrollIntoView({ block: 'center' }));
            await b.click();
            await b.fill(String(v));
            await this.page.keyboard.press('Tab');
        }
        await this.fillAuctionInput('input[id^="Max Extensions"]', maxExt);
        console.log(`[AUC] extension: +${byMin} min if rank ≤${rankUpTo} changes in last ${lastMin} min, max ${maxExt}`);
    }

    /**
     * ag-grid Items: edit the n-th (0-based) empty cell whose placeholder is
     * `placeholder`. Description opens an ag-popup <textarea class="my-editor">
     * in which Enter inserts a NEWLINE rather than committing, so the value is
     * filled into the textarea and committed with Tab.
     */
    async fillAuctionItemCell(placeholder, n, value) {
        const cell = this.page.locator('div.ag-grid-custom-placeholder', { hasText: placeholder }).nth(n);
        await cell.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await cell.dblclick();
        const popup = this.page.locator(`.ag-popup textarea, .ag-popup input`).first();
        if (await popup.isVisible({ timeout: 3000 }).catch(() => false)) {
            await popup.fill(String(value));
            await this.page.keyboard.press('Tab');
        } else {
            await this.page.keyboard.type(String(value));
            await this.page.keyboard.press('Tab');
        }
        await this.page.waitForTimeout(800);
        await expect(this.page.locator('.ag-popup textarea'), 'the item cell editor did not close').toHaveCount(0);
        await expect(this.page.getByText(String(value)).first(), `item cell did not take "${value}"`).toBeVisible();
    }

    async fillAuctionNotes(text) {
        const ed = this.page.locator('[contenteditable=true]').first();
        await ed.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await ed.click();
        await this.page.keyboard.type(text);
        await this.page.waitForTimeout(500);
    }

    async uploadAuctionAttachment(filePath) {
        const input = this.page.locator('input[type=file][multiple]').first();
        await input.setInputFiles(filePath);
        await this.page.waitForTimeout(4000);
        const name = filePath.split('/').pop();
        await expect(this.page.getByText(name).first(), `attachment ${name} not listed after upload`)
            .toBeVisible({ timeout: 30000 });
    }

    async addAuctionSupplier(name) {
        const search = this.page.locator('input[placeholder^="Search by Supplier Name"]').first();
        await search.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await search.click();
        await search.fill(name);
        await this.page.waitForTimeout(3000);
        const opt = this.page.getByRole('option', { name: new RegExp(name.replace(/[-]/g, '\\-'), 'i') }).first()
            .or(this.page.locator('li', { hasText: name }).first());
        await opt.first().click();
        await this.page.waitForTimeout(2000);
        console.log(`[AUC] auction supplier "${name}" added`);
    }

    /** Bottom-bar Submit, then any confirmation dialog. Returns the landing URL. */
    async submitAuctionEdit() {
        await this.page.getByRole('button', { name: /^Submit$/ }).last().click();
        await this.page.waitForTimeout(2500);
        const dlg = this.page.getByRole('dialog').last();
        if (await dlg.isVisible({ timeout: 4000 }).catch(() => false)) {
            console.log(`[AUC] submit dialog: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);
            const ok = dlg.getByRole("button", { name: /^(Submit Auction|Submit|Confirm|Yes|Proceed|OK)$/i }).last();
            if (await ok.isVisible({ timeout: 3000 }).catch(() => false)) await ok.click();
        }
        await this.page.waitForURL(u => !/\/edit/.test(u.toString()), { timeout: 90000 });
        await this.page.waitForTimeout(5000);
        return this.page.url();
    }

    /** Auction code from the header breadcrumb, e.g. AUC-NSEFN-26-99 (AUC-DRAFT before release). */
    async readAuctionCode() {
        const t = await this.page.locator('body').innerText();
        return (t.match(/AUC-[A-Z0-9-]+/) || [])[0] || null;
    }

    /** More → Update Timings → a new Bid Start Time `minutes` out → save. Returns the Date picked. */
    async updateAuctionTimings(minutes, runtimeMin = 10) {
        await this.page.getByRole('button', { name: /^More$/ }).first().click();
        await this.page.waitForTimeout(1200);
        await this.page.getByText('Update Timings', { exact: true }).last().click();
        await this.page.waitForTimeout(3000);
        const dlg = this.page.getByRole('dialog').last();
        console.log(`[AUC] Update Timings dialog: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 500)}`);
        // The dialog ("Auction Configurations") uses a plain "Enter Date"
        // placeholder, not the edit form's "Enter Bid Start Time"; it saves on OK.
        const t = await this.pickBidStartTime(minutes, '[role=dialog] input[placeholder="Enter Date"]');
        // The dialog opens with Bid Start Time AND Bid Runtime blank. Saving
        // with the runtime blank still toasts "Auction configuration updated
        // successfully" but changes NOTHING (verified 2026-09-29 on #1673: start
        // stayed 11:15 pm). The runtime must be re-entered for the save to apply.
        await dlg.locator('input[type=number]').first().fill(String(runtimeMin));
        await this.page.waitForTimeout(500);
        const save = dlg.getByRole('button', { name: /^(OK|Update|Save|Submit|Confirm)$/i }).last();
        await save.click();
        await this.page.waitForTimeout(2500);
        const confirm = this.page.getByRole('dialog').last()
            .getByRole('button', { name: /^(Yes|Confirm|OK|Update)$/i }).last();
        if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
        await this.page.waitForTimeout(5000);
        return t;
    }

    /** Start Time column of the CAPP auction listing for `code`, e.g. "29 Sep, 2026, 11:45 pm". */
    async readListingStartTime(code) {
        await this.page.goto(`${V3_BASE_URL}/auction-requests`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 60000 });
        const row = (await this.page.locator('tbody tr', { hasText: code }).first().innerText()).replace(/\s+/g, ' ');
        return (row.match(/\d{1,2} \w{3}, \d{4}, \d{1,2}:\d{2} [ap]m/g) || []).pop() || row;
    }

    /** Type into the view page's "Search Supplier" box → names of the rows left. */
    async searchAuctionSupplier(text) {
        const box = this.page.locator('input[placeholder="Search Supplier"]').first();
        await box.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await box.fill(text);
        await this.page.waitForTimeout(2500);
        const r = await this.readSupplierResponse();
        await box.fill('');
        await this.page.waitForTimeout(1500);
        return r.rows.map(x => x.name);
    }

    /**
     * Download an attachment by file name. The name itself is a plain
     * <span class="attachment-label"> — the download is the ICON beside it, in
     * the nearest ancestor that also holds an icon.
     */
    async downloadAttachment(fileName) {
        const label = this.page.getByText(fileName, { exact: true }).locator('visible=true').first();
        await label.evaluate(e => e.scrollIntoView({ block: 'center' }));
        const icon = label.locator('xpath=ancestor::*[.//img or .//*[local-name()="svg"]][1]')
            .locator('button, img, svg').locator('visible=true').last();
        // The icon opens a NEW TAB on a pre-signed S3 URL carrying
        // response-content-disposition=filename=<name> (observed 2026-09-29);
        // a browser download event is accepted too, in case that changes.
        const ctx = this.page.context();
        const got = await Promise.race([
            this.page.waitForEvent('download', { timeout: 30000 }).then(d => ({ d })),
            ctx.waitForEvent('page', { timeout: 30000 }).then(p => ({ p })),
            icon.click().then(() => new Promise(() => {})),
        ]);
        let name;
        if (got.d) {
            name = got.d.suggestedFilename();
        } else {
            await got.p.waitForLoadState('domcontentloaded').catch(() => {});
            const url = got.p.url();
            const resp = await ctx.request.get(url, { timeout: 120000 });   // ~3.6 MB image
            expect(resp.status(), `the attachment link ${url.slice(0, 80)}… did not serve the file`).toBe(200);
            name = decodeURIComponent((url.match(/filename%3D([^&]+)/i) || url.match(/filename=([^&]+)/i) || [])[1] || '');
            await got.p.close().catch(() => {});
        }
        console.log(`[AUC] downloaded "${name}"`);
        return name;
    }

    // ── CAPP live page (/auction-requests/{id}/live) ─────────────────────────
    //
    // Mapped live 2026-09-29 on #1673: Close Auction · Live Auction Trend Graph
    // (Participant Progression / All Bid Progression / Best Bid/Saving Progress)
    // · Insights (Base Line, Best BID, Savings) · "Auction will Automatically
    // Ends after hh mm ss" · +5min … +30min, Custom Timer + ADD · "Auto BID
    // Extension Left N" · Supplier Bids per item · Supplier Information (rank,
    // name, bid value, status, actions: img ResetUser / RemoveUser / CommentIcon)
    // · Bid Logs (supplier, version, updated on, items updated, total, IP).

    async openLivePage(url) {
        await this.page.goto(url.replace(/\/?$/, '') + '/live', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.getByRole('button', { name: 'Close Auction' }).waitFor({ timeout: 60000 });
        await this.page.waitForTimeout(2500);
    }

    /** Structured read of the CAPP live page. */
    async readLivePage() {
        const t = (await this.page.locator('body').innerText()).split('\n').map(x => x.trim()).filter(Boolean);
        const after = (label, n = 1) => { const k = t.indexOf(label); return k === -1 ? null : t.slice(k + 1, k + 1 + n); };
        const endsIdx = t.findIndex(x => /Automatically Ends after/i.test(x));
        const ends = endsIdx === -1 ? null : t.slice(endsIdx + 1, endsIdx + 7).join(' ');
        const extLeft = Number((after('Auto BID Extension Left') || [])[0]);
        // These panels are NOT <table>s — parse them from the page text.
        //   Supplier Information: "# 1 | <name> | ₹ 1,750 | <status>" …  up to "Live Updates"
        //   Bid Logs: "+ | <supplier> | v1 | <date> | <items> | ₹ <total> [| <ip>]" … up to "Bid Value By Item"
        const between = (from, to) => {
            const i = t.indexOf(from), j = t.indexOf(to, i + 1);
            return i === -1 ? [] : t.slice(i + 1, j === -1 ? undefined : j);
        };
        const suppliers = [];
        const si = between('Supplier Information', 'Live Updates');
        for (let k = 0; k < si.length; k++) {
            // "# -" = unranked (e.g. a reset supplier)
            if (/^#\s*(\d+|-)$/.test(si[k])) suppliers.push([si[k], si[k + 1], si[k + 2], si[k + 3]]);
        }
        const bidLogs = [];
        const bl = between('Bid Logs', 'Bid Value By Item');
        for (let k = 0; k < bl.length; k++) {
            if (/^v\d+$/.test(bl[k])) bidLogs.push([bl[k - 1], bl[k], bl[k + 1], bl[k + 2], bl[k + 3]]);
        }
        const charts = await this.page.locator('canvas, svg.recharts-surface, .recharts-wrapper').count();
        return { text: t.join(' | '), ends, extLeft, suppliers, bidLogs, charts,
            baseLine: (after('Base Line') || [])[0], bestBid: (after('Best BID', 3) || []).join(' ') };
    }

    /** "hh hr mm min ss sec" countdown → seconds left (CAPP live page). */
    static secondsOf(ends) {
        const m = (ends || '').match(/(\d+)\D+(\d+)\D+(\d+)/);
        return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
    }

    async addAuctionTime(label) {
        await this.page.getByRole('button', { name: label, exact: true }).first().click();
        await this.page.waitForTimeout(1500);
        const pop = this.page.locator('.MuiPopover-paper, [role=dialog]').last();
        const yes = pop.getByRole('button', { name: /^(Yes|OK|Ok|Confirm)$/ }).last();
        if (await yes.isVisible({ timeout: 2500 }).catch(() => false)) await yes.click();
        await this.page.waitForTimeout(3000);
    }

    async addCustomTime(minutes) {
        const box = this.page.locator('xpath=//*[contains(normalize-space(.),"Custom Timer")]/following::input[1]').first();
        await box.fill(String(minutes));
        await this.page.getByRole('button', { name: 'ADD', exact: true }).click();
        await this.page.waitForTimeout(1500);
        const pop = this.page.locator('.MuiPopover-paper, [role=dialog]').last();
        const yes = pop.getByRole('button', { name: /^(Yes|OK|Ok|Confirm)$/ }).last();
        if (await yes.isVisible({ timeout: 2500 }).catch(() => false)) await yes.click();
        await this.page.waitForTimeout(3000);
    }

    /** Supplier Information row action by img alt (ResetUser / RemoveUser / CommentIcon). */
    async liveRowAction(supplier, alt) {
        const row = this.page.locator('tr', { hasText: supplier }).filter({ has: this.page.locator(`img[alt="${alt}"]`) }).first();
        await row.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await row.locator(`img[alt="${alt}"]`).first().click();
        await this.page.waitForTimeout(2000);
    }

    async resetSupplier(supplier) {
        await this.liveRowAction(supplier, 'ResetUser');
        // Confirmation, if any, can be an MUI popover/dialog or an antd popconfirm; the
        // reset may also apply straight away — the caller verifies the outcome.
        const overlay = this.page.locator('.ant-popover:visible, .ant-popconfirm:visible, .MuiPopover-paper:visible, [role=dialog]:visible, [role=tooltip]:visible').last();
        if (await overlay.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
            console.log(`[AUC] reset prompt: ${(await overlay.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 200)}`);
            const box = overlay.locator('textarea, input[type=text]').first();
            if (await box.count()) await box.fill('Reset by automation').catch(() => {});
            const ok = overlay.getByRole('button', { name: /^(Yes|OK|Ok|Confirm|Reset|Submit)$/ }).last();
            if (await ok.count()) await ok.click();
        } else {
            console.log('[AUC] reset: no confirmation shown');
        }
        await this.page.waitForTimeout(4000);
    }

    /**
     * CAPP Supplier Comments (row CommentIcon → "Supplier Comments" panel).
     * Mapped 2026-09-30: textarea[placeholder="Add a comment"] + button "Add Comment".
     * Enter does NOT send — an earlier version only typed and never posted.
     */
    async postSupplierComment(supplier, msg) {
        await this.liveRowAction(supplier, 'CommentIcon');
        const box = this.page.locator('textarea[placeholder="Add a comment"]').locator('visible=true').first();
        await box.waitFor({ state: 'visible', timeout: 15000 });
        await box.fill(msg);
        await this.page.getByRole('button', { name: 'Add Comment' }).locator('visible=true').first().click();
        await this.page.waitForTimeout(3000);
        // getByText does not match a textarea's value, so this only passes once POSTED
        await expect(this.page.getByText(msg).first(), 'the comment was not posted in CAPP').toBeVisible({ timeout: 15000 });
        await expect(box, 'the comment box did not clear after Add Comment').toHaveValue('');
    }

    /** Text of the Supplier Comments panel for `supplier` (opened from the CAPP live page). */
    async readSupplierComments(supplier) {
        await this.liveRowAction(supplier, 'CommentIcon');
        await this.page.locator('textarea[placeholder="Add a comment"]').locator('visible=true').first()
            .waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(2000);
        return (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    }

    async closeAuction() {
        await this.page.getByRole('button', { name: 'Close Auction' }).click();
        const pop = this.page.locator('.MuiPopover-paper', { hasText: 'Confirm to Close Auction' }).first();
        await pop.getByRole('button', { name: 'Yes' }).click();
        await expect(this.page.getByText('Auction Closed').first(), 'no "Auction Closed" after closing')
            .toBeVisible({ timeout: 30000 });
    }

    /** More → Update RFQ → "Are you sure you want to update the parent RFQ?" → Ok. */
    async updateRfq() {
        await this.page.getByRole('button', { name: /^More$/ }).first().click();
        await this.page.waitForTimeout(1200);
        await this.page.getByRole('menuitem', { name: 'Update RFQ' }).click();
        const dlg = this.page.getByRole('dialog').last();
        await expect(dlg).toContainText('update the parent RFQ', { timeout: 15000 });
        await dlg.getByRole('button', { name: /^Ok$/i }).click();
        await this.page.waitForTimeout(8000);
    }

}

// ── SAPP (supplier portal) ────────────────────────────────────────────────────
//
// Mapped live 2026-09-29. Auctions list at nse-sapp-uat…/auction-requests with
// tabs All · Pending Acceptance · Live Auctions; a row opens
// /auction-requests/{supplierAuctionId} (a DIFFERENT id per supplier). The view
// page shows the status chip beside the code (prebid-submitted / pending), a
// General Details block (Customer, Company, Purchaser, Subject, Frequency, Event
// Type, Auction Type, Supplier Name, Payment Terms), the Items grid with each
// line's Description and Status, and Notes & Attachments.
export const SAPP_URL = 'https://nse-sapp-uat.aerchain.io';

export class sappAuctionActions {

    constructor(page) { this.page = page; }

    static async login(browser, email, password = 'Test@123') {
        const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 }, acceptDownloads: true });
        const page = await ctx.newPage();
        // one retry — UAT occasionally drops the auth connection (ERR_CONNECTION_CLOSED)
        await page.goto('https://nse-auth-uat.aerchain.io/sapp/login', { timeout: 60000 })
            .catch(async () => { await page.waitForTimeout(5000); await page.goto('https://nse-auth-uat.aerchain.io/sapp/login', { timeout: 60000 }); });
        await page.fill('#email', email);
        await page.fill('#password', password);
        await page.click('button[type=submit]');
        await page.waitForURL(/nse-sapp-uat\.aerchain\.io/, { timeout: 60000 });
        await page.waitForTimeout(3000);
        return new sappAuctionActions(page);
    }

    async close() { await this.page.context().close(); }

    /** Open an auction from the SAPP list by its code. */
    async openAuction(code) {
        await this.page.goto(`${SAPP_URL}/auction-requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 60000 });
        await this.page.waitForTimeout(2000);
        const row = this.page.locator('tbody tr', { hasText: code }).first();
        await expect(row, `${code} is not in this supplier's auction list`).toBeVisible({ timeout: 30000 });
        const listed = (await row.innerText()).replace(/\s+/g, ' ').trim();
        await row.getByText(code, { exact: true }).first().click();
        await this.page.waitForURL(/\/auction-requests\/\d+/, { timeout: 60000 });
        await this.page.getByText('General Details').first().waitFor({ timeout: 60000 });
        await this.page.waitForTimeout(3000);
        return listed;
    }

    async body() { return (await this.page.locator('body').innerText()).replace(/\s+/g, ' '); }

    /** Status chip beside the code on the view page. */
    async readStatus(code) {
        const t = await this.page.locator('body').innerText();
        const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
        const i = lines.indexOf(code);
        return i === -1 ? null : lines[i + 1];
    }

    /** Items grid rows → [{ desc, status }] (ag-grid, read by row). */
    async readItems() {
        return this.page.evaluate(() => {
            const rows = [...document.querySelectorAll('.ag-center-cols-container .ag-row')];
            return rows.map(r => {
                const cells = [...r.querySelectorAll('.ag-cell')].map(c => (c.innerText || '').trim());
                return { cells };
            });
        });
    }

    // ── live bidding ──────────────────────────────────────────────────────────
    //
    // RFX quoter: view → "Join Live" → /live (update-bid page) directly.
    // New supplier: view → Accept → T&C dialog (checkbox + Accept) → status
    // "accepted" → Join Live → /bid "Bid Submission" (ag-grid "Enter Price"
    // cells) → Submit Bid → confirm "Submit Bid" → lands on /live.

    async acceptAuction() {
        // idempotent: an already-accepted auction offers Join Live (live) or Pre-Bid (before start)
        const next = this.page.getByRole('button', { name: /^(Join Live|Pre-Bid)$/ });
        if (await next.count()) return false;
        await this.page.getByRole('button', { name: 'Accept' }).first().click();
        const dlg = this.page.getByRole('dialog').last();
        await expect(dlg).toContainText('I accept the Terms', { timeout: 15000 });
        await dlg.locator('input[type=checkbox]').check({ force: true });
        await dlg.getByRole('button', { name: 'Accept' }).click();
        await expect(next.first()).toBeVisible({ timeout: 30000 });
        return true;
    }

    async regretAuction(reason = 'Regretted by automation') {
        await this.page.getByRole('button', { name: 'Reject' }).first().click();
        await this.page.waitForTimeout(1500);
        const dlg = this.page.getByRole('dialog').last();
        console.log(`[SAPP] reject dialog: ${(await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300)}`);
        const box = dlg.locator('textarea, input[type=text]').first();
        if (await box.isVisible({ timeout: 2000 }).catch(() => false)) await box.fill(reason);
        await dlg.getByRole('button', { name: /^(Reject|Submit|Yes|Confirm|OK|Regret)$/i }).last().click();
        await this.page.waitForTimeout(4000);
    }

    /** Join Live → returns 'live' (update-bid page) or 'bid' (first-time Bid Submission). */
    async joinLive() {
        await this.page.getByRole('button', { name: 'Join Live' }).click();
        await this.page.waitForURL(/\/(live|bid)$/, { timeout: 60000 });
        await this.page.waitForTimeout(4000);
        return /\/bid$/.test(this.page.url()) ? 'bid' : 'live';
    }

    /** First-time bid on /bid: one price per line, Submit Bid, confirm. */
    async submitFirstBid(prices, { prebid = false } = {}) {
        for (const v of prices) {
            const cell = this.page.locator('div.ag-grid-custom-placeholder', { hasText: 'Enter Price' }).first();
            await cell.evaluate(e => e.scrollIntoView({ block: 'center' }));
            await cell.dblclick();
            await this.page.waitForTimeout(500);
            await this.page.keyboard.type(String(v));
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(700);
        }
        // live: "Submit Bid" → lands on /live.  before start: "Submit Pre-bid" → stays off /live.
        await this.page.getByRole('button', { name: /^Submit (Bid|Pre-?bid)$/i }).last().click();
        // "Submit Bid — Please confirm to send the Bid! — Cancel · Confirm"
        const dlg = this.page.getByRole('dialog').last();
        if (await dlg.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
            console.log(`[SAPP] submit confirm: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 200)}`);
            await dlg.getByRole('button', { name: /^(Confirm|Submit|Yes|OK)$/i }).last().click();
        }
        if (prebid) {
            await this.page.waitForTimeout(6000);
        } else {
            await this.page.waitForURL(/\/live$/, { timeout: 60000 });
            await this.page.waitForTimeout(4000);
        }
    }

    /**
     * Update bid on /live. `bids` maps 0-based line → new price. Returns the
     * toast/alert text so callers can assert both success and rejection.
     */
    async updateBid(bids) {
        const inputs = this.page.locator('input[placeholder="Enter Bid"]');
        await expect(inputs.first()).toBeVisible({ timeout: 30000 });
        for (const [i, v] of Object.entries(bids)) {
            await inputs.nth(Number(i)).fill(String(v));
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(400);
        }
        const before = await this.page.$$eval('[role=alert], .MuiSnackbar-root, .Toastify__toast, .ant-message, .ant-notification',
            els => els.length);
        // A sticky snackbar (e.g. "Information — This is the final bid extension…") sits over
        // Update Bid and swallows the click (AUC-121). Clear toasts first; fall back to a DOM click.
        await this.page.evaluate(() => document.querySelectorAll('.MuiSnackbar-root').forEach(e => e.remove()));
        const upd = this.page.getByRole('button', { name: 'Update Bid' });
        await upd.click({ timeout: 8000 }).catch(() => upd.evaluate(b => b.click()));
        await this.page.waitForTimeout(3000);
        const dlg = this.page.getByRole('dialog').last();
        if (await dlg.isVisible({ timeout: 1000 }).catch(() => false)) {
            const ok = dlg.getByRole('button', { name: /^(Submit|Confirm|Yes|OK|Update Bid|Update)$/i }).last();
            if (await ok.isVisible({ timeout: 1000 }).catch(() => false)) { await ok.click(); await this.page.waitForTimeout(3000); }
        }
        const msgs = await this.page.$$eval('[role=alert], .MuiSnackbar-root, .Toastify__toast, .ant-message, .ant-notification, .MuiFormHelperText-root, .error, [class*=error]',
            els => els.map(e => (e.innerText || '').trim()).filter(Boolean));
        const msg = [...new Set(msgs)].join(' | ');
        console.log(`[SAPP] update bid ${JSON.stringify(bids)} → ${msg}`);
        // The bid that uses the LAST allowed extension answers with an Information toast
        // ("This is the final bid extension for this auction…") instead of "Bid Updated
        // Successfully!" — it is still an accepted bid.
        const ok = /Bid Updated Successfully|final bid extension/i.test(msg) && !/\bError\b/.test(msg);
        return { ok, msg };
    }

    /** Structured read of the SAPP /live page. */
    async readLive() {
        await this.page.waitForTimeout(1500);
        const t = (await this.page.locator('body').innerText()).split('\n').map(x => x.trim()).filter(Boolean);
        const after = (label) => { const k = t.indexOf(label); return k === -1 ? null : t[k + 1]; };
        const ranks = await this.page.evaluate(() => {
            const out = [];
            for (const r of document.querySelectorAll('tr, .ag-row')) {
                const tx = (r.innerText || '').replace(/\s+/g, ' ');
                const m = tx.match(/^\s*(\d+)\s.*?\b(\d+)(?:st|nd|rd|th)\b/);
                if (m && /Manpower|View All/.test(tx)) out.push({ line: Number(m[1]), rank: Number(m[2]), text: tx.slice(0, 200) });
            }
            return out;
        });
        const endsIdx = t.indexOf('Bid Ends In');
        return {
            bidRank: after('Bid Rank'), leadBid: after('Lead Bid'),
            ends: endsIdx === -1 ? null : t.slice(endsIdx + 1, endsIdx + 7).join(' '),
            grandTotal: after('Grand Total:'), itemRanks: ranks, text: t.join(' | '),
        };
    }


    /** Make sure this supplier is on its /live page (steps must not depend on an earlier, possibly skipped, step). */
    async ensureLive(code) {
        if (/\/live$/.test(this.page.url())) {
            await this.page.reload(); await this.page.waitForTimeout(4000);
            // a reset supplier is bounced from /live back to the view page — re-check
            if (/\/live$/.test(this.page.url()) && await this.page.locator('input[placeholder="Enter Bid"]').count()) return 'live';
        }
        await this.openAuction(code);
        if (await this.page.getByRole('button', { name: 'Accept' }).count()) return 'not-accepted';
        return this.joinLive();
    }


    /**
     * SAPP comments: on the auction VIEW page, the textless header button right
     * of "Create Ticket" (no hover text) opens a "Comments | n | Add Reply" panel.
     */
    async openComments(code) {
        await this.openAuction(code);
        const idx = await this.page.evaluate(() => {
            const all = [...document.querySelectorAll('button')].map((b, i) => ({ i, r: b.getBoundingClientRect(), t: (b.innerText || '').trim() }))
                .filter(x => x.r.width > 0 && x.r.top < 140 && x.r.top > 60);
            const ct = all.find(x => /Create Ticket/.test(x.t));
            if (!ct) return -1;
            const next = all.filter(x => !x.t && x.r.left > ct.r.right - 2).sort((a, b) => a.r.left - b.r.left)[0];
            return next ? next.i : -1;
        });
        if (idx === -1) throw new Error('[SAPP] comments button (right of Create Ticket) not found');
        await this.page.locator('button').nth(idx).click();
        await this.page.getByText('Comments', { exact: true }).last().waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(2500);
        return (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    }

    /** Reply from the SAPP comments panel (panel must be open). */
    async replyComment(msg) {
        const ed = this.page.locator('[contenteditable=true]').locator('visible=true').last();
        await ed.click();
        await this.page.keyboard.type(msg);
        await this.page.waitForTimeout(500);
        const send = this.page.getByRole('button', { name: /^(Add Reply|Reply|Send|Submit|Post)$/i }).locator('visible=true').last();
        if (await send.count()) await send.click(); else await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(3000);
        const t = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
        console.log(`[SAPP] after reply: ${t.slice(-400)}`);
        return t;
    }

}
