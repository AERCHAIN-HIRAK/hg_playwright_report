import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { rfxListingActions } from '../pages/rfxListingActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// RFX / Sourcing (Quote Requests) — negative & flow suite.
//
// Three areas (all under the shared NSEF login provided by nsef-setup):
//   1. /quote-requests LISTING — search / filter / pagination / navigation
//      negatives & edge cases (single "All" tab; no Create button — RFXs come
//      from sourcing).
//   2. REJECT during the sourcing approval workflow — build an intake → send for
//      sourcing → submit → Reject at Pending Approval → status Rejected.
//   3. MORE-DROPDOWN flows on a quote request — Audit Logs, Workflow Stages,
//      Regenerate Document, Download Document (the actions offered on an
//      existing RFX; reuse the generic v4 header More menu).
//
// The listing/More-dropdown tests need no setup (they run against existing quote
// requests). The Reject test builds its own RFX and is therefore long-running.
// ─────────────────────────────────────────────────────────────────────────────

// Reuse the generic (app-agnostic) search/filter negative payloads.
const ld = data.cxoListing;

// ── Shared helper: login + land on the /quote-requests listing ───────────────
async function loginAndOpenRfxListing(page) {
    const auth = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await auth.openApp(data);

    const list = new rfxListingActions(page);
    await list.navigateToListingPage();
    await list.assertOnListingPage();
    return list;
}

