import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPoViaCapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling the PRC returns the PR to processable — sheet scenario 147
//
//   "Verify that the complete PR recovery flow works after cancelling a PRC and
//    creating a new PRC and PO."
//
// QA's steps (2026-09-23): after the PO is created → reject and cancel the PO →
// navigate to the PRC → cancel the PRC → navigate to the Requisition → Process →
// "Convert to" dropdown → awarded supplier → Convert → fill any mandatory field
// left empty → submit.
//
// This is scenario 146 plus one more rung: 146 stops once the cancelled PO frees
// the PRC, 147 cancels the PRC itself and rebuilds from the REQUISITION. The
// PO-side machinery is shared with 146 (cancelPurchaseOrder / assertPoCancelled),
// and cancelPrc deliberately reuses the same polling — the PRC toolbar has the
// same repaint lag that made 146's first run fail.
//
// THE PIVOTAL ASSERTION is the Process TAB. Probed live 2026-09-23 on
// PR-NSEFN-26-241: while a live PRC consumes the PR, "Process" is a role=tab
// carrying Mui-disabled, and clicking it waits out the timeout with "element is
// not enabled". So the recovery is proven by that tab flipping DISABLED →
// ENABLED once the PRC is cancelled, which is far stronger than merely reaching
// a conversion form.
//
// PARTLY UNMAPPED, BY NECESSITY: the Process tab's own contents — the "Convert
// to" dropdown, the awarded-supplier option and the Convert button — only exist
// once a PR is re-processable, and no such PR existed in the tenant to probe.
// convertPrToAwardedSupplier therefore tries several plausible shapes and, when
// none matches, dumps every control on the page so one run maps what guessing
// could not. Expect to tighten it after the first live pass.
//
// RESUME PATH, as for 146: a full chain is ~14 min, so S147_RESUME_PO_ID plus
// S147_RESUME_REQ_ID / S147_RESUME_REQ_CODE point at a PO a previous run left
// behind and exercise only the cancels and the re-conversion. Not for CI.
// ─────────────────────────────────────────────────────────────────────────────

let dataSnapshot = null;

