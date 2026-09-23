import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling a PO frees the PRC to be converted again — sheet scenario 146
//
//   "Verify that cancelling a PO resets the processing state of the related PRC
//    and PR, allowing them to be re-processed."
//
// QA's steps (2026-09-23): CXO → PO → reject the PO during approvals → CANCEL the
// PO → open the PRC → expand the Requisition Conversion view split → Convert to
// PO → add the needed details → submit.
//
// This is scenario 12's twin and deliberately shares its machinery: 12 frees the
// quantity by REJECT-EDITING the PO down, 146 frees it by CANCELLING the PO
// outright. Everything from "open the PRC" onward is the same surface, and the
// helpers (expandPrcRateContractSection / readConvertToPoButton /
// clickConvertToPo) plus the two mandatory conversion fields were mapped live for
// 12 on 2026-09-11, so they are reused verbatim rather than re-derived.
//
// WHAT ACTUALLY PROVES THE SCENARIO: the conversion must produce a PO whose code
// DIFFERS from the cancelled one. A conversion that landed back on the cancelled
// PO would satisfy "a PO exists" while proving nothing about re-processing, so
// the cancelled code is captured before the cancel and compared at the end.
//
// The chain builds its OWN CXO. CXO budget is consumed at PR SUBMIT, so reusing a
// stored CXO across repeated full chains drains it and submitPr then stalls on a
// disabled Workflow Submit behind "Budget Amount is exceeded" — the failure that
// killed scenario 12's first run and still blocks scenario 59.
//
// UNMAPPED, BY NECESSITY: whether a REJECTED PO offers Cancel in the header or
// under More. No rejected PO existed in the tenant to probe, and the PO states
// that do exist (In Progress, Completed) offer no Cancel at all — so
// cancelPurchaseOrder tries both and, if neither is there, fails with every
// action the page actually offers rather than a bare "not found".
// ─────────────────────────────────────────────────────────────────────────────

let dataSnapshot = null;

