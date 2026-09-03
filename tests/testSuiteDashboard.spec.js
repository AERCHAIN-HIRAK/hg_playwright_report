import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// User's Dashboard
//
// Sheet scenarios:
//   22 clicking the Aerchain logo shows the V4 Dashboard
//   89 all pending-approval transactions appear under the My Pending Approval
//      view type
//   92 the pending-approval count matches between Dashboard and listing
//   138 cancelling a transaction clears it from My Pending Approvals
//   139 the same, at any workflow stage / for all approvers
//
// The v4 root ("/") IS the dashboard. Its tab bar is rendered TWICE (desktop +
// mobile copies) — an XPath/text click can land on the inert copy and silently
// do nothing while still looking successful. Verified 2026-08-31: an XPath click
// left "All" active with 1586 rows; getByRole('tab', …) switched properly and
// the count fell to 164. Every tab switch here goes through getByRole.
// ─────────────────────────────────────────────────────────────────────────────

// Statuses that legitimately appear in a "pending my approval" queue. A record
// sitting here in a terminal state (Rejected / Cancelled / Completed) would mean
// the queue is not being cleared.
const PENDING_STATUSES = [
    'Pending Approval',
    'Pending Budget Approval',
    'Pending Amend Approval',
    'Pending Cancellation Approval',
    'Pending Inventory Approval',
    'To-review',
    'To-enrich',
    'Submitted',
];

// ── Known stale rows, exempted on QA's instruction (2026-09-02) ───────────────
//
// QA: "ignore ... that one cancelled cxo 26-90 is displayed in my pending
// approval ... because that one cancelled cxo will be present in the pending
// approvals tab".
//
// CXO-FNSE-26-90 (id 5247) is genuinely Cancelled on /cxos/5247/overview yet
// still sits in the CXO listing's My Pending Approval tab. It predates the fix
// and was never backfilled, so it will not clear. Scenarios 92/138/139 are
// about the RULE, not about this one legacy record, so it is excluded from the
// assertions — but deliberately NARROWLY:
//
//  · only this exact code is forgiven; any OTHER terminal row still fails,
//    which is the behaviour these scenarios actually exist to catch;
//  · it is still logged on every run, so it never silently disappears from view;
//  · the exemption is SELF-EXPIRING — if the row is ever cleaned up the tests
//    keep passing and the log says the exemption is now unused, which is the
//    cue to delete this list.
const KNOWN_STALE_PENDING = ['CXO-FNSE-26-90'];

/** Split terminal rows into the ones we forgive and the ones that must fail. */
function partitionTerminalRows(rows) {
    const exempt = rows.filter(r => KNOWN_STALE_PENDING.some(code => r.startsWith(code)));
    const unexpected = rows.filter(r => !KNOWN_STALE_PENDING.some(code => r.startsWith(code)));
    if (exempt.length) {
        console.log(`[DASH] tolerating ${exempt.length} known stale row(s): ${JSON.stringify(exempt)}`);
    } else {
        console.log('[DASH] no known stale rows present — the KNOWN_STALE_PENDING exemption is now unused and can be removed');
    }
    return { exempt, unexpected };
}

