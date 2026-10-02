import { expect } from '@playwright/test';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks for the auction flows (A-D) in testSuiteAuctionFlow.
//
// Every flow needs the same chain: a 3-line intake → an RFX with a supplier
// list → optional restriction → surrogate quotes → foreclose → Convert to
// Auction. Only the supplier list, the restriction and the quoters differ, so
// the chain lives here once, driven by a small config.
// ─────────────────────────────────────────────────────────────────────────────

export const S = {
    S1: 'HG Automation SUPP',   // hgautonsef@mail.com
    S2: 'HG HF Test 001',       // nsehg01@mail.com
    S3: 'NSETEST',              // never quotes (Flow A)
    S4: 'TEST MUMBAI',          // restricted before quoting (Flow A)
    S5: 'HG Test SUP - SEZ',    // hgsez@mai.com (sic) — added in the auction edit
};
export const LOGIN = {
    S1: 'hgautonsef@mail.com',
    S2: 'nsehg01@mail.com',
    S5: 'hgsez@mai.com',        // ".mai" is correct — hgsez@mail.com does not exist
};
// qty 1 per line, so a price is also its line amount
export const RATES = { S1: [500, 700, 800], S2: [1000, 600, 1400] };
export const LINES = 3;

/** Per-flow JSON state file, so each stage can be re-run alone. */
export function makeState(file) {
    const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
    const write = (patch) => { const s = { ...read(), ...patch }; fs.writeFileSync(file, JSON.stringify(s, null, 2)); return s; };
    /** Run a step once per auction — a live window is too short to redo passed steps. */
    const once = async (key, fn, tag = 'AUC') => {
        if ((read().done || []).includes(key)) { console.log(`[${tag}] skip (already verified): ${key}`); return; }
        await fn();
        write({ done: [...(read().done || []), key] });
    };
    return { file, read, write, once };
}

/** Wait until an ISO time (+ extra ms). */
export async function waitUntil(page, iso, extraMs = 0, label = '') {
    const w = new Date(iso).getTime() + extraMs - Date.now();
    if (w > 0) {
        console.log(`[AUC] waiting ${Math.round(w / 1000)}s ${label}`);
        await page.waitForTimeout(w);
    }
}

/**
 * Intake (3 lines, qty 1) → RFX with `rfxSuppliers` → restrict `restrict` →
 * quote `quoters` → foreclose → Convert to Auction. Resumable through `st`.
 * Leaves { rfxUrl, paymentTerm, auctionUrl } in the state file.
 */
