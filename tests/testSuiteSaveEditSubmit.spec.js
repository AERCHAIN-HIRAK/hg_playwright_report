import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Save → edit → submit during creation
//
// Sheet scenarios 14 (CXO) · 15 (Intake)
//
// The RFX / GRN / Invoice variants were removed from the sheet by QA on
// 2026-09-02 — those create pages have no Save control (see below).
//
// The pattern is the same in every module: fill the create form, Save it WITHOUT
// submitting (so it lands in Draft), reopen it, change something, then Submit —
// and the workflow must start from the edited values, not the saved ones.
//
// Save is an icon-only button (lucide-save) on the v4 create pages, sitting next
// to AI Polish — it has no accessible name, so the icon class is the anchor.
// A Draft has no header Edit button either; Edit lives in the More dropdown.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.resolve('pages/NSEFoundationData.json');

/**
 * Snapshot / restore pages/NSEFoundationData.json around a test.
 *
 * createCxoDraft() and createIntakeDraft() persist the new record into the
 * SHARED fixture (savedCxo / savedIntake) — which other suites depend on. This
 * suite creates throwaway drafts, so leaving those pointers behind actively
 * breaks later tests: on the first run, the CXO test replaced savedCxo with a
 * Pending Approval draft, and the Intake test then failed because the "CXO
 * Transaction" dropdown only lists eligible (Released) CXOs. The Non-PO invoice
 * suite reads the same pointer and would have broken the same way.
 */
function snapshotFixture() {
    return fs.readFileSync(DATA_FILE, 'utf-8');
}
function restoreFixture(snapshot) {
    fs.writeFileSync(DATA_FILE, snapshot);
}

test.describe('Save → edit → submit during creation', () => {

    test.describe.configure({ timeout: 300000 });

    let fixtureSnapshot;
    test.beforeEach(() => { fixtureSnapshot = snapshotFixture(); });
    test.afterEach(() => { restoreFixture(fixtureSnapshot); });

    // ── CXO (scenario 14) ─────────────────────────────────────────────────────
    test('CXO: save as Draft → edit the title → Submit @SaveEdit @CXO @S14', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.waitForCreatePageLoaded();

        // 1. Save without submitting → Draft
        await a.createCxoDraft(data);
        await a.assertCxoStatusDraft();
        console.log(`[S14] draft CXO id = ${a.getSavedCxoCode()}`);

        // 2. Reopen from the Draft, edit, submit
        const newTitle = await a.editDraftCxoAndSubmit();

        // 3. The submitted CXO must carry the EDITED title, and must have left
        //    Draft — otherwise Save/edit silently discarded the change.
        await a.assertCxoStatusPendingApproval();
        const body = await page.locator('body').innerText();
        expect(body, 'submitted CXO does not show the edited title').toContain(newTitle);
    });

    // ── Intake (scenario 15) ──────────────────────────────────────────────────
    test('Intake: save as Draft → edit the title → Submit @SaveEdit @Intake @S15', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();

        await a.createIntakeDraft(data);
        await a.assertIntakeStatusDraft();

        // editAndResubmitDraftIntake appends " - recalled edit" to the title and
        // submits through the workflow popup.
        await a.editAndResubmitDraftIntake(data);

        // Leaving Draft is the proof the resubmit actually took.
        const body = await page.locator('body').innerText();
        expect(body, 'intake is still in Draft after resubmitting').not.toMatch(/\bDraft\b/);
    });

    // ── Save control availability ─────────────────────────────────────────────
    //
    // The RFX / GRN / Invoice equivalents of this scenario (old sheet numbers
    // 16, 17, 18) were REMOVED by QA on 2026-09-02: those three create pages
    // have no Save control at all, so there is no draft to reopen and edit.
    // Probed live —
    //   RFX     (intake → Send For Sourcing)      0 lucide-save buttons
    //   GRN     (/pending-inwards/po/<id>/inward) 0
    //   Invoice (/invoices/new)                   0, only Cancel / Submit
    //
    // Save-as-draft therefore exists only on CXO and Intake. These checks pin
    // that down, so a regression that removes Save from either is caught.
    test.describe('Save control availability', () => {

        test('CXO create page offers Save as draft @SaveEdit @CXO @S14', async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await a.clickCxoTab();
            await a.clickCreateCxo();
            await a.waitForCreatePageLoaded();

            expect(await a.hasSaveDraftButton(), 'CXO create page has no Save control').toBeTruthy();
            await expect(page.locator(`xpath=${L.v4SaveDraftBtn}`).first()).toBeVisible();
        });

        test('Intake create page offers Save as draft @SaveEdit @Intake @S15', async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await a.clickIntakeTab();
            await a.clickCreateIntake();
            await a.waitForCreatePageLoaded();

            expect(await a.hasSaveDraftButton(), 'Intake create page has no Save control').toBeTruthy();
            await expect(page.locator(`xpath=${L.v4SaveDraftBtn}`).first()).toBeVisible();
        });
    });
});
