import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

const V3 = 'https://nse-capp-uat.aerchain.io';

// ─────────────────────────────────────────────────────────────────────────────
// Lowered PO qty returns to the PRC for the next PO — sheet scenario 12
//
//   "Verify that the lowered qty during PO Reject edit is avilable in the PRC
//    for creation of the nect PO"
//
// QA's steps (2026-09-11): CXO → PO as configured → reject the PO during
// approvals → edit it → lower the QTY → submit → open the PRC → expand the RC
// section inside the Requisition Conversion View → the "Convert to PO" button is
// BLUE → click it → add the needed details → submit the PO conversion.
//
// RUN 1 IS A DISCOVERY RUN. Two things are unmapped and a full chain costs ~16
// min per attempt, so this buys facts rather than guessing:
//   · the PO edit form - there is no known quantity cell and no submitPo helper
//     (the GRN and Invoice equivalents exist; the PO one never has). The helper
//     dumps the form's fields and grid columns when its guess misses.
//   · the Convert to PO control - a PRC with no spare quantity shows no such
//     button at all (verified live on PRC-NSEFN-26-165, whose only buttons are
//     More / Overview / Process / Transactions), so its enabled state and its
//     "blue" can only be observed AFTER the reject-edit frees quantity.
//
// The RC section is Rate Contract: a normal PRC renders "Rate Contract No RC".
//
// ── ONE CHAIN, THREE SERIAL STEPS (merged 2026-11-24) ───────────────────────
// S131-PO, S12 and S65 each built a PO in Pending Approval. They now share one:
//
//   1  S131-PO  the approver REJECTS the PO → it leaves "Pending My Approval"
//   2  S12      that rejected PO is edited down to 50 → the PRC converts the
//               freed 50 into a NEW PO
//   3  S65      the new PO (Pending Approval, as conversions land — seen on
//               PO-NSEFN-26-592, 2026-11-24) is RECALLED with a reason → Rejected
//
// Each scenario keeps its own action: S131 and S12 both start from an approver
// reject, and S65 recalls a PO that is genuinely Pending Approval (asserted
// before the recall). SERIAL: a failed step skips the rest; a retry rebuilds.
// ─────────────────────────────────────────────────────────────────────────────

const LOWER_QTY = '50';   // the PO is built at qty 100

// Every PO code rendered on the page, header first. Same pattern as
// assertPoCodeVisible; field values are included because some forms hold the
// code only in an input.
const readPoCodes = (pg) => pg.evaluate(() => {
    const re = /PO-[A-Z]+-\d+-\d+/g;
    const out = new Set();
    const eat = (s) => { for (const m of (s || '').matchAll(re)) out.add(m[0]); };
    eat(document.body.innerText);
    for (const f of document.querySelectorAll('input, textarea')) eat(f.value);
    return [...out];
});

let dataSnapshot = null;