test.describe('PRC cancel — the requisition can be processed again', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S147' }); });

    test('cancelling the PRC re-enables Process on the requisition and a new PRC can be created '
        + '@PR @PRC @Cancel @S147 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── Precondition: a PO pending approval on a live PRC ───────────────
        const resumePo = process.env.S147_RESUME_PO_ID;
        if (resumePo) {
            const reqId = process.env.S147_RESUME_REQ_ID;
            const reqCode = process.env.S147_RESUME_REQ_CODE;
            expect(reqId && reqCode,
                'S147_RESUME_PO_ID needs S147_RESUME_REQ_ID and S147_RESUME_REQ_CODE too').toBeTruthy();
            const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
            const cur = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            cur.savedRequisition = {
                code: reqCode, id: reqId,
                url: `https://nse-capp-uat.aerchain.io/requisitions/${reqId}`,
            };
            fs.writeFileSync(DATA_PATH, JSON.stringify(cur, null, 4) + '\n', 'utf-8');
            console.log(`[S147] RESUME — PO ${resumePo}, requisition ${reqCode} (${reqId})`);
            await a.page.goto(`https://nse-capp-uat.aerchain.io/purchase-orders/${resumePo}`,
                { waitUntil: 'domcontentloaded', timeout: 90000 });
            await a.page.waitForTimeout(12000);
        } else {
            await buildToPoViaCapp(a, data, { approvePo: false });
        }
        console.log(`[S147] PO ${resumePo ? 'resumed' : 'built'} @ ${a.page.url()}`);

        const cancelledPo = await a.page.evaluate(() =>
            (document.body.innerText.match(/PO-[A-Z0-9-]+\d+/) || [null])[0]);
        expect(cancelledPo, 'could not read the PO code').toBeTruthy();

        // LATER RESUME STAGE. S147_RESUME_STAGE=convert skips both cancels and goes
        // straight to the requisition, for a PR a previous run already recovered to
        // the re-processable state. It needs the cancelled PRC's code
        // (S147_RESUME_PRC) so the "a NEW PRC exists" check at the end still has
        // something to compare against. Not for CI.
        const stage = process.env.S147_RESUME_STAGE;
        const skipCancels = stage === 'convert';
        let cancelledPrc = process.env.S147_RESUME_PRC ?? null;
        if (skipCancels) {
            expect(cancelledPrc,
                'S147_RESUME_STAGE=convert needs S147_RESUME_PRC (the already-cancelled PRC code)')
                .toBeTruthy();
            console.log(`[S147] RESUME STAGE=convert — skipping both cancels; cancelled PRC is ${cancelledPrc}`);
        }

        // ── Reject + cancel the PO ──────────────────────────────────────────
        if (!skipCancels) {
            const alreadyRejected = await a.page.evaluate(() => /\bRejected\b/.test(document.body.innerText));
            if (alreadyRejected) console.log('[S147] the PO is already Rejected — skipping the reject');
            else await a.rejectCappDoc('Rejected by automation — scenario 147', 'PO');
            await a.cancelPurchaseOrder('Cancelled by automation — scenario 147', 'S147');
            await a.assertPoCancelled('S147');
            await a.takeScreenshot('s147_po_cancelled');
        }

        // ── The PRC: cancel it ──────────────────────────────────────────────
        if (!skipCancels) {
            await a.openSavedRequisition(data);
            await a.clickPrTransactionsTab();
            await a.expandPrConversionsSection();
            // openPrcFromConversions RETURNS the code. The first run scraped the page
            // text instead and got null — the conversion view does not render a PRC-
            // code in its body — which silently defanged the "new PRC differs" check
            // at the end, since anything !== null passes.
            cancelledPrc = await a.openPrcFromConversions();
            expect(cancelledPrc, 'could not read the PRC code from the conversion view').toBeTruthy();
            console.log(`[S147] cancelling PRC ${cancelledPrc}`);
            await a.cancelPrc('Cancelled by automation — scenario 147', 'S147');
            await a.assertDocCancelled('S147', 'PRC');
            await a.takeScreenshot('s147_prc_cancelled');
        }

        // ── The requisition: Process must be live again ─────────────────────
        await a.openSavedRequisition(data);
        await a.page.waitForTimeout(6000);
        const tab = await a.readPrProcessTab();
        expect(tab, 'no Process tab on the requisition at all').toBeTruthy();
        expect(tab.disabled,
            'Process is still DISABLED on the requisition after its PRC was cancelled — the PR was not '
            + 'released for re-processing, which is the whole of scenario 147')
            .toBe(false);

        await a.clickPrProcessTab('S147');
        await a.takeScreenshot('s147_process_tab');

        // ── Convert to → awarded supplier → Convert ─────────────────────────
        const picked = await a.convertPrToAwardedSupplier('S147');
        await a.takeScreenshot('s147_converted');

        // The three starred fields on the PRC template form, mapped live 2026-09-23:
        //   * Inward Required                      yes | no
        //   * Transaction Exchange Rate Criterion  Fixed | Flexible
        //   * Inward Matching Criterion            Quantity | Value
        // NOTE the lowercase "yes". The first run borrowed 146's ['Inward Required',
        // 'Yes'] and silently matched nothing, because XPath string comparison is
        // case-SENSITIVE — the field stayed empty and the submit was refused.
        for (const [label, value] of [['Inward Required', 'yes'],
                                      ['Transaction Exchange Rate Criterion', 'Fixed'],
                                      ['Inward Matching Criterion', 'Quantity']]) {
            const opt = a.page.locator(
                `xpath=//*[contains(normalize-space(.),'${label}')]/following::*[normalize-space(.)='${value}'][1]`).first();
            if (await opt.isVisible({ timeout: 8000 }).catch(() => false)) {
                await opt.click();
                console.log(`[S147] ${label} = ${value}`);
                await a.page.waitForTimeout(1200);
            } else {
                console.log(`[S147] ${label}: no "${value}" option on screen — leaving it`);
            }
        }

        // PICK THE VISIBLE ONE. This page carries several buttons reading "Submit" —
        // the embedded SunEditor rich-text control contributes its own inside hidden
        // dialogs — and the first in DOM order is one of those. The first run's
        // .first() therefore resolved to a hidden button, isVisible said false, and
        // the form was never submitted at all.
        const submits = a.page.locator(`xpath=//button[normalize-space(.)='Submit']`);
        let submit = null;
        for (let i = (await submits.count()) - 1; i >= 0; i--) {
            const cand = submits.nth(i);
            if (await cand.isVisible({ timeout: 2000 }).catch(() => false)
                && await cand.isEnabled().catch(() => false)) { submit = cand; break; }
        }
        if (submit) {
            await submit.scrollIntoViewIfNeeded().catch(() => {});
            await submit.click();
            console.log('[S147] conversion submitted');
            await a.page.waitForTimeout(5000);
            const dlg = a.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
            if (await dlg.isVisible({ timeout: 8000 }).catch(() => false)) {
                await dlg.click();
                console.log('[S147] confirmed the conversion workflow dialog');
                await a.page.waitForTimeout(8000);
            }
        }
        await a.takeScreenshot('s147_submitted');

        // ── A NEW PRC, not the cancelled one ────────────────────────────────
        // Read it off the requisition's own conversions list rather than whatever
        // page the submit happened to land on: the list is where a new PRC has to
        // appear for the PR to count as recovered, and it names every conversion,
        // so the cancelled one cannot be mistaken for the new one.
        await a.openSavedRequisition(data);
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        const prcCodes = await a.page.evaluate(() =>
            [...new Set((document.body.innerText.match(/PRC-[A-Z0-9-]+\d+/g) || []))]);
        console.log(`[S147] picked ${JSON.stringify(picked)}; conversions now list ${JSON.stringify(prcCodes)}`);
        expect(prcCodes.length,
            `the re-conversion produced no PRC at all — conversions list is empty (was ${cancelledPrc})`)
            .toBeGreaterThan(0);
        expect(prcCodes.some(c => c !== cancelledPrc),
            `the only conversion is still the CANCELLED PRC (${cancelledPrc}) — the PR was not really `
            + `recovered. Conversions: ${JSON.stringify(prcCodes)}`)
            .toBeTruthy();
        const newPrc = prcCodes.find(c => c !== cancelledPrc);

        console.log(`[S147] cancelled ${cancelledPo} + ${cancelledPrc} → requisition re-processed into ${newPrc}`);
    });

});
