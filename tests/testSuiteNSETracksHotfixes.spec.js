import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import { buildRfxToForeclose, buildToPoViaCapp } from '../pages/chainBuilders';

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

// ── Tracks: Advance on a non-PO CXO, adjusted on the CXO invoice ─────────────
// Non-PO CXO of V = 200000 → Advance for 250000 is blocked by budget → Advance
// for V/2 → Review → Accounted → + Payment 100000 → Paid → CXO invoice for V
// with that advance selected → view page shows Paid 100000 / Balance 100000.
test.describe('NSE Tracks & Hotfixes › Advance against non-PO CXO', () => {

    const V = data.nonPoInvoice.cxoValue;   // 200000
    const OVER = 250000, ADVANCE = V / 2, PAID = 100000;
    const nonPoData = { ...data, cxo: { ...data.cxo, transactionFlowType: 'Non-PO Based' } };

    // Slow-network tolerance, as for the other Tracks: the repo-wide 5s action /
    // 15s navigation limits are too tight for the V3 Advances + Invoice pages.
    test.use({ actionTimeout: 60000, navigationTimeout: 60000 });

    // createAndReleaseCxo rewrites savedCxo with a Non-PO CXO the chain suites
    // must not inherit — snapshot and restore.
    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'TracksAdvance' }); });

    test('Advance over CXO value is blocked, then advance → payment → invoice adjusts it @Tracks @Advance @Budget', async ({ page }) => {
        test.setTimeout(1500000); // 25 min — CXO approvals, advance, payment, invoice
        const a = await loginAndOpenApp(page);

        // ── Non-PO CXO, released ────────────────────────────────────────────
        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.createAndReleaseCxo(nonPoData);
        const cxoCode = a.getSavedCxoCode();

        // ── Advance: over the CXO value is refused ──────────────────────────
        await a.openAdvanceCreateDrawer();
        await a.fillAdvanceHeader(data, cxoCode, OVER);
        await a.addAdvanceLineItem(data, { qty: 1, price: OVER });
        await a.assertAdvanceBudgetExceeded();

        // ── Advance for half the CXO value → Review → Accounted ─────────────
        await a.setAdvanceAmount(ADVANCE, { line: true });
        const advance = await a.submitAdvanceAndOpen(cxoCode);
        await a.reviewAdvance();
        await a.assertAdvanceStatus(advance.id, 'Accounted');

        // ── Payment → Paid ──────────────────────────────────────────────────
        await a.payAdvance(PAID);
        await a.assertAdvanceStatus(advance.id, 'Paid');

        // ── CXO invoice for the full value, adjusted against the advance ────
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate(data);
        await a.expandNonPoSections();
        await a.selectNonPoCxo(cxoCode);
        await a.fillNonPoBudgetCombination(data);
        await a.selectNonPoBrf(data);
        await a.fillNonPoInvoiceDetails(data);
        await a.addNonPoLineItem(data, { qty: '1', price: String(V) });
        // Only after the line: before it, Save refuses with "Advances used amount
        // can not exceed Invoice Amount".
        // Submitting without picking the advance is stopped by an "advance
        // available for selection" popup → Make Changes returns to the form.
        await a.submitInvoiceExpectingAdvancePrompt();
        await a.selectInvoiceAdvance(advance.code);
        await a.submitInvoice();

        expect(await a.readNonPoTotal('Paid Amount'), 'Paid Amount on the invoice').toBe(PAID);
        expect(await a.readNonPoTotal('Balance'), 'Balance on the invoice').toBe(V - PAID);
    });
});

// ── Tracks: Award Notes carry to the auto PR and PRC, not to the PO ──────────
// RFX → foreclose → Award (Notes filled at the bottom of the New Award page) →
// auto PR shows the notes (before and after PR edit-submit) → PRC shows them →
// the auto PO does NOT.
test.describe('NSE Tracks & Hotfixes › Award notes carry-forward', () => {

    test.use({ actionTimeout: 60000, navigationTimeout: 60000 });

    // The chain rewrites saved CXO/Intake/RFX/PR codes — snapshot and restore.
    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'TracksAwardNotes' }); });

    test('Award notes reach the PR and PRC but not the PO @Tracks @Award @Notes', async ({ page }) => {
        test.setTimeout(3600000); // 60 min — full RFX → PO chain
        const a = await loginAndOpenApp(page);
        const NOTES = `Award notes by automation ${Date.now()}`;

        // ── RFX → foreclose → Award with Notes → auto PR ────────────────────
        await buildRfxToForeclose(a, data);
        await a.clickAnalysisTab();
        await a.clickAwardButton();
        await a.fillAllocatedQuantity();
        await a.fillAwardNotes(NOTES);
        await a.clickAwardButton();
        await a.submitWorkflowSummary();
        await a.completeAwardApprovals('Approved by automation');
        await a.clickAwardBackArrow();
        await a.waitForRequisitionCode();
        await a.openRequisitionAndSaveCode();

        // ── PR: notes carried from the award ────────────────────────────────
        await a.openSavedRequisition(data);
        expect(await a.pageHasNotes(NOTES, 'PR'), 'award notes on the auto PR').toBe(true);

        await a.clickPrEdit();
        await a.fillPrEffectiveFromDate();
        await a.fillPrEffectiveToDate(data);
        await a.selectPrPurchaseType(data);
        await a.selectPrInwardRequiredYes();
        await a.selectPrInwardMatchingQuantity();
        await a.submitPr();
        await a.assertPrSubmitted();
        await a.saveRequisitionCode();
        await a.waitForPrStatus(['Processed', 'Completed']);
        await a.waitForPrStatus('Completed');
        await a.openSavedRequisition(data);
        expect(await a.pageHasNotes(NOTES, 'PR'), 'award notes still on the PR after submit').toBe(true);

        // ── PRC: notes carried ──────────────────────────────────────────────
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        expect(await a.pageHasNotes(NOTES, 'PRC'), 'award notes on the PRC').toBe(true);

        // ── PO: notes NOT carried ───────────────────────────────────────────
        await a.openPoFromConversionViewInNewTab();
        expect(await a.pageHasNotes(NOTES, 'PO'), 'award notes must NOT reach the PO').toBe(false);
    });
});

