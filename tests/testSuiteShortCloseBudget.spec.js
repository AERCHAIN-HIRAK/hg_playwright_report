import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { budgetSpendActions } from '../pages/budgetSpendActions';
import { v3DetailActions } from '../pages/v3DetailActions';
import { buildRfxToForeclose, buildAwardToPrSubmitted } from '../pages/chainBuilders';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import data from '../pages/NSEFoundationData.json';
import listingData from '../pages/V3ListingData.json';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Short close returns the unspent PO balance to the budget — sheet scenario 60
//
//   "Verify that when a partial-quantity GRN is created for a PO, an Invoice is
//    created and matched against the partial quantity, and the PO is
//    subsequently Short Closed, the remaining PO amount is returned to the
//    Budget correctly."
//
// QA's steps (2026-09-15), followed exactly:
//   CXO -> Intake -> RFX -> quote -> Award -> PR edit+submit
//     -> BUDGET READING A  (from the PR view page)
//   PO auto-created from the PR
//     -> BUDGET READING B  (from the PO view page) = A + PO amount
//   GRN for HALF the PO qty -> Invoice for that half, matched to the GRN -> ack
//   Short close the PO
//     -> BUDGET READING C = B - the short-closed amount
//
// THE BUDGET FIGURE. QA's path is: the BRF link on the transaction page -> the
// eye ("View Details", which opens a NEW TAB) -> back out of /budget-items/{id}
// -> /budgets/{id} -> "Actual Spend". That walk matters because THREE different
// spend figures are on screen and they disagree - see budgetSpendActions, which
// refuses to report one unless it came from /budgets/{id}.
//
// WHY THE PO IS APPROVED before reading B, which QA's steps do not mention: a
// PO cannot be received against until it is approved, so the chain has to
// approve it anyway to reach the GRN. Reading B AFTER approval is also the
// stricter reading of "PO created -> actual spent = previous + PO amount": were
// the budget to move only on approval, reading beforehand would show no change
// and the assertion would pass for the wrong reason.
//
// COST: this builds a complete real chain on UAT every run (CXO, Intake, RFX,
// award, PR, PRC, PO, GRN, Invoice, payment-less ack) and takes ~30-40 min.
// The fixture file is snapshotted and restored, but the UAT records remain.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');

const PO_MODULE = listingData.modules.purchaseOrder;

/** PO Amount as shown on the PO view page, e.g. "PO Amount 200,000.000". */
async function readPoAmount(page) {
    const text = await page.evaluate(() => (document.body.innerText || '').replace(/\r/g, ''));
    const m = text.match(/PO\s*Amount\s*:?\s*₹?\s*([\d,]+(?:\.\d+)?)/i);
    const n = m ? parseFloat(m[1].replace(/,/g, '')) : null;
    expect(n, 'no "PO Amount" on the PO view page').not.toBeNull();
    return n;
}

