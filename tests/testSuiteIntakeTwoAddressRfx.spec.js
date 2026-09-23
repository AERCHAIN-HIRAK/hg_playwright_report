import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// One item, twice, on two delivery addresses → two separate RFXs — scenario 83
//
//   "Verify if same item added two times with different delivery address can be
//    processed to different RFX or PR"
//
// QA's steps (2026-09-23): create the CXO → create an Intake carrying the SAME
// line item twice, differing ONLY by delivery address → convert line 1 to an RFX
// by selecting just that line → convert line 2 to a second RFX.
//
// ── WHY THIS STARTS AS A DISCOVERY RUN ───────────────────────────────────────
// Three things are unmapped, and each costs a chain to learn the hard way:
//
//  1. ROW-AWARE CELLS. Every intake line-item locator in allLocators is ABSOLUTE
//     and page-scoped — intakeItemName is "(//div[@class=…])[1]", Qty is [2],
//     Delivery Address is [4] — so they all address ROW 1 and a second call just
//     refills it. The positions are overloaded too: the same [4] is UOM on a row
//     with no item picked and Delivery Address once one is. An earlier attempt at
//     row-2 locators (intakeItemName1 … at nth=16-21) sits COMMENTED OUT in
//     allLocators, which is the clearest evidence that guessing offsets did not
//     work.
//  2. A SECOND DELIVERY ADDRESS. fillIntakeLineItem always takes the FIRST option
//     ("(//div[@role='option'])[1]"), so two rows filled with it would be
//     identical — and the scenario would prove nothing.
//  3. PER-LINE-ITEM SELECTION at Intake → Send for Sourcing. Nothing in the repo
//     converts a SUBSET of lines; scenario 6 splits by QUANTITY, which is a
//     different control.
//
// So S83_STAGE=grid stops once two rows exist and dumps the grid — the cell
// inventory, what each row holds, and the delivery-address options. That is
// ~4 min against ~20 for a full chain, and it answers 1 and 2 outright.
//
// QUANTITY: 50 per row, NOT the fixture's 100. The CXO is worth 100 × 2,000 =
// 200,000 and this intake carries TWO rows; at the fixture quantity they would
// ask 400,000 of a 200,000 CXO and be refused on budget — a failure that has
// nothing to do with delivery addresses.
//
// Reuses the stored CXO rather than building one: the discovery stage never
// submits, so nothing is consumed.
// ─────────────────────────────────────────────────────────────────────────────

const ROW_QTY = 50;
const DATA_PATH = path.resolve('pages/NSEFoundationData.json');

let dataSnapshot = null;

