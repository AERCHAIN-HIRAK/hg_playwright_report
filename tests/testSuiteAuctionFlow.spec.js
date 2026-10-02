import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { auctionActions, sappAuctionActions } from '../pages/auctionActions';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import { buildConvertedAuction, editAndRelease, makeState, waitUntil, rupees } from '../pages/auctionFlowHelpers';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Auction suite — QA's 6-stage auction sheet, dictated 2026-09-28/29.
//
// ONE continuous flow (Flow A) carries stages 1-6 on a single RFX → auction,
// each stage continuing from the last. Three short side flows cover what one
// auction cannot hold at the same time:
//   B  bid improvement Yes / 50 / multiples No
//   C  bid improvement Yes / 50 / multiples Yes + ceiling 600
//   D  new-supplier pre-bid, RFX quoter cannot regret, reassign, cancel before start
//   E  a new supplier (S5) regrets before start → CAPP Regretted view
//
// Rules QA stated:
//   • an RFX converts to an auction only once quoted by ≥2 suppliers AND foreclosed
//   • a supplier that never quoted, or was restricted before quoting, must not
//     reach the auction
//   • bid rank = supplier TOTAL; line-item rank is per item price, independent
//
// Flow A data (qty 1 per line, so a price is also its line amount):
//
//              item 1   item 2   item 3   total
//     S1        500      700      800     2000   rank 1
//     S2       1000      600     1400     3000   rank 2   (but rank 1 on item 2)
//     S3        —  never quotes
//     S4        —  restricted before anyone quotes
//     S5        —  added in the auction edit
//
// Stages hand over through STATE_FILE so a later stage can be re-run alone:
//   AUC_A_RFX=<rfx overview url> AUC_A_AUCTION=<auction url>
// ─────────────────────────────────────────────────────────────────────────────

const LOGIN = {
    S1: 'hgautonsef@mail.com',
    S2: 'nsehg01@mail.com',
    S5: 'hgsez@mai.com',        // ".mai" is correct — hgsez@mail.com does not exist
};

const S = {
    S1: 'HG Automation SUPP',   // hgautonsef@mail.com
    S2: 'HG HF Test 001',       // nsehg01@mail.com
    S3: 'NSETEST',              // never quotes
    S4: 'TEST MUMBAI',          // restricted before quoting
    S5: 'HG Test SUP - SEZ',    // hgsez@mai.com (sic) — added in the auction
};
const RATES = { S1: [500, 700, 800], S2: [1000, 600, 1400] };
const LINES = 3;
// 20 min, not 10: Stage 4 needs ~15 min of checks BEFORE the last-5-minute
// window, otherwise an early rank-1 change would spend an extension early.
const RUNTIME_MIN = Number(process.env.AUC_RUNTIME_MIN || 20);

const STATE_FILE = '.auction-a-state.json';
const readState = () => {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* none yet */ }
    if (process.env.AUC_A_RFX) s.rfxUrl = process.env.AUC_A_RFX;
    if (process.env.AUC_A_AUCTION) s.auctionUrl = process.env.AUC_A_AUCTION;
    return s;
};
const writeState = (patch) => {
    const s = { ...readState(), ...patch };
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
    return s;
};

const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

/** Run a stage-4 step once per auction: a live window is too short to redo passed steps on a re-run. */
const doneOnce = async (key, fn) => {
    const st = readState();
    if ((st.done || []).includes(key)) { console.log(`[AUC-A] skip (already verified): ${key}`); return; }
    await fn();
    writeState({ done: [...(readState().done || []), key] });
};

let dataSnapshot = null;

