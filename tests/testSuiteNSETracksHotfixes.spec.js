import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// NSE Tracks & Hotfixes — combined suite:
//   • Tracks   — end-to-end coverage for the Tracks feature/module.
//   • Hotfixes — targeted regression checks that shipped bug fixes stay fixed.
//
// Uses the shared NSEF login (nsefsupport@demo.com) via the nsef-setup project
// (auth.nsef.json), same as the NSEF happy-paths / Intake Negative suites.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared helper: login + land on the app home ──────────────────────────────
async function loginAndOpenApp(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    await a.openApp(data);

    return a;
}

// ── Tracks ───────────────────────────────────────────────────────────────────
test.describe('NSE Tracks & Hotfixes › Tracks', () => {

    // Every module should list transactions scoped to the logged-in user's
    // department access. This case adjusts the admin's Department dimension
    // access via Org Settings › User Management (unchecks its "Full Access"),
    // then returns to the dashboard. Org Settings opens in a NEW TAB on the
    // admin subdomain; the actions switch tabs transparently.
    test('Modules show transactions per user department access @Tracks @DeptAccess', async ({ page }) => {
        test.setTimeout(300000); // 5 min — admin update + multi-module checks

        const a = await loginAndOpenApp(page);

        // ── Org Settings › User Management: adjust Department Full Access ──────
        await a.clickOrgSettings();          // opens the admin tab
        await a.clickUserManagement();
        await a.clickUsers();
        await a.openUserByName('NSEF Support Admin');
        // Branch logic (state-dependent): if unchecked → check/Update/uncheck/Update
        // then close the drawer; if checked → just uncheck. Asserts the
        // "User updated successfully" toast on each Update.
        await a.handleDepartmentFullAccess();

        // Back to the dashboard (close the admin tab, return to the v4 tab).
        await a.clickHomeIcon();
        await a.waitForUserDashboard();

        // TODO: next steps (per-module transaction verification) — awaiting
        // dictation from user.
    });

});

// ── Hotfixes (regression) ─────────────────────────────────────────────────────
test.describe('NSE Tracks & Hotfixes › Hotfixes', () => {

    // Dictated hotfix regression cases go here.

});
