import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { v3DetailActions } from '../pages/v3DetailActions';
import { buildToGrnViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';
import v3data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// ONE PO + ONE full-qty GRN, four serial steps (merged 2026-11-24)
//
// These three scenarios used to build a CXO → … → PO → GRN chain EACH. They all
// need the same thing — a 100-qty PO with an Inwarded GRN for the full 100 —
// and each leaves the PO in exactly the state the next one starts from:
//
//   1  build PO + GRN; BASELINE: the fresh GRN is unmatched AND offers Cancel
//   2  S116      one full-qty invoice, reject-edited 3×, stays ONE entry
//   3  S66/122/151  that invoice is recalled + cancelled → GRN Unmatched again,
//                and the PO offers its full 100 for invoicing once more
//   4  S68/117   a NEW invoice for 50 of the 100 → Accounted → the GRN no
//                longer offers Cancel; the PO code is shown at every step
//
// WHY THE BASELINE IS STEP 1. Both S66 ("it became unmatched") and S68 ("Cancel
// is gone") are only meaningful against the SAME GRN's own unmatched state —
// /inwards/565 was unmatched and still offered no Cancel (2026-09-03), so a
// missing Cancel proves nothing on its own. Read once, before any invoice.
//
// SERIAL: a failed step skips the steps after it; a retry rebuilds the chain.
// The debug RESUME knobs the three old specs had are gone — with the steps
// chained, a resumed run could not reproduce the precondition of any of them.
//
// Match state is read from the GRN listing's "Matched" column ICON
// (span.progress-completed / span.progress-pending) — that column renders no
// text at all. Cancel on a GRN is a TOP-LEVEL button, not a More-menu item.
//
// ⚠️ Creates real UAT records ("HG Automation …"). PW_LIGHT=1 drops video/trace
// for long runs.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
// Re-read from DISK, never the module import — the import is a snapshot taken
// before any run wrote to it (that cost a 14-minute run once, see git history).
const readFixture = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

const FULL_QTY = String(data.intake.itemQty);   // 100 — the line the chain raises
const PARTIAL_QTY = '50';
// "Multiple times" — three cycles by default, overridable.
const REJECT_EDIT_CYCLES = Number(process.env.S116_CYCLES || 3);

test.use({ navigationTimeout: 60000, actionTimeout: 20000 });

test.describe.serial('One PO + GRN: invoice reject-edit, cancel, then partial match (S116 + S66/122/151 + S68/117)', () => {

    let dataSnapshot = null;
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    // The chain rewrites savedCxo … savedGrn / savedInvoice, which other suites
    // read as fixtures. restoreFixtures carries invoice.invoiceNumber forward.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S116+S66+S68' }); });

    // Handed between the serial steps (same worker, same order).
    let poCode = null;
    let grnCode = null;
    let grnId = null;
    let s116Invoice = null;   // { code, id }

    const newActions = async (page) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);
        return { a, grn: new v3DetailActions(page, v3data.modules.grn) };
    };
    const grnRow = async (grn) => (await grn.listGrnsWithMatchState(v3data.baseUrl))
        .find(g => g.code === grnCode);

    // ── 1. Build + baseline ──────────────────────────────────────────────────
    test('build a 100-qty PO with a full GRN; the fresh GRN is unmatched and offers Cancel '
        + '@Grn @Cancel @S66 @S68 @S117 @Slow', async ({ page }) => {
        test.setTimeout(2700000); // 45 min — the chain is most of it

        const { a, grn } = await newActions(page);

        // grnQty omitted ⇒ the builder asserts Received == PO qty (the FULL 100),
        // otherwise S68's 50-qty invoice would be a FULL match of a 50 GRN.
        await buildToGrnViaCapp(a, data);
        const f = readFixture();
        poCode = f.savedPurchaseOrder?.code;
        grnCode = f.savedGrn?.code;
        expect(poCode, 'the chain left no savedPurchaseOrder.code').toBeTruthy();
        expect(grnCode, 'the chain left no savedGrn.code').toBeTruthy();
        // S117: the PO code is shown correctly on the GRN view page.
        await a.assertPoCodeVisible(poCode, 'GRN view page (post-approval)');
        console.log(`[S116+S66+S68] PO ${poCode} with GRN ${grnCode} at full qty ${FULL_QTY}`);

        const row = await grnRow(grn);
        expect(row, `${grnCode} is not on the v3 GRN listing`).toBeTruthy();
        grnId = row.id;
        expect(row.matched, `${grnCode} was already matched before any invoice existed`)
            .not.toBe('completed');
        const actions = await grn.readGrnActions(grnId, v3data.baseUrl);
        expect(grn.grnCanBeCancelled(actions),
            `${grnCode} offers no Cancel even while UNMATCHED, so its absence after matching would `
            + 'prove nothing — S68 cannot be demonstrated on this GRN')
            .toBeTruthy();
        console.log(`[BASELINE] ${grnCode} is unmatched and offers Cancel`);
    });

    // ── 2. S116 ──────────────────────────────────────────────────────────────
    // Each reject-edit must UPDATE the existing invoice, not insert another row:
    //   IDENTITY — after every resubmit the invoice's id AND code are unchanged;
    //   COUNT    — the PO's Transactions tab ends with exactly ONE invoice row.
    // Traps (2026-09-15): reject NAVIGATES AWAY from the invoice; the FIX /
    // re-match control is not always present on the edit form; Item Matching can
    // push the GRN qty back into the row. editInvoiceResubmitSameQty handles all
    // three. The invoice is left in approval — step 3 recalls it from there.
    test('one full-qty invoice reject-edited repeatedly stays a single entry @S116 @Invoice', async ({ page }) => {
        test.setTimeout(1800000); // 30 min — invoice + ~1 min per cycle, with slack

        const { a } = await newActions(page);

        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.fillInvoiceDetails(data);       // fresh invoice number + today's date
        await a.setInvoiceGeneralDetailsNo();   // period-based / extra billing → No
        // The create form already carries the full PO qty — this invoice uses all of it.
        await a.matchGrnInItemMatching();
        await a.ensureInvoiceQty(FULL_QTY);
        await a.submitInvoice();
        const code = await a.saveInvoiceCode();
        const id = readFixture().savedInvoice?.id;
        expect(code, 'no Invoice code was captured after the initial submit').toBeTruthy();
        expect(id, 'no Invoice id was captured after the initial submit').toBeTruthy();
        s116Invoice = { code, id };
        console.log(`[S116] invoice created: ${code} (id ${id}) at qty ${FULL_QTY}`);

        for (let cycle = 1; cycle <= REJECT_EDIT_CYCLES; cycle++) {
            console.log(`\n[S116] ══ reject-edit cycle ${cycle}/${REJECT_EDIT_CYCLES} on ${code} ══`);
            await a.openSavedInvoice(data);
            await a.rejectCappDoc(`Rejected by automation (S116 cycle ${cycle})`, 'INV');
            await a.editInvoiceResubmitSameQty(FULL_QTY, data);

            const codeNow = await a.saveInvoiceCode();
            const idNow = readFixture().savedInvoice?.id;
            expect(codeNow, `cycle ${cycle}: the reject-edit produced a NEW invoice code `
                + `(${code} → ${codeNow}) — that is a duplicate entry`).toBe(code);
            expect(idNow, `cycle ${cycle}: the reject-edit produced a NEW invoice id `
                + `(${id} → ${idNow}) — that is a duplicate entry`).toBe(id);
            console.log(`[S116] cycle ${cycle}/${REJECT_EDIT_CYCLES} done — still ${codeNow} (id ${idNow})`);
        }

        await a.openSavedPurchaseOrder(data);
        await a.openPoTransactionsTab();
        const listed = await a.readPoTransactionInvoiceCodes();
        expect(listed,
            `after ${REJECT_EDIT_CYCLES} reject-edits the PO Transactions tab should list `
            + `exactly one invoice (${code}) — found ${JSON.stringify(listed)}`)
            .toEqual([code]);
        console.log(`[S116] PASS — ${code} survived ${REJECT_EDIT_CYCLES} reject-edits as a single entry`);
    });

    // ── 3. S66 / S122 / S151 ─────────────────────────────────────────────────
    //   66   cancelling the Invoice changes the GRN status back to Unmatched
    //   122  …and releases the matched quantity
    //   151  …and restores the PO balance so the PO can be invoiced again
    // A Pending-Approval invoice has NO Cancel action; Recall puts it in Rejected,
    // after which a top-level Cancel appears (verified on Invoice-FNSE-26-363).
    test('cancelling a matched Invoice returns its GRN to Unmatched and frees the qty '
        + '@Invoice @Grn @Cancel @S66 @S122 @S151', async ({ page }) => {
        test.setTimeout(1200000); // 20 min

        const { a, grn } = await newActions(page);
        expect(s116Invoice, 'step 2 left no invoice to cancel').toBeTruthy();

        // 66 precondition: S116's invoice matched the GRN.
        const matched = await grnRow(grn);
        expect(matched?.matched,
            `${grnCode} is not matched although ${s116Invoice.code} was submitted against it`)
            .toBe('completed');
        console.log(`[S66] ${grnCode} is matched to ${s116Invoice.code} — recalling and cancelling it`);

        await a.openSavedInvoice(data);
        const recalled = await a.recallInvoice('Recalled by automation — scenario 66/122/151');
        expect(recalled, 'the invoice offered no Recall, so it cannot be made cancellable').toBeTruthy();
        await a.cancelInvoice('Cancelled by automation — scenario 66/122/151');

        // 66: the GRN returns to Unmatched.
        const after = await grnRow(grn);
        expect(after, `${grnCode} vanished from the GRN listing after the cancel`).toBeTruthy();
        expect(after.matched,
            `${grnCode} is still matched after its only invoice was cancelled`)
            .not.toBe('completed');
        console.log(`[S66] ${grnCode} match state after cancel: "${after.matched || 'unmatched'}"`);

        // 122 / 151: the PO offers the FULL line qty for a NEW invoice again.
        await a.assertPoQtyAvailableForInvoice(FULL_QTY, data);
        console.log(`[S122/S151] the PO offers ${FULL_QTY} for invoicing again`);
    });

    // ── 4. S68 / S117 ────────────────────────────────────────────────────────
    //   68   Cancel is NOT available for a GRN once it is PARTIALLY matched
    //   117  the PO code is shown correctly at every step
    // The GRN (100) is matched by a NEW invoice for 50, taken to Accounted. The
    // baseline from step 1 proved this same GRN offers Cancel while unmatched.
    test('a GRN partially matched to an Accounted Invoice cannot be cancelled '
        + '@Grn @Cancel @S68 @S117', async ({ page }) => {
        test.setTimeout(1800000); // 30 min — invoice, approvals, ack

        const { a, grn } = await newActions(page);

        await a.openSavedPurchaseOrder(data);
        await a.assertPoCodeVisible(poCode, 'PO view page');
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);
        await a.assertPoCodeVisible(poCode, 'Invoice creation page');
        await a.fillInvoiceDetails(data);
        await a.setInvoiceGeneralDetailsNo();
        await a.setInvoiceQty(PARTIAL_QTY);
        await a.matchGrnInItemMatching();
        // Item Matching can push the GRN's qty (100) back into the row, turning
        // this into a FULL match and silently invalidating the scenario.
        await a.ensureInvoiceQty(PARTIAL_QTY);
        await a.submitInvoice();
        const invCode = await a.saveInvoiceCode();
        await a.assertPoCodeVisible(poCode, 'Invoice view page (pending approval)');
        console.log(`[S68] invoice ${invCode} raised for ${PARTIAL_QTY} of ${FULL_QTY}`);

        // This UAT has no EBS integration, so approvals can end on "Sync Failed"
        // rather than "Pending Sync" — still acknowledgeable through to Accounted.
        await a.approveInvoiceUntilPendingSync('Approved by automation — scenario 68',
            { acceptSyncFailed: true });
        await a.acknowledgeInvoice(data);
        await a.assertInvoiceAccounted();
        console.log(`[S68] ${invCode} is Accounted`);

        const after = await grn.readGrnActions(grnId, v3data.baseUrl);
        console.log(`[S68] ${grnCode} after partial match — invoices on page: `
            + `${after.invoiceCodes.join(', ') || 'none'}`);
        expect(grn.grnCanBeCancelled(after),
            `${grnCode} is partially matched to an Accounted invoice (${invCode}, ${PARTIAL_QTY} of `
            + `${FULL_QTY}) but still offers Cancel`)
            .toBeFalsy();
    });
});
