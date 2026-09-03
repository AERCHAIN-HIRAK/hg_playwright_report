import { expect } from '@playwright/test';
import { reports_Locators as L } from './reportsLocators';

const V3_BASE = 'https://nse-capp-uat.aerchain.io';

/**
 * Reports module + Email Report Logs.
 *
 * Behaviour verified live on UAT 2026-09-01 (PR Ageing Report, /reports/146):
 *   Generate Report → GET …/reports/<slug>?startDate&endDate&isPivot=1
 *   Send Mail       → GET …/reports/<slug>?startDate&endDate&sendEmailToUser=1
 *   The send is then recorded in /email-report-logs, whose Status moves
 *   "pending" → "success" (roughly 45s) and whose Report URL column turns from
 *   empty into a Download link to S3. Older rows show "Link Expired", so a
 *   freshly-sent row is the only one that can be downloaded.
 */
export class reportsActions {

    constructor(page, baseUrl = V3_BASE) {
        this.page = page;
        this.baseUrl = baseUrl;
    }

    async openReport(name) {
        await this.page.goto(`${this.baseUrl}/reports`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(2500);
        // getByText, not an xpath — `//*[normalize-space()="…"]` also matches
        // every ancestor whose only text is the report name, and .first()
        // then lands on a container that is not the clickable item.
        await this.page.getByText(name, { exact: true }).first().click();
        await expect(this.page.locator(L.generateButton).first())
            .toBeVisible({ timeout: 30000 });
        await this.page.waitForTimeout(1500);
        return this.page.url();
    }

    /**
     * Set the range to the last `months` months, ending today.
     * Inputs accept a typed yyyy/mm/dd and commit on Enter.
     */
    async setDateRangeMonths(months = 3) {
        const end = new Date();
        const start = new Date(end);
        start.setMonth(start.getMonth() - months);

        const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

        for (const [sel, value] of [[L.startDate, fmt(start)], [L.endDate, fmt(end)]]) {
            const input = this.page.locator(sel).first();
            await input.click();
            await this.page.waitForTimeout(400);
            await input.fill(value);
            await this.page.waitForTimeout(400);
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(800);
        }

        return {
            start: await this.page.locator(L.startDate).first().inputValue(),
            end: await this.page.locator(L.endDate).first().inputValue(),
        };
    }

    /** Generate and return the number of result rows rendered. */
    async generateAndCountRows() {
        const resp = this.page.waitForResponse(
            r => /\/api\/capp\/reports\/.+isPivot=1/.test(r.url()),
            { timeout: 90000 },
        ).catch(() => null);

        await this.page.locator(L.generateButton).first().click();
        await resp;
        await this.page.waitForTimeout(3000);
        return this.page.locator(L.resultRows).count();
    }

    /**
     * Click Download and report what came back. Like the PO document, this may
     * arrive as a browser download OR as a new tab holding an S3 URL.
     */
    async downloadReport() {
        const context = this.page.context();
        const popupP = context.waitForEvent('page', { timeout: 45000 })
            .then(p => ({ kind: 'tab', page: p })).catch(() => null);
        const dlP = this.page.waitForEvent('download', { timeout: 45000 })
            .then(d => ({ kind: 'download', download: d })).catch(() => null);

        await this.page.locator(L.downloadButton).first().click();

        const result = await Promise.race([
            popupP, dlP, new Promise(r => setTimeout(() => r(null), 47000)),
        ]);

        if (result && result.kind === 'download') {
            return { kind: 'download', name: result.download.suggestedFilename() };
        }
        if (result && result.kind === 'tab') {
            await result.page.waitForLoadState('domcontentloaded').catch(() => {});
            const url = result.page.url();
            await result.page.close().catch(() => {});
            return { kind: 'tab', url };
        }
        return null;
    }

    /** Click Send Mail; returns the HTTP status of the send request. */
    async sendMail() {
        const resp = this.page.waitForResponse(
            r => /sendEmailToUser=1/.test(r.url()),
            { timeout: 60000 },
        );
        await this.page.locator(L.sendMailButton).first().click();
        const r = await resp;
        await this.page.waitForTimeout(1500);
        return r.status();
    }

    // ── Email Report Logs ─────────────────────────────────────────────────────

    async openLogs() {
        await this.page.goto(`${this.baseUrl}/email-report-logs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await this.page.waitForTimeout(1000);
    }

    /** Read the log as objects keyed by their column headers. */
    async readLogRows(limit = 5) {
        return this.page.evaluate((limit) => {
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            return [...document.querySelectorAll('tbody tr')].slice(0, limit).map(r => {
                const o = {};
                [...r.querySelectorAll('td')].forEach((c, i) => {
                    o[ths[i] || `col${i}`] = (c.textContent || '').trim();
                });
                return o;
            });
        }, limit);
    }

    /**
     * Poll the log until the newest row for `reportName` reaches a terminal
     * status. Sending is asynchronous — the row appears as "pending" and
     * becomes "success" a little later — so this must poll rather than read
     * once, or the assertion races the backend.
     *
     * The wait is DELIBERATELY long. Measured on UAT 2026-09-01: one send
     * flipped to "success" in ~45s while an identical one took several
     * minutes. A 3-minute window produced a false failure that looked exactly
     * like a stuck queue — the row completed on its own later.
     */
    async waitForLogStatus(reportName, timeoutMs = 600000) {
        const deadline = Date.now() + timeoutMs;
        let last = null;

        while (Date.now() < deadline) {
            await this.openLogs();
            const rows = await this.readLogRows(5);
            const row = rows.find(r => (r['Report Name'] || '') === reportName);
            if (row) {
                last = row;
                const status = (row['Status'] || '').toLowerCase();
                if (status && status !== 'pending' && status !== 'in progress') return row;
            }
            await this.page.waitForTimeout(20000);
        }
        return last;
    }

    /** Open a report directly by its numeric id (avoids name-matching the list). */
    async openReportById(id) {
        await this.page.goto(`${this.baseUrl}/reports/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await expect(this.page.locator(L.generateButton).first())
            .toBeVisible({ timeout: 40000 });
        await this.page.waitForTimeout(1500);
    }

    /**
     * Generate and report what the grid actually shows.
     *
     * "Displayed properly" means: the request succeeded, column headers
     * rendered, and the page is not showing an error. A report with zero rows
     * for the chosen window is NOT a failure — several of these are genuinely
     * empty on UAT — but a missing header row or an error banner is.
     */
    async generateAndInspect() {
        let status = null;
        const resp = this.page.waitForResponse(
            r => /\/api\/capp\/reports\/.+(isPivot|startDate)/.test(r.url()),
            { timeout: 120000 },
        ).then(r => { status = r.status(); return r; }).catch(() => null);

        await this.page.locator(L.generateButton).first().click();
        await resp;
        await this.page.waitForTimeout(4000);

        // The report grid is WebDataRocks (`wdr-` classes), NOT a <table> and
        // NOT ag-Grid. Counting document-wide `th`/`tbody tr` is WORTHLESS
        // here: it picks up the DATE PICKER's calendar (Su/Mo/Tu headers, week
        // rows), so every report looked identical at 14 headers / 12 rows and
        // the check would have passed on a completely broken report.
        return this.page.evaluate((httpStatus) => {
            const body = (document.body.innerText || '').replace(/\s+/g, ' ');
            const grid = document.querySelector('.wdr-grid-layout');
            return {
                status: httpStatus,
                grid: !!grid,
                cells: document.querySelectorAll('.wdr-cell').length,
                headers: document.querySelectorAll('.wdr-header').length,
                sample: [...document.querySelectorAll('.wdr-cell')]
                    .map(c => (c.textContent || '').trim())
                    .filter(Boolean).slice(0, 5).join(' | '),
                error: /Internal Server Error|Something went wrong|Failed to|Unable to load/i.test(body),
                errorText: (body.match(/Internal Server Error|Something went wrong|Failed to [^.]{0,60}|Unable to load[^.]{0,60}/i) || [''])[0],
            };
        }, status);
    }
}
