import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import { v3Detail_Locators as L } from '../pages/v3DetailLocators';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Requisition (PR) detail page
//
// Sheet scenarios:
//   52 clicking the Award link opens the RFX award page
//   53 clicking the Intake link opens the Intake
//   54 clicking the Budget link opens the Budget
//   55 clicking the CXO link opens the CXO
//   56 search any line item in the line-item section
//   59 clicking the item name opens the item details panel
//   60 back button from the PR shows the PR listing
//
// Verified live on PR-NSEFN-26-126 (2026-08-31): the related-transaction links
// render as blue <div>s with cursor:pointer (NOT anchors) and open in a NEW TAB.
// Present on an award-sourced PR: "Awards" (→ /rfx/{id}/awards/{id}),
// "CXO Code" and "Award Id". No Intake or Budget link was exposed on that PR,
// so 53/54 assert conditionally and skip with a clear reason when the link is
// absent rather than failing on data shape.
// ─────────────────────────────────────────────────────────────────────────────

const REQ = data.modules.requisition;

test.describe('Requisition detail page', () => {

    test.describe.configure({ timeout: 150000 });

    /** @type {v3DetailActions} */
    let pr;

    test.beforeEach(async ({ page }) => {
        pr = new v3DetailActions(page, REQ);
        await page.setViewportSize({ width: 1800, height: 900 });
    });

    // ── Related-transaction links ─────────────────────────────────────────────

    test('Award link opens the RFX award page @Requisition @Links @S49', async ({ page }) => {
        const code = await pr.openFirstTransactionFromListing(data.baseUrl);
        const links = await pr.getBlueLinkTexts();
        test.skip(!links.includes('Awards'), `${code} is not award-sourced (links: ${links.join(', ')})`);

        const popup = await pr.clickBlueLinkExpectingNewTab('Awards');
        expect(popup.url(), 'Award link did not open an RFX award page')
            .toMatch(/\/rfx\/\d+\/awards\/\d+/);
        await popup.close();
    });

    test('CXO link opens the CXO @Requisition @Links @S52', async ({ page }) => {
        const code = await pr.openFirstTransactionFromListing(data.baseUrl);
        const links = await pr.getBlueLinkTexts();
        const cxoLink = links.find(t => /^CXO-/.test(t));
        test.skip(!cxoLink, `${code} exposes no CXO link (links: ${links.join(', ')})`);

        const popup = await pr.clickBlueLinkExpectingNewTab(cxoLink);
        expect(popup.url(), 'CXO link did not open a CXO page').toMatch(/\/cxos?\//);
        await popup.close();
    });

    test('Intake link opens the Intake @Requisition @Links @S50', async ({ page }) => {
        const code = await pr.openFirstTransactionFromListing(data.baseUrl);
        const links = await pr.getBlueLinkTexts();
        const intakeLink = links.find(t => /^INT-/.test(t) || t === 'Intake');
        test.skip(!intakeLink,
            `${code} exposes no Intake link — an award-sourced PR shows Awards/CXO only (links: ${links.join(', ')})`);

        const popup = await pr.clickBlueLinkExpectingNewTab(intakeLink);
        expect(popup.url(), 'Intake link did not open an Intake page').toMatch(/\/intakes?\//);
        await popup.close();
    });

    test('Budget link opens the Budget @Requisition @Links @S51', async ({ page }) => {
        const code = await pr.openFirstTransactionFromListing(data.baseUrl);
        const links = await pr.getBlueLinkTexts();
        const budgetLink = links.find(t => /budget/i.test(t));
        test.skip(!budgetLink,
            `${code} exposes no Budget link (links: ${links.join(', ')})`);

        const popup = await pr.clickBlueLinkExpectingNewTab(budgetLink);
        expect(popup.url(), 'Budget link did not open a Budget page').toMatch(/budget/i);
        await popup.close();
    });

    // ── Line items ────────────────────────────────────────────────────────────

    test('Line Items grid renders the PR\'s rows @Requisition @LineItems', async () => {
        await pr.openFirstTransactionFromListing(data.baseUrl);
        const rows = await pr.getLineItemRowCount();
        expect(rows, 'PR shows no line items').toBeGreaterThan(0);

        const names = await pr.getLineItemProductNames();
        expect(names.length, 'line items have no product names').toBeGreaterThan(0);
    });

    test('clicking the item name opens the item details panel @Requisition @LineItems @S56', async ({ page }) => {
        await pr.openFirstTransactionFromListing(data.baseUrl);

        const link = page.locator(L.lineItemProductLink).first();
        await expect(link, 'no clickable product name in the line-item grid').toBeVisible();
        const itemName = ((await link.innerText()) || '').trim();

        // The panel needs TWO clicks with a gap between them — confirmed by QA
        // and by measurement: after one click the drawer paper sits off-screen
        // (x=1800, width=1, visibility:hidden); after the second it slides in to
        // x=1210, width=590, visible. A single click silently does nothing.
        //
        // Do NOT gate on GET /api/capp/products/{id} either: it only fires when
        // the product is not already cached, so waiting for it hangs on a warm
        // page.
        await link.click();
        await page.waitForTimeout(1000);
        await link.click();

        // NOTE: the drawer is position:fixed, so `offsetParent` is null for it.
        // A hand-rolled visibility check written that way reports "no panel"
        // even though it is on screen — use toBeVisible(), which measures the
        // bounding box.
        const drawer = page.locator(L.itemDetailsPaper).first();
        await expect(drawer).toBeVisible({ timeout: 15000 });

        // It must be THIS item's panel, not an empty shell.
        await expect(drawer).toContainText(itemName, { timeout: 10000 });
        await expect(drawer).toContainText(/Details/i);
    });

    // ── Back navigation ───────────────────────────────────────────────────────

    test('back arrow returns to the Requisition listing @Requisition @Navigation @S57', async () => {
        await pr.openFirstTransactionFromListing(data.baseUrl);
        await pr.clickBackArrow();
        await pr.assertOnListing();
    });
});