test.describe('Short close returns the unspent PO balance to the budget', () => {

    let snapshot = null;
    test.beforeAll(() => { snapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(snapshot, { tag: 'S60' }); });

    // ── Guard: the budget drilldown itself ────────────────────────────────────
    //
    // Runs in ~1 min against whatever Completed PR is newest, and exists so a
    // broken drilldown is caught BEFORE the 40-minute chain below spends its
    // time building records it can no longer measure. Not a sheet scenario.
    test('the budget drilldown reads Actual Spend from the parent budget @S60 @Budget @Guard',
        async ({ page }) => {
            test.setTimeout(300000);
            await page.setViewportSize({ width: 1800, height: 950 });

            const pr = new v3DetailActions(page, listingData.modules.requisition);
            const code = await pr.openFirstTransactionWithStatus(['Completed'], listingData.baseUrl);
            test.skip(!code, 'no Completed requisition on the first listing page');

            const budget = new budgetSpendActions(page);
            const { actualSpend, budgetUrl } = await budget.readActualSpendFromTransaction('S60-GUARD');

            expect(budgetUrl, 'the drilldown must land on the parent budget').toMatch(/\/budgets\/\d+/);
            expect(actualSpend, 'Actual Spend must be a number').toEqual(expect.any(Number));
            console.log(`[S60-GUARD] ${code} -> ${budgetUrl} -> Actual Spend ${actualSpend}`);
        });

    // ── 60 — the scenario ─────────────────────────────────────────────────────
    test('a short-closed PO returns its unspent balance to the budget @S60 @Budget @ShortClose @Slow',
        async ({ page }) => {
            test.setTimeout(3600000); // 60 min — full chain plus three budget walks

            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 950 });
            await a.openApp(data);

            const UNIT_PRICE = parseFloat(data.lineItem.suggestedPrice); // 2000
            const PO_QTY     = parseInt(data.lineItem.quantity, 10);     // 100
            const HALF       = PO_QTY / 2;                               // 50

            // ── CXO -> Intake -> RFX -> quote -> foreclose -> award -> PR ─────
            await buildRfxToForeclose(a, data);
            await buildAwardToPrSubmitted(a, data);
            const prCode = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedRequisition?.code;
            console.log(`[S60] PR ${prCode} submitted`);

            // ── READING A — from the PR view page ─────────────────────────────
            await a.openSavedRequisition(data);
            const readA = await new budgetSpendActions(a.page)
                .readActualSpendFromTransaction('S60-PR');
            const budgetUrl = readA.budgetUrl;
            console.log(`[S60] A (after PR submit) = ${readA.actualSpend}`);

            // ── PR -> Completed -> PRC -> PO -> approve ───────────────────────
            await a.waitForPrStatus(['Processed', 'Completed']);
            await a.waitForPrStatus('Completed');
            await a.openSavedRequisition(data);
            await a.clickPrTransactionsTab();
            await a.expandPrConversionsSection();
            await a.openPrcFromConversions();
            // NOTE: this opens the PO in a NEW TAB and repoints `a.page` at it,
            // so everything downstream must use a.page, never the `page` fixture.
            await a.openPoFromConversionViewInNewTab();
            await a.approvePoUntilSubmitted('Approved by automation');

            // ── READING B — from the PO view page ─────────────────────────────
            await a.openSavedPurchaseOrder(data);
            const poAmount = await readPoAmount(a.page);
            const poCode = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedPurchaseOrder?.code;
            console.log(`[S60] PO ${poCode} amount ${poAmount}`);
            expect(poAmount, 'PO amount should be qty x unit price')
                .toBeCloseTo(PO_QTY * UNIT_PRICE, 2);

            // The walk is QA's documented path, so it stays; but the figure it
            // returns may not have settled yet (see below), so a value that is
            // not yet A + PO amount is polled rather than failed on the spot.
            const walkB = await new budgetSpendActions(a.page)
                .readActualSpendFromTransaction('S60-PO');
            console.log(`[S60] B (after PO, first read) = ${walkB.actualSpend}`);

            const expectedB = readA.actualSpend + poAmount;
            const settledB = Math.abs(walkB.actualSpend - expectedB) <= 0.01
                ? { value: walkB.actualSpend, settled: true }
                : await new budgetSpendActions(a.page)
                    .waitForActualSpend(budgetUrl, expectedB, { tag: 'S60-PO-WAIT' });
            const actualB = settledB.value;
            console.log(`[S60] B (after PO) = ${actualB}`);
            expect(actualB,
                `Actual Spend should rise by the PO amount (${poAmount}) once the PO exists`)
                .toBeCloseTo(expectedB, 2);

            // ── GRN for HALF the PO quantity -> Inwarded ──────────────────────
            await a.openSavedPurchaseOrder(data);
            await a.clickPoCreateGrn();
            await a.submitSelectPoItemsPopup();
            await a.fillGrnGeneralDetails(data);
            await a.fillGrnDocumentDetails(data);
            await a.setGrnReceivedQty(HALF);
            await a.submitGrn();
            await a.saveGrnCode();
            await a.approveGrnUntilInwarded('Approved by automation');
            await a.assertGrnInwarded();
            console.log(`[S60] GRN inwarded for ${HALF} of ${PO_QTY}`);

            // ── Invoice for that same half, MATCHED to the GRN ────────────────
            await a.openSavedPurchaseOrder(data);
            await a.clickPoCreateInvoice();
            await a.submitSelectPoItemsForInvoice();
            await a.confirmInvoiceCreation();
            await a.uploadInvoiceDocument(data);
            await a.fillInvoiceDetails(data);
            await a.setInvoiceGeneralDetailsNo();
            await a.setInvoiceQty(String(HALF));
            await a.matchGrnInItemMatching();
            // Item Matching can push the GRN's matched qty back into the row.
            await a.ensureInvoiceQty(String(HALF));
            await a.submitInvoice();
            await a.saveInvoiceCode();
            await a.approveInvoiceUntilPendingSync('Approved by automation',
                { acceptSyncFailed: true });
            await a.assertInvoiceReadyForAck('S60');

            // ── Acknowledge -> Accounted ──────────────────────────────────────
            await a.acknowledgeInvoice(data);
            await a.openSavedInvoice(data);
            await a.assertInvoiceAccounted();
            console.log('[S60] invoice acknowledged → Accounted');

            // ── Baseline taken IMMEDIATELY BEFORE the short close ─────────────
            //
            // NOT reading B. B was taken ~10 minutes earlier, and /budgets/369 is
            // a SHARED tenant budget (168 requisitions, 160 POs, 118 invoices) that
            // other work moves while this test runs: on the 2026-09-15 rerun ₹200
            // of somebody else's spend landed between B and the short close, so
            // "C == B - 100,000" missed by exactly that ₹200 while the short close
            // itself was flawless. Anchoring to a reading taken seconds before the
            // write makes the assertion exact again instead of needing a fudge
            // factor to absorb other people's transactions.
            const beforeSC = await new budgetSpendActions(a.page)
                .readActualSpendAt(budgetUrl, 'S60-BEFORE-SC');
            console.log(`[S60] baseline immediately before short close = ${beforeSC}`);

            // ── Short close the PO ────────────────────────────────────────────
            await a.openSavedPurchaseOrder(data);
            const po = new v3DetailActions(a.page, PO_MODULE);
            expect(await po.hasShortCloseButton(),
                'a partially-received PO should offer Short Close').toBe(true);
            const status = await po.shortClosePo('Short closed by automation — scenario 60');
            console.log(`[S60] short close HTTP ${status}`);

            await a.openSavedPurchaseOrder(data);
            const closedQty = await po.getShortClosedQty();
            console.log(`[S60] short-closed qty = ${closedQty}`);
            expect(closedQty,
                'short close should close the un-received half of the PO').toBeCloseTo(HALF, 2);
            const closedAmount = closedQty * UNIT_PRICE;

            // ── READING C — the balance is back in the budget ─────────────────
            //
            // THE BUDGET UPDATES 60 SECONDS AFTER THE SHORT CLOSE (QA, 2026-09-15).
            // That is why the first certification run failed: the short-close POST
            // returned 200 and short_close_qty was already 50, yet Actual Spend
            // still read its pre-close figure, and only minutes later showed the
            // returned amount. So wait out the settling window, then poll — the
            // poll is a safety net around the 60s, not a substitute for it.
            await a.page.waitForTimeout(60000);

            const expectedC = beforeSC - closedAmount;
            const settledC = await new budgetSpendActions(a.page)
                .waitForActualSpend(budgetUrl, expectedC, { tag: 'S60-AFTER-SC' });
            console.log(`[S60] C (after short close) = ${settledC.value}`
                + ` after ${settledC.seen.length} poll(s)`);

            expect(settledC.value,
                `Actual Spend should fall by the short-closed amount (${closedAmount}): `
                + `${beforeSC} - ${closedAmount}; saw ${JSON.stringify(settledC.seen)}`)
                .toBeCloseTo(expectedC, 2);

            console.log(`[S60] PASS — A ${readA.actualSpend} -> B ${actualB}`
                + ` -> before short close ${beforeSC} -> C ${settledC.value}`
                + ` (PO ${poAmount}, short closed ${closedAmount})`);
        });
});
