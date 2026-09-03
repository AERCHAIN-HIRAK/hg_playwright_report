import { expect } from '@playwright/test';
import { v3Detail_Locators as L } from './v3DetailLocators';
import { v3Listing_Locators as LL } from './v3ListingLocators';
import fs from 'fs';

export const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// ─────────────────────────────────────────────────────────────────────────────
// v3DetailActions
//
// Shared actions for the v3 transaction detail pages (Requisition, PRC,
// Purchase Order, GRN/Inwards, Invoice). These pages share one header + "More"
// dropdown component, so document and reassignment behaviour is identical
// across modules apart from a couple of menu-label differences.
// ─────────────────────────────────────────────────────────────────────────────

export class v3DetailActions {

    constructor(page, moduleCfg) {
        this.page = page;
        this.module = moduleCfg;
        fs.mkdirSync('screenshots', { recursive: true });
        fs.mkdirSync('downloads', { recursive: true });
    }

    async takeScreenshot(name) {
        await this.page.screenshot({
            path: `screenshots/v3detail_${this.module.slug}_${name}_${Date.now()}.png`,
            fullPage: true,
        });
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Open the first transaction on this module's listing and return its code.
     * Preferred over a hardcoded id so the suite survives UAT data churn.
     */
    async openFirstTransactionFromListing(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(800);
        const code = ((await this.page.locator(LL.firstRowCodeLink).first().innerText()) || '').trim();
        await this.page.locator(LL.firstRowCodeLink).first().click();
        await this.waitForDetailLoaded();
        return code;
    }

    /**
     * Open the first transaction whose Status column matches one of `statuses`.
     * Returns null when the visible page holds no such row — callers should
     * skip rather than fail, since UAT data is not guaranteed to contain one.
     */
    async openFirstTransactionWithStatus(statuses, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(800);

        const rowIndex = await this.page.evaluate((wanted) => {
            const ths = [...document.querySelectorAll('th')];
            const si = ths.findIndex(t => (t.textContent || '').trim().startsWith('Status'));
            if (si === -1) return -1;
            const rows = [...document.querySelectorAll('tbody tr')];
            return rows.findIndex(r => {
                const c = r.querySelectorAll('td')[si];
                return c && wanted.includes((c.textContent || '').trim());
            });
        }, statuses);

        if (rowIndex === -1) return null;

        const link = this.page.locator(LL.tableRows).nth(rowIndex).locator('td').first().locator('a').first();
        const code = ((await link.innerText()) || '').trim();
        await link.click();
        await this.waitForDetailLoaded();
        return code;
    }

    /**
     * Open the first transaction whose `header` column equals `value`.
     *
     * Needed because some relationships are only visible on transactions of a
     * particular provenance: a Requisition raised from an Intake carries
     * Source = "intakes" and shows an Intake link, while one raised from an
     * award carries Source = "awards" and does not.
     *
     * Returns null when no visible row matches — callers should skip, since
     * UAT data is not guaranteed to contain one.
     */
    async openFirstTransactionWithColumnValue(header, value, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(800);

        const rowIndex = await this.page.evaluate(({ header, value }) => {
            const ths = [...document.querySelectorAll('th')];
            const ci = ths.findIndex(t => (t.textContent || '').trim().startsWith(header));
            if (ci === -1) return -1;
            const rows = [...document.querySelectorAll('tbody tr')];
            return rows.findIndex(r => {
                const c = r.querySelectorAll('td')[ci];
                return c && (c.textContent || '').trim().toLowerCase() === value.toLowerCase();
            });
        }, { header, value });

        if (rowIndex === -1) return null;

        const link = this.page.locator(LL.tableRows).nth(rowIndex).locator('td').first().locator('a').first();
        const code = ((await link.innerText()) || '').trim();
        await link.click();
        await this.waitForDetailLoaded();
        return code;
    }

    /** Every listing row whose Status column matches one of `statuses`. */
    async listTransactionsWithStatus(statuses, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(800);
        return this.page.evaluate((wanted) => {
            const ths = [...document.querySelectorAll('th')];
            const si = ths.findIndex(t => (t.textContent || '').trim().startsWith('Status'));
            if (si === -1) return [];
            const out = [];
            for (const r of [...document.querySelectorAll('tbody tr')]) {
                const tds = r.querySelectorAll('td');
                const st = ((tds[si] || {}).textContent || '').trim();
                const a = r.querySelector('a');
                if (wanted.includes(st) && a) {
                    out.push({ code: ((tds[0] || {}).textContent || '').trim(), href: a.getAttribute('href'), status: st });
                }
            }
            return out;
        }, statuses);
    }

    async waitForDetailLoaded() {
        await expect(this.page.locator(L.moreButton).first())
            .toBeVisible({ timeout: 30000 });
        await this.page.waitForTimeout(1200);
    }

    // ── "More" dropdown ───────────────────────────────────────────────────────

    /**
     * Locators for menu items must be scoped to VISIBLE nodes.
     *
     * The Purchase Order detail page keeps an unrelated MUI menu ("Save" /
     * "Create New") permanently mounted with visibility:hidden. An unscoped
     * `li[role=menuitem]` therefore resolves to that hidden node, and waiting
     * for it to become visible can never succeed — which is exactly how the
     * PO document + reassign tests failed on 2026-08-31.
     */
    _visibleMenuItems() {
        return this.page.locator('li[role="menuitem"]').locator('visible=true');
    }

    _menuItemByLabel(label) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this._visibleMenuItems().filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) });
    }

    /**
     * Idempotent: returns immediately if the dropdown is already open.
     *
     * Opens via getByRole rather than the XPath. Both resolve the same single
     * button, but the role locator waits for actionability, and an XPath click
     * fired too early opened a PARTIALLY POPULATED menu — only Clone / Reassign
     * User / Regenerate Document, with the data-dependent GRN / Invoice /
     * Request Advance entries missing. That looked identical to a Completed PO
     * and produced a false failure (2026-08-31).
     */
    async openMoreMenu() {
        if (await this._visibleMenuItems().count() > 0) return;
        const byRole = this.page.getByRole('button', { name: 'More' }).first();
        if (await byRole.count() > 0) {
            await byRole.click();
        } else {
            await this.page.locator(L.moreButton).first().click();
        }
        await expect(this._visibleMenuItems().first()).toBeVisible({ timeout: 15000 });
        await this.page.waitForTimeout(800);
    }

    /** Close and WAIT for the menu to actually go away, not just fire Escape. */
    async closeMenu() {
        if (await this._visibleMenuItems().count() === 0) return;
        await this.page.keyboard.press('Escape');
        for (let i = 0; i < 20; i++) {
            if (await this._visibleMenuItems().count() === 0) return;
            if (i === 5) await this.page.mouse.click(5, 5);
            await this.page.waitForTimeout(300);
        }
    }

    async getMoreMenuItems() {
        await this.openMoreMenu();
        const items = this._visibleMenuItems();
        const n = await items.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await items.nth(i).innerText()) || '').trim());
        return out;
    }

    /**
     * Read the menu, retrying until `expected` items are present or time runs out.
     *
     * The PO menu fills in progressively: Clone / Reassign User / Regenerate
     * Document render immediately, while GRN / Invoice / Request Advance appear
     * a beat later once the PO's data resolves. Reading once, right after the
     * More button becomes visible, catches only the first three — which looked
     * exactly like a Completed PO and produced a false failure (2026-08-31).
     */
    async getMoreMenuItemsSettled(expected = [], timeout = 20000) {
        const deadline = Date.now() + timeout;
        let items = [];
        for (;;) {
            items = await this.getMoreMenuItems();
            const haveAll = expected.every(e => items.includes(e));
            if (haveAll || Date.now() > deadline) break;
            await this.closeMenu();
            await this.page.waitForTimeout(1500);
        }
        return items;
    }

    async hasMenuItem(label) {
        const items = await this.getMoreMenuItems();
        await this.closeMenu();
        return items.includes(label);
    }

    async clickMenuItem(label) {
        const item = this._menuItemByLabel(label).first();
        await item.waitFor({ state: 'visible', timeout: 15000 });
        await item.scrollIntoViewIfNeeded().catch(() => {});
        await item.click({ timeout: 15000 });
    }


    // ── PRC / Requisition Conversion View ─────────────────────────────────────

    /**
     * Open a PRC by walking its parent Requisition: Transactions tab →
     * Conversions → the PRC-… link.
     *
     * A PRC has no listing and no URL of its own — the conversion view renders
     * IN PLACE, so `page.url()` still reads /requisitions/{id} afterwards and
     * the header shows the PARENT PR's code with a "Converted" chip. The only
     * proof the view actually opened is its own section heading, which is what
     * this asserts.
     *
     * Returns the PRC code read off the link before clicking it (it is not
     * displayed in the header once open).
     */
    async openPrcConversionView(requisitionId, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/requisitions/${requisitionId}`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(7000);

        await this.page.locator(L.prcTransactionsTab).first().click();
        await this.page.waitForTimeout(3500);

        const conversions = this.page.locator(L.prcConversionsSection).first();
        if (await conversions.count()) {
            await conversions.scrollIntoViewIfNeeded();
            await conversions.click();
            await this.page.waitForTimeout(2000);
        }

        const link = this.page.locator(L.prcCodeLink).last();
        if (!(await link.count())) return null;
        const code = ((await link.textContent()) || '').trim();
        await link.click();

        await expect(this.page.locator(L.prcConversionViewHeading).first(),
            'the Requisition Conversion View did not open')
            .toBeVisible({ timeout: 30000 });
        await this.page.waitForTimeout(2500);
        console.log(`[PRC] opened ${code} (conversion view of requisition ${requisitionId})`);
        return code;
    }

    /**
     * Find a Completed/Converted requisition that actually HAS a PRC, and open
     * it. Returns { requisitionId, prcCode } or null.
     *
     * Not every PR converts, so this walks the listing rather than trusting one
     * hardcoded id to survive UAT data churn.
     */
    async openAnyPrcConversionView(baseUrl = V3_BASE_URL, maxCandidates = 5) {
        await this.page.goto(`${baseUrl}/requisitions`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(7000);

        const headers = await this.page.$$eval('thead th',
            ths => ths.map(t => (t.innerText || '').trim()));
        const iStatus = headers.indexOf('Status');

        const candidates = await this.page.$$eval('tbody tr', (trs, iStatus) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            return {
                id: (href.match(/\/requisitions\/(\d+)/) || [])[1] || null,
                code: (tds[0]?.innerText || '').trim(),
                status: iStatus >= 0 ? (tds[iStatus]?.innerText || '').trim() : '',
            };
        }).filter(r => r.id && /completed|converted|processed/i.test(r.status)), iStatus);

        for (const c of candidates.slice(0, maxCandidates)) {
            const prcCode = await this.openPrcConversionView(c.id, baseUrl);
            if (prcCode) return { requisitionId: c.id, prcCode, requisitionCode: c.code };
            console.log(`[PRC] requisition ${c.code} has no PRC conversion — trying the next`);
        }
        return null;
    }


    // ── GRN match state (sheet scenarios 67, 68) ──────────────────────────────

    /**
     * Read the GRN (Inwards) listing with each row's MATCH state.
     *
     * The listing's "Matched" column renders an ICON and no text at all —
     * `<span class="progress-completed">` when the GRN is fully matched to an
     * invoice, `<span class="progress-pending">` when it is not. Reading that
     * column with innerText returns '' for every row, which is why a first pass
     * concluded "no GRN is matched" when several were.
     *
     * Returns [{ id, code, status, matched: 'completed'|'pending'|'', invoice }].
     */
    async listGrnsWithMatchState(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/inwards`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // WAIT FOR ROWS, not a fixed delay. A blind 10s wait returned ZERO rows
        // on one run of two (the charts + ~19 columns make this listing slow),
        // and an empty read looks exactly like "no matched GRN exists" — the
        // test then skipped for the wrong reason.
        await this.page.locator('tbody tr').first()
            .waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(3000);

        const headers = await this.page.$$eval('thead th',
            ths => ths.map(t => (t.innerText || '').trim()));
        const idx = {
            status: headers.indexOf('Status'),
            matched: headers.indexOf('Matched'),
            invoice: headers.indexOf('INV Code'),
        };

        const rows = await this.page.$$eval('tbody tr', (trs, idx) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            const matchCell = tds[idx.matched];
            let matched = '';
            if (matchCell) {
                if (matchCell.querySelector('.progress-completed')) matched = 'completed';
                else if (matchCell.querySelector('.progress-pending')) matched = 'pending';
            }
            const invoice = (tds[idx.invoice]?.innerText || '').trim();
            return {
                id: (href.match(/\/inwards\/(\d+)/) || [])[1] || null,
                code: (tds[0]?.innerText || '').trim(),
                status: idx.status >= 0 ? (tds[idx.status]?.innerText || '').trim() : '',
                matched,
                invoice: invoice === '-' ? '' : invoice,
            };
        }).filter(r => r.id), idx);

        console.log(`[GRN] ${rows.length} row(s); matched=completed: ` +
            rows.filter(r => r.matched === 'completed').map(r => r.code).join(', '));
        return rows;
    }

    /** Open a GRN and report which header actions it offers. */
    async readGrnActions(id, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/inwards/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(9000);
        const buttons = await this.page.$$eval('button', els => els
            .filter(e => e.getBoundingClientRect().width > 0)
            .map(e => ({
                label: (e.innerText || '').trim(),
                disabled: e.disabled || e.getAttribute('aria-disabled') === 'true',
            }))
            .filter(b => b.label));
        const menu = await this.getMoreMenuItems().catch(() => []);
        await this.closeMenu().catch(() => {});

        // The listing's "INV Code" column is EMPTY even for a matched GRN
        // (verified: every row read '-' while 12 rows carried the
        // progress-completed match icon). The invoice linkage is only visible on
        // the GRN's own page, so it is read here rather than from the listing.
        const invoiceCodes = await this.page.$$eval('*', els => Array.from(new Set(els
            .filter(e => e.children.length === 0 && /^INV-/.test((e.textContent || '').trim()))
            .map(e => (e.textContent || '').trim()))));

        console.log(`[GRN] ${id} buttons: ${buttons.map(b => b.label + (b.disabled ? '(disabled)' : '')).join(' · ')}` +
            ` | More: ${menu.join(' · ')} | invoices: ${invoiceCodes.join(', ') || 'none'}`);
        return { buttons, menu, invoiceCodes };
    }

    /** Cancel is a TOP-LEVEL button on a GRN, not a More-menu item. */
    grnCanBeCancelled({ buttons, menu }) {
        const btn = buttons.find(b => /^Cancel$/i.test(b.label));
        if (btn) return !btn.disabled;
        return menu.some(m => /^Cancel$/i.test(m));
    }


    // ── Attachments (sheet scenario 91) ───────────────────────────────────────

    /**
     * Attachment file links on the open transaction.
     *
     * They are anchors with NO href, NO download attribute and NO target — the
     * navigation is JS-driven — so they can only be recognised by the FILENAME
     * in their text. A locator keyed on href would find nothing.
     */
    async findAttachmentLinks() {
        return this.page.$$eval('a', els => els
            .filter(e => e.getBoundingClientRect().width > 0)
            .map(e => (e.innerText || '').trim())
            .filter(t => /\.(pdf|png|jpe?g|xlsx?|docx?|csv|txt)$/i.test(t)));
    }

    /**
     * Click an attachment and verify the file is actually served.
     *
     * It does NOT fire a Playwright download event — clicking opens a NEW TAB at
     * a presigned S3 URL, so waiting on `page.waitForEvent('download')` times out
     * and looks like a broken feature. Capture the popup, then fetch the URL to
     * prove real bytes come back rather than a 403 on an expired signature.
     */
    async openAttachmentAndVerify(filename) {
        const link = this.page.locator('a', { hasText: filename }).first();
        await expect(link, `attachment "${filename}" is not on the page`).toBeVisible({ timeout: 15000 });

        const [popup] = await Promise.all([
            this.page.context().waitForEvent('page', { timeout: 25000 }),
            link.click(),
        ]);
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        const url = popup.url();

        const res = await this.page.context().request.get(url);
        const body = await res.body();
        await popup.close().catch(() => {});

        const out = {
            url,
            status: res.status(),
            bytes: body.length,
            contentType: res.headers()['content-type'] || '',
        };
        console.log(`[ATTACH] ${filename} → ${out.status} ${out.bytes}B ${out.contentType}`);
        return out;
    }

    /**
     * Walk the first `max` transactions on this module's listing until one is
     * found that carries an attachment. Returns { code, attachments } or null.
     */
    async findTransactionWithAttachment(baseUrl = V3_BASE_URL, max = 4) {
        await this.page.goto(`${baseUrl}/${this.module.slug}`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(2500);

        const rows = await this.page.$$eval('tbody tr', trs => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            return {
                href: tds[0]?.querySelector('a')?.getAttribute('href') || '',
                code: (tds[0]?.innerText || '').trim(),
            };
        }).filter(r => r.href));

        for (const row of rows.slice(0, max)) {
            await this.page.goto(`${baseUrl}${row.href}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await this.page.locator('xpath=//button[normalize-space()="Overview"]').first()
                .waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
            await this.page.waitForTimeout(5000);
            const attachments = await this.findAttachmentLinks();
            if (attachments.length) {
                console.log(`[ATTACH] ${this.module.name} ${row.code} has: ${attachments.join(', ')}`);
                return { code: row.code, attachments };
            }
        }
        console.log(`[ATTACH] ${this.module.name}: none of the first ${max} transactions carry an attachment`);
        return null;
    }

    // ── Documents ─────────────────────────────────────────────────────────────

    /**
     * Regenerate produces no toast — the only reliable signal is the POST it
     * fires, so assert on that response instead of racing a UI element that
     * never appears.
     *
     * The path is NOT uniform across modules (verified live 2026-08-31):
     *   Requisition  → /requisitions/v2/{id}/regenerate-document
     *   PurchaseOrder→ /purchase-orders/v2/{id}/regenerate-po-document
     * hence the `regenerate[a-z-]*document` pattern rather than a literal.
     */
    async regenerateDocumentAndAssert() {
        await this.openMoreMenu();
        const [response] = await Promise.all([
            this.page.waitForResponse(
                r => /regenerate[a-z-]*document/i.test(r.url()) && r.request().method() === 'POST',
                { timeout: 30000 },
            ),
            this.clickMenuItem(L.menu_RegenerateDocument),
        ]);
        expect(response.ok(), `regenerate-document returned ${response.status()}`).toBeTruthy();
        await this.page.waitForTimeout(2000);
        return response;
    }

    /** Menu label differs per module: "Download" vs "Download Document". */
    async _downloadLabel() {
        const items = await this.getMoreMenuItems();
        await this.closeMenu();
        if (items.includes(L.menu_DownloadDocument)) return L.menu_DownloadDocument;
        if (items.includes(L.menu_Download)) return L.menu_Download;
        return null;
    }

    /**
     * "Download" does NOT fire a browser download event in this build — it opens
     * the generated PDF in a NEW TAB via an S3 presigned URL (verified live
     * 2026-08-31 on a Requisition). Some modules could still stream a real
     * download, so both outcomes are raced and whichever lands first is used.
     */
    async downloadDocumentAndAssert() {
        const label = await this._downloadLabel();
        if (!label) return null;

        const context = this.page.context();
        const popupPromise = context.waitForEvent('page', { timeout: 30000 })
            .then(p => ({ kind: 'tab', page: p }))
            .catch(() => null);
        const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 })
            .then(d => ({ kind: 'download', download: d }))
            .catch(() => null);

        await this.openMoreMenu();
        await this.clickMenuItem(label);

        const result = await Promise.race([
            popupPromise,
            downloadPromise,
            new Promise(r => setTimeout(() => r(null), 32000)),
        ]);

        expect(result, `"${label}" produced neither a new tab nor a download`).not.toBeNull();

        if (result.kind === 'download') {
            const name = result.download.suggestedFilename();
            const target = `downloads/${this.module.slug}_${Date.now()}_${name}`;
            await result.download.saveAs(target);
            const size = fs.statSync(target).size;
            expect(size, 'downloaded document is empty').toBeGreaterThan(0);
            return { via: 'download', name, path: target, size };
        }

        // New-tab case: the tab URL is the document itself. Fetch it through the
        // browser's request context so the assertion covers the real bytes, not
        // just that a tab opened.
        const popup = result.page;
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        const url = popup.url();
        expect(url, 'document tab opened with no URL').toBeTruthy();
        expect(url, `document URL does not look like a file: ${url}`).toMatch(/\.pdf|response-content-disposition/i);

        const res = await context.request.get(url);
        expect(res.ok(), `document URL returned ${res.status()}`).toBeTruthy();
        const body = await res.body();
        expect(body.length, 'document is empty').toBeGreaterThan(0);

        await popup.close().catch(() => {});
        const name = decodeURIComponent(url.split('filename%3D').pop() || url.split('/').pop()).split('?')[0];
        return { via: 'tab', name, url, size: body.length };
    }

    // ── Reassign ──────────────────────────────────────────────────────────────

    async openReassignUserDialog() {
        await this.openMoreMenu();
        await this.clickMenuItem(L.menu_ReassignUser);
        await expect(this.page.locator(L.dialog).first()).toBeVisible({ timeout: 15000 });
    }

    /**
     * True when the dialog reports no eligible reassignment targets — a valid
     * app state for Completed/Cancelled transactions, not a test failure.
     */
    async reassignHasNoCandidates() {
        return (await this.page.locator(L.reassignNoUsers).count()) > 0;
    }

    async closeDialog() {
        const cancel = this.page.locator(L.dialogCancel).first();
        if (await cancel.count() > 0) await cancel.click();
        else await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(600);
    }

    async assertDialogTitled(text) {
        const dlg = this.page.locator(L.dialog).first();
        await expect(dlg).toContainText(text, { timeout: 10000 });
    }

    // ── Back navigation (sheet scenario 60) ───────────────────────────────────

    /** In-app back arrow (not browser back) — returns to the module listing. */
    async clickBackArrow() {
        await this.page.locator(L.backArrow).first().click();
        await this.page.waitForTimeout(3000);
    }

    async assertOnListing() {
        await expect(this.page).toHaveURL(
            new RegExp(`/${this.module.slug}(\\?|$|#)`),
            { timeout: 15000 },
        );
    }

    // ── Cross-transaction links (sheet scenarios 52-55) ───────────────────────

    /** Text of every blue "go to related transaction" link on the page. */
    async getBlueLinkTexts() {
        return this.page.evaluate(() => {
            const out = [];
            document.querySelectorAll('*').forEach(e => {
                if (e.children.length !== 0) return;
                const st = e.getAttribute('style') || '';
                if (!/cursor: pointer/.test(st)) return;
                if (!/rgb\(24, 144, 255\)|rgb\(51, 136, 235\)/.test(st)) return;
                const t = (e.textContent || '').trim();
                if (t) out.push(t);
            });
            return [...new Set(out)];
        });
    }

    /**
     * Wait for a blue cross-transaction link to render.
     *
     * The General Details section paints AFTER the More button, so reading
     * getBlueLinkTexts() straight after waitForDetailLoaded() can return an
     * empty list on a page that does have the link.
     */
    async waitForBlueLink(text, timeout = 30000) {
        await expect(this.page.locator(L.blueLink(text)).first())
            .toBeVisible({ timeout });
    }

    /**
     * Click a blue link that opens a related transaction. These consistently
     * open in a NEW TAB, so the new page is returned for assertion and the
     * caller is responsible for closing it.
     */
    async clickBlueLinkExpectingNewTab(text) {
        const context = this.page.context();
        const [popup] = await Promise.all([
            context.waitForEvent('page', { timeout: 30000 }),
            this.page.locator(L.blueLink(text)).first().click(),
        ]);
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        await popup.waitForTimeout(2000);
        return popup;
    }

    // ── Line items ────────────────────────────────────────────────────────────

    /**
     * Number of LOGICAL line items. ag-Grid duplicates each row across its
     * pinned/center containers, so this counts only the center container.
     */
    async getLineItemRowCount() {
        await this.page.locator(L.lineItemGrid).first()
            .waitFor({ state: 'visible', timeout: 20000 });
        return this.page.locator(L.lineItemRows).count();
    }

    async getLineItemProductNames() {
        const cells = this.page.locator(L.lineItemProductCell);
        const n = await cells.count();
        const out = [];
        for (let i = 0; i < n; i++) out.push(((await cells.nth(i).innerText()) || '').trim());
        return out.filter(Boolean);
    }

    // ── Budget (BRF) link ─────────────────────────────────────────────────────

    /**
     * Click the budget link in the General Details section and read the drawer
     * it opens.
     *
     * Unlike the cross-transaction blue links, this one is a real <a> WITHOUT
     * an href and it does NOT open a new tab — it opens the same right-side MUI
     * drawer used for line-item details, in place.
     */
    async openBudgetDrawer(linkTextFragment) {
        const link = this.page.locator(L.anchorContaining(linkTextFragment)).first();
        await expect(link).toBeVisible({ timeout: 20000 });
        const label = await this.budgetLinkLabel(linkTextFragment);
        await link.click();

        const paper = this.page.locator(L.itemDetailsPaper)
            .filter({ hasText: /Details/ }).locator('visible=true').first();
        await expect(paper).toBeVisible({ timeout: 20000 });
        await this.page.waitForTimeout(1200);

        const text = ((await paper.innerText()) || '').replace(/\s+/g, ' ').trim();
        return { label, text };
    }

    /** The field label the budget link sits under, e.g. "BRF - Description". */
    async budgetLinkLabel(linkTextFragment) {
        return this.page.evaluate((frag) => {
            const a = [...document.querySelectorAll('a')]
                .find(e => (e.textContent || '').includes(frag));
            if (!a) return null;
            let n = a.parentElement;
            for (let i = 0; i < 5 && n; i++) {
                const p = n.previousElementSibling;
                if (p && (p.innerText || '').trim()) return (p.innerText || '').trim();
                n = n.parentElement;
            }
            return null;
        }, linkTextFragment);
    }

    // ── PO Short Close (sheet scenarios 65, 66) ───────────────────────────────
    //
    // Available on a PO that is still In-progress, i.e. partially received.
    // The dialog is an ag-Grid of line items with checkboxes plus a MANDATORY
    // "Reason for short close" textarea; the confirm button is "Short close".

    async hasShortCloseButton() {
        return (await this.page.getByRole('button', { name: /^Short Close$/i }).count()) > 0;
    }

    /**
     * Short close the open PO. Returns the HTTP status of the request, or null
     * if none was observed.
     *
     * NOTE: this is DESTRUCTIVE — it consumes a partially-received PO.
     */
    async shortClosePo(reason = 'Short closed by automation') {
        await this.page.getByRole('button', { name: /^Short Close$/i }).first().click();

        const dialog = this.page.locator('.MuiDialog-paper, [role=dialog]')
            .locator('visible=true').first();
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await this.page.waitForTimeout(1500);

        // Tick the line items. Only some ag-Grid checkboxes are visible (the
        // grid keeps offscreen copies), so drive the visible ones only.
        const boxes = dialog.locator('input[type=checkbox]').locator('visible=true');
        const n = await boxes.count();
        for (let i = 0; i < n; i++) {
            if (!(await boxes.nth(i).isChecked().catch(() => true))) {
                await boxes.nth(i).check({ force: true, timeout: 10000 }).catch(() => {});
                await this.page.waitForTimeout(500);
            }
        }

        // The reason is mandatory — fill the first EMPTY visible textarea.
        const areas = dialog.locator('textarea').locator('visible=true');
        const an = await areas.count();
        for (let i = 0; i < an; i++) {
            if (((await areas.nth(i).inputValue().catch(() => 'x')) || '') === '') {
                await areas.nth(i).fill(reason);
                break;
            }
        }
        await this.page.waitForTimeout(800);

        const resp = this.page.waitForResponse(
            r => /short-close|shortclose/i.test(r.url()) && r.request().method() !== 'GET',
            { timeout: 60000 },
        ).catch(() => null);

        await dialog.getByRole('button', { name: /^Short close$/i }).first()
            .click({ timeout: 20000 });
        const r = await resp;
        await this.page.waitForTimeout(4000);
        return r ? r.status() : null;
    }

    /**
     * Total "Short Closed Qty" across the PO's line items.
     *
     * This — NOT the header status — is what proves a short close landed.
     * Verified on PO-NSEFN-26-209: ordered 20, inward 18, short close closed
     * the remaining 2 and `line_items_short_close_qty` became "2", while the
     * header and the line both still read "In-progress". Asserting on the
     * header status would report a working feature as broken.
     */
    async getShortClosedQty() {
        return this.page.evaluate(() => {
            let total = 0;
            document.querySelectorAll('.ag-center-cols-container div.ag-row')
                .forEach(r => {
                    const c = r.querySelector('[col-id="line_items_short_close_qty"]');
                    const v = parseFloat(((c || {}).textContent || '').trim());
                    if (!isNaN(v)) total += v;
                });
            return total;
        });
    }

    /** The status shown in the PO detail header. */
    async readHeaderStatus() {
        return this.page.evaluate(() => {
            const t = (document.body.innerText || '').replace(/\s+/g, ' ');
            const m = t.match(/(In-progress|In Progress|Short Closed|Short-closed|Completed|Cancelled|Submitted|Pending-approval)/i);
            return m ? m[0] : '';
        });
    }
}