// ── Shared helper: login + open the first quote request's detail page ────────
async function loginAndOpenFirstQuoteRequest(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);

    const list = new rfxListingActions(page);
    await list.navigateToListingPage();
    await list.clickFirstRowCode();
    await list.verifyDetailPageOpened();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2500);
    return a;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. LISTING PAGE  (/quote-requests)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('RFX Listing Page', () => {

    test('listing page loads with table rows @RFX @Listing @Smoke', async ({ page }) => {
        test.setTimeout(120000);
        const list = await loginAndOpenRfxListing(page);
        await list.verifyRowCountGreaterThan(0);
    });

    // ── Search — Negative ────────────────────────────────────────────────────
    test.describe('Search — Negative', () => {

        test('non-existent search term shows no results without crashing @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.nonExistent);
            await list.verifyNoResultsShown();
            await list.verifyPageNotCrashed();
        });

        test('spaces-only search does not crash the page @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.emptySpaces);
            await list.verifyPageNotCrashed();
        });

        test('SQL-injection string does not break the page @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.sqlInjection);
            await list.verifyPageNotCrashed();
        });

        test('XSS payload does not inject a script @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.xssPayload);
            await list.verifyPageNotCrashed();
            expect(await page.evaluate(() => document.title.length)).toBeGreaterThan(0);
        });
    });

    // ── Search — Edge Cases ──────────────────────────────────────────────────
    test.describe('Search — Edge Cases', () => {

        test('very long search string does not crash @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.longString);
            await list.verifyPageNotCrashed();
        });

        test('special characters in search do not crash @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.specialChars);
            await list.verifyPageNotCrashed();
        });

        test('unicode characters in search do not crash @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.unicodeChars);
            await list.verifyPageNotCrashed();
        });

        test('different-case search does not crash the page @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.caseUpper);
            await list.verifyPageNotCrashed();
        });

        test('clearing the search restores records @RFX @Listing @Search', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.typeInSearch(ld.search.nonExistent);
            await list.clearSearch();
            await list.verifyRowCountGreaterThan(0);
        });
    });

    // ── Column Filters — Negative / Edge ─────────────────────────────────────
    test.describe('Filters — Negative / Edge', () => {

        test('non-existent value in Status filter does not crash the popup @RFX @Listing @Filter', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.openColumnFilter('Status');
            await list.searchInFilterPopup(ld.filter.invalidUser);
            await list.verifyFilterPopupOpen();   // popup still alive, no crash
        });

        test('special characters in Created By filter do not crash the popup @RFX @Listing @Filter', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.openColumnFilter('Created By');
            await list.searchInFilterPopup(ld.search.specialChars);
            await list.verifyFilterPopupOpen();
        });
    });

    // ── Pagination — Negative / Edge ─────────────────────────────────────────
    test.describe('Pagination — Negative / Edge', () => {

        test('search on page 2 does not crash the page @RFX @Listing @Pagination', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            test.skip(!(await list.isNextPageEnabled()), 'only one page of results');
            await list.clickNextPage();
            await list.typeInSearch(ld.search.byCodePartial);
            await list.verifyPageNotCrashed();
        });
    });

    // ── Row Navigation ───────────────────────────────────────────────────────
    test.describe('Row Navigation', () => {

        test('clicking the first row opens the RFX detail page @RFX @Listing @Navigation', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.clickFirstRowCode();
            await list.verifyDetailPageOpened();
        });

        test('browser back from the detail page returns to the listing @RFX @Listing @Navigation', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.clickFirstRowCode();
            await list.verifyDetailPageOpened();
            await list.navigateBackToListing();
            await list.assertOnListingPage();
            await list.verifyRowCountGreaterThan(0);
        });

        test('refreshing the detail page keeps the URL intact @RFX @Listing @Navigation', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenRfxListing(page);
            await list.clickFirstRowCode();
            await list.verifyDetailPageOpened();
            const url = page.url();
            await page.reload({ waitUntil: 'domcontentloaded' });
            expect(page.url()).toBe(url);
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. MORE-DROPDOWN FLOWS  (on an existing quote request)
//
// Exercises the actions offered by the RFX header More menu. These run against
// whatever quote request is first in the listing, so they need no setup.
// ═════════════════════════════════════════════════════════════════════════════

test.describe('RFX More Dropdown (Quote Request)', () => {

    test('More → Audit Logs opens the audit-log dialog @RFX @MoreDropdown', async ({ page }) => {
        test.setTimeout(150000);
        const a = await loginAndOpenFirstQuoteRequest(page);
        const text = await a.openCxoAuditLogs();       // generic More → Audit Logs
        expect(text.length).toBeGreaterThan(0);
        await a.takeScreenshot('rfx_more_audit_logs');
    });

    test('More → Workflow Stages opens the Workflow Steps panel @RFX @MoreDropdown', async ({ page }) => {
        test.setTimeout(150000);
        const a = await loginAndOpenFirstQuoteRequest(page);
        await a.openWorkflowStages();                  // asserts the panel title
        expect(await a.getWorkflowCount()).toBeGreaterThan(0);
        await a.takeScreenshot('rfx_more_workflow_stages');
        await a.closeWorkflowStages();
    });

    test('More → Regenerate Document shows the success toast @RFX @MoreDropdown', async ({ page }) => {
        test.setTimeout(150000);
        const a = await loginAndOpenFirstQuoteRequest(page);
        await a.regenerateCxoDocument();               // lenient toast: …regenerated successfully
        await a.takeScreenshot('rfx_more_regenerate');
    });

    test('More → Download Document downloads the RFX PDF @RFX @MoreDropdown', async ({ page }) => {
        test.setTimeout(150000);
        const a = await loginAndOpenFirstQuoteRequest(page);
        const { text, filename } = await a.downloadCxoDocumentText();
        expect(filename.length).toBeGreaterThan(0);
        expect(text.length).toBeGreaterThan(0);
        await a.takeScreenshot('rfx_more_download');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. REJECT DURING WORKFLOW
//
// Build a fresh intake → Released → Send For Sourcing → submit the sourcing
// event (→ Pending Approval) → Reject during the workflow → status Rejected.
// Long-running: full intake approval + sourcing creation.
// ═════════════════════════════════════════════════════════════════════════════

test.describe('RFX Reject during workflow', () => {
    test('Sourcing event → submit → Reject at Pending Approval → status Rejected @RFX @Reject', async ({ page }) => {
        test.setTimeout(1200000); // 20 min — intake to Released + sourcing + reject

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        // Build + approve an intake to Released so it can be sent for sourcing.
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.createAndSubmitIntake(data);
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();
        await a.takeScreenshot('rfx_reject_intake_released');

        // Reopen the intake → Process → Send For Sourcing → fill the event.
        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.expandSourcingSections();
        await a.selectSourcingPaymentTerms();
        await a.fillSourcingCommercialBidDueDate(data);
        await a.fillSourcingTechnicalBidDueDate(data);
        await a.fillSourcingExpectedDeliveryDate(data);
        await a.addSourcingSupplier(data);

        // Submit the sourcing event → it enters the approval workflow.
        await a.submitSourcingEvent();
        await a.saveSourcingEventCode();
        await a.takeScreenshot('rfx_reject_sourcing_submitted');

        // Reject during the workflow → status becomes Rejected.
        await a.rejectRfx('Rejected by automation');
        await a.assertSourcingStatusRejected();
        await a.takeScreenshot('rfx_reject_done');
    });
});