// ── Tracks: PO advance → PO invoice auto-mapping ─────────────────────────────
// PO (100 × 2000 = 200000) → two advances of 100000 from the PO page (line price
// 2000 → 1000), each Reviewed and Paid → GRN. The PO invoice with the advance
// auto-mapped is ON HOLD: the auto-mapping is broken and raised for a fix.
test.describe('NSE Tracks & Hotfixes › PO advance auto-mapping', () => {

    const ADVANCE = 100000, LINE_PRICE = 1000;

    test.use({ actionTimeout: 60000, navigationTimeout: 60000 });

    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'TracksPoAdvance' }); });

    test('Two paid PO advances consume the PO, then GRN @Tracks @Advance @PO', async ({ page }) => {
        test.setTimeout(3600000); // 60 min — full chain, two advances, GRN
        const a = await loginAndOpenApp(page);

        // ── CXO → PO, approved ──────────────────────────────────────────────
        await buildToPoViaCapp(a, data);
        const po = a.getSavedPurchaseOrder();
        console.log(`[PO-ADV] PO ${po.code} → ${po.url}`);

        const advances = [];
        for (let n = 1; n <= 2; n++) {
            // ── PO › Create › Request Advance ───────────────────────────────
            if (n === 1) await a.openSavedPurchaseOrder(data);
            await a.clickPoRequestAdvance();
            await a.fillPoAdvanceHeader(ADVANCE);
            await a.setPoAdvanceLinePrice(LINE_PRICE, ADVANCE);
            await a.submitPoAdvance();

            // ── Advances listing → our PO's advance → Review → Pay ──────────
            const adv = await a.openAdvanceForPo(po.code, advances.map(x => x.code));
            await a.reviewAdvance();
            await a.assertAdvanceStatus(adv.id, 'Accounted');
            await a.payAdvance(ADVANCE);
            await a.assertAdvanceStatus(adv.id, 'Paid');
            advances.push(adv);
            console.log(`[PO-ADV] advance ${n}: ${adv.code} Paid ${ADVANCE}`);

            // ── back to the PO through the advance's PO code ────────────────
            await a.openPoFromAdvance(po.code);
        }

        // ── GRN from CAPP, approved ─────────────────────────────────────────
        await a.clickPoCreateGrn();
        await a.submitSelectPoItemsPopup();
        await a.fillGrnGeneralDetails(data);
        await a.fillGrnDocumentDetails(data);
        await a.assertGrnReceivedMatchesPoQty();
        await a.submitGrn();
        await a.saveGrnCode();
        await a.approveGrnUntilInwarded('Approved by automation');
        await a.assertGrnInwarded();

        // ON HOLD — PO invoice with the advances auto-mapped (bug raised).
    });
});

// ── Tracks: Supplier Portal › Payments › Export ──────────────────────────────
// HG Automation SUPP exports its Payments listing. The export is invoice-level
// ("Payments-Report.xlsx": Invoice Code, UTR / Transaction Reference, Paid
// Amount, …) and carries no Payment-FNSE codes, so the listing's first row is
// matched to the Excel by UTR, and its Paid Amount must agree.
test.describe('NSE Tracks & Hotfixes › SAPP Payments export', () => {

    test.use({ actionTimeout: 60000, navigationTimeout: 60000 });

    const COLUMNS = [
        'Invoice Code', 'Invoice ID', 'Invoice Reference', 'Supplier Name',
        'UTR / Transaction Reference', 'Invoice Date', 'Invoice Created Date',
        'Invoice Accounted Date', 'Invoice Payment Status', 'Invoice Subtotal',
        'Total Invoice Amount', 'Payment Amount', 'Paid Amount', 'Actual Payment Date',
        'Payment Mode', 'Payment Type', 'Payment Remarks', 'Payment Currency',
    ];

    test('Payments export downloads an Excel with the listed payments @Tracks @SAPP @Export', async ({ page }, testInfo) => {
        test.setTimeout(300000); // 5 min — SAPP login + export on a slow link
        await page.setViewportSize({ width: 1800, height: 900 });
        const s = new SupplierPortalActions(page);

        await s.openSappModule('Payments');
        const first = await s.readFirstListingRow();

        const { header, rows } = await s.exportListingToExcel(testInfo);
        expect(header, 'export columns').toEqual(COLUMNS);
        expect(rows.length, 'export should contain data rows').toBeGreaterThan(0);

        const hit = rows.find(r => String(r['UTR / Transaction Reference'] ?? '').trim() === first.UTR);
        expect(hit, `listing's first UTR ${first.UTR} should be in the export`).toBeTruthy();
        expect(Number(hit['Paid Amount']), 'Paid Amount in the export')
            .toBe(Number(first['Paid Amount'].replace(/[^\d.]/g, '')));
        expect(hit['Supplier Name']).toBe('HG Automation SUPP');
        console.log(`[SAPP] ${first.Code} / ${first.UTR} → ${hit['Invoice Code']} paid ${hit['Paid Amount']}`);
    });
});

// ── Hotfixes (regression) ─────────────────────────────────────────────────────
test.describe('NSE Tracks & Hotfixes › Hotfixes', () => {

    // Dictated hotfix regression cases go here.

});
