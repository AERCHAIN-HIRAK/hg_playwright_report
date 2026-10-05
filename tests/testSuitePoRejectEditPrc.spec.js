import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

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

test.describe('PO reject-edit — lowered qty returns to the PRC', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S12' }); });

    test('the quantity freed by a PO reject-edit can be converted to a new PO '
        + '@PO @PRC @RejectEdit @S12 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000); // 60 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── CXO → … → PO, left in PENDING APPROVAL so it can be rejected ────
        //
        // This chain builds its OWN CXO (skipCxo defaults to false). Reusing the
        // stored one - right for scenario 17, which never submits a PR - does not
        // work here: CXO budget is consumed AT PR SUBMIT, so repeated full chains
        // drain it. Once drained, submitPr stalls on a Workflow dialog whose
        // Submit is disabled behind "Budget Amount is exceeded. Please Contact
        // Budget User." and a mandatory empty "Budget Amend Request" - which is
        // exactly how run 1 died here, and how scenario 59 is currently blocked.
        await buildToPoViaCapp(a, data, { approvePo: false });
        // buildToPoViaCapp ends by opening the PO in a NEW TAB, and the actions
        // object switches to it (this.page = newPage). The `page` fixture still
        // points at the PR tab, so every interaction from here uses a.page -
        // otherwise the conversion steps below silently drive the wrong tab.
        console.log(`[S12] PO built and left pending approval @ ${a.page.url()}`);
        // Remember the ORIGINAL PO so the new one can be told apart from it later -
        // the conversion's PO page and the original share most of their text.
        const origPoUrl = a.page.url();
        const origPoCode = (await readPoCodes(a.page))[0] ?? null;
        await a.takeScreenshot('s12_po_pending');

        // ── Reject it during approvals ──────────────────────────────────────
        await a.rejectCappDoc('Rejected by automation — scenario 12', 'PO');
        await a.takeScreenshot('s12_po_rejected');

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
    });

});
