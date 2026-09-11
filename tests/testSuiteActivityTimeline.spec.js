import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Activity timeline — download activities + comments
//
// Sheet scenarios 35 (CXO) · 36 (Intake) · 37 (RFX)
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

// `commentUrl` is the transaction to use for the COMMENT-dependent tests, where
// that differs from the one used for the read-only checks.
//
// It exists because commenting is state-dependent: an AWARDED RFX renders the
// Activity Log with its filter chips and feed but NO comment field at all, so
// the Comments export has no conversation to be named after and comes back as
// ActivityTimeline_undefined_<ts>.xlsx. savedSourcingEvent (RFX-26-243) is
// Awarded, so the comments half of scenario 37 runs against a non-awarded RFX
// instead. CXO and Intake need no split — both allow commenting in their saved
// state, so they fall back to `url`.
const MODULES = [
    { key: 'cxo',    scenario: 35, name: 'CXO',    url: () => data.savedCxo.url },
    { key: 'intake', scenario: 36, name: 'Intake', url: () => data.savedIntake.url },
    { key: 'rfx',    scenario: 37, name: 'RFX',    url: () => data.savedSourcingEvent.url,
                                                   commentUrl: () => data.commentableSourcingEvent.url },
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

        // ── Comments export filename ─────────────────────────────────────────
        // "Download Comments" was originally recorded as a defect: it named its
        // export ActivityTimeline_undefined_<ts>.xlsx on CXO, Intake AND RFX
        // (observed 2026-08-31), where "Download Activities" correctly produced
        // ActivityTimeline_Transaction Events_<ts>.xlsx.
        //
        // NOT A DEFECT — retracted by QA 2026-09-04. The transactions simply had
        // no comments, so the export had no conversation to name itself after.
        // Post a comment first and the same export comes back as
        // ActivityTimeline_Conversations_<ts>.xlsx.
        //
        // So the add-comment step below is the precondition under test, not
        // setup noise: drop it and this test legitimately fails again.
        test(`${mod.name}: Download Comments is named after the conversation once a comment exists @Activity @Download @S${mod.scenario}`, async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await page.goto((mod.commentUrl ?? mod.url)(), { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            await a.openActivityLogPanel();

            // The fixture is chosen to be commentable, so an absent field is a
            // real failure now — most likely the fixture transaction has since
            // been awarded/closed and needs replacing.
            expect(await a.hasActivityLogCommentField(),
                `${mod.name}: no add-comment field on this transaction — it is probably awarded/closed now; point the fixture at a non-awarded one`)
                .toBe(true);

            await a.addActivityLogComment(`Automation ${mod.name} comment ${Date.now()}`);
            const file = await a.downloadActivityLogItem('Download Comments', mod.key);
            await a.closeActivityLogPanel();

            expect(file.name,
                `Comments export filename still contains "undefined" even though a comment exists (got "${file.name}")`)
                .not.toContain('undefined');
            expect(file.name.toLowerCase(),
                `Comments export should be named after the conversation (got "${file.name}")`)
                .toContain('conversations');
        });

        for (const label of ['Download Activities', 'Download Comments']) {

            test(`${mod.name}: "${label}" produces a non-empty file @Activity @Download @S${mod.scenario}`, async ({ page }) => {
                const a = new NSEFoundationActions(page);
                await page.setViewportSize({ width: 1800, height: 900 });
                await a.openApp(data);

                const target = label === 'Download Comments'
                    ? (mod.commentUrl ?? mod.url)()
                    : mod.url();
                await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(3500);

                await a.openActivityLogPanel();
                // Comments export needs a conversation to exist first (see above).
                // Guarded rather than unconditional so this still downloads even if
                // the fixture is later awarded — the export must work either way.
                if (label === 'Download Comments' && await a.hasActivityLogCommentField()) {
                    await a.addActivityLogComment(`Automation ${mod.name} comment ${Date.now()}`);
                }
                const file = await a.downloadActivityLogItem(label, mod.key);

                expect(file.name, 'downloaded file has no name').toBeTruthy();
                expect(file.size).toBeGreaterThan(0);

                await a.closeActivityLogPanel();
            });
        }
    }
});
