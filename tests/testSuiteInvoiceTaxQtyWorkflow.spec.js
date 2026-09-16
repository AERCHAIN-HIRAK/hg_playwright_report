import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import { buildToGrnViaSapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// SHEET SCENARIO 58
//
//   "Verify that when a PO Invoice is created from SAPP, adding Tax during the
//    SAPP Review stage triggers the CAPP workflow. After modifying the Tax,
//    Quantity, or Price during the CAPP Review stage and submitting the Invoice,
//    verify that a new workflow is triggered and the previous workflow is
//    rejected."
//
// STEPS AS QA DICTATED THEM (2026-09-16), which settle two things the sheet
// leaves open — the review stages are BOTH worked from CAPP, and the field to
// change at the second gate is Quantity:
//
//   1. CXO → … → PO, then a GRN against it
//   2. SAPP: create the PO Invoice with line qty 70 (NOT the PO's full 100)
//   3. CAPP supplier review stage: add the 18% tax from the line-item dropdown
//   4. Submit → the CAPP workflow is triggered
//   5. CAPP review stage (QA configured supplier review → CAPP review → the
//      remaining CAPP stages): change qty 70 → 100, submit
//   6. Workflow Stages must show the PREVIOUS run Rejected and the NEW one Active
//
// WHY 70 AND 100. The fixture line item is qty 100, so the PO ceiling is 100:
// invoicing 70 leaves headroom to raise it to exactly the ceiling at step 5. A
// value above 100 would be refused for exceeding the PO and would never reach
// the workflow, which is the thing under test.
//
// THE 70 IS FRAGILE BY DESIGN OF THE APP, NOT THE TEST. Item Matching pushes the
// GRN's own qty back into the row (that is why ensureInvoiceQty exists), so the
// 70 is re-read after the supplier review page opens and before the tax goes on.
// If it had silently become 100 the step-5 change would be a no-op and the
// workflow assertion would pass for the wrong reason.
//
// FIXTURES. The chain rewrites savedCxo / savedIntake / savedRequisition /
// savedPurchaseOrder / savedGrn / savedInvoice in NSEFoundationData.json, and
// other suites read those. Snapshotted and restored, the same guard the
// reject-edit and review-validation suites use around throwaway records.
//
// COST. The chain to GRN is ~17 min of real UAT work and the whole flow runs
// well past that, hence the 1-hour cap. Set S58_INVOICE_ID to a CAPP invoice
// already sitting in Pending Review to skip the build and exercise steps 3-6
// only; that path depends on ambient data and is for iteration, not CI.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const CAPP = 'https://nse-capp-uat.aerchain.io';
const INVOICE_QTY = '70';
// QA's scenario says 70 -> 100. Overridable so the mechanics can be proven with a
// DECREASE while the increase is blocked by the PO ceiling (see the run notes).
const REVISED_QTY = process.env.S58_REVISED_QTY || '100';
const TAX_NEEDLE  = '18%';   // exact option text, probed live

let dataSnapshot = null;

test.describe('Invoice — tax at supplier review, qty change at CAPP review', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S58' }); });

    test('adding an 18% tax at supplier review triggers the CAPP workflow, and raising '
        + 'qty 70→100 at CAPP review rejects it and starts a new one '
        + '@Invoice @Workflow @Tax @Review @S58',
        async ({ page }) => {
            test.setTimeout(3600000);

            // `a` drives the chain build. It REBINDS its own this.page to new tabs
            // as the chain opens them (NSEFoundationActions:5332), so it must not be
            // used for the review-stage work afterwards. `inv` stays bound to the
            // fixture page — the tab `s` actually navigates — and does that work.
            const a   = new NSEFoundationActions(page);
            const inv = new NSEFoundationActions(page);
            const s   = new SupplierPortalActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // ── (1)+(2) precondition: a PO with a GRN, and a SAPP invoice at qty 70 ──
            // DIAGNOSTIC (S58_GRN_ID): inspect a stuck GRN — its header actions and its
            // workflow stages — to see which stage is blocking and who owns it.
            if (process.env.S58_GRN_ID) {
                const g = process.env.S58_GRN_ID;
                await page.goto(`${CAPP}/inwards/${g}`,
                    { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForTimeout(10000);
                console.log(`[S58-GRN] on ${page.url()}`);
                const acts = await page.evaluate(() => {
                    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                    const status = ['Draft','Pending Approval','Inwarded','Rejected','Cancelled','Pending Review']
                        .filter(st => [...document.querySelectorAll('*')]
                            .some(e => !e.children.length && vis(e) && txt(e) === st));
                    return {
                        status,
                        buttons: [...new Set([...document.querySelectorAll('button')]
                            .filter(vis).map(txt).filter(Boolean))].slice(0, 30),
                    };
                });
                console.log(`[S58-GRN] header → ${JSON.stringify(acts)}`);
                await inv.identifyHeaderIcons('S58-GRN');
                try {
                    await inv.openInvoiceWorkflowStages('S58-GRN');
                    const st = await inv.readInvoiceWorkflowState('S58-GRN');
                    console.log(`[S58-GRN] stages → ${JSON.stringify(st.runs, null, 1)}`);
                    const who = await page.evaluate(() => {
                        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                        const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                        return [...new Set([...document.querySelectorAll('*')]
                            .filter(e => !e.children.length && vis(e))
                            .map(txt)
                            .filter(x => /(Support|Admin|User|@|Pending|In progress|Completed)/i.test(x))
                            .filter(x => x.length < 60))].slice(0, 40);
                    });
                    console.log(`[S58-GRN] panel people/status text → ${JSON.stringify(who)}`);
                } catch (e) {
                    console.log(`[S58-GRN] no workflow stages surface: ${e.message}`);
                }
                // Who rejected it, and at which stage? Open Audit Logs / Activity
                // Timeline by tooltip and dump the entries.
                for (const want of ['Audit Logs', 'Activity Timeline']) {
                    await page.goto(`${CAPP}/inwards/${g}`,
                        { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
                    await page.waitForTimeout(8000);
                    const icons = page.locator('button').filter({ hasText: /^$/ });
                    const n = Math.min(await icons.count().catch(() => 0), 30);
                    let opened = false;
                    for (let i = 0; i < n && !opened; i++) {
                        const b = icons.nth(i);
                        const box = await b.boundingBox().catch(() => null);
                        if (!box || box.y > 200) continue;
                        await b.hover().catch(() => {});
                        await page.waitForTimeout(700);
                        const tip = await page.evaluate(() => {
                            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                            const t = [...document.querySelectorAll('[role="tooltip"], .MuiTooltip-tooltip, [class*="tooltip"]')]
                                .filter(vis).map(e => (e.textContent || '').trim()).filter(Boolean);
                            return t[0] || '';
                        });
                        if (tip === want) { await b.click().catch(() => {}); opened = true; }
                    }
                    if (!opened) { console.log(`[S58-GRN] could not open ${want}`); continue; }
                    await page.waitForTimeout(5000);
                    const entries = await page.evaluate(() => {
                        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                        const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                        return [...new Set([...document.querySelectorAll('*')]
                            .filter(e => !e.children.length && vis(e))
                            .map(txt)
                            .filter(x => x && x.length < 130
                                && /(reject|approv|stage|workflow|submit|inward|status|by |Admin|User)/i.test(x)))]
                            .slice(0, 45);
                    });
                    console.log(`[S58-GRN] ${want} → ${JSON.stringify(entries, null, 1)}`);
                }
                return;
            }

            const reuseId = process.env.S58_INVOICE_ID;
            if (reuseId) {
                console.log(`[S58] FAST PATH — reusing invoice id ${reuseId}, skipping the chain`);
                await page.goto(`${CAPP}/invoices/${reuseId}`,
                    { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForTimeout(12000);
                if (process.env.S58_PROBE === '3') {
                    await inv.probeWorkflowSurface('S58-WF');
                    return;
                }
                if (process.env.S58_PROBE === '7') {
                    const before = await inv._visibleLeafText();
                    await inv.openInvoiceWorkflowStages('S58-WF');
                    await page.waitForTimeout(2000);
                    const after = await inv._visibleLeafText();
                    const bag = {};
                    before.forEach(x => { bag[x] = (bag[x] || 0) + 1; });
                    const added = after.filter(x => {
                        if (bag[x]) { bag[x] -= 1; return false; }
                        return true;
                    });
                    console.log('[S58-WF] NEW text after clicking See Workflow Stages ('
                        + added.length + ' lines) → ' + JSON.stringify(added.slice(0, 80), null, 1));
                    const shape = await page.evaluate(() => {
                        const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                        const head = [...document.querySelectorAll('*')]
                            .find(e => !e.children.length && txt(e) === 'Workflow Steps');
                        if (!head) return '(no Workflow Steps heading)';
                        let box = head;
                        for (let i = 0; i < 8 && box.parentElement; i++) {
                            box = box.parentElement;
                            if (txt(box).includes('Completed') && txt(box).includes('Pending')) break;
                        }
                        return {
                            cls: (box.className || '').toString().slice(0, 90),
                            html: box.innerHTML.replace(/\s+/g, ' ').slice(0, 2600),
                        };
                    });
                    console.log('[S58-WF] panel shape → ' + JSON.stringify(shape, null, 1));
                    return;
                }
                if (process.env.S58_PROBE === '6') {
                    await inv.probeHeaderControls('S58-HDR');
                    await inv.identifyHeaderIcons('S58-TIP');
                    return;
                }
                if (process.env.S58_PROBE === '5') {
                    await inv.huntInvoiceWorkflowSurface('S58-HUNT');
                    return;
                }
                if (process.env.S58_PROBE === '4') {
                    // Does the v4 shell expose this invoice (and a Workflow Stages
                    // surface) where v3 does not?
                    const v4 = `https://nse-capp-v4-uat.aerchain.io/invoices/${reuseId}`;
                    await page.goto(v4, { waitUntil: 'domcontentloaded', timeout: 90000 })
                        .catch(e => console.log('[S58-V4] goto failed: ' + e.message));
                    await page.waitForTimeout(10000);
                    console.log('[S58-V4] landed on ' + page.url());
                    await inv.probeWorkflowSurface('S58-V4');
                    return;
                }
            } else {
                await buildToGrnViaSapp(a, s, data);

                // No openApp() hop here: openPoListing does an absolute goto on the
                // fixture page, and an openApp() through `a` would only navigate the
                // stale tab `a` rebound itself to during the chain.
                await s.openPoListing();
                await s.openSavedPoFromListing();

                // qty 70 goes in while the create form is still open.
                await s.createInvoiceFromPo(data, {
                    beforeSubmit: async (sappPage) => {
                        console.log(`[S58] setting qty on ${sappPage.url()}`);
                        await new NSEFoundationActions(sappPage).setInvoiceQty(INVOICE_QTY);
                        console.log(`[S58] create form line qty set to ${INVOICE_QTY}`);
                    },
                });

                const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
                console.log(`[S58] chain built → PO ${built.savedPurchaseOrder?.code}, `
                    + `GRN ${built.savedGrn?.code}, invoice ${built.savedInvoice?.code}`);
                // Onto the CAPP invoice, on the fixture page, where the review lives.
                await inv.openSavedInvoice(data);
            }

            // RESUME (S58_FROM=13): the invoice already carries the tax and already
            // sits at the CAPP review stage, so skip the supplier-review half and
            // exercise steps 13-15 only. Iteration aid; the default path runs it all.
            const resumeAt13 = process.env.S58_FROM === '13' || process.env.S58_FROM === '15';
            // S58_FROM=15 additionally skips the step-13 assertion, for iterating on
            // step 15 against an invoice whose workflow has already been re-triggered
            // once (its Active run then legitimately starts at stage 2, not stage 1).
            const skipStep13 = process.env.S58_FROM === '15';

            // ── (3) CAPP supplier review stage → the editable review page ──
            // A reused invoice has already had its approver reassigned and its GRN
            // matched by the run that created it; redoing either would fail or, worse,
            // overwrite the partial qty.
            const onReview = resumeAt13 ? true : await s.openPendingReviewEditPage('S58',
                reuseId ? { reassign: false, matchGrn: false } : {});
            expect(onReview,
                'the supplier review edit page never opened — the SAPP invoice did not reach '
                + 'Pending Review in CAPP, so scenario 58 has no surface to test').toBeTruthy();

if (!resumeAt13) {
                // The 70 must still be there. Item Matching (run by the step above) can
                // overwrite it with the GRN qty, which would make step 5 a no-op.
                const qtyAtReview = await inv.readInvoiceLineQty();
                console.log(`[S58] line qty on the review page reads "${qtyAtReview}"`);
                if (qtyAtReview !== INVOICE_QTY) {
                    console.log(`[S58] qty came back as "${qtyAtReview}" — re-applying ${INVOICE_QTY}`);
                    await inv.ensureInvoiceQty(INVOICE_QTY);
                }
                expect(await inv.readInvoiceLineQty(),
                    `the invoice must sit at qty ${INVOICE_QTY} before the tax is added, otherwise the `
                    + `qty change at the CAPP review stage changes nothing and the workflow assertion `
                    + `would pass without cause`).toBe(INVOICE_QTY);

                // TEMPORARY diagnostic (S58_PROBE=1): dump the grid structure and stop,
                // so the tax column can be located without spending a full flow.
                if (process.env.S58_PROBE) {
                    console.log('[S58-PROBE] grids → '
                        + JSON.stringify(await inv.readInvoiceGrids(), null, 1));
                    if (process.env.S58_PROBE === '2') await inv.probeTaxEditor('S58-PROBE');
                    return;
                }

                // Add the 18% tax — this is the change that sends it into the workflow.
                const taxed = await inv.setInvoiceLineTax(TAX_NEEDLE, 'S58');
                console.log(`[S58] tax applied: ${JSON.stringify(taxed)}`);

                // ── (4) submit → the CAPP workflow is triggered ──
                const submittedReview = await s.submitReviewEdit('S58');
                expect(submittedReview,
                    'the supplier review did not submit, so no CAPP workflow was triggered').toBeTruthy();
                await page.waitForTimeout(4000);
            }


            // Step 13 — the tax submit must have started the CAPP workflow: stage 1
            // (supplier review) Completed, stage 2 (CAPP review) In progress, the
            // rest still Pending. Read from the invoice header's "See Workflow
            // Stages" panel; the v4 More → Workflow Stages surface does not exist
            // on this old-CAPP page.
            const afterTax = skipStep13
                ? await inv.getInvoiceWorkflowState('S58')
                : await inv.assertTaxTriggeredCappWorkflow('S58');
            const runsBefore = afterTax.runs.length;

            const moneyBefore = await inv.readInvoiceMoneySnapshot('S58-before');

            // The panel overlays the header with no reachable dismiss, so Review stays
            // unclickable until the page is reloaded.
            const cleared = await inv.dismissInvoiceWorkflowStages('S58');
            expect(cleared,
                'the Workflow Steps panel would not clear, so the CAPP review stage cannot be '
                + 'opened for the qty change').toBeTruthy();

            // ── (5) CAPP review stage → raise qty 70 → 100 → submit ──
            // No reassign and no GRN match on this gate: the approver is already the
            // admin, and matching would overwrite the qty this step exists to change.
            const onCappReview = await s.openPendingReviewEditPage('S58-capp',
                { reassign: false, matchGrn: false });
            expect(onCappReview,
                'the CAPP review stage did not expose an editable Review page, so the qty change '
                + 'this scenario turns on cannot be made').toBeTruthy();

            await inv.setInvoiceQty(REVISED_QTY);
            if (process.env.S58_PROBE === '8') {
                // Where can the GRN be re-matched? The app refuses the submit with
                // "GRN consumption mismatch ... Please re-match GRN before submitting",
                // so find that control before designing the step.
                const controls = await page.evaluate(() => {
                    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                    const btns = [...document.querySelectorAll('button, [role="button"], a')]
                        .filter(vis).map(txt).filter(Boolean);
                    const matchish = [...document.querySelectorAll('*')]
                        .filter(e => !e.children.length && vis(e) && /match|grn|inward/i.test(txt(e)))
                        .map(txt).filter(t => t.length < 60);
                    return { url: location.href, btns: [...new Set(btns)].slice(0, 45),
                             matchish: [...new Set(matchish)].slice(0, 25) };
                });
                console.log('[S58-P8] edit-page controls → ' + JSON.stringify(controls, null, 1));

                const where = await page.evaluate(() => {
                    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                    return ['PO Match', 'GRN Match', 'FIX'].map(label => {
                        const el = [...document.querySelectorAll('*')]
                            .find(e => !e.children.length && vis(e) && txt(e) === label);
                        if (!el) return { label, found: false };
                        const r = el.getBoundingClientRect();
                        return { label, found: true, tag: el.tagName,
                                 cls: (el.className || '').toString().slice(0, 70),
                                 parentTag: el.parentElement?.tagName,
                                 parentCls: (el.parentElement?.className || '').toString().slice(0, 70),
                                 xy: `${Math.round(r.x)},${Math.round(r.y)}` };
                    });
                });
                console.log('[S58-P8] match controls → ' + JSON.stringify(where, null, 1));

                const before = await inv._visibleLeafText();
                const grnMatch = page.getByText('GRN Match', { exact: true }).first();
                const clicked = await grnMatch.isVisible({ timeout: 5000 }).catch(() => false);
                console.log('[S58-P8] GRN Match visible: ' + clicked);
                if (clicked) {
                    await grnMatch.click();
                    await page.waitForTimeout(3500);
                    const after = await inv._visibleLeafText();
                    const bag = {};
                    before.forEach(x => { bag[x] = (bag[x] || 0) + 1; });
                    const added = after.filter(x => {
                        if (bag[x]) { bag[x] -= 1; return false; }
                        return true;
                    });
                    console.log('[S58-P8] NEW after GRN Match (' + added.length + ') → '
                        + JSON.stringify(added.slice(0, 60), null, 1));
                    const dlgBtns = await page.evaluate(() => {
                        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                        const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                        const dlg = [...document.querySelectorAll('[role="dialog"], .MuiDialog-root, .ant-modal')]
                            .filter(vis).pop();
                        if (!dlg) return '(no dialog)';
                        return [...dlg.querySelectorAll('button, input[type="checkbox"]')]
                            .filter(vis).map(b => b.tagName === 'INPUT' ? 'checkbox' : txt(b))
                            .filter(Boolean);
                    });
                    console.log('[S58-P8] dialog controls → ' + JSON.stringify(dlgBtns));
                }
                const hdr = await page.evaluate(() => {
                    const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
                    const el = [...document.querySelectorAll('*')]
                        .find(e => /^Line Items.*Match/.test(txt(e)) && txt(e).length < 120);
                    if (!el) return '(header not found)';
                    return {
                        text: txt(el),
                        html: el.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>')
                                          .replace(/\s+/g, ' ').slice(0, 1800),
                    };
                });
                console.log('[S58-P8] line-items header → ' + JSON.stringify(hdr, null, 1));
                return;
            }
            expect(await inv.readInvoiceLineQty(),
                `qty should now read ${REVISED_QTY} before the resubmit`).toBe(REVISED_QTY);
            console.log(`[S58] qty raised ${INVOICE_QTY} → ${REVISED_QTY} at the CAPP review stage`);

            // The qty change breaks the GRN consumption match, and the app refuses the
            // submit until the GRN is re-matched. FIX does that, in place.
            await inv.fixGrnMatchAfterQtyChange('S58');

            const resubmitted = await s.submitReviewEdit('S58-capp');
            expect(resubmitted,
                'the CAPP review resubmit did not go through, so the workflow could not be '
                + 're-triggered').toBeTruthy();
            await page.waitForTimeout(6000);

            // Back to the invoice DETAIL page: the resubmit leaves the browser on
            // /invoices/<id>/edit, where the header has no "See Workflow Stages"
            // icon at all (the only tooltips there are the editor's own Undo).
            const invId = (page.url().match(/\/invoices\/(\d+)/) || [])[1] || reuseId;
            expect(invId, 'could not work out the invoice id to reopen').toBeTruthy();
            await page.goto(`${CAPP}/invoices/${invId}`,
                { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForTimeout(10000);
            console.log(`[S58] reopened invoice ${invId} to read the workflow panel`);
            const moneyAfter = await inv.readInvoiceMoneySnapshot('S58-after');
            console.log(`[S58] amount before=${moneyBefore.invoiceAmount} after=${moneyAfter.invoiceAmount}`);
            expect(moneyAfter.invoiceAmount,
                `the qty change from ${INVOICE_QTY} to ${REVISED_QTY} did not persist — the invoice `
                + `amount is unchanged at ${moneyAfter.invoiceAmount}. The review submit was refused `
                + `silently, so no workflow could be re-triggered.`)
                .not.toBe(moneyBefore.invoiceAmount);

            // ── (6) previous run Rejected, new run Active ──
            const runs = await inv.assertWorkflowRejectedAndNewActive({
                tag: 'S58',
                expectRuns: skipStep13 ? null : runsBefore + 1,
            });
            // Report by status. Indexing positionally here printed "Workflow 3 Active"
            // while the panel actually had Workflow 1 Active — the labels are
            // renumbered on every re-trigger.
            const activeRun   = runs.find(r => r.status === 'Active');
            const rejectedRun = runs.filter(r => r.status === 'Rejected').map(r => r.name);
            console.log(`[S58] PASS — ${runs.length} workflow runs; `
                + `${activeRun?.name} Active, ${rejectedRun.join(' + ')} Rejected`);
        });
});
