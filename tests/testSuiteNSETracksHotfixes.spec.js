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

// ── Tracks: Org Settings › Others › Audit logs ───────────────────────────────
// Every action in NSE is recorded in the org-level Audit Logs. Export to Excel
// is allowed for a range of at most 90 days ("3 months"); anything longer
// disables the export icon with a "Cannot export data over 3 months" tooltip.
test.describe('NSE Tracks & Hotfixes › Audit Logs (Org Settings)', () => {

    async function openAuditLogs(page) {
        const a = await loginAndOpenApp(page);
        await a.clickOrgSettings();   // opens the admin tab
        await a.clickOthers();
        await a.clickAuditLogs();     // admin tab navigates to /audit-logs
        return a;
    }

    test('Export audit logs for last 90 days downloads Excel with data @Tracks @AuditLogs', async ({ page }, testInfo) => {
        test.setTimeout(480000); // 8 min — each step may wait up to 60s on a slow network
        const a = await openAuditLogs(page);

        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - 90);
        await a.setAuditDateRange(from, today);

        await a.exportAuditLogsAndVerifyExcel(testInfo);
    });

    test('Export over 3 months (4 months) is blocked with tooltip @Tracks @AuditLogs', async ({ page }) => {
        test.setTimeout(480000); // 8 min — each step may wait up to 60s on a slow network
        const a = await openAuditLogs(page);

        const today = new Date();
        const from = new Date(today);
        from.setMonth(from.getMonth() - 4);
        await a.setAuditDateRange(from, today);

        await a.verifyAuditExportBlockedOverLimit();
    });

});

// ── Tracks: Budgets › Transfer Budget (internal) ────────────────────────────
// Dedicated budget "Automation Purpose - Transfer 1" (item 1 / item 2, 1,000,000
// each). Move 200000 item 1 → item 2, then back, checking the Activity Timeline
// after each transfer and the item totals at the end. A previous run that died
// mid-way is rebalanced first so it can't fail every later run.
test.describe('NSE Tracks & Hotfixes › Budget Transfer', () => {

    const BUDGET = 'Automation Purpose - Transfer 1';
    const I1 = 'item 1', I2 = 'item 2', AMT = 200000, START = 1000000;

    test('Internal transfer between budget items and back @Tracks @BudgetTransfer', async ({ page }) => {
        test.setTimeout(600000); // 10 min — every step may wait up to 60s
        const a = await loginAndOpenApp(page);

        await a.openBudgetsModule();
        await a.openBudgetByName(BUDGET);
        await a.rebalanceBudgetItems(I1, I2);

        const before = await a.readBudgetItemTotals();
        expect(before[I1], 'item 1 starting total').toBe(START);
        expect(before[I2], 'item 2 starting total').toBe(START);
        const fwd0 = await a.countTransferTimelineEntries(I1, I2);
        const back0 = await a.countTransferTimelineEntries(I2, I1);

        // ── Transfer 1: item 1 → item 2 ─────────────────────────────────────
        await a.internalBudgetTransfer(I1, I2, AMT);
        await a.reloadBudget();
        await a.waitForTransferTimelineEntries(I1, I2, fwd0 + 1);
        const mid = await a.readBudgetItemTotals();
        expect(mid[I1]).toBe(START - AMT);
        expect(mid[I2]).toBe(START + AMT);

        // ── Transfer 2: item 2 → item 1 ─────────────────────────────────────
        await a.internalBudgetTransfer(I2, I1, AMT);
        await a.reloadBudget();
        await a.waitForTransferTimelineEntries(I2, I1, back0 + 1);

        const after = await a.readBudgetItemTotals();
        expect(after[I1], 'item 1 total after both transfers').toBe(START);
        expect(after[I2], 'item 2 total after both transfers').toBe(START);
    });

    // External: Transfer 1 item 1 → Transfer 2 item 1, then back. Each side logs
    // its own wording — the sender "Transferred … of <target code>", the receiver
    // "Received … of <source code>" — so each budget's check is direction-specific.
    test('External transfer between two budgets and back @Tracks @BudgetTransfer @External', async ({ page }) => {
        test.setTimeout(900000); // 15 min — two budgets, every step may wait up to 60s
        const T1 = 'Automation Purpose - Transfer 1', T1_CODE = 'OPX-FNSE-26-21';
        const T2 = 'Automation Purpose - Transfer 2', T2_CODE = 'OPX-FNSE-26-22';
        const A = NSEFoundationActions;
        const t1Sent = A.sentTransferRe(I1, I1, T2_CODE), t1Recv = A.receivedTransferRe(I1, I1, T2_CODE);
        const t2Sent = A.sentTransferRe(I1, I1, T1_CODE), t2Recv = A.receivedTransferRe(I1, I1, T1_CODE);
        const a = await loginAndOpenApp(page);

        await a.rebalanceItemAcrossBudgets(T1, T2, I1); // ends on T1
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 1 item 1 starting total').toBe(START);
        const t1Sent0 = await a.countTimelineEntries(t1Sent, 'T1 sent to T2');
        const t1Recv0 = await a.countTimelineEntries(t1Recv, 'T1 received from T2');

        await a.openBudgetsModule(); await a.openBudgetByName(T2);
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 2 item 1 starting total').toBe(START);
        const t2Sent0 = await a.countTimelineEntries(t2Sent, 'T2 sent to T1');
        const t2Recv0 = await a.countTimelineEntries(t2Recv, 'T2 received from T1');

        // ── Transfer 1 → Transfer 2 ─────────────────────────────────────────
        await a.openBudgetsModule(); await a.openBudgetByName(T1);
        await a.externalBudgetTransfer(T2, I1, I1, AMT);
        await a.reloadBudget();
        await a.waitForTimelineEntries(t1Sent, 'T1 sent to T2', t1Sent0 + 1);
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 1 item 1 after sending').toBe(START - AMT);

        await a.openBudgetsModule(); await a.openBudgetByName(T2);
        await a.waitForTimelineEntries(t2Recv, 'T2 received from T1', t2Recv0 + 1);
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 2 item 1 after receiving').toBe(START + AMT);

        // ── Transfer 2 → Transfer 1 ─────────────────────────────────────────
        await a.externalBudgetTransfer(T1, I1, I1, AMT);
        await a.reloadBudget();
        await a.waitForTimelineEntries(t2Sent, 'T2 sent to T1', t2Sent0 + 1);
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 2 item 1 after sending back').toBe(START);

        await a.openBudgetsModule(); await a.openBudgetByName(T1);
        await a.waitForTimelineEntries(t1Recv, 'T1 received from T2', t1Recv0 + 1);
        expect((await a.readBudgetItemTotals())[I1], 'Transfer 1 item 1 after receiving back').toBe(START);
    });
});

// ── Hotfixes (regression) ─────────────────────────────────────────────────────
test.describe('NSE Tracks & Hotfixes › Hotfixes', () => {

    // Dictated hotfix regression cases go here.

});