test.describe.serial('Auction Flow A — RFX → Auction → live → Update to RFQ', () => {

    // UAT drops a connection now and then; a lost live window costs a full rebuild. Every stage
    // resumes from .auction-a-state.json (stageNDone flags + doneOnce keys), so a retry only
    // redoes the step that failed.
    test.describe.configure({ retries: 2 });
    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });
    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'AUC-A' }); });

    // ── Setup: intake (3 lines) → RFX with S1-S4 → restrict S4 → quote S1, S2 →
    //    foreclose → Convert to Auction ────────────────────────────────────────
    test('A0 build: 3-line RFX, 4 suppliers, S4 restricted, S1+S2 quoted, foreclosed, converted '
        + '@auction @Slow', async ({ page }) => {
        test.setTimeout(3_000_000);
        const pre = readState();
        test.skip(!!(pre.rfxUrl && pre.auctionUrl), `reusing ${pre.auctionUrl} (delete ${STATE_FILE} to rebuild)`);

        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        await buildConvertedAuction({ page, a, x, data, st: { read: readState, write: writeState },
            rfxSuppliers: ['S1', 'S2', 'S3', 'S4'], restrict: ['S4'], quoters: ['S1', 'S2'], tag: 'AUC-A' });
    });

    // ── Stage 1 checks ────────────────────────────────────────────────────────
    test('A1 stage 1: conversion carries only valid suppliers + payment term, cannot repeat, is logged '
        + '@auction', async ({ page }) => {
        test.setTimeout(600_000);
        const st = readState();
        test.skip(!st.rfxUrl || !st.auctionUrl, 'A0 did not produce an RFX + auction');
        test.skip(!!st.stage1Done, 'stage 1 already verified on this auction');

        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await a.openApp(data);

        await x.openAuction(st.auctionUrl);
        const resp = await x.readSupplierResponse();
        const names = resp.rows.map(r => r.name);
        console.log(`[AUC-A] auction suppliers: ${JSON.stringify(resp)}`);

        await test.step('1.1 the supplier who never quoted (S3) is not in the auction', async () => {
            expect(names.some(n => n.includes(S.S3)), `S3 "${S.S3}" reached the auction: ${names}`).toBeFalsy();
            expect(names.some(n => n.includes(S.S1)) && names.some(n => n.includes(S.S2)),
                `the quoting suppliers are not both in the auction: ${names}`).toBeTruthy();
        });

        await test.step('1.2 the supplier restricted before quoting (S4) is not in the auction', async () => {
            expect(names.some(n => n.includes(S.S4)), `S4 "${S.S4}" reached the auction: ${names}`).toBeFalsy();
        });

        await test.step('1.3 the RFX payment term is carried to the auction', async () => {
            const general = norm(await x.readAuctionSection('General Details'));
            console.log(`[AUC-A] General Details: ${general.slice(0, 600)}`);
            expect(general, `auction does not show the RFX payment term "${st.paymentTerm}"`)
                .toContain(norm(st.paymentTerm));
            const code = (general.match(/Quote Request\s*:\s*(RFX-[\d-]+)/) || [])[1];
            expect(code, 'auction General Details do not name the source RFX').toBeTruthy();
            writeState({ rfxCode: code });
        });

        await test.step('1.5a the conversion is in the auction Activity timeline', async () => {
            await x.openAuction(st.auctionUrl);
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] auction timeline: ${JSON.stringify(tl)}`);
            // Exact wording, observed 2026-09-29: "Auction created from RFX RFX-26-404"
            const want = `Auction created from RFX ${readState().rfxCode}`;
            expect(tl, `no "${want}" entry in the auction timeline`).toContain(want);
        });

        await test.step('1.5b the conversion is in the RFX Activity timeline', async () => {
            await page.goto(st.rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(7000);
            const tl = await a.readRfxActivityTimeline();
            console.log(`[AUC-A] RFX timeline: ${JSON.stringify(tl)}`);
            // Exact wording, observed 2026-09-29: "RFX-26-404 has been converted to Auction AUC-DRAFT"
            const want = `${readState().rfxCode} has been converted to Auction`;
            expect(tl.some(l => l.startsWith(want)), `no "${want} …" entry in the RFX Activity timeline`).toBeTruthy();
        });

        await test.step('1.4 the RFX cannot be converted to a second auction', async () => {
            await page.goto(st.rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(7000);
            const d = await x.probeConvertToAuctionDialog(a);
            console.log(`[AUC-A] 2nd Convert to Auction dialog: ${JSON.stringify(d)}`);
            // QA: on a second conversion the line items are no longer available.
            // The dialog still LISTS them, each marked "Pending Auction", with
            // its checkbox disabled.
            expect(d.enabled, `the RFX still offers ${d.enabled} line item(s) for a second auction`).toBe(0);
            expect(d.pendingAuction, 'not every line is marked "Pending Auction" in the second Convert dialog')
                .toBeGreaterThanOrEqual(LINES);
        });
        writeState({ stage1Done: true });
    });

    // ── Stage 2 (edit + submit) and the Stage 3 checks up to Release ──────────
    test('A2 stage 2: edit + submit the auction (S5, no bid improvement, lead-bid feedback, '
        + 'notes, attachment, auto-release No, 10 min, extension) → release @auction', async ({ page }) => {
        test.setTimeout(900_000);
        const st = readState();
        test.skip(!st.auctionUrl, 'no auction from A0');
        test.skip(!!st.released, `auction already released (${st.auctionUrl})`);

        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await a.openApp(data);
        await x.openAuction(st.auctionUrl);

        await test.step('2.2 the RFX link on the auction opens the parent RFX', async () => {
            await x.expandAuctionSection('General Details');
            const link = page.getByText(st.rfxCode, { exact: true }).first();
            await expect(link, `no ${st.rfxCode} link on the auction`).toBeVisible();
            const [popup] = await Promise.all([
                page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
                link.click(),
            ]);
            const target = popup || page;
            await target.waitForLoadState('domcontentloaded').catch(() => {});
            await target.waitForTimeout(4000);
            const rfxId = st.rfxUrl.match(/quote-requests\/(\d+)/)[1];
            console.log(`[AUC-A] RFX link → ${target.url()}`);
            expect(target.url(), 'the RFX link did not open the parent RFX').toContain(`/quote-requests/${rfxId}`);
            if (popup) await popup.close(); else await x.openAuction(st.auctionUrl);
        });

        if (!readState().edited) {
            await x.clickAuctionEdit();

            await test.step('2.1 the currency cannot be changed in the auction edit', async () => {
                await expect(page.locator('input[id="Allowed Currency"]').first(),
                    'Allowed Currency is editable in the auction edit').toBeDisabled();
            });

            // ── fill the edit form ───────────────────────────────────────────────
            await x.selectAuctionOption('Frequency', 'One Time');
            await page.evaluate(() => [...document.querySelectorAll('p')]
                .filter(e => e.innerText.trim() === 'Advanced Settings' && e.offsetParent).forEach(e => e.click()));
            await page.waitForTimeout(1200);
            await x.setAuctionRadio('Auto Release Auction', '0');
            await x.selectAuctionOption('Bid Imporvement Condition', 'No');
            await x.setAuctionRadio('Supplier Market Feedback', auctionActions.FEEDBACK['Bid Rank with Lead Bid']);

            const start = await x.pickBidStartTime(30);
            await x.fillAuctionInput('input[id="Bid Runtime"]', RUNTIME_MIN);
            await x.selectAuctionOption('Run time in', 'Minutes');
            await x.setAuctionExtension(1, 1, 5, 3);

            const desc = [1, 2, 3].map(n => `AUTO-DESC line ${n}`);
            for (let i = 0; i < LINES; i++) await x.fillAuctionItemCell('Enter Description', 0, desc[i]);

            const notes = `AUTO-NOTES ${Date.now()}`;
            await x.fillAuctionNotes(notes);
            await x.uploadAuctionAttachment(path.resolve(data.invoice.documentPath));
            await x.addAuctionSupplier(S.S5);
            await page.screenshot({ path: 'test-results/auction-a2-before-submit.png', fullPage: true });

            const landed = await x.submitAuctionEdit();
            console.log(`[AUC-A] edit submitted → ${landed}`);
            // AUC-121: the file name showed in the edit form but the upload had not finished when
            // Submit went, so the auction saved with "No Attachments" — and after release it can
            // no longer be edited. Verify now, while the auction is still editable, and re-upload.
            const attName = path.basename(data.invoice.documentPath);
            for (let i = 0; i < 2; i++) {
                await x.openAuction(st.auctionUrl);
                await x.expandAuctionSection('Notes & Attachments');
                if ((await page.locator('body').innerText()).includes(attName)) break;
                console.log(`[AUC-A] attachment missing after submit — re-uploading (try ${i + 1})`);
                await x.clickAuctionEdit();
                await x.uploadAuctionAttachment(path.resolve(data.invoice.documentPath));
                await page.waitForTimeout(8000);
                await x.submitAuctionEdit();
            }
            await x.openAuction(st.auctionUrl);
            await x.expandAuctionSection('Notes & Attachments');
            expect(await page.locator('body').innerText(), 'the attachment did not save on the auction')
                .toContain(attName);
            writeState({ edited: true, bidStart: start.toISOString(), notes, desc,
                attachment: path.basename(data.invoice.documentPath) });
        }

        await x.openAuction(st.auctionUrl);
        const resp = await x.readSupplierResponse();
        console.log(`[AUC-A] after edit: ${JSON.stringify(resp)}`);
        const statusOf = (k) => (resp.rows.find(r => r.name.includes(S[k])) || {}).status || '(absent)';

        await test.step('2.3 the RFX quoters show Prebid-submitted', async () => {
            expect(statusOf('S1')).toMatch(/Prebid/i);
            expect(statusOf('S2')).toMatch(/Prebid/i);
        });
        await test.step('2.4a before release the added supplier sits in Draft', async () => {
            // Observed 2026-09-29: an added supplier reads "Draft" until the
            // auction is released, then "Pending".
            expect(statusOf('S5'), 'S5 was not added to the auction').not.toBe('(absent)');
        });

        await test.step('3.2 the edit-submit is in the auction Activity timeline', async () => {
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] timeline after edit: ${JSON.stringify(tl)}`);
            // Exact wording, observed 2026-09-29.
            expect(tl, 'no "Auction updated and submitted" entry in the auction timeline')
                .toContain('Auction updated and submitted');
        });

        await test.step('2.5 auto release No → a Release button is offered; release it', async () => {
            await x.openAuction(st.auctionUrl);
            const rel = page.getByRole('button', { name: /^Release/i }).first();
            await expect(rel, 'no Release button on an auction with auto release = No').toBeVisible({ timeout: 20000 });
            await rel.click();
            await page.waitForTimeout(2500);
            const dlg = page.getByRole('dialog').last();
            if (await dlg.isVisible({ timeout: 4000 }).catch(() => false)) {
                console.log(`[AUC-A] release dialog: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 300)}`);
                await dlg.getByRole('button', { name: /^(Release|Confirm|Yes|Submit|OK)$/i }).last().click();
            }
            await page.waitForTimeout(6000);
            await x.openAuction(st.auctionUrl);
            const head = await page.locator('body').innerText();
            expect(head, 'the auction is not Released after clicking Release').toMatch(/Released/);
            writeState({ released: true });
        });

        await test.step('2.4 after release the supplier added in the auction shows Pending', async () => {
            await x.openAuction(st.auctionUrl);
            const r = await x.readSupplierResponse();
            console.log(`[AUC-A] after release: ${JSON.stringify(r)}`);
            const s5 = (r.rows.find(row => row.name.includes(S.S5)) || {}).status || '(absent)';
            expect(s5, 'the supplier added in the auction is not Pending after release').toMatch(/Pending/i);
            expect(r.counts.pending, 'the Pending view type does not count S5').toBeGreaterThanOrEqual(1);
        });

        await test.step('3.3 the release is in the auction Activity timeline', async () => {
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] timeline after release: ${JSON.stringify(tl)}`);
            // Exact wording, observed 2026-09-29 — the app says RFQ, not Auction.
            expect(tl, 'no "RFQ released" entry in the auction timeline').toContain('RFQ released');
        });

        await test.step('3.1 no Amend after the auction is released', async () => {
            await x.openAuction(st.auctionUrl);
            await page.getByRole('button', { name: /^More$/ }).first().click();
            await page.waitForTimeout(1500);
            const items = await page.$$eval('[role=menuitem]', els => els.map(e => e.innerText.trim()));
            await page.keyboard.press('Escape');
            console.log(`[AUC-A] More after release: ${JSON.stringify(items)}`);
            expect(items.some(t => /^Amend/i.test(t)), `Amend offered after release: ${items}`).toBeFalsy();
        });
    });

    // ── Stage 3: after release, before the auction starts ────────────────────
    test('A3 stage 3: timings update, supplier search, downloads, SAPP details + statuses '
        + '@auction', async ({ page, browser }) => {
        test.setTimeout(900_000);
        const st = readState();
        test.skip(!st.released, 'auction not released yet (A2)');
        test.skip(!!st.stage3Done, 'stage 3 already verified on this auction');

        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await a.openApp(data);
        await x.openAuction(st.auctionUrl);
        const code = await x.readAuctionCode();
        expect(code, 'released auction has no code').toMatch(/^AUC-(?!DRAFT)/);
        writeState({ auctionCode: code });
        console.log(`[AUC-A] auction code ${code}`);

        await test.step('3.4 timings can be updated after release, before start — and it is logged', async () => {
            const t = await x.updateAuctionTimings(Number(process.env.AUC_LIVE_IN_MIN || 12), RUNTIME_MIN);
            writeState({ bidStart: t.toISOString() });
            await x.openAuction(st.auctionUrl);
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] timeline after timing update: ${JSON.stringify(tl)}`);
            // Exact wording, observed 2026-09-29.
            expect(tl, 'no "Auction timing rules have been updated" entry in the auction timeline')
                .toContain('Auction timing rules have been updated');
        });

        const startLabel = new Date(readState().bidStart)
            .toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

        await test.step('3.6 the new timing is what the auction now shows', async () => {
            // The view page does not print the start time; the listing does.
            const shown = await x.readListingStartTime(code);
            console.log(`[AUC-A] CAPP listing start: ${shown}`);
            expect(shown.toLowerCase(), `CAPP listing does not show the new start time ${startLabel}`).toContain(startLabel);
        });

        await test.step('3.5 a supplier can be searched on the auction view page', async () => {
            await x.openAuction(st.auctionUrl);
            const hits = await x.searchAuctionSupplier(S.S5);
            console.log(`[AUC-A] search "${S.S5}" → ${JSON.stringify(hits)}`);
            expect(hits.length, 'the supplier search found nothing').toBeGreaterThan(0);
            expect(hits.every(n => n.includes(S.S5)), `search returned other suppliers: ${hits}`).toBeTruthy();
        });

        await x.openAuction(st.auctionUrl);
        await x.expandAuctionSection('Notes & Attachments');
        const attMissing = !(await page.locator('body').innerText()).includes(st.attachment);
        if (attMissing) {
            // Only on an auction released before A2's attachment check existed (AUC-121) — it can't be
            // edited any more, so record the gap instead of losing the live window over it.
            test.info().annotations.push({ type: 'not verified', description: `3.9a/3.9b: ${st.auctionCode} has no attachment` });
            expect.soft(attMissing, `${st.auctionCode} was released without the attachment — 3.9 not verifiable`).toBeFalsy();
        }
        if (!attMissing) await test.step('3.9a the uploaded document downloads from CAPP', async () => {
            await x.openAuction(st.auctionUrl);
            await x.expandAuctionSection('Notes & Attachments');
            const name = await x.downloadAttachment(st.attachment);
            expect(name).toContain(path.parse(st.attachment).name);
        });

        for (const k of ['S1', 'S2', 'S5']) {
            await test.step(`SAPP as ${k}: details, statuses, descriptions, notes, download, start time`, async () => {
                const sp = await sappAuctionActions.login(browser, LOGIN[k]);
                try {
                    const listed = await sp.openAuction(code);
                    console.log(`[AUC-A] SAPP ${k} list row: ${listed}`);
                    const body = await sp.body();
                    const status = await sp.readStatus(code);
                    console.log(`[AUC-A] SAPP ${k} status "${status}"`);

                    // 3.10 all auction details reach the supplier
                    for (const want of ['National Stock Exchange Foundation', 'English Reverse(price)', 'One Time',
                        norm(st.paymentTerm), S[k]]) {
                        expect(body, `SAPP (${k}) does not show "${want}"`).toContain(want);
                    }
                    // 3.13 item descriptions entered in CAPP
                    for (const d of st.desc) expect(body, `SAPP (${k}) is missing "${d}"`).toContain(d);
                    // 2.6 notes + attachment on the SAPP view
                    expect(body, `SAPP (${k}) does not show the notes`).toContain(st.notes);
                    if (!attMissing) expect(body, `SAPP (${k}) does not list the attachment`).toContain(st.attachment);
                    // 3.6 the new start time reached SAPP too
                    expect(listed.toLowerCase(), `SAPP (${k}) list does not show start ${startLabel}`).toContain(startLabel);

                    if (k === 'S5') {
                        // 3.12 new to the auction → Pending, auction AND every line
                        expect(status, 'S5 auction status is not pending').toMatch(/^pending$/i);
                        expect((body.match(/\bPending\b/g) || []).length, 'S5 line items are not all Pending')
                            .toBeGreaterThanOrEqual(LINES);
                    } else {
                        // 3.11 quoted in the RFX → Prebid-submitted, auction AND every line
                        expect(status, `${k} auction status is not prebid-submitted`).toMatch(/^prebid-submitted$/i);
                        expect((body.match(/Prebid-submitted/gi) || []).length, `${k} line items are not all Prebid-submitted`)
                            .toBeGreaterThanOrEqual(LINES + 1);
                    }

                    // 3.9b the document downloads from SAPP
                    if (!attMissing) {
                        const sx = new auctionActions(sp.page);
                        const name = await sx.downloadAttachment(st.attachment);
                        expect(name).toContain(path.parse(st.attachment).name);
                    }
                } finally {
                    await sp.close();
                }
            });
        }
        writeState({ stage3Done: true });
    });


    // ── Stage 4: the live auction ────────────────────────────────────────────
    test('A4 stage 4: live bidding — first-time vs update screens, ranks, view types, buyer view, '
        + 'chat, reset, errors, extensions, added time @auction', async ({ page, browser }) => {
        test.setTimeout(3_000_000);
        const st = readState();
        test.skip(!st.stage3Done, 'stage 3 not verified yet (A3)');
        test.skip(!!st.stage4Done, 'stage 4 already verified on this auction');

        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await a.openApp(data);

        const startAt = new Date(st.bidStart).getTime();
        const wait = startAt + 20_000 - Date.now();
        if (wait > 0) { console.log(`[AUC-A] waiting ${Math.round(wait / 1000)}s for ${st.auctionCode} to go live`); await page.waitForTimeout(wait); }
        const endAt = () => startAt + RUNTIME_MIN * 60_000;

        const sup = {};
        for (const k of ['S1', 'S2', 'S5']) sup[k] = await sappAuctionActions.login(browser, LOGIN[k]);
        try {
            await doneOnce('4.5 going live is in the auction Activit', () => test.step('4.5 going live is in the auction Activity timeline', async () => {
                await x.openAuction(st.auctionUrl);
                const tl = await x.readAuctionTimeline();
                console.log(`[AUC-A] timeline at live: ${JSON.stringify(tl)}`);
                // Exact wording, observed 2026-09-30.
                expect(tl, 'no "Auction has started" entry in the auction timeline').toContain('Auction has started');
            }));

            await doneOnce('4.10 / 4.11 Pre-bid submitted lists the ', () => test.step('4.10 / 4.11 Pre-bid submitted lists the RFX quoters; Pending lists the new supplier', async () => {
                await x.openAuction(st.auctionUrl);
                const pre = await x.readSupplierResponse('Prebid-submitted');
                // a second tab click ADDS to the filter, so start clean for Pending
                await x.openAuction(st.auctionUrl);
                const pen = await x.readSupplierResponse('Pending');
                expect(pre.rows.some(r => r.name.includes(S.S5)), 'S5 listed under Pre-bid submitted').toBeFalsy();
                expect(pen.rows.some(r => r.name.includes(S.S1) || r.name.includes(S.S2)), 'an RFX quoter listed under Pending').toBeFalsy();
                console.log(`[AUC-A] prebid view ${JSON.stringify(pre.rows.map(r => r.name))} | pending view ${JSON.stringify(pen.rows.map(r => r.name))}`);
                for (const k of ['S1', 'S2']) expect(pre.rows.some(r => r.name.includes(S[k])), `${k} missing from Pre-bid submitted`).toBeTruthy();
                expect(pen.rows.some(r => r.name.includes(S.S5)), 'S5 missing from Pending').toBeTruthy();
            }));

            // 4.14 (no pre-bid for RFX quoters, pre-bid for new suppliers) is a
            // PRE-live rule — it is covered in Flow D. Here: 4.2 only.
            await doneOnce('4.2 an RFX quoter goes straight to the l', () => test.step('4.2 an RFX quoter goes straight to the live update-bid page', async () => {
                await sup.S2.openAuction(st.auctionCode);
                expect(await sup.S2.joinLive(), 'S2 (RFX quoter) did not land on the update-bid page').toBe('live');
                await expect(sup.S2.page.getByRole('button', { name: 'Update Bid' })).toBeVisible();
            }));

            await doneOnce('4.20 wrong inputs are rejected with an e', () => test.step('4.20 wrong inputs are rejected with an error message', async () => {
                // A ₹0 bid is out of scope (QA 2026-09-30: no supplier bids 0 in practice). The app
                // accepts it with "Bid Updated Successfully!" and an empty version — not tested.
                const cases = [{ label: 'above current', bids: { 0: 5000 } }, { label: 'negative', bids: { 0: -10 } }];
                for (const c of cases) {
                    const r = await sup.S2.updateBid(c.bids);
                    console.log(`[AUC-A] 4.20 ${c.label}: ${JSON.stringify(r)}`);
                    expect.soft(r.ok, `a ${c.label} bid was accepted`).toBeFalsy();
                    expect.soft(r.msg, `no error message for a ${c.label} bid`).not.toMatch(/^$|Successfully/);
                    await sup.S2.page.reload(); await sup.S2.page.waitForTimeout(4000);
                }
            }));

            await doneOnce('4.21 / 4.3 / 4.22 S2 bids 3000→2500, S1 ', () => test.step('4.21 / 4.3 / 4.22 S2 bids 3000→2500, S1 idle: S1 rank 1, S2 rank 2; item ranks independent', async () => {
                await sup.S2.ensureLive(st.auctionCode);
                let live = await sup.S2.readLive();
                if (!/2,500/.test(live.grandTotal || '')) {          // idempotent on re-runs
                    const r = await sup.S2.updateBid({ 2: 900 });
                    expect(r.ok, `S2 bid rejected: ${r.msg}`).toBeTruthy();
                    live = await sup.S2.readLive();
                }
                console.log(`[AUC-A] S2 live: rank ${live.bidRank}, lead ${live.leadBid}, total ${live.grandTotal}, items ${JSON.stringify(live.itemRanks.map(i => i.rank))}`);
                expect(live.bidRank).toMatch(/#\s*2/);
                expect(live.leadBid).toMatch(/2,?000/);
                expect(live.itemRanks.map(i => i.rank), 'S2 item ranks (500/700/800 vs 1000/600/900)').toEqual([2, 1, 2]);
                const s1 = sup.S1;
                await s1.ensureLive(st.auctionCode);
                const l1 = await s1.readLive();
                console.log(`[AUC-A] S1 live: rank ${l1.bidRank}, items ${JSON.stringify(l1.itemRanks.map(i => i.rank))}`);
                expect(l1.bidRank, 'S1 (never bid in the auction, RFX 2000) is not rank 1').toMatch(/#\s*1/);
                expect(l1.itemRanks.map(i => i.rank)).toEqual([1, 2, 1]);
            }));

            await doneOnce('4.14b / 4.1 / 4.6 the new supplier accep', () => test.step('4.14b / 4.1 / 4.6 the new supplier accepts, sees the FIRST-TIME bid screen, bids', async () => {
                await sup.S5.openAuction(st.auctionCode);
                await sup.S5.acceptAuction();
                const screen = await sup.S5.joinLive();
                if (!readState().s5FirstBid) {
                    expect(screen, 'S5 (new) did not get the first-time Bid Submission screen').toBe('bid');
                    await expect(sup.S5.page.getByText('Bid Submission').first()).toBeVisible();
                    await sup.S5.submitFirstBid([450, 550, 750]);
                    writeState({ s5FirstBid: true });
                }
                const l5 = await sup.S5.readLive();
                console.log(`[AUC-A] S5 live: rank ${l5.bidRank}, total ${l5.grandTotal}`);
                expect(l5.bidRank).toMatch(/#\s*1/);
                await expect(sup.S5.page.getByRole('button', { name: 'Update Bid' }), 'S5 not on the update page after its first bid').toBeVisible();
                await x.openAuction(st.auctionUrl);
                const tl = await x.readAuctionTimeline();
                console.log(`[AUC-A] timeline after S5 accept: ${JSON.stringify(tl)}`);
                expect(tl.some(l => /accept/i.test(l)), 'the supplier acceptance is not in the auction timeline').toBeTruthy();
            }));

            await doneOnce('4.4 / 4.8 after bidding, S2 and S5 are B', () => test.step('4.4 / 4.8 after bidding, S2 and S5 are Bid-Submitted and listed in that view type', async () => {
                await x.openAuction(st.auctionUrl);
                const bs = await x.readSupplierResponse('Bid-submitted');
                console.log(`[AUC-A] bid-submitted view ${JSON.stringify(bs.rows.map(r => [r.name, r.status]))}`);
                for (const k of ['S2', 'S5']) {
                    const row = bs.rows.find(r => r.name.includes(S[k]));
                    expect(row, `${k} not in Bid-submitted view`).toBeTruthy();
                    expect(row.status).toMatch(/Bid-submitted/i);
                }
            }));

            await doneOnce('4.7 / 4.19 / 4.15 / 4.16 buyer sees bids', () => test.step('4.7 / 4.19 / 4.15 / 4.16 buyer sees bids, bid logs, progression graph and live totals', async () => {
                await x.openLivePage(st.auctionUrl);
                const lp = await x.readLivePage();
                console.log(`[AUC-A] live page: ${JSON.stringify({ ends: lp.ends, extLeft: lp.extLeft, sup: lp.suppliers, logs: lp.bidLogs, charts: lp.charts, base: lp.baseLine, best: lp.bestBid })}`);
                expect(lp.text).toContain('Participant Progression');
                expect(lp.charts, 'no progression chart rendered').toBeGreaterThan(0);
                expect(lp.text, 'CAPP live page does not show S5 total 1,750').toContain('1,750');
                expect(lp.text, 'CAPP live page does not show S2 total 2,500').toContain('2,500');
                expect(lp.text).toContain('₹');
                const logFor = (k) => lp.bidLogs.filter(r => r.join(' ').includes(S[k]));
                expect(logFor('S2').length, 'S2 bid missing from Bid Logs').toBeGreaterThanOrEqual(2);
                expect(logFor('S5').length, 'S5 bid missing from Bid Logs').toBeGreaterThanOrEqual(1);
                const ranks = lp.suppliers.map(r => r.join(' '));
                expect(ranks.findIndex(r => r.includes(S.S5)), 'S5 not ranked #1 in Supplier Information').toBe(0);
            }));

            await doneOnce('4.12 buyer and supplier can chat through', () => test.step('4.12 buyer and supplier can chat through supplier comments', async () => {
                const msg = `AUTO-CHAT buyer ${Date.now()}`;
                const reply = `AUTO-CHAT supplier ${Date.now()}`;
                await x.openLivePage(st.auctionUrl);
                await x.postSupplierComment(S.S2, msg);
                // the supplier sees it in SAPP's Comments panel (auction view page) …
                const sappText = await sup.S2.openComments(st.auctionCode);
                expect(sappText, 'the buyer comment did not reach the supplier in SAPP').toContain(msg);
                // … and replies, which the buyer sees back in CAPP
                const after = await sup.S2.replyComment(reply);
                expect(after, 'the supplier reply is not shown in SAPP after sending').toContain(reply);
                await x.openLivePage(st.auctionUrl);
                expect(await x.readSupplierComments(S.S2), 'the supplier reply did not reach CAPP').toContain(reply);
                await x.openLivePage(st.auctionUrl);
            }));

            // ── extensions: rank-1 changes inside the last 5 minutes ──────────
            await doneOnce('2.14 / 2.15 a rank-1 change in the last ', () => test.step('2.14 / 2.15 a rank-1 change in the last 5 min extends by 1 min — at most 3 times', async () => {
                const lastWindow = endAt() - 5 * 60_000 + 15_000;
                const w = lastWindow - Date.now();
                if (w > 0) { console.log(`[AUC-A] waiting ${Math.round(w / 1000)}s for the last-5-minute window`); await page.waitForTimeout(w); }
                // Runs BEFORE the reset. Standing: S5 450/550/750 = 1750 (#1), S1 2000, S2 1000/600/900 = 2500.
                // Each move takes BOTH the overall rank 1 AND the L1 of a line the mover did not lead,
                // so an extension is due whether the app reads "rank up to 1" on the total or per line
                // (AUC-120: a move that flipped only the total rank earned no extension).
                //   S2 line3→100: 1700 < 1750, L1 line3 (was S5 750)
                //   S5 line3→ 50: 1050 < 1700, L1 line3 (was S2 100)
                //   S2 line1→300: 1000 < 1050, L1 line1 (was S5 450)
                //   S5 line1→250:  850 < 1000, L1 line1 (was S2 300)  — 4th: no extension left
                const moves = [['S2', { 2: 100 }], ['S5', { 2: 50 }], ['S2', { 0: 300 }], ['S5', { 0: 250 }]];
                const secs = [];
                await x.openLivePage(st.auctionUrl);
                let before = await x.readLivePage();
                // resumable: a retry inside the same live window must not replay accepted moves
                const movesDone = readState().extMovesDone || 0;
                if (movesDone) console.log(`[AUC-A] resuming extensions after ${movesDone} accepted move(s)`);
                for (let m = movesDone; m < moves.length; m++) {
                    const [k, bids] = moves[m];
                    // Each extension pushes the end back out past 5:00 remaining — outside the
                    // window, where a rank-1 change correctly earns nothing. Re-enter it first.
                    const left = auctionActions.secondsOf(before.ends);
                    if (left > 280) {
                        console.log(`[AUC-A] ${left}s left — waiting ${left - 280}s to re-enter the last-5-min window`);
                        await page.waitForTimeout((left - 280) * 1000);
                        await x.openLivePage(st.auctionUrl);
                        before = await x.readLivePage();
                    }
                    await sup[k].ensureLive(st.auctionCode);
                    const r = await sup[k].updateBid(bids);
                    expect(r.ok, `${k} bid ${JSON.stringify(bids)} rejected: ${r.msg}`).toBeTruthy();
                    await page.waitForTimeout(4000);
                    await x.openLivePage(st.auctionUrl);
                    const after = await x.readLivePage();
                    const gained = auctionActions.secondsOf(after.ends) - (auctionActions.secondsOf(before.ends) - 15);
                    secs.push({ move: m + 1, k, extLeftBefore: before.extLeft, extLeftAfter: after.extLeft, endsBefore: before.ends, endsAfter: after.ends });
                    console.log(`[AUC-A] extension move ${m + 1}: ${JSON.stringify(secs[m])}`);
                    if (m < 3) expect(after.extLeft, `rank-1 change #${m + 1} did not use an extension`).toBe(before.extLeft - 1);
                    else expect(after.extLeft, 'a 4th extension was granted beyond Max Extensions 3').toBe(0);
                    writeState({ extMovesDone: m + 1 });
                    before = after;
                }
            }));

            await doneOnce('4.18 buyer can add time from the live pa', () => test.step('4.18 buyer can add time from the live page — button and custom timer', async () => {
                await x.openLivePage(st.auctionUrl);
                const b0 = auctionActions.secondsOf((await x.readLivePage()).ends);
                await x.addAuctionTime('+5min');
                const b1 = auctionActions.secondsOf((await x.readLivePage()).ends);
                console.log(`[AUC-A] +5min: ${b0}s → ${b1}s`);
                expect(b1 - b0, '+5min did not add ~5 minutes').toBeGreaterThan(240);
                await x.addCustomTime(2);
                const b2 = auctionActions.secondsOf((await x.readLivePage()).ends);
                console.log(`[AUC-A] custom +2: ${b1}s → ${b2}s`);
                expect(b2 - b1, 'custom timer did not add ~2 minutes').toBeGreaterThan(90);
            }));
            // S2 (RFX quoter) is NOT reset until Bug 3 is fixed (QA 2026-09-30): its reset drops the
            // bids to ₹0 instead of the RFX quote. Only the new supplier S5 is reset here.
            await doneOnce('4.17 reset: new supplier S5 drops out of', () => test.step('4.17 reset: the new supplier (S5) drops out of the ranking', async () => {
                await x.openLivePage(st.auctionUrl);
                // Final auction bids BEFORE the reset — what 5.3 compares against.
                const pre = (await x.readLivePage()).suppliers;
                writeState({ preReset: pre });
                const preRow = (k) => (pre.find(r => r.join(' ').includes(S[k])) || []).join(' ');
                await x.resetSupplier(S.S5);
                await x.openLivePage(st.auctionUrl);
                const lp = await x.readLivePage();
                const row = (k) => (lp.suppliers.find(r => r.join(' ').includes(S[k])) || []).join(' ');
                console.log(`[AUC-A] after reset: S5 "${row('S5')}" | S2 "${row('S2')}" (before "${preRow('S2')}") | S1 "${row('S1')}"`);
                // QA 2026-09-30: a reset NEW supplier drops out of the rankings.
                expect(row('S5'), 'S5 still carries a rank after its reset').not.toMatch(/#\s*[1-9]/);
                // …and nobody else's bid moves
                expect(rupees(row('S2'))[0], 'S2 total changed when S5 was reset').toBe(rupees(preRow('S2'))[0]);
                const ranked = lp.suppliers.map(r => r.join(' ')).filter(r => /#\s*[1-9]/.test(r));
                const low = ['S1', 'S2'].sort((p, q) => rupees(row(p))[0] - rupees(row(q))[0])[0];
                expect(ranked[0], `${low} (lowest remaining total) is not rank 1 once S5 is reset`).toContain(S[low]);
            }));

            writeState({ stage4Done: true });
        } finally {
            for (const k of Object.keys(sup)) await sup[k].close().catch(() => {});
        }
    });

    // ── Stages 5 & 6: close → Update to RFQ ──────────────────────────────────
    test('A5 stages 5-6: Bid Submitted before update, close logged, Update RFQ carries bids + new supplier '
        + '@auction', async ({ page, browser }) => {
        test.setTimeout(900_000);
        const st = readState();
        test.skip(!st.stage4Done, 'stage 4 not verified yet (A4)');
        const a = new NSEFoundationActions(page);
        const x = new auctionActions(page);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await a.openApp(data);

        await doneOnce('A5 5.1', () => test.step('5.1 every line is Bid Submitted in CAPP and SAPP before Update to RFQ', async () => {
            await x.openAuction(st.auctionUrl);
            const body = norm(await page.locator('body').innerText());
            expect((body.match(/Bid-submitted/gi) || []).length, 'CAPP lines not all Bid-submitted').toBeGreaterThanOrEqual(LINES);
            const sp = await sappAuctionActions.login(browser, LOGIN.S2);
            try {
                await sp.openAuction(st.auctionCode);
                const sb = await sp.body();
                expect((sb.match(/Bid-submitted|Bid Submitted/gi) || []).length, 'SAPP lines not all Bid Submitted').toBeGreaterThanOrEqual(LINES);
            } finally { await sp.close(); }
        }));

        await doneOnce('A5 5.2 close', () => test.step('4.13 / 5.2 the buyer closes the live auction and it is logged', async () => {
            await x.openLivePage(st.auctionUrl);
            await x.closeAuction();
            await x.openAuction(st.auctionUrl);
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] timeline after close: ${JSON.stringify(tl)}`);
            expect(tl.some(l => /clos|ended/i.test(l)), 'no close entry in the auction timeline').toBeTruthy();
        }));

        await doneOnce('A5 6.x update rfq', () => test.step('6.1-6.3 Update RFQ: new supplier joins the RFX, statuses, both timelines', async () => {
            await x.openAuction(st.auctionUrl);
            await x.updateRfq();
            await x.openAuction(st.auctionUrl);
            const head = await page.locator('body').innerText();
            console.log(`[AUC-A] auction after Update RFQ: ${norm(head).slice(0, 300)}`);
            // 6.2 (QA 2026-09-30): after Update RFQ the auction and its lines read Converted.
            expect(head, 'the auction is not Converted after Update RFQ').toMatch(/Converted/);
            expect((norm(head).match(/Converted/g) || []).length, 'not every line is Converted')
                .toBeGreaterThanOrEqual(LINES + 1);
            const tl = await x.readAuctionTimeline();
            console.log(`[AUC-A] auction timeline after Update RFQ: ${JSON.stringify(tl)}`);
            await page.goto(st.rfxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(8000);
            const rows = await x.readRfxSupplierRows();
            console.log(`[AUC-A] RFX suppliers after Update RFQ: ${JSON.stringify(rows.map(r => r.cells))}`);
            expect(rows.some(r => r.name.includes(S.S5)), 'the supplier added in the auction did not reach the RFX').toBeTruthy();
            const rtl = await a.readRfxActivityTimeline();
            console.log(`[AUC-A] RFX timeline after Update RFQ: ${JSON.stringify(rtl.slice(-12))}`);
        }));

        await doneOnce('A5 5.3 analysis', () => test.step('5.3 the RFX Analysis tab carries the final prices (S1 RFX quote, S2 final auction bid)', async () => {
            await page.goto(st.rfxUrl.replace(/\/overview.*$/, '/analysis'), { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(10000);
            const lines = (await page.locator('body').innerText()).split('\n').map(l => l.trim()).filter(Boolean);
            // supplier columns in header order, then the Cost Approval Note "Total" row
            const from = lines.indexOf('Compare');
            const order = lines.slice(from, from + 40).filter(l => [S.S1, S.S2, S.S5].includes(l));
            const ti = lines.findIndex((l, i) => i > from && l === 'Total' && lines.slice(Math.max(0, i - 6), i).some(x => /Cost Approval Note|\d+/.test(x)));
            const totals = rupees(lines.slice(ti + 1, ti + 12).join(' ')).slice(0, order.length);
            const got = Object.fromEntries(order.map((n, i) => [n, totals[i]]));
            console.log(`[AUC-A] RFX Analysis totals: ${JSON.stringify(got)} (pre-reset auction standing ${JSON.stringify(st.preReset)})`);
            for (const k of ['S1', 'S2', 'S5']) expect(order, `${k} missing from RFX Analysis`).toContain(S[k]);
            // S1 never bid in the auction and was never reset → its RFX quote 500/700/800
            expect(got[S.S1], 'S1 total in RFX Analysis').toBe(2000);
            // S2 was not reset (Bug 3 parked) → its FINAL auction bid must flow back to the RFX
            const s2Final = rupees(((st.preReset || []).find(r => r.join(' ').includes(S.S2)) || []).join(' '))[0];
            console.log(`[AUC-A] S2 final auction total ${s2Final}`);
            expect(s2Final, 'no pre-reset S2 standing recorded').toBeTruthy();
            expect(got[S.S2], 'S2 did not reach the RFX at its final auction bid').toBe(s2Final);
            // S5 (new to the auction, reset, no re-bid): expected value not specified by QA — recorded only.
            console.log(`[AUC-A] S5 reached the RFX at: ${got[S.S5]}`);
        }));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Flows B & C — bid-improvement rules. One auction can hold only one setting
// (auction-wide, QA 2026-09-29), so each has its own short chain: S1 + S2 quote
// (S1 500/700/800, S2 1000/600/1400), foreclose, convert, edit, release, live.
// QA: "Yes" = Bid Improvement Condition "Value Basis"; value 50 in the HEADER
// only — never on the line items.
// ═════════════════════════════════════════════════════════════════════════════

/** S2 bids on one line and each case must be accepted / refused. Returns the log. */
async function bidCases(sp, code, line, cases, tag) {
    const out = [];
    for (const c of cases) {
        await sp.ensureLive(code);
        const r = await sp.updateBid({ [line]: c.price });
        out.push({ ...c, ok: r.ok, msg: r.msg });
        console.log(`[${tag}] line ${line + 1} bid ${c.price} (${c.why}) → ${r.ok ? 'ACCEPTED' : 'REFUSED'} ${r.msg}`);
        expect.soft(r.ok, `line ${line + 1} bid ${c.price} (${c.why}) should be ${c.accept ? 'accepted' : 'refused'}: ${r.msg}`)
            .toBe(c.accept);
        if (!c.accept) expect.soft(r.msg, `no error message for the refused bid ${c.price}`).not.toMatch(/^$|Successfully/);
    }
    return out;
}

/** Suggested Bid shown on the SAPP live page for a line (null when "N/A"). */
async function suggestedBid(sp, code, line) {
    await sp.ensureLive(code);
    const live = await sp.readLive();
    const row = live.itemRanks.find(r => r.line === line + 1);
    if (!row || /N\/A\s+₹[\s\d,]+$/.test(row.text)) return { value: null, row: row && row.text };
    const v = rupees(row.text);
    return { value: v.length >= 3 ? v[v.length - 2] : null, row: row.text };
}

for (const flow of [
    {
        key: 'B', title: 'Auction Flow B — bid improvement Value Basis 50, multiples No',
        cfg: { bidImprovement: 'Value Basis', improvementValue: 50, minMultiples: '0' },
        // S2 line 3 is 1400. Multiples No: at least 50 below — 55 is fine, 45 is not.
        line: 2, suggested: 1350,
        cases: [
            { price: 1355, accept: false, why: '45 below 1400' },
            { price: 1345, accept: true, why: '55 below 1400' },
            { price: 1295, accept: true, why: '50 below 1345' },
        ],
        covers: '2.9 / 2.11',
    },
    {
        key: 'C', title: 'Auction Flow C — Value Basis 50, multiples Yes, ceiling 600 on line 1',
        cfg: { bidImprovement: 'Value Basis', improvementValue: 50, minMultiples: '1', ceilings: { 0: 600 } },
        // S2 line 1 quoted 1000, ceiling 600: nothing above the ceiling; 600 itself refused
        // because the first bid must also improve by 50 → 550. Then multiples of 50 only.
        line: 0, suggested: 550,
        cases: [
            { price: 601, accept: false, why: 'above ceiling 600' },
            { price: 600, accept: false, why: 'equal to ceiling (no 50 improvement)' },
            { price: 550, accept: true, why: 'ceiling − 50' },
            { price: 505, accept: false, why: '45 below 550' },
            { price: 495, accept: false, why: '55 below 550 (not a multiple of 50)' },
            { price: 450, accept: true, why: '100 below 550 (2 × 50)' },
        ],
        covers: '2.10 / 2.12',
    },
]) {
    const st = makeState(`.auction-${flow.key.toLowerCase()}-state.json`);
    const TAG = `AUC-${flow.key}`;
    let snap = null;

    test.describe.serial(flow.title, () => {
        test.use({ actionTimeout: 20000, navigationTimeout: 60000 });
        test.beforeAll(() => { snap = snapshotFixtures(); });
        test.afterAll(() => { restoreFixtures(snap, { tag: TAG }); });

        test(`${flow.key}0 build: S1 + S2 quoted, foreclosed, converted @auction @Slow`, async ({ page }) => {
            test.setTimeout(3_000_000);
            test.skip(!!st.read().auctionUrl, `reusing ${st.read().auctionUrl} (delete ${st.file} to rebuild)`);
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 950 });
            await a.openApp(data);
            await buildConvertedAuction({ page, a, x, data, st, rfxSuppliers: ['S1', 'S2'], quoters: ['S1', 'S2'], tag: TAG });
        });

        test(`${flow.key}1 edit + release with the bid-improvement rule @auction`, async ({ page }) => {
            test.setTimeout(900_000);
            test.skip(!st.read().auctionUrl, 'no auction yet');
            test.skip(!!st.read().released, 'already released');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);
            await editAndRelease({ page, x, st, tag: TAG, auctionClass: auctionActions,
                cfg: { ...flow.cfg, feedback: 'Bid Rank with Lead Bid', startInMin: 8, runtimeMin: 15 } });
        });

        test(`${flow.key}2 live: ${flow.covers} — suggested price and accepted / refused bids @auction`, async ({ page, browser }) => {
            test.setTimeout(2_400_000);
            const s = st.read();
            test.skip(!s.released, 'not released yet');
            test.skip(!!s.liveDone, 'already verified');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);
            await waitUntil(page, s.bidStart, 20_000, `for ${s.auctionCode} to go live`);

            const sp = await sappAuctionActions.login(browser, LOGIN.S2);
            try {
                await test.step(`${flow.key === 'B' ? '2.11' : '2.12'} suggested price = ${flow.suggested}`, async () => {
                    const sg = await suggestedBid(sp, s.auctionCode, flow.line);
                    console.log(`[${TAG}] suggested bid line ${flow.line + 1}: ${sg.value} | row: ${sg.row}`);
                    expect.soft(sg.value, `suggested bid on line ${flow.line + 1}`).toBe(flow.suggested);
                });
                await test.step(`${flow.covers} bids accepted / refused by the rule`, async () => {
                    await bidCases(sp, s.auctionCode, flow.line, flow.cases, TAG);
                });
            } finally { await sp.close(); }

            // tidy up: close the auction so it does not linger live on UAT
            await x.openLivePage(s.auctionUrl);
            await x.closeAuction();
            st.write({ liveDone: true });
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Flow D — before go-live: pre-bid rules, regret, reassign, cancel.
//   4.14 an RFX quoter has no pre-bid; the new supplier (S5) can pre-bid
//   4.9a an RFX quoter (S2) cannot regret — no Reject / Regret button
//   3.8  reassign the auction to any user in the dropdown
//   3.7  cancel before the auction starts
// ═════════════════════════════════════════════════════════════════════════════
{
    const st = makeState('.auction-d-state.json');
    const TAG = 'AUC-D';
    let snap = null;

    test.describe.serial('Auction Flow D — pre-bid, regret, reassign, cancel before start', () => {
        test.use({ actionTimeout: 20000, navigationTimeout: 60000 });
        test.beforeAll(() => { snap = snapshotFixtures(); });
        test.afterAll(() => { restoreFixtures(snap, { tag: TAG }); });

        test('D0 build: S1 + S2 quoted, foreclosed, converted @auction @Slow', async ({ page }) => {
            test.setTimeout(3_000_000);
            test.skip(!!st.read().auctionUrl, `reusing ${st.read().auctionUrl}`);
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 950 });
            await a.openApp(data);
            await buildConvertedAuction({ page, a, x, data, st, rfxSuppliers: ['S1', 'S2'], quoters: ['S1', 'S2'], tag: TAG });
        });

        test('D1 edit (add S5, pre-bids allowed) + release, start well in the future @auction', async ({ page }) => {
            test.setTimeout(900_000);
            test.skip(!st.read().auctionUrl, 'no auction yet');
            test.skip(!!st.read().released, 'already released');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);
            await editAndRelease({ page, x, st, tag: TAG, auctionClass: auctionActions,
                cfg: { bidImprovement: 'No', feedback: 'Bid Rank with Lead Bid', startInMin: 60, runtimeMin: 10, addSuppliers: ['S5'] } });
        });

        test('D2 4.14 / 4.9a / 3.8 / 3.7 pre-bid rules, no regret for RFX quoters, reassign, cancel @auction', async ({ page, browser }) => {
            test.setTimeout(1_200_000);
            const s = st.read();
            test.skip(!s.released, 'not released yet');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);
            const actionButtons = async (sp) => [...new Set(await sp.page.$$eval('button', bs => bs
                .map(b => (b.innerText || '').trim()).filter(t => t && t.length < 30)))];

            await st.once('4.14a RFX quoter has no pre-bid', () => test.step('4.14a an RFX quoter (S1) is not offered a pre-bid', async () => {
                const sp = await sappAuctionActions.login(browser, LOGIN.S1);
                try {
                    await sp.openAuction(s.auctionCode);
                    const btns = await actionButtons(sp);
                    console.log(`[${TAG}] S1 view actions before start: ${JSON.stringify(btns)}`);
                    // status chips are buttons too ("Prebid-submitted") — only real actions count
                    expect(btns.filter(t => /pre.?bid|submit bid|place bid|bid now/i.test(t) && !/submitted/i.test(t)),
                        'S1 (quoted in the RFX) is offered a pre-bid').toEqual([]);
                } finally { await sp.close(); }
            }), TAG);

            await st.once('4.14b new supplier can pre-bid', () => test.step('4.14b the new supplier (S5) accepts and pre-bids', async () => {
                const sp = await sappAuctionActions.login(browser, LOGIN.S5);
                try {
                    await sp.openAuction(s.auctionCode);
                    await sp.acceptAuction();
                    await sp.openAuction(s.auctionCode);
                    const btns = await actionButtons(sp);
                    console.log(`[${TAG}] S5 view actions after accept, before start: ${JSON.stringify(btns)}`);
                    const pre = sp.page.getByRole('button', { name: /pre.?bid|submit bid|join live|bid/i })
                        .filter({ hasNotText: /submitted/i }).first();
                    await expect(pre, 'S5 (new) is offered no pre-bid action before the start').toBeVisible({ timeout: 15000 });
                    await pre.click();
                    // Pre-Bid opens a "Pre-bid Submission" page (Enter Price grid + Submit Pre-bid)
                    await expect(sp.page.locator('div.ag-grid-custom-placeholder', { hasText: 'Enter Price' }).first(),
                        'Pre-Bid did not open the pre-bid submission grid').toBeVisible({ timeout: 60000 });
                    console.log(`[${TAG}] pre-bid page: ${sp.page.url()}`);
                    await sp.submitFirstBid([450, 550, 750], { prebid: true }).catch(async (e) => {
                        console.log(`[${TAG}] pre-bid submit: ${String(e).split('\n')[0]} | url ${sp.page.url()}`);
                        throw e;
                    });
                    await sp.openAuction(s.auctionCode);
                    const status = await sp.readStatus(s.auctionCode);
                    console.log(`[${TAG}] S5 status after pre-bid: ${status}`);
                    expect(status, 'S5 is not prebid-submitted after pre-bidding').toMatch(/prebid/i);
                } finally { await sp.close(); }
            }), TAG);

            await st.once('4.9a RFX quoter cannot regret', () => test.step('4.9a an RFX quoter (S2) is offered no Reject / Regret', async () => {
                // QA rule: a supplier that already quoted in the RFX cannot regret the auction.
                // It lands on prebid-submitted; only a Pending new supplier gets Accept / Reject (Flow E).
                const sp = await sappAuctionActions.login(browser, LOGIN.S2);
                try {
                    await sp.openAuction(s.auctionCode);
                    const status = await sp.readStatus(s.auctionCode);
                    console.log(`[${TAG}] S2 status before start: ${status}`);
                    expect(status, 'S2 (RFX quoter) is not prebid-submitted').toMatch(/prebid-submitted/i);
                    await sp.page.waitForTimeout(3000);
                    expect(await sp.page.getByRole('button', { name: /^(Reject|Regret)$/ }).count(),
                        'S2 (quoted in the RFX) is offered Reject / Regret').toBe(0);
                } finally { await sp.close(); }
            }), TAG);

            await st.once('3.8 reassign', () => test.step('3.8 the auction can be reassigned to another user', async () => {
                await x.openAuction(s.auctionUrl);
                await page.getByRole('button', { name: /^More$/ }).first().click();
                await page.getByRole('menuitem', { name: 'Reassign' }).click();
                const dlg = page.getByRole('dialog').last();
                await dlg.waitFor({ state: 'visible', timeout: 15000 });
                console.log(`[${TAG}] reassign dialog: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);
                const combo = dlg.locator('input, [role=combobox]').first();
                await combo.click();
                await page.waitForTimeout(1500);
                const opts = page.getByRole('option');
                const n = await opts.count();
                const names = n ? await opts.allInnerTexts() : [];
                console.log(`[${TAG}] reassign options: ${JSON.stringify(names.slice(0, 10))}`);
                expect(n, 'the reassign dropdown offers no users').toBeGreaterThan(0);
                const pick = names.findIndex(t => !/NSEF Support Admin/i.test(t));
                const chosen = names[pick === -1 ? 0 : pick];
                await opts.nth(pick === -1 ? 0 : pick).click();
                await page.waitForTimeout(800);
                const reason = dlg.locator('textarea').first();
                if (await reason.count()) await reason.fill('Reassigned by automation');
                await dlg.getByRole('button', { name: /^(Reassign|Submit|Save|Confirm|OK|Yes)$/i }).last().click();
                await page.waitForTimeout(5000);
                await x.openAuction(s.auctionUrl);
                const tl = await x.readAuctionTimeline();
                console.log(`[${TAG}] timeline after reassign to "${chosen}": ${JSON.stringify(tl)}`);
                expect(tl.some(l => /reassign/i.test(l)) || tl.some(l => l.includes(chosen.trim())),
                    `no reassignment to "${chosen}" in the auction timeline`).toBeTruthy();
                st.write({ reassignedTo: chosen });
            }), TAG);

            await st.once('3.7 cancel', () => test.step('3.7 the auction can be cancelled before it starts', async () => {
                await x.openAuction(s.auctionUrl);
                await page.getByRole('button', { name: /^More$/ }).first().click();
                await page.getByRole('menuitem', { name: 'Cancel' }).click();
                await page.waitForTimeout(2000);
                const dlg = page.getByRole('dialog').last();
                console.log(`[${TAG}] cancel dialog: ${(await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 400)}`);
                const reason = dlg.locator('textarea, input[type=text]').first();
                if (await reason.count()) await reason.fill('Cancelled by automation');
                await dlg.getByRole('button', { name: /^(Cancel Auction|Submit|Confirm|Yes|OK)$/i }).last().click();
                await page.waitForTimeout(6000);
                await x.openAuction(s.auctionUrl);
                const head = norm(await page.locator('body').innerText()).slice(0, 300);
                console.log(`[${TAG}] after cancel: ${head}`);
                expect(head, 'the auction is not Cancelled').toMatch(/Cancel+ed/i);
            }), TAG);
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Flow E — regret before go-live.
//   4.9  the new supplier (S5, Pending) regrets → listed in CAPP's Regretted view
//        (an RFX quoter cannot regret — asserted in Flow D). Cancelled afterwards
//        so the auction does not go live with nobody watching it.
// ═════════════════════════════════════════════════════════════════════════════
{
    const st = makeState('.auction-e-state.json');
    const TAG = 'AUC-E';
    let snap = null;

    test.describe.serial('Auction Flow E — new supplier regrets before start', () => {
        test.use({ actionTimeout: 20000, navigationTimeout: 60000 });
        test.beforeAll(() => { snap = snapshotFixtures(); });
        test.afterAll(() => { restoreFixtures(snap, { tag: TAG }); });

        test('E0 build: S1 + S2 quoted, foreclosed, converted @auction @Slow', async ({ page }) => {
            test.setTimeout(3_000_000);
            test.skip(!!st.read().auctionUrl, `reusing ${st.read().auctionUrl}`);
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 950 });
            await a.openApp(data);
            await buildConvertedAuction({ page, a, x, data, st, rfxSuppliers: ['S1', 'S2'], quoters: ['S1', 'S2'], tag: TAG });
        });

        test('E1 edit (add S5) + release, start well in the future @auction', async ({ page }) => {
            test.setTimeout(900_000);
            test.skip(!st.read().auctionUrl, 'no auction yet');
            test.skip(!!st.read().released, 'already released');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);
            await editAndRelease({ page, x, st, tag: TAG, auctionClass: auctionActions,
                cfg: { bidImprovement: 'No', feedback: 'Bid Rank with Lead Bid', startInMin: 60, runtimeMin: 10, addSuppliers: ['S5'] } });
        });

        test('E2 4.9 the new supplier regrets and is listed under Regretted @auction', async ({ page, browser }) => {
            test.setTimeout(900_000);
            const s = st.read();
            test.skip(!s.released, 'not released yet');
            const a = new NSEFoundationActions(page);
            const x = new auctionActions(page);
            await page.setViewportSize({ width: 1800, height: 1000 });
            await a.openApp(data);

            await st.once('4.9 S5 regret', () => test.step('4.9 S5 (Pending) regrets before the start', async () => {
                const sp = await sappAuctionActions.login(browser, LOGIN.S5);
                try {
                    await sp.openAuction(s.auctionCode);
                    const before = await sp.readStatus(s.auctionCode);
                    console.log(`[${TAG}] S5 status before regret: ${before}`);
                    await sp.regretAuction();
                    await sp.openAuction(s.auctionCode);
                    const after = await sp.readStatus(s.auctionCode);
                    console.log(`[${TAG}] S5 status after regret: ${after}`);
                    expect(after, 'S5 status did not change to a regretted/rejected state').toMatch(/regret|reject/i);
                } finally { await sp.close(); }
            }), TAG);

            await st.once('4.9 Regretted view', () => test.step('4.9 CAPP lists S5 (only) under Regretted', async () => {
                await x.openAuction(s.auctionUrl);
                const reg = await x.readSupplierResponse('Regretted');
                console.log(`[${TAG}] regretted view: ${JSON.stringify(reg)}`);
                expect(reg.rows.map(r => r.name), 'S5 is not (the only one) listed under Regretted').toEqual([S.S5]);
            }), TAG);

            await st.once('cleanup cancel', () => test.step('clean-up: cancel the auction', async () => {
                await x.openAuction(s.auctionUrl);
                await page.getByRole('button', { name: /^More$/ }).first().click();
                await page.getByRole('menuitem', { name: 'Cancel' }).click();
                const dlg = page.getByRole('dialog').last();
                await dlg.waitFor({ state: 'visible', timeout: 15000 });
                const reason = dlg.locator('textarea, input[type=text]').first();
                if (await reason.count()) await reason.fill('Cancelled by automation (Flow E clean-up)');
                await dlg.getByRole('button', { name: /^(Submit|Confirm|Yes|OK)$/i }).last().click();
                await page.waitForTimeout(5000);
            }), TAG);
        });
    });
}