test.describe.serial('PO reject → reject-edit → recall on one chain (S131-PO + S12 + S65)', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S131+S12+S65' }); });

    // Handed between the serial steps (same worker, same order).
    let origPo = null;    // { url, code } — the auto-created PO, rejected in step 1
    let newPo = null;     // { url, code } — the PO converted from the PRC in step 2

    const newActions = async (page) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);
        return a;
    };

    // ── Scenario 131 (PO) ─────────────────────────────────────────────────────
    // "rejecting … updates its status correctly across all applicable pages" —
    // QA (2026-09-08): after the reject, the listing's pending-approval view must
    // no longer show it. The v3 PO view is "Pending My Approval" (word order),
    // ONE page of 20 rows with no pager, newest first — so a still-queued PO
    // created moments ago would sit at the top. The CXO and Invoice halves of
    // S131 stay in testSuiteRejectedNotPending.
    test('a rejected PO is not in Pending My Approval @Reject @Listing @S131 @PO',
        async ({ page }) => {
            test.setTimeout(2700000); // 45 min — the chain is most of it
            const a = await newActions(page);

            // approvePo:false leaves the PO in Pending Approval, i.e. actually in
            // the queue — rejecting an already-approved PO would prove nothing.
            await buildToPoViaCapp(a, data, { approvePo: false });
            // buildToPoViaCapp ends by opening the PO in a NEW TAB and the actions
            // object switches to it, so read everything off a.page.
            origPo = { url: a.page.url(), code: (await readPoCodes(a.page))[0] ?? null };
            expect(origPo.code, 'could not read the built PO code').toBeTruthy();
            console.log(`[S131-PO] built ${origPo.code} in Pending Approval @ ${origPo.url}`);

            await a.rejectCappDoc('Rejected by automation — scenarios 131 / 12', 'S131-PO');
            await a.takeScreenshot('s12_po_rejected');

            await a.openPendingApprovalView(`${V3}/purchase-orders`, 'Pending My Approval', 'S131-PO');
            const codes = await a.listingCodesAcrossPages(15, 'S131-PO');
            console.log(`[S131-PO] looking for ${origPo.code} in "Pending My Approval" — ${codes.length} row(s) scanned`);
            expect(codes, `${origPo.code} was rejected but is STILL listed in "Pending My Approval"`)
                .not.toContain(origPo.code);
        });

    // ── Scenario 12 ───────────────────────────────────────────────────────────

    test('the quantity freed by a PO reject-edit can be converted to a new PO '
        + '@PO @PRC @RejectEdit @S12 @Slow', async ({ page }) => {
        test.setTimeout(1800000); // 30 min — edit, PRC conversion, new PO
        const a = await newActions(page);

        // The PO rejected by the approver in the S131 step.
        expect(origPo?.url, 'the S131-PO step left no rejected PO').toBeTruthy();
        await a.page.goto(origPo.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await a.page.waitForTimeout(10000);
        const origPoUrl = origPo.url;
        const origPoCode = origPo.code;

        // ── Edit → lower the qty → submit ───────────────────────────────────
        await a.editPoLowerQtyAndSubmit(LOWER_QTY);
        await a.takeScreenshot('s12_po_edited');

        // ── The PRC: does the freed quantity offer a new PO? ────────────────
        const req = a.getSavedRequisition();
        console.log(`[S12] opening the PRC conversion view for requisition ${req?.id}`);
        await a.openSavedRequisition(data);
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        await a.takeScreenshot('s12_prc_conversion_view');

        // ── Expand the RC (Rate Contract) section ───────────────────────────
        // The Convert to PO button does not exist in the DOM until this is
        // expanded: run 1 dumped the collapsed view, found only
        // More/Overview/Process/Transactions, and reported "Convert to PO: null".
        await a.expandPrcRateContractSection();
        await a.takeScreenshot('s12_rc_expanded');

        // ── Convert the freed qty to a new PO ───────────────────────────────
        const convert = await a.readConvertToPoButton();
        expect(convert, 'no Convert to PO in the PRC after the PO reject-edit').toBeTruthy();
        await a.clickConvertToPo();

        // The two mandatory fields on the "Converting to PO" form.
        for (const [label, value] of [['Inward Required', 'Yes'],
                                      ['Inward Matching Criterion', 'Quantity']]) {
            await a.page.locator(
                `xpath=//*[contains(normalize-space(.),'${label}')]/following::*[normalize-space(.)='${value}'][1]`)
                .first().click({ timeout: 15000 });
            await a.page.waitForTimeout(1200);
        }
        await a.page.locator(`xpath=//button[normalize-space(.)='Submit']`)
            .filter({ visible: true }).first().click();
        // Confirm the Workflow Summary dialog (it always follows this Submit).
        await a.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`)
            .filter({ visible: true }).first().click({ timeout: 30000 });

        // ── A NEW PO was created ────────────────────────────────────────────
        await expect(a.page, 'the conversion did not land on a new PO')
            .toHaveURL(u => /\/purchase-orders\/\d+/.test(u.toString()) && u.toString() !== origPoUrl,
                { timeout: 60000 });
        await a.page.waitForTimeout(5000);
        const newPoCode = (await readPoCodes(a.page)).find(c => c !== origPoCode) ?? null;
        console.log(`[S12] original PO: ${origPoCode} @ ${origPoUrl}`);
        console.log(`[S12] new PO:      ${newPoCode} @ ${a.page.url()}`);
        expect(newPoCode, 'the new PO page shows no PO code').toBeTruthy();
        console.log('[S12] the qty freed by the PO reject-edit was converted into a new PO');
        newPo = { url: a.page.url(), code: newPoCode };
    });

    // ── Scenario 65 ───────────────────────────────────────────────────────────
    //   "Verify that a PO can be recalled successfully and its status is updated
    //    accordingly to draft"
    // THE SHEET'S "DRAFT" IS WRONG. QA, 2026-09-08: Recall opens a popup with a
    // MANDATORY REASON, and after submitting it the PO goes to REJECTED. Rejected
    // is asserted and Draft tolerated, so it still passes if the app is changed to
    // match the sheet — but never on nothing happening. Recall is status-gated:
    // only a Pending Approval PO offers it (PO-NSEFN-26-213 vs -220, 2026-09-08).
    test('a Pending-Approval PO offers Recall; recalling it with a reason rejects the PO '
        + '@PO @Recall @S65', async ({ page }) => {
        test.setTimeout(900000); // 15 min
        const a = await newActions(page);

        expect(newPo?.url, 'the S12 step left no converted PO to recall').toBeTruthy();
        await a.page.goto(newPo.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await a.page.waitForTimeout(13000);
        console.log(`[S65] target PO ${newPo.code} (converted from the PRC in S12)`);

        const before = await a.readPoStatus();
        expect(before, 'the PO converted from the PRC should be Pending Approval, which is the only '
            + `status that offers Recall — it reads "${before}"`)
            .toMatch(/pending[-\s]?approval/i);
        const after = await a.recallPoWithReason('Recalled by automation');
        console.log(`[S65] ${newPo.code}: ${before} → ${after}`);
        expect(after, `the recalled PO settled on "${after}" — expected Rejected (per QA) or Draft `
            + '(per the sheet wording)').toMatch(/rejected|draft/i);
    });

});