test.describe("User's Dashboard", () => {

    test.describe.configure({ timeout: 240000 });

    // The Aerchain logo's href is NOT the dashboard — it mirrors the current URL
    // (verified 2026-08-31: /cxos → href="/cxos", /intakes → href="/intakes",
    // /cxos/5744/overview → href="/cxos/5744/overview"). Navigation is driven by
    // the click handler, not the href, and it DOES reach the dashboard — so the
    // attribute is misleading but the behaviour is correct. Do not "fix" this
    // test by asserting the href.
    test('Aerchain logo opens the V4 Dashboard @Dashboard @Navigation @S19', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // Navigate away first, so returning to the dashboard is a real change.
        await page.goto(`${data.loginUrl}/cxos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        expect(page.url()).toContain('/cxos');

        const logoHref = await page.locator(`xpath=${L.aerchainLogo}/ancestor::a[1]`)
            .first().getAttribute('href');
        console.log(`[DASH] logo href on /cxos = ${logoHref}`);

        await page.locator(`xpath=${L.aerchainLogo}`).first().click();
        await page.waitForTimeout(4000);

        expect(page.url(),
            `logo click did not reach the dashboard (its href was "${logoHref}")`)
            .toMatch(/nse-capp-v4-uat\.aerchain\.io\/?$/);
        await expect(page.locator(`xpath=${L.dashboardHeading}`).first()).toBeVisible();
    });

    test('My Pending Approval shows only pending transactions @Dashboard @S85', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);
        await a.openDashboard(data);

        const allTotal = await a.getListingTotalEntries();

        await a.clickV4Tab('My Pending Approval');
        expect(await a.getActiveV4TabNames()).toContain('My Pending Approval');

        const pendingTotal = await a.getListingTotalEntries();
        expect(pendingTotal, 'no pending-approval transactions listed').toBeGreaterThan(0);

        // The pending queue is a subset of everything — if the tab did not
        // actually filter, these would be equal.
        expect(pendingTotal,
            `My Pending Approval (${pendingTotal}) is not a subset of All (${allTotal}) — the tab did not filter`)
            .toBeLessThan(allTotal);

        const rows = await a.readDashboardRows();
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) {
            expect(PENDING_STATUSES,
                `${r.code} (${r.type}) is in My Pending Approval with a non-pending status "${r.status}"`)
                .toContain(r.status);
        }
        console.log(`[DASH] All=${allTotal}, My Pending Approval=${pendingTotal}`);
    });

    test('CXO pending count matches between Dashboard and CXO listing @Dashboard @S88', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // 1. Dashboard → My Pending Approval → tally by transaction type.
        await a.openDashboard(data);
        await a.clickV4Tab('My Pending Approval');
        const dashTotal = await a.getListingTotalEntries();

        const { tally, pagesWalked } = await a.tallyDashboardByType();
        const counted = Object.values(tally).reduce((s, n) => s + n, 0);
        console.log(`[DASH] walked ${pagesWalked} pages, tally=${JSON.stringify(tally)}`);

        // Guard: a truncated walk would make the comparison meaningless.
        test.skip(counted < dashTotal,
            `dashboard walk covered ${counted}/${dashTotal} rows (page cap reached) — cannot compare totals`);

        // 2. CXO listing → My Pending Approval → total + the offending rows.
        await page.goto(`${data.loginUrl}/cxos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await a.clickV4Tab('My Pending Approval');
        const listingTotal = await a.getListingTotalEntries();

        const dashCxo = tally['CXO'] ?? 0;

        // Name the culprits rather than just reporting a number mismatch.
        const terminal = await a.findTerminalStatusRowsAcrossPages();
        const { exempt, unexpected } = partitionTerminalRows(terminal);
        console.log(`[DASH] CXO dashboard=${dashCxo}, CXO listing=${listingTotal}, terminal rows in listing=${JSON.stringify(terminal)}`);

        // The Dashboard correctly excludes the stale record while the listing
        // still carries it, so the listing reads one higher. Discount exactly
        // the exempted rows — nothing else — and the two must then agree.
        const adjustedListing = listingTotal - exempt.length;
        console.log(`[DASH] listing adjusted for ${exempt.length} exempt row(s): ${listingTotal} → ${adjustedListing}`);

        expect(unexpected,
            `terminal-status rows other than the known stale one are sitting in the CXO listing's pending tab: ${JSON.stringify(unexpected)}`)
            .toEqual([]);

        expect(dashCxo,
            `CXO pending count differs: dashboard ${dashCxo} vs CXO listing ${adjustedListing} `
            + `(raw ${listingTotal}, less ${exempt.length} exempt). `
            + `Terminal rows seen: ${JSON.stringify(terminal)}`)
            .toBe(adjustedListing);
    });

    // ── Sheet scenarios 138 / 139 ─────────────────────────────────────────────
    // "Cancelling a transaction removes it from the approver's My Pending
    // Approvals list", and the broader "at any workflow stage / for all
    // approvers" form of the same rule.
    //
    // CXO-FNSE-26-90 (id 5247) is Cancelled on its overview page yet still sits
    // in the CXO listing's My Pending Approval tab. QA (2026-09-02) confirmed
    // that record is expected to stay and told us to ignore it, so it is
    // exempted — see KNOWN_STALE_PENDING. Every other terminal row still fails,
    // which is what keeps these scenarios meaningful.
    //
    // 139 is covered only for the CXO module and the logged-in approver;
    // proving "all approvers" needs a second approver account.
    test('no Cancelled or Rejected CXO remains in My Pending Approval @Dashboard @S133 @S134', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await page.goto(`${data.loginUrl}/cxos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await a.clickV4Tab('My Pending Approval');

        const terminal = await a.findTerminalStatusRowsAcrossPages();
        const { unexpected } = partitionTerminalRows(terminal);

        expect(unexpected,
            `these transactions are in a terminal state but still sit in My Pending Approval: ${JSON.stringify(unexpected)}`)
            .toEqual([]);
    });
});
