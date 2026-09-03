import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 32 — self-contained variant
//
// QA (2026-09-01): "for this flow u better clone a rfx then add one more
// supplier then quote from both of them foreclose then convert to auction".
//
// The version in testSuiteQaClarified reuses whatever quoted-and-foreclosed RFX
// happens to be on the listing, and SKIPS when there is none. This one builds
// its own: clone → second supplier → quote both → foreclose → convert. It is
// slow and it CREATES REAL RECORDS on UAT (one RFX and one auction per run),
// which is the price of not depending on ambient data.
//
// The second supplier must differ from data.sourcing.supplierSearch, otherwise
// "add one more supplier" adds nobody.
// ─────────────────────────────────────────────────────────────────────────────

const SECOND_SUPPLIER = 'HG HF Test 001';

test.describe('RFX → Auction, on self-created data', () => {

    test.describe.configure({ timeout: 900000 });

    test('a cloned RFX quoted by two suppliers converts to an auction @RFX @Auction @S29 @Slow', async ({ page }) => {
        // WORK IN PROGRESS — marked fixme so it does not fail full-suite runs.
        //
        // Verified working so far: clone opens, the bid dates are re-filled
        // (the clone drops them; the expected-delivery date is carried on the
        // line items and is NOT rendered), the second supplier is added, Submit
        // and the Process Request popup are both accepted.
        //
        // WHERE IT STOPS: after the popup the page STAYS on
        // /quote-requests/<id>/clone instead of moving to a new RFX, and the
        // page then shows no quotable suppliers. So the clone submit is not
        // completing — most likely another mandatory field on the clone form is
        // rejected silently. Next step is to capture the validation state on
        // that page immediately after the popup Submit.
        //
        // Scenario 32 IS covered meanwhile by testSuiteQaClarified.spec.js,
        // which passes against an existing quoted-and-foreclosed RFX; this
        // self-contained variant only removes that test's dependency on
        // ambient data.
        test.fixme(true, 'clone submit does not complete — stays on /clone with no quotable suppliers');

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        // The project-wide actionTimeout is 5s, which is too tight for the
        // sourcing form: expanding the sections reflows the page and the date
        // fields need longer to settle before they can be scrolled to.
        page.setDefaultTimeout(30000);
        await a.openApp(data);

        // Clone a released/quoted RFX so the clone inherits a usable structure.
        const seeds = await a.listRfxByStatus(['Quoted', 'Released', 'Awarded'], data.loginUrl);
        test.skip(!seeds.length, 'no RFX available to clone');
        const seed = seeds[0];
        console.log(`[S32b] cloning ${seed.code}`);

        await page.goto(`${data.loginUrl}${seed.href}/overview`,
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        const cloneUrl = await a.cloneRfxAddSupplierAndSubmit(data, SECOND_SUPPLIER);
        console.log(`[S32b] clone submitted → ${cloneUrl}`);

        await a.approveSourcingUntilReleased();
        console.log('[S32b] clone released');

        // Quote from every supplier that still shows Submit Quote.
        let pending = await a.countPendingQuotes();
        console.log(`[S32b] suppliers awaiting a quote: ${pending}`);
        expect(pending, 'the clone carries fewer than two quotable suppliers')
            .toBeGreaterThan(1);

        let guard = 0;
        while (pending > 0 && guard++ < 5) {
            await a.quoteNextSupplier(data);
            await page.goto(cloneUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(4000);
            pending = await a.countPendingQuotes();
            console.log(`[S32b] remaining quotes: ${pending}`);
        }
        expect(pending, 'some suppliers were never quoted').toBe(0);

        await a.forecloseRfx(data);
        console.log('[S32b] foreclosed');

        // Convert to Auction only appears after foreclosure.
        expect(await a.hasV4MenuItem('Convert to Auction'),
            'a foreclosed RFX does not offer Convert to Auction').toBeTruthy();

        const transactionsUrl = cloneUrl.replace(/\/overview.*$/, '/transactions');
        const readAuctions = async () => {
            await page.goto(transactionsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);
            const s = await a.readV4TransactionSections(['Linked Auctions']);
            return s['Linked Auctions'];
        };

        const before = await readAuctions();
        console.log(`[S32b] auctions before: ${before ? before.rowCount : 'n/a'}`);

        await page.goto(cloneUrl.replace(/\/overview.*$/, '/overview'),
            { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);
        await a.clickV4MenuItem('Convert to Auction');
        await a.confirmConvertToAuction();

        const after = await readAuctions();
        expect(after.rowCount,
            `converting the clone produced no Linked Auction (before ${before.rowCount}, after ${after.rowCount})`)
            .toBeGreaterThan(before ? before.rowCount : 0);
        console.log(`[S32b] auctions after: ${after.rowCount} ${JSON.stringify(after.codes)}`);
    });
});
