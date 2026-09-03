import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import v3data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 65 and 66 — PO Short Close
//
//   65: a PO can be Short Closed after a partial-quantity GRN
//   66: a PO can be Short Closed after a partial-quantity GRN AND an Invoice
//
// QA (2026-09-01): "PO can be short closed if partial quantity GRN is created
// and partial quantity invoice also".
//
// CORRECTION: an earlier pass recorded these as "action absent". That was
// wrong — the Short Close button sits in the PO detail header, but only while
// the PO is still In-progress (i.e. partially received). A Completed or
// Cancelled PO has nothing left to short close, which is why it was not found.
//
// DESTRUCTIVE: a passing run consumes one In-progress PO. The test skips
// cleanly when UAT has none left rather than failing.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Purchase Order — Short Close', () => {

    test.describe.configure({ timeout: 300000 });

    test('a partially-received PO can be short closed @PO @ShortClose @S62 @S63', async ({ page }) => {
        const po = new v3DetailActions(page, v3data.modules.purchaseOrder);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);

        // In-progress means goods are partially received — the precondition for
        // short closing. But an ALREADY short-closed PO stays In-progress and
        // no longer offers the action, so scan for one that still does rather
        // than taking the first In-progress row.
        const candidates = await po.listTransactionsWithStatus(['In-progress'], v3data.baseUrl);
        let code = null;
        for (const c of candidates) {
            await page.goto(`${v3data.baseUrl}${c.href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await po.waitForDetailLoaded();
            if (await po.hasShortCloseButton()) { code = c.code; break; }
            console.log(`[S65] ${c.code} is In-progress but already short closed — skipping`);
        }
        test.skip(!code, 'no In-progress PO still offering Short Close');
        console.log(`[S65] PO ${code}`);

        const before = await po.getShortClosedQty();
        console.log(`[S65] short-closed qty before: ${before}`);

        const status = await po.shortClosePo('Short closed by automation');
        console.log(`[S65] short close responded ${status}`);
        if (status !== null) {
            expect(status, `short close returned HTTP ${status}`).toBeLessThan(400);
        }

        // Assert on the LINE ITEMS, not the header. A short close closes the
        // undelivered balance and raises "Short Closed Qty"; the PO header can
        // legitimately stay In-progress, so asserting on it reports a working
        // feature as broken (observed on PO-NSEFN-26-209: 20 ordered, 18
        // inward, 2 short closed, header still In-progress).
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);
        const after = await po.getShortClosedQty();
        console.log(`[S65] short-closed qty after: ${after}`);
        expect(after, `${code} shows no short-closed quantity after the action`)
            .toBeGreaterThan(before);

        // And the action must no longer be on offer once the balance is closed.
        expect(await po.hasShortCloseButton(),
            `${code} still offers Short Close after being short closed`).toBeFalsy();
    });
});