test.describe('Intake — one item on two delivery addresses', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S83' }); });

    test('the same item on two delivery addresses converts to two separate RFXs '
        + '@Intake @RFX @S83 @Slow', async ({ page }) => {
        test.setTimeout(2_400_000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── Intake form, through to the line-item grid ──────────────────────
        await a.clickIntakeTab();
        await a.clickCreateIntake();
        await a.assertIntakeCreatePage();
        await a.waitForCreatePageLoaded();
        await a.closeAskAieraIfVisible();
        await a.expandIntakeSections();

        await a.fillIntakeTitle(data);
        await a.fillIntakeSummary(data);
        await a.selectIntakeCompany1();
        await a.selectIntakeCompany2();
        await a.selectIntakeDepartment(data);
        await a.selectIntakeExpenseNatureApproval(data);
        await a.selectIntakeCurrency(data);
        await a.selectIntakeFunction(data);
        await a.selectIntakeVertical(data);
        await a.selectIntakeProjectName();
        await a.selectIntakeNatureOfExpense(data);
        await a.selectIntakeGLAccount();
        await a.selectIntakeProfitCenter();
        await a.selectIntakeCostCenter();
        await a.selectIntakeSEBICategorization();
        await a.selectIntakeSubSegment();
        await a.selectIntakeProjectCategory();
        await a.selectIntakeCXOType(data);
        await a.selectIntakeCXOTransaction(data);
        await a.assertIntakeBRFAutoPopulated();

        // Row 1 — the existing helper, at half the fixture quantity.
        await a.addIntakeLineRow();
        await a.fillIntakeLineItem(data, { qty: ROW_QTY });
        console.log(`[S83] row 1 filled at qty ${ROW_QTY}`);

        // Row 2 — added, deliberately NOT filled yet: the whole point of the
        // discovery stage is to see what the grid looks like with an empty second
        // row, so the cell offsets can be derived rather than guessed.
        await a.addIntakeLineRow();
        await page.waitForTimeout(1500);

        // ── Row 2: the SAME item, the OTHER delivery address ────────────────
        const rows = await a.readIntakeGridRows();
        expect(rows.length,
            'the grid does not show two line-item rows, so the scenario cannot be built')
            .toBeGreaterThanOrEqual(2);

        const addr2 = await a.fillIntakeLineItemRow(data,
            { row: 2, qty: ROW_QTY, addressIndex: 1, tag: 'S83' });

        // The two rows must differ ONLY by address, so prove they actually DO
        // differ — picking the same option twice would leave a test that passes
        // while testing nothing.
        const filled = await a.readIntakeGridRows();
        // INTAKE_COL holds OFFSETS from the row's leftmost cell, not absolute x —
        // the grid scrolls horizontally, so an absolute comparison reads "" for
        // every row and would report two identical blank addresses.
        const addrOf = (r) => {
            const cells = filled[r - 1].cells;
            const scrollable = cells.filter(c => c.text.trim() !== String(r));
            const base = Math.min(...(scrollable.length ? scrollable : cells).map(c => c.left));
            const want = base + NSEFoundationActions.INTAKE_COL.deliveryAddress;
            return cells.find(c => Math.abs(c.left - want) < 40)?.text ?? '';
        };
        const [a1, a2] = [addrOf(1), addrOf(2)];
        console.log(`[S83] row 1 address "${a1}" | row 2 address "${a2}"`);
        expect(a2,
            `both rows carry the same delivery address ("${a1}") — the scenario needs them to differ`)
            .not.toBe(a1);
        expect(a1 && a2, 'one of the rows has no delivery address set').toBeTruthy();

        if (process.env.S83_STAGE === 'grid') {
            console.log(`[S83] two rows built, addresses "${a1}" and "${a2}" — nothing submitted`);
            return;
        }

        // ── Submit the intake and release it ────────────────────────────────
        await a.fillIntakePotentialSuppliers(data);
        await a.submitIntake();
        await a.completeIntakeSubmissionPopup();
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();
        console.log('[S83] intake released with both line items');

        // ── Convert each line to its OWN sourcing event ─────────────────────
        // The intake overview carries a checkbox per line (plus a select-all), and
        // all start CHECKED — so a single-line conversion means clearing the other,
        // which is exactly what makes two separate RFXs possible from one intake.
        const rfxCodes = [];
        for (const line of [1, 2]) {
            await a.clickIntakeTab();
            await a.openSavedIntakeFromListing();
            await a.selectIntakeLineItems([line], 'S83');

            await a.clickIntakeProcess();
            await a.clickSendForSourcing();
            await a.expandSourcingSections();
            await a.selectSourcingPaymentTerms();
            await a.fillSourcingCommercialBidDueDate(data);
            await a.fillSourcingTechnicalBidDueDate(data);
            await a.fillSourcingExpectedDeliveryDate(data);
            await a.addSourcingSupplier(data);
            await a.submitSourcingEvent();
            await a.saveSourcingEventCode();

            const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')).savedSourcingEvent;
            expect(built?.code, `line ${line} did not produce a sourcing event`).toBeTruthy();
            rfxCodes.push(built.code);
            console.log(`[S83] line ${line} -> RFX ${built.code}`);
        }

        // ── Two DISTINCT RFXs off the one intake ────────────────────────────
        expect(rfxCodes[1],
            `both line items produced the SAME sourcing event (${rfxCodes[0]}) — the second conversion `
            + 'reused the first rather than creating its own, so the two delivery addresses were not '
            + 'processed separately')
            .not.toBe(rfxCodes[0]);

        console.log(`[S83] one intake, two addresses -> ${rfxCodes[0]} (Mumbai) and ${rfxCodes[1]} (Delhi)`);
    });

});