export async function buildConvertedAuction({ page, a, x, data, st, rfxSuppliers, restrict = [], quoters, tag }) {
    let rfxUrl = st.read().rfxUrl;
    if (!rfxUrl) {
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

        await a.addIntakeLineRow();
        await a.fillIntakeLineItem(data, { qty: 1 });
        for (let row = 2; row <= LINES; row++) {
            await a.addIntakeLineRow();
            await page.waitForTimeout(1500);
            await a.fillIntakeLineItemRow(data, { row, qty: 1, addressIndex: 0, tag });
        }
        expect((await a.readIntakeGridRows()).length, 'the intake does not carry 3 line items')
            .toBeGreaterThanOrEqual(LINES);

        await a.fillIntakePotentialSuppliers(data);
        await a.submitIntake();
        await a.completeIntakeSubmissionPopup();
        await a.approveIntakeUntilReleased(data, 'Approved by automation');
        await a.assertIntakeStatusReleased();
        await a.saveIntakeCode();

        await a.clickIntakeTab();
        await a.openSavedIntakeFromListing();
        await a.clickIntakeProcess();
        await a.clickSendForSourcing();
        await a.expandSourcingSections();
        await a.selectSourcingPaymentTerms();
        await a.fillSourcingCommercialBidDueDate(data);
        await a.fillSourcingTechnicalBidDueDate(data);
        await a.fillSourcingExpectedDeliveryDate(data);
        for (const k of rfxSuppliers) await a.addSourcingSupplierNamed(S[k]);
        await a.submitSourcingEvent();
        await a.saveSourcingEventCode();
        await a.approveSourcingUntilReleased();

        rfxUrl = page.url().replace(/\/(overview|evaluations|analysis|awards|transactions).*$/, '') + '/overview';
        st.write({ rfxUrl });
        console.log(`[${tag}] RFX released → ${rfxUrl}`);
    }

    await page.goto(rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);

    const paymentTerm = await page.evaluate(() => {
        const t = document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        const i = t.indexOf('Payment Terms');
        return i === -1 ? null : t[i + 1];
    });
    expect(paymentTerm, 'the RFX shows no Payment Terms value').toBeTruthy();
    st.write({ paymentTerm });

    const rows = await x.readRfxSupplierRows();
    console.log(`[${tag}] RFX suppliers: ${JSON.stringify(rows.map(r => r.cells))}`);
    for (const k of rfxSuppliers) {
        expect(rows.some(r => r.name.includes(S[k])), `${k} (${S[k]}) is not on the RFX`).toBeTruthy();
    }

    for (const k of restrict) {
        if (st.read()[`restricted${k}`]) continue;
        await x.restrictRfxSupplier(S[k]);
        st.write({ [`restricted${k}`]: true });
    }

    for (const k of quoters) {
        if (st.read()[`quoted${k}`]) continue;
        await page.goto(rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        // a run killed mid-quote leaves the supplier Quoted but not recorded — don't quote twice
        const cur = (await x.readRfxSupplierRows()).find(r => r.name.includes(S[k]));
        if (cur && cur.cells.some(c => /^Quoted$/i.test(c))) {
            console.log(`[${tag}] ${k} already Quoted on the RFX — skipping the quote`);
        } else {
            await x.quoteRfxSupplier(a, data, S[k], RATES[k]);
        }
        st.write({ [`quoted${k}`]: true });
    }

    await page.goto(rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    console.log(`[${tag}] suppliers before foreclose: ${JSON.stringify((await x.readRfxSupplierRows()).map(r => r.cells))}`);
    await a.forecloseRfx(data);
    await page.goto(rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    expect(await a.hasV4MenuItem('Convert to Auction'),
        'a quoted + foreclosed RFX does not offer Convert to Auction').toBeTruthy();
    // hasV4MenuItem leaves the Radix menu mid-animation — reload for a clean menu.
    await page.goto(rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    await a.clickV4MenuItem('Convert to Auction');
    await a.confirmConvertToAuction();

    const linked = await x.readLinkedAuctions(rfxUrl);
    console.log(`[${tag}] linked auctions: ${JSON.stringify(linked)}`);
    const auction = linked.find(l => l.href && /auction-requests\/\d+/.test(l.href));
    expect(auction, 'the conversion produced no Linked Auction on the RFX').toBeTruthy();
    st.write({ auctionUrl: auction.href.replace(/\/(edit)?$/, '') });
    console.log(`[${tag}] auction → ${auction.href}`);
}

/**
 * Auction edit → fill → Submit Auction → Release. `cfg`:
 *   bidImprovement   'No' | 'Value Basis' (…)   improvementValue   minMultiples '1'|'0'
 *   feedback         label from auctionActions.FEEDBACK
 *   startInMin       Bid Start Time = first 15-min slot at least this far out
 *   runtimeMin       Bid Runtime (minutes)
 *   ceilings         { lineIndex0: price }  — Ceiling Price per line item
 *   addSuppliers     ['S5', …]
 * Returns the start Date picked.
 */
export async function editAndRelease({ page, x, st, cfg, tag, auctionClass }) {
    await x.openAuction(st.read().auctionUrl);
    await x.clickAuctionEdit();

    await x.selectAuctionOption('Frequency', 'One Time');
    await page.evaluate(() => [...document.querySelectorAll('p')]
        .filter(e => e.innerText.trim() === 'Advanced Settings' && e.offsetParent).forEach(e => e.click()));
    await page.waitForTimeout(1200);
    await x.setAuctionRadio('Auto Release Auction', '0');

    await x.selectAuctionOption('Bid Imporvement Condition', cfg.bidImprovement || 'No');
    if (cfg.bidImprovement && cfg.bidImprovement !== 'No') {
        await x.fillAuctionInput('input[id="Bid Improvement value"]', cfg.improvementValue);
        await x.setAuctionRadio('Min Bid Change Multiples', cfg.minMultiples);
    }
    await x.setAuctionRadio('Supplier Market Feedback',
        auctionClass.FEEDBACK[cfg.feedback || 'Bid Rank with Lead Bid']);

    const start = await x.pickBidStartTime(cfg.startInMin);
    await x.fillAuctionInput('input[id="Bid Runtime"]', cfg.runtimeMin);
    await x.selectAuctionOption('Run time in', 'Minutes');
    // The extension rule is MANDATORY on the edit form — Submit silently stays on
    // /edit with the three boxes outlined red when it is left empty.
    const [by, rank, last, max] = cfg.extension || [1, 1, 5, 3];
    await x.setAuctionExtension(by, rank, last, max);

    for (const [line, price] of Object.entries(cfg.ceilings || {})) {
        // placeholder cells disappear once filled, so address by position among the EMPTY ones
        const before = Number(line) - Object.keys(cfg.ceilings).filter(l => Number(l) < Number(line)).length;
        await x.fillAuctionItemCell('Enter Ceiling Price', before, price);
        console.log(`[${tag}] ceiling line ${Number(line) + 1} = ${price}`);
    }
    for (const k of cfg.addSuppliers || []) await x.addAuctionSupplier(S[k]);

    await page.screenshot({ path: `test-results/auction-${tag}-before-submit.png`, fullPage: true });
    await x.submitAuctionEdit();

    await x.openAuction(st.read().auctionUrl);
    const rel = page.getByRole('button', { name: /^Release/i }).first();
    await expect(rel, 'no Release button (auto release = No)').toBeVisible({ timeout: 20000 });
    await rel.click();
    await page.waitForTimeout(2500);
    const dlg = page.getByRole('dialog').last();
    if (await dlg.isVisible().catch(() => false)) {
        await dlg.getByRole('button', { name: /^(Release|Confirm|Yes|Submit|OK)$/i }).last().click();
    }
    await page.waitForTimeout(6000);
    await x.openAuction(st.read().auctionUrl);
    const code = await x.readAuctionCode();
    expect(code, 'auction did not get a code on release').toMatch(/^AUC-(?!DRAFT)/);
    st.write({ released: true, auctionCode: code, bidStart: start.toISOString() });
    console.log(`[${tag}] released ${code}, starts ${start.toString()}`);
    return start;
}

/** All ₹ amounts in a text, as numbers. */
export const rupees = (t) => [...(t || '').matchAll(/₹\s*([\d,]+)/g)].map(m => Number(m[1].replace(/,/g, '')));
