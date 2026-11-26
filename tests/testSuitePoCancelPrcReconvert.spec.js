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
//
// ── MERGED WITH SCENARIO 147 (2026-11-24) ───────────────────────────────────
// S147 used to build its own chain. It now runs second in this SERIAL group on
// the NEW PO that S146's re-conversion just produced: reject + cancel that PO,
// cancel the PRC, and re-process the requisition. One chain instead of two. The
// S147_RESUME_* shortcuts still work and skip the dependency on S146.
// ─────────────────────────────────────────────────────────────────────────────

let dataSnapshot = null;
// Handed from S146 to S147 (same worker, serial order).
let s146NewPo = null;

test.describe.serial('PO cancel → PRC re-convert, then PRC cancel → PR re-process (S146 + S147, one chain)', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S146+S147' }); });

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
                { waitUntil: 'domcontentloaded', timeout: 120000 });
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
            await opt.waitFor({ state: 'visible', timeout: 120000 });
            await opt.click();
            console.log(`[S146] ${label} = ${value}`);
            await a.page.waitForTimeout(1200);
        }

        const submit = a.page.locator(`xpath=//button[normalize-space(.)='Submit']`).first();
        await submit.waitFor({ state: 'visible', timeout: 120000 });
        await submit.click();
        console.log('[S146] PO conversion submitted');
        await a.page.waitForTimeout(5000);
        const dlg = a.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
        if (await dlg.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
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
        s146NewPo = { code: newPo, url: a.page.url() };
    });

    // ── Scenario 147 ─────────────────────────────────────────────────────────
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
    test('cancelling the PRC re-enables Process on the requisition and a new PRC can be created '
        + '@PR @PRC @Cancel @S147 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000);

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        // ── Precondition: a PO pending approval on a live PRC (S146's new PO) ─
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
                { waitUntil: 'domcontentloaded', timeout: 120000 });
            await a.page.waitForTimeout(12000);
        } else {
            // The NEW PO that S146's re-conversion produced, on the same PRC.
            expect(s146NewPo?.url,
                'S146 did not hand over its re-converted PO — S147 depends on it (or set S147_RESUME_*)')
                .toBeTruthy();
            await a.page.goto(s146NewPo.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
            await a.page.waitForTimeout(12000);
        }
        console.log(`[S147] PO ${resumePo ? 'resumed' : `from S146 (${s146NewPo?.code})`} @ ${a.page.url()}`);

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
            if (await opt.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
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
            if (await cand.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)
                && await cand.isEnabled().catch(() => false)) { submit = cand; break; }
        }
        if (submit) {
            await submit.scrollIntoViewIfNeeded().catch(() => {});
            await submit.click();
            console.log('[S147] conversion submitted');
            await a.page.waitForTimeout(5000);
            const dlg = a.page.locator(`xpath=//*[@role='dialog']//button[normalize-space(.)='Submit']`).first();
            if (await dlg.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
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