test.describe('PO cancel — the PRC can be converted to a new PO', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S146' }); });

    test('cancelling a rejected PO lets the PRC be converted into a new PO '
        + '@PO @PRC @Cancel @S146 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000); // 60 min — the chain alone is ~16

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── CXO → … → PO, left PENDING APPROVAL so it can be rejected ───────
        //
        // RESUME PATH. A full chain is ~14 min, so when a previous run already left
        // a REJECTED PO behind, point at it instead and exercise only the cancel
        // and re-conversion. Needs the PO's numeric id and the requisition's, e.g.
        //   S146_RESUME_PO_ID=1164 S146_RESUME_REQ_ID=1265 S146_RESUME_REQ_CODE=PR-NSEFN-26-240
        // Not for CI — it depends on ambient data — but it is how the cancel step
        // was validated without paying for a second chain.
        const resumePo = process.env.S146_RESUME_PO_ID;
        if (resumePo) {
            const reqId = process.env.S146_RESUME_REQ_ID;
            const reqCode = process.env.S146_RESUME_REQ_CODE;
            expect(reqId && reqCode,
                'S146_RESUME_PO_ID needs S146_RESUME_REQ_ID and S146_RESUME_REQ_CODE too — the PRC is '
                + 'reached through the requisition').toBeTruthy();
            const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
            const cur = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            cur.savedRequisition = {
                code: reqCode, id: reqId,
                url: `https://nse-capp-uat.aerchain.io/requisitions/${reqId}`,
            };
            fs.writeFileSync(DATA_PATH, JSON.stringify(cur, null, 4) + '\n', 'utf-8');
            console.log(`[S146] RESUME — using PO ${resumePo} and requisition ${reqCode} (${reqId})`);
            await a.page.goto(`https://nse-capp-uat.aerchain.io/purchase-orders/${resumePo}`,
                { waitUntil: 'domcontentloaded', timeout: 90000 });
            await a.page.waitForTimeout(12000);
        } else {
            await buildToPoViaCapp(a, data, { approvePo: false });
        }
        // buildToPoViaCapp ends by opening the PO in a NEW TAB and the actions
        // object switches to it (this.page = newPage). The `page` fixture still
        // points at the PR tab, so everything below must go through a.page or it
        // silently drives the wrong tab.
        console.log(`[S146] PO ${resumePo ? 'resumed' : 'built and left pending approval'} @ ${a.page.url()}`);

        // Read the code off the PO page itself: buildToPoViaCapp(approvePo:false)
        // opens the PO in a new tab but does NOT persist it to the fixture, so
        // there is no savedPurchaseOrder to read at this point in the flow.
        const cancelledPo = await a.page.evaluate(() =>
            (document.body.innerText.match(/PO-[A-Z0-9-]+\d+/) || [null])[0]);
        expect(cancelledPo, 'could not read the built PO code').toBeTruthy();
        console.log(`[S146] the PO about to be rejected and cancelled is ${cancelledPo}`);
        await a.takeScreenshot('s146_po_pending');

        // ── Reject it during approvals ──────────────────────────────────────
        // On the resume path the PO is already Rejected — re-rejecting it is not
        // offered and would fail for a reason unrelated to this scenario.
        if (resumePo) {
            console.log('[S146] RESUME — skipping the reject; the PO is already Rejected');
        } else {
            await a.rejectCappDoc('Rejected by automation — scenario 146', 'PO');
        }
        await a.takeScreenshot('s146_po_rejected');

        // ── Cancel it ───────────────────────────────────────────────────────
        await a.cancelPurchaseOrder('Cancelled by automation — scenario 146', 'S146');
        await a.assertPoCancelled('S146');
        await a.takeScreenshot('s146_po_cancelled');

        // ── The PRC: is the quantity offered for a new PO again? ────────────
        const req = a.getSavedRequisition();
        console.log(`[S146] opening the PRC conversion view for requisition ${req?.id}`);
        await a.openSavedRequisition(data);
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        await a.expandPrcRateContractSection();
        await a.takeScreenshot('s146_prc_conversion_view');

        const convert = await a.readConvertToPoButton();
        expect(convert,
            'no Convert to PO button in the expanded conversion view — cancelling the PO did NOT '
            + 'release the PRC for re-processing, which is the whole of scenario 146')
            .toBeTruthy();
        expect(convert.disabled,
            'Convert to PO is present but DISABLED after the PO was cancelled — the PRC still counts '
            + 'the cancelled PO as consuming its quantity')
            .toBe(false);

        // ── Convert → the two mandatory fields → submit ─────────────────────
        await a.clickConvertToPo();
        await a.takeScreenshot('s146_converting_to_po');
        for (const [label, value] of [['Inward Required', 'Yes'],
                                      ['Inward Matching Criterion', 'Quantity']]) {
            const opt = a.page.locator(
                `xpath=//*[contains(normalize-space(.),'${label}')]/following::*[normalize-space(.)='${value}'][1]`).first();
            await opt.waitFor({ state: 'visible', timeout: 15000 });
            await opt.click();
            console.log(`[S146] ${label} = ${value}`);
            await a.page.waitForTimeout(1200);
        }

        const submit = a.page.locator(`xpath=//button[normalize-space(.)='Submit']`).first();
        await submit.waitFor({ state: 'visible', timeout: 20000 });
        await submit.click();
        console.log('[S146] PO conversion submitted');
        await a.page.waitForTimeout(5000);
        const dlg = a.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
        if (await dlg.isVisible({ timeout: 8000 }).catch(() => false)) {
            await dlg.click();
            console.log('[S146] confirmed the conversion workflow dialog');
            await a.page.waitForTimeout(8000);
        }
        await a.takeScreenshot('s146_po_conversion_submitted');

        // ── A NEW PO, not the cancelled one ─────────────────────────────────
        await a.page.waitForTimeout(5000);
        expect(a.page.url(), 'the conversion should land on the new PO')
            .toMatch(/\/purchase-orders\/\d+/);
        const newPo = await a.page.evaluate(() =>
            (document.body.innerText.match(/PO-[A-Z0-9-]+\d+/) || [null])[0]);
        expect(newPo, `the conversion did not produce a PO — still on ${a.page.url()}`).toBeTruthy();
        expect(newPo,
            `the conversion landed back on the CANCELLED PO (${cancelledPo}) — no new PO was created, `
            + 'so the PRC was not really re-processed')
            .not.toBe(cancelledPo);

        console.log(`[S146] cancelled ${cancelledPo} → PRC re-converted into ${newPo}`);
    });

});
