import { expect } from '@playwright/test';

const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// Page object for the Advances module (v3, /advances).
//
// Sheet scenario 102: payments made against an advance are listed in the
// Advance's Transactions tab.
//
// The module has no entry in the app's module switcher that the other v3
// listings use — it is reached directly at /advances. (/advance also resolves,
// to a different, tabbed view; /advance-payments 404s.)
export class advanceActions {

    constructor(page) {
        this.page = page;
    }

    /** "₹ 1,000" / "₹ 4,234" → 1000 / 4234. Returns NaN for a non-numeric cell. */
    static amount(text) {
        const cleaned = String(text ?? '').replace(/[^\d.-]/g, '');
        return cleaned === '' ? NaN : Number(cleaned);
    }

    async openListing(baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/advances`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // Wait for rows, not a fixed delay — an empty read on these v3 listings
        // is indistinguishable from "no data" and silently skips the test.
        await this.page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(2500);
    }

    /** [{ id, code, type, amount, status }] from the Advances listing. */
    async listAdvances(baseUrl = V3_BASE_URL) {
        await this.openListing(baseUrl);
        const headers = await this.page.$$eval('thead th', ths => ths.map(t => (t.innerText || '').trim()));
        const idx = {
            type: headers.indexOf('Type'),
            amount: headers.indexOf('Amount'),
            status: headers.indexOf('Status'),
        };
        const rows = await this.page.$$eval('tbody tr', (trs, idx) => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tds[0]?.querySelector('a')?.getAttribute('href') || '';
            return {
                id: (href.match(/\/advances\/(\d+)/) || [])[1] || null,
                code: (tds[0]?.innerText || '').trim(),
                type: idx.type >= 0 ? (tds[idx.type]?.innerText || '').trim() : '',
                amountText: idx.amount >= 0 ? (tds[idx.amount]?.innerText || '').trim() : '',
                status: idx.status >= 0 ? (tds[idx.status]?.innerText || '').trim() : '',
            };
        }).filter(r => r.id), idx);

        console.log(`[ADV] ${rows.length} advance(s): ` +
            rows.map(r => `${r.code}(${r.status},${r.amountText})`).join(' · '));
        return rows.map(r => ({ ...r, amount: advanceActions.amount(r.amountText) }));
    }

    /**
     * Open one advance and read its Transactions tab.
     * Returns [{ code, type, paidText, paid }] — empty when the tab shows "No data".
     */
    async readPayments(id, baseUrl = V3_BASE_URL) {
        await this.page.goto(`${baseUrl}/advances/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const tab = this.page.locator('xpath=//button[normalize-space()="Transactions"]').first();
        await tab.waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(2000);
        await tab.click();
        await this.page.waitForTimeout(6000);

        const headers = await this.page.$$eval('thead th', ths => ths.map(t => (t.innerText || '').trim()));
        const rows = await this.page.$$eval('tbody tr', trs => trs.map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim())));

        // The empty state renders as a single row reading "No data".
        const real = rows.filter(r => r.length > 1 && !/^no data$/i.test((r[0] || '')));
        const out = real.map(r => ({
            code: r[0] || '', type: r[1] || '', paidText: r[2] || '',
            paid: advanceActions.amount(r[2]),
        }));
        console.log(`[ADV] advance ${id} payments (${headers.join('/')}): ` +
            (out.map(p => `${p.code} ${p.type} ${p.paidText}`).join(' · ') || 'none'));
        return out;
    }
}
