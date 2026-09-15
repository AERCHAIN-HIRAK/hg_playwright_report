import { expect } from '@playwright/test';

const V3_BASE_URL = 'https://nse-capp-uat.aerchain.io';

// ─────────────────────────────────────────────────────────────────────────────
// Budget "Actual Spend" reader — sheet scenario 60.
//
// QA's drilldown, mapped live 2026-09-15 from PR-NSEFN-26-173:
//
//   transaction view page
//     -> the "BRF - Description" link            (an <a> with NO href)
//     -> right-side drawer for the BUDGET ITEM   ("Dont Touch")
//     -> the eye / "View Details" button         -> opens a NEW TAB
//     -> /budget-items/{itemId}                  (heading = the item name)
//     -> the back control beside that heading    -> /budgets/{budgetId}
//     -> "Actual Spend ₹7,12,72,629.98"          <- the figure scenario 60 tracks
//
// WHICH NUMBER — this is the whole trap. THREE different budget figures are on
// screen during this walk and they do NOT agree:
//
//   drawer (budget ITEM "Dont Touch")   Actual Spend  68,082,747.98
//   /budget-items/703                   Estimated Spend  ₹17,32,54,900
//   /budgets/369 (parent budget)        Actual Spend  ₹7,12,72,629.98  <- THIS
//
// Reading "whatever budget-ish number is nearest" silently tracks the wrong
// one — the item-level figure never moves with the parent's. The walk exists
// precisely to land on the PARENT budget, so the reader refuses to report a
// figure unless it is on /budgets/{id}.
//
// The page is Ant Design, unlike the MUI v3 transaction pages and the shadcn v4
// ones — its back control is div.ant-page-header-back-button, not an arrowLeft
// image, and its tables expose [role=columnheader] rather than <thead><th>.
// ─────────────────────────────────────────────────────────────────────────────
export class budgetSpendActions {

    constructor(page) {
        this.page = page;
    }

    /** ₹7,12,72,629.98 -> 71272629.98 (Indian digit grouping, so commas alone). */
    static parseAmount(text) {
        const m = (text || '').replace(/[₹\s]/g, '').match(/-?[\d,]+(?:\.\d+)?/);
        if (!m) return null;
        const n = parseFloat(m[0].replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    /**
     * Walk the drilldown from whatever transaction page is open and return
     * { actualSpend, estimatedSpend, budgetUrl }.
     *
     * Leaves the browser back on the transaction page with the budget tab
     * closed, so a caller can read again later in the same chain.
     */
    async readActualSpendFromTransaction(tag = 'BUDGET') {
        const origin = this.page;

        // 1 ── the BRF - Description link. Located by its LABEL, never by the
        // budget's name: the link text is the BRF description ("Dont Touch/HG
        // Auomation PURPOSE") and differs per tenant and per record.
        const link = origin.locator(
            'xpath=//*[normalize-space()="BRF - Description"]/following::a[1]').first();
        await expect(link, 'no BRF - Description budget link on this transaction page')
            .toBeVisible({ timeout: 30000 });
        const linkText = ((await link.innerText()) || '').trim();
        await link.click({ timeout: 20000 });
        await origin.waitForTimeout(3500);
        console.log(`[${tag}] opened budget drawer via "${linkText}"`);

        // 2 ── the eye ("View Details"), which opens a NEW TAB.
        const eye = origin.locator('button:has(img[src*="view"])').locator('visible=true').first();
        await expect(eye, 'the budget drawer exposes no View Details (eye) button')
            .toBeVisible({ timeout: 20000 });

        const popupPromise = origin.context().waitForEvent('page', { timeout: 30000 });
        await eye.click({ timeout: 20000 });
        const budgetTab = await popupPromise;
        await budgetTab.waitForLoadState('domcontentloaded').catch(() => {});
        await budgetTab.waitForTimeout(6000);
        console.log(`[${tag}] View Details opened ${budgetTab.url()}`);

        try {
            // 3 ── back, out of the budget ITEM and up to its parent BUDGET.
            const back = budgetTab.locator('.ant-page-header-back-button, .ant-page-header-back')
                .locator('visible=true').first();
            await expect(back, 'no back control beside the budget item heading')
                .toBeVisible({ timeout: 20000 });
            await back.click({ timeout: 20000 });
            await budgetTab.waitForURL(/\/budgets\/\d+/, { timeout: 30000 });
            await budgetTab.waitForTimeout(6000);

            const budgetUrl = budgetTab.url();
            // Refuse to report a figure read anywhere but the parent budget —
            // the item page carries a DIFFERENT "spend" that never matches.
            expect(budgetUrl, 'the back control did not land on /budgets/{id}')
                .toMatch(/\/budgets\/\d+/);

            const text = await budgetTab.evaluate(() =>
                (document.body.innerText || '').replace(/\r/g, ''));

            const actualM = text.match(/Actual\s*Spen[dt]\s*:?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i);
            const estM    = text.match(/Estimated?\s*Spen[dt]\s*:?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i);
            const actualSpend    = actualM ? budgetSpendActions.parseAmount(actualM[1]) : null;
            const estimatedSpend = estM ? budgetSpendActions.parseAmount(estM[1]) : null;

            expect(actualSpend, `no "Actual Spend" figure on ${budgetUrl}`).not.toBeNull();
            console.log(`[${tag}] ${budgetUrl} | Actual Spend = ${actualSpend}`
                + ` | Estimated Spend = ${estimatedSpend}`);

            return { actualSpend, estimatedSpend, budgetUrl };
        } finally {
            await budgetTab.close().catch(() => {});
            await origin.bringToFront().catch(() => {});
            await origin.waitForTimeout(1500);
        }
    }

    /**
     * Re-read the same budget page directly. Once the first walk has revealed
     * the URL there is nothing to gain from repeating the four-hop navigation,
     * and every repeat is another chance for a drawer to not open.
     */
    async readActualSpendAt(budgetUrl, tag = 'BUDGET') {
        const p = this.page;
        await p.goto(budgetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await p.waitForTimeout(8000);
        const text = await p.evaluate(() => (document.body.innerText || '').replace(/\r/g, ''));
        const actualM = text.match(/Actual\s*Spen[dt]\s*:?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i);
        const actualSpend = actualM ? budgetSpendActions.parseAmount(actualM[1]) : null;
        expect(actualSpend, `no "Actual Spend" figure on ${budgetUrl}`).not.toBeNull();
        console.log(`[${tag}] ${budgetUrl} | Actual Spend = ${actualSpend}`);
        return actualSpend;
    }
}
