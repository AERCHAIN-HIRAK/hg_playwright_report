import { expect } from '@playwright/test';

const V4_BASE_URL = 'https://nse-capp-v4-uat.aerchain.io';

// RFX collaboration actions on the v4 (shadcn/radix) app:
//   sheet 30  Negotiations can be performed for the RFX
//   sheet 34  the buyer can add comments for another user of the RFX
//
// Both live on a QUOTED RFX. An Awarded one exposes neither Negotiation nor
// Award on its Analysis tab — verified: RFX-26-231 (Awarded) offers only
// "Select View Type" and "Compare", while RFX-26-239 (Quoted) adds
// "Negotiation" and "Award".
export class rfxCollabActions {

    constructor(page) {
        this.page = page;
    }

    /**
     * Find RFXs on the v4 listing, newest first.
     * The listing is a plain table; the code cell holds the anchor with the id.
     */
    async listRfx(baseUrl = V4_BASE_URL) {
        await this.page.goto(`${baseUrl}/quote-requests`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 90000 });
        await this.page.waitForTimeout(3000);

        return this.page.$$eval('tbody tr', trs => trs.map(tr => {
            const tds = tr.querySelectorAll('td');
            const href = tr.querySelector('a')?.getAttribute('href') || '';
            return {
                id: (href.match(/\/quote-requests\/(\d+)/) || [])[1] || null,
                code: (tds[0]?.innerText || '').trim(),
                subject: (tds[1]?.innerText || '').trim(),
                status: (tds[4]?.innerText || '').trim(),
            };
        }).filter(r => r.id));
    }

    /**
     * A Quoted RFX that is safe to touch — subject must contain "HG Automation",
     * the same guard the RFX-cancel test uses, so a run can never act on a
     * record somebody set up by hand.
     */
    async findQuotedRfx(baseUrl = V4_BASE_URL) {
        const all = await this.listRfx(baseUrl);
        const hit = all.find(r => /quoted/i.test(r.status) && /HG Automation/i.test(r.subject));
        if (hit) console.log(`[RFX] using ${hit.code} (${hit.status}, id ${hit.id})`);
        return hit || null;
    }

    async openOverview(id, baseUrl = V4_BASE_URL) {
        await this.page.goto(`${baseUrl}/quote-requests/${id}/overview`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(8000);
    }

    /** The Analysis tab trigger is a <button>, not role=tab — getByRole('button')
     *  with an exact name does NOT resolve it, so match on the XPath text. */
    async openAnalysis() {
        await this.page.locator('xpath=//button[normalize-space()="Analysis"]').first().click();
        await this.page.waitForURL(/\/analysis/, { timeout: 30000 }).catch(() => {});
        await this.page.waitForTimeout(8000);
    }

    async analysisActionLabels() {
        return this.page.$$eval('button', els => Array.from(new Set(els
            .filter(e => e.getBoundingClientRect().width > 0)
            .map(e => (e.innerText || '').trim())
            .filter(Boolean))));
    }

    // ── Negotiation (sheet 30) ────────────────────────────────────────────────

    async openNegotiation() {
        await this.page.locator('xpath=//button[normalize-space()="Negotiation"]').first().click();
        await this.page.waitForURL(/\/negotiations/, { timeout: 30000 });
        await this.page.waitForTimeout(6000);
        console.log(`[RFX] negotiation page: ${this.page.url()}`);
    }

    // ── Activity Log comments (sheet 34) ──────────────────────────────────────

    /** Icon-only trigger — no accessible name, so it is matched by its lucide
     *  class. Three sibling icon buttons sit next to it (collapse, rotate), so
     *  a positional click would be fragile. */
    async openActivityLog() {
        await this.page.locator('button:has(svg.lucide-clock)').first().click();
        const sheet = this.page.locator('[role="dialog"]').first();
        await expect(sheet, 'the Activity Log sheet did not open').toBeVisible({ timeout: 20000 });
        await this.page.waitForTimeout(4000);
        return sheet;
    }

    async openCommentsTab() {
        const sheet = this.page.locator('[role="dialog"]').first();
        await sheet.locator('button', { hasText: /^Comments$/ }).first().click();
        await this.page.waitForTimeout(3000);
        return sheet;
    }

    /**
     * Type a comment, optionally @mentioning a user, and send.
     *
     * The composer hints "Press Enter to send • @ to mention users". Typing "@"
     * surfaces a name list that carries NO role=option and no listbox — the
     * names are plain text nodes — so a mention target is clicked by its text
     * rather than selected by role.
     *
     * Sending is done with the send button rather than Enter: Enter is also the
     * newline key in a textarea, and relying on it makes the test depend on the
     * app's key handling rather than on the affordance under test.
     */
    async postComment(text, { mention = null } = {}) {
        const sheet = this.page.locator('[role="dialog"]').first();
        const box = sheet.locator('textarea[placeholder="Add comment..."]').first();
        await expect(box, 'no comment composer in the Activity Log').toBeVisible({ timeout: 15000 });
        await box.click();

        let mentioned = null;
        if (mention) {
            await box.type('@', { delay: 150 });
            await this.page.waitForTimeout(3000);
            const option = this.page.locator(`text="${mention}"`).first();
            if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
                await option.click();
                await this.page.waitForTimeout(1500);
                mentioned = mention;
                console.log(`[RFX] mentioned "${mention}"`);
            } else {
                console.log(`[RFX] mention list did not offer "${mention}"`);
                // Clear the stray "@" so the posted text is exactly `text`.
                await box.fill('');
            }
        }

        await box.type(text, { delay: 20 });
        await this.page.waitForTimeout(800);

        const send = sheet.locator('button:has(svg.lucide-send-horizontal)').first();
        await expect(send, 'no send button on the comment composer').toBeVisible({ timeout: 10000 });
        await send.click();
        await this.page.waitForTimeout(6000);
        return { mentioned };
    }

    async commentsText() {
        const sheet = this.page.locator('[role="dialog"]').first();
        return ((await sheet.innerText()) || '').trim();
    }
}
