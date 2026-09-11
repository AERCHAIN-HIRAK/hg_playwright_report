import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import { v3DetailActions } from '../pages/v3DetailActions';
import v3data from '../pages/V3ListingData.json';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios unblocked by QA's walkthrough (2026-09-01) — see docs/QA_DECISIONS.md
//
//   4  CXO panel opens from the listing ROW (not the code link)
//  31  The Intake an RFX came from is reachable via the RFX Transactions tab
//  43  PO document downloads from the General Details section
//  53  A Requisition raised from an Intake links back to that Intake
//  54  The Requisition's budget (BRF) link opens the budget
//  34  Suppliers can be reminded in bulk to quote an RFX (in-app half)
//
// Sheet scenario 29 ("the Auction for the RFX can be accessed from the RFX
// Analysis tab") was MOVED OUT on 2026-09-08: auctions get their own sheet, so
// its test was removed from here. What it had established, for whoever picks the
// auction sheet up: QA corrected the location — the Auction is linked from the
// RFX **Transactions** tab, not Analysis — and the "Convert to Auction" action
// is GATED ON FORECLOSURE. Confirmed on UAT: RFX-26-233 (Quoted, not foreclosed)
// offered Foreclose and no auction option, while RFX-26-222 (quoted then
// foreclosed) offered Convert to Auction and no Foreclose. The removed test also
// counted Linked Auctions before and after, so the assertion proved the
// conversion produced one rather than finding an older auction, and it never
// foreclosed anything itself — foreclosing is destructive and would consume the
// shared pool of quotable RFXs that scenario 34 draws from.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('QA-clarified scenarios', () => {

    test.describe.configure({ timeout: 180000 });

    // ── Scenario 4 ────────────────────────────────────────────────────────────
    test('CXO panel opens by clicking the listing row @CXO @Listing @Panel @S4', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await page.goto(`${data.loginUrl}/cxos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        // Wait for the first row to actually carry a code. Rows mount before
        // their cells fill, and reading too early yields "" — which both made
        // the row click land on an unrendered cell AND silently defanged the
        // toContainText assertion below.
        await page.waitForFunction(() => {
            const c = document.querySelector('tbody tr td');
            return c && (c.textContent || '').trim().length > 0;
        }, null, { timeout: 30000 });
        await page.waitForTimeout(800);

        const rowCode = (await page.locator('(//tbody/tr)[1]/td[1]').innerText()).trim();
        expect(rowCode, 'first listing row has no CXO code').toBeTruthy();

        // Click the ROW BODY, not the code — the code link navigates away.
        //
        // Each attempt WAITS for the panel before deciding to retry. Clicking
        // again while the panel is already opening would land on its backdrop
        // and toggle it shut, which is what made a naive click-then-recheck
        // loop fail roughly one run in four.
        const panel = page.locator(`xpath=${L.cxoListingPanel}`).first();
        let opened = false;
        for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
            await page.locator(`xpath=${L.cxoListingRowBody}`).first().click();
            opened = await panel.waitFor({ state: 'visible', timeout: 8000 })
                .then(() => true).catch(() => false);
            if (!opened) {
                console.log(`[S4] panel not open after click ${attempt}, retrying`);
                await page.keyboard.press('Escape').catch(() => {});
                await page.waitForTimeout(1000);
            }
        }

        // Still on the listing: the panel is an overlay, not a navigation.
        expect(page.url(), 'clicking the row navigated instead of opening a panel')
            .toMatch(/\/cxos\/?$/);

        await expect(panel, 'CXO panel did not open after 3 row clicks').toBeVisible({ timeout: 15000 });

        // It must be THIS row's CXO, with its related data populated.
        await expect(panel).toContainText(rowCode);
        for (const field of ['Subject', 'Reference Code', 'Created On']) {
            await expect(panel, `panel is missing "${field}"`).toContainText(field);
        }
        console.log(`[S4] panel opened for ${rowCode}`);
    });

    // ── Scenario 31 ───────────────────────────────────────────────────────────
    test('the parent Intake is reachable from the RFX Transactions tab @RFX @Transactions @S28', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await page.goto(data.savedSourcingEvent.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3500);

        await page.locator(`xpath=${L.rfxTransactionsTabBtn}`).first().click();
        await page.waitForURL(/\/transactions/, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3500);

        // All three linked-transaction sections must render.
        for (const sel of [L.rfxLinkedIntakes, L.rfxLinkedAuctions, L.rfxLinkedNegotiations]) {
            await expect(page.locator(`xpath=${sel}`).first()).toBeVisible();
        }

        const sections = await a.readV4TransactionSections(
            ['Linked Intakes', 'Linked Auctions', 'Linked Negotiations'],
        );
        const intakes = sections['Linked Intakes'];
        expect(intakes, 'Linked Intakes section missing').not.toBeNull();
        expect(intakes.rowCount,
            'the RFX lists no parent Intake — it should show the intake it was converted from')
            .toBeGreaterThan(0);

        // The listed code must actually look like an intake.
        for (const code of intakes.codes) expect(code).toMatch(/^INT-/);
        console.log(`[S31] parent intakes: ${JSON.stringify(intakes.codes)}`);
    });

    // ── Scenario 43 ───────────────────────────────────────────────────────────
    test('the PO document downloads from General Details @PO @Document @S40', async ({ page }) => {
        const po = new v3DetailActions(page, v3data.modules.purchaseOrder);
        await page.setViewportSize({ width: 1800, height: 900 });

        // QA: every PO status EXCEPT Cancelled exposes the download.
        let code = await po.openFirstTransactionWithStatus(
            ['Submitted', 'In-progress', 'Completed'], v3data.baseUrl);
        if (!code) code = await po.openFirstTransactionFromListing(v3data.baseUrl);
        console.log(`[S43] PO ${code}`);

        // The control sits in General Details, labelled "PO Document".
        await expect(page.locator(`xpath=${L.poDocumentLabel}`).first()).toBeVisible({ timeout: 20000 });

        const link = page.locator(`xpath=${L.poDocumentDownload}`).first();
        await expect(link).toBeVisible();

        // The anchor has NO href — it is JS-driven — so watch for either a
        // download event or a new tab, exactly as the Requisition document does.
        const context = page.context();
        const popupP = context.waitForEvent('page', { timeout: 30000 })
            .then(p => ({ kind: 'tab', page: p })).catch(() => null);
        const dlP = page.waitForEvent('download', { timeout: 30000 })
            .then(d => ({ kind: 'download', download: d })).catch(() => null);

        await link.click();
        const result = await Promise.race([
            popupP, dlP, new Promise(r => setTimeout(() => r(null), 32000)),
        ]);

        expect(result, 'PO Document Download produced neither a file nor a document tab').not.toBeNull();

        if (result.kind === 'download') {
            const name = result.download.suggestedFilename();
            expect(name, 'downloaded file has no name').toBeTruthy();
            console.log(`[S43] downloaded ${name}`);
        } else {
            await result.page.waitForLoadState('domcontentloaded').catch(() => {});
            const url = result.page.url();
            expect(url).toMatch(/\.pdf|response-content-disposition|blob:/i);
            console.log(`[S43] document tab ${url.slice(0, 120)}`);
            await result.page.close().catch(() => {});
        }
    });

    // ── Scenarios 53 + 54 ─────────────────────────────────────────────────────
    //
    // Both need the SAME kind of record: a Requisition whose Source is
    // "intakes" (Intake converted straight to PR). A Requisition raised from an
    // award carries Source = "awards" and shows no Intake link at all, so
    // picking an arbitrary PR would make these pass or fail by luck.
    //
    // Verified on UAT 2026-09-01 against PR-NSEFN-26-121 (/requisitions/1083):
    //   Source "intakes"  → new tab /intakes/2201/overview
    //   BRF - Description "Dont Touch/HG Auomation PURPOSE" → budget drawer
    test.describe('Requisition raised from an Intake', () => {

        // Nested describes do NOT inherit the outer configure() budget.
        test.describe.configure({ timeout: 180000 });

        /** @type {import('@playwright/test').Page} */
        let sharedPage;
        let prCode = null;

        // One navigation serves both assertions — the PR is read-only here.
        test.beforeEach(async ({ page }) => {
            const pr = new v3DetailActions(page, v3data.modules.requisition);
            await page.setViewportSize({ width: 1800, height: 900 });
            prCode = await pr.openFirstTransactionWithColumnValue('Source', 'intakes', v3data.baseUrl);
            sharedPage = page;
        });

        test('links back to the Intake it was converted from @PR @Intake @Link @S50', async ({ page }) => {
            test.skip(!prCode, 'no Requisition with Source "intakes" on the first listing page');
            const pr = new v3DetailActions(page, v3data.modules.requisition);
            console.log(`[S53] ${prCode}`);

            // The Source value itself is the link — a blue div, new tab.
            // General Details paints after the header, so wait rather than
            // snapshotting the blue links immediately.
            await pr.waitForBlueLink('intakes');
            const links = await pr.getBlueLinkTexts();
            expect(links, `no "intakes" link on ${prCode}; blue links were ${JSON.stringify(links)}`)
                .toContain('intakes');

            const popup = await pr.clickBlueLinkExpectingNewTab('intakes');
            const url = popup.url();
            await popup.close().catch(() => {});

            expect(url, `the Intake link on ${prCode} did not open an intake`)
                .toMatch(/\/intakes\/\d+/);
            console.log(`[S53] opened ${url}`);
        });

        test('exposes the budget link, which opens the budget @PR @Budget @S51', async ({ page }) => {
            test.skip(!prCode, 'no Requisition with Source "intakes" on the first listing page');
            const pr = new v3DetailActions(page, v3data.modules.requisition);
            console.log(`[S54] ${prCode}`);

            // QA: for our data the budget is named "Dont Touch".
            const { label, text } = await pr.openBudgetDrawer('Dont Touch');

            expect(label, 'budget link is not under a labelled field').toBeTruthy();
            console.log(`[S54] link label "${label}"`);

            // The drawer must actually describe the budget, not just be open.
            expect(text, `budget drawer does not name the budget; it read: ${text.slice(0, 200)}`)
                .toMatch(/Dont Touch/i);
            expect(text, 'budget drawer shows no budget amount')
                .toMatch(/budget/i);
            console.log(`[S54] drawer: ${text.slice(0, 160)}`);
        });
    });

    // ── Scenario 34 ───────────────────────────────────────────────────────────
    //
    // "Verify Suppliers can be reminded in bulk for quoting the RFX."
    //
    // QA: once an RFX is released, its supplier section offers a bulk reminder
    // which emails every supplier.
    //
    // This covers the IN-APP half. The app shows no toast at all, so the only
    // observable signal is POST …/send-reminder-to-all-suppliers. Confirming
    // the supplier actually RECEIVED the mail needs mailbox access, which is
    // currently blocked by Gmail 2FA — see docs/QA_DECISIONS.md.
    test('suppliers can be reminded in bulk to quote an RFX @RFX @Supplier @Reminder @S31', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // Released is the state QA described; a Quoted RFX still exposes the
        // control, so accept either rather than skipping on data availability.
        const rfx = await a.openRfxWithStatus(['Released', 'Quoted'], data.loginUrl);
        test.skip(!rfx, 'no Released or Quoted RFX on the first listing page');
        console.log(`[S34] ${rfx.code} (${rfx.status})`);

        expect(await a.hasBulkReminderButton(),
            `${rfx.code} is ${rfx.status} but exposes no Bulk Reminder control`).toBeTruthy();

        const status = await a.clickBulkReminder();
        expect(status, `bulk reminder returned HTTP ${status}`).toBeLessThan(400);
        console.log(`[S34] send-reminder-to-all-suppliers HTTP ${status}`);
    });

});
