import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { fillIntakeBulkTemplate, INTAKE_BULK_ROW } from '../pages/bulkUploadExcel';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Intake created via Bulk Upload — sheet scenario 10
//
//   "Verify that Intake can be created using Bulk Upload"
//
// QA's steps (2026-09-11): fill every field on the intake create page → Bulk
// Upload (top right) → Download Template → add the line item 100 times in the
// downloaded excel → save → upload → the line item shows 100 times on the create
// page → submit → approve until Released.
//
// EXACTLY 100 LINES, 100 IDENTICAL ROWS (QA, 2026-09-11). The header is built
// with NO manual line row — fillIntakeHeaderFields exists for that — so the 100
// uploaded rows are the whole grid and the count is unambiguous rather than 101.
//
// WHAT THIS ACTUALLY PROVES
// -------------------------
// That the round trip works on the REAL artefact: the template the app served
// this run, not a fixture committed months ago. If the template gains a column
// or a validation, this test fails — which is the point. The assertion is the
// grid's own serial column after the upload, so it proves the app ingested the
// rows, not merely that the request returned 200.
//
// Three traps are encoded in the helpers rather than here (see their comments):
// the dialog's input[type=file] is inert and the upload must go through the file
// chooser; columns H and L reject every value by design; and the grid is
// virtualised, so a DOM row count reports ~31 of 100.
// ─────────────────────────────────────────────────────────────────────────────

let dataSnapshot = null;

test.describe('Intake — create via Bulk Upload', () => {

    // ~150 interactions plus a 100-row upload against a slow shared UAT.
    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S10' }); });

    test('100 line items uploaded from the downloaded template reach a Released intake '
        + '@Intake @BulkUpload @S10 @Slow', async ({ page }) => {
        test.setTimeout(2_400_000); // 40 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── Intake create page, header fields only ──────────────────────────
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.closeAskAieraIfVisible();
        await a.selectIntakeTemplate();
        await a.expandIntakeSections();
        await a.fillIntakeHeaderFields(data);
        await a.takeScreenshot('s10_header_filled');

        // ── Bulk Upload → Download Template ─────────────────────────────────
        await a.openIntakeBulkUpload();
        const templatePath = await a.downloadIntakeTemplate();

        // ── 100 identical line items into the downloaded workbook ───────────
        const filled = path.join('downloads', `intake_bulk_100_${Date.now()}.xlsx`);
        await fillIntakeBulkTemplate(templatePath, filled, { count: 100, values: INTAKE_BULK_ROW });

        // ── Upload it ───────────────────────────────────────────────────────
        await a.uploadIntakeBulkFile(filled);
        await a.takeScreenshot('s10_after_upload');

        // ── The line item appears 100 times on the create page ──────────────
        await a.assertIntakeLineItemCount(100);

        // ── Submit → approve until Released ─────────────────────────────────
        await a.fillIntakePotentialSuppliers(data);
        await a.submitIntake();
        await a.completeIntakeSubmissionPopup();
        const code = await a.getCurrentIntakeCode();
        console.log(`[S10] intake submitted: ${code}`);
        expect(code, 'the bulk-uploaded intake should have a code').toBeTruthy();
        await a.takeScreenshot('s10_submitted');

        await a.approveIntakeUntilReleased(data, 'Approved by automation — scenario 10');
        await a.assertIntakeStatusReleased();
        console.log(`[S10] ${code} Released with 100 bulk-uploaded line items`);
        await a.takeScreenshot('s10_released');
    });

});
