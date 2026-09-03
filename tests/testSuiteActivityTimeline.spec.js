import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Activity timeline — download activities + comments
//
// Sheet scenarios 38 (CXO) · 39 (Intake) · 40 (RFX)
//
// One parametrised suite: the Activity Log is the same radix sheet on every v4
// detail page, reached from an icon-only clock button, with a download control
// in its header (verified live 2026-08-31 on all three modules).
//
// The export is generated CLIENT-SIDE (Blob → <a download>) and fires NO network
// request, so the assertion hangs off Playwright's `download` event. Watching
// for a response — the approach used for the v3 Regenerate Document tests —
// would never resolve here.
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = [
    { key: 'cxo',    scenario: 38, name: 'CXO',    url: () => data.savedCxo.url },
    { key: 'intake', scenario: 39, name: 'Intake', url: () => data.savedIntake.url },
    { key: 'rfx',    scenario: 40, name: 'RFX',    url: () => data.savedSourcingEvent.url },
];

test.describe('Activity timeline — download activities & comments', () => {

    test.describe.configure({ timeout: 150000 });

    for (const mod of MODULES) {

        test(`${mod.name}: Activity Log panel opens with entries @Activity @S${mod.scenario}`, async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await page.goto(mod.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            await a.openActivityLogPanel();
            await expect(page.locator(`xpath=${L.activityLogPanel}`).first()).toBeVisible();

            const entries = await a.activityLogEntryCount();
            expect(entries, `${mod.name} Activity Log shows no entries`).toBeGreaterThan(0);

            await a.closeActivityLogPanel();
        });

        test(`${mod.name}: Activity Log offers both download options @Activity @S${mod.scenario}`, async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await page.goto(mod.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            await a.openActivityLogPanel();
            const options = await a.getActivityDownloadOptions();
            expect(options).toContain('Download Activities');
            expect(options).toContain('Download Comments');

            await a.closeActivityLogPanel();
        });

        // ── KNOWN BUG ────────────────────────────────────────────────────────
        // "Download Comments" names its export
        //     ActivityTimeline_undefined_<timestamp>.xlsx
        // on CXO, Intake AND RFX (observed 2026-08-31), where "Download
        // Activities" correctly produces
        //     ActivityTimeline_Transaction Events_<timestamp>.xlsx
        // The file content is fine — only the middle segment of the filename is
        // the literal string "undefined", so a value is missing where the export
        // type should be interpolated.
        //
        // This test asserts the CORRECT behaviour and therefore FAILS until the
        // defect is fixed, matching how the CXO amend audit-log bug is tracked.
        test(`${mod.name}: Download Comments filename has no "undefined" segment @Activity @Download @KnownBug @S${mod.scenario}`, async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await page.goto(mod.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            await a.openActivityLogPanel();
            const file = await a.downloadActivityLogItem('Download Comments', mod.key);
            await a.closeActivityLogPanel();

            expect(file.name,
                `Comments export filename contains "undefined" — the export-type value is missing (got "${file.name}")`)
                .not.toContain('undefined');
        });

        for (const label of ['Download Activities', 'Download Comments']) {

            test(`${mod.name}: "${label}" produces a non-empty file @Activity @Download @S${mod.scenario}`, async ({ page }) => {
                const a = new NSEFoundationActions(page);
                await page.setViewportSize({ width: 1800, height: 900 });
                await a.openApp(data);

                await page.goto(mod.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(3500);

                await a.openActivityLogPanel();
                const file = await a.downloadActivityLogItem(label, mod.key);

                expect(file.name, 'downloaded file has no name').toBeTruthy();
                expect(file.size).toBeGreaterThan(0);

                await a.closeActivityLogPanel();
            });
        }
    }
});
