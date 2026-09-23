import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import { buildToGrnViaSapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate invoice reference ACROSS PORTALS — sheet scenarios 143 and 144
//
//   143  duplicate reference validation when a Supplier Portal Invoice is edited
//        with an existing reference number
//   144  duplicate reference validation ACROSS supplier-created and buyer-created
//        invoices
//
// BOTH IN ONE FLOW, per QA 2026-09-23:
//
//   1. On the SAPP create form, enter an ALREADY-USED reference  -> validation
//   2. Replace it with a fresh reference                          -> invoice created
//   3. At the CAPP supplier-review step, enter the SAME duplicate -> validation
//
// Step 1 covers the creation side and step 3 the EDIT side (143); the duplicate
// itself is a BUYER-created invoice's reference, which is what makes both halves
// cross-portal (144) rather than a supplier-vs-supplier collision.
//
// THE DUPLICATE IS PINNED, not read off whatever savedInvoice happens to hold.
// A dynamic read makes the collision a moving target — every run collides with a
// different invoice, so a refusal can never be compared between runs; the same
// lesson S126b recorded on 2026-09-21. INV-AUTO-20800 is Invoice-FNSE-26-553, a
// CAPP PO invoice created by the S123 run on 2026-09-22 and carried to Accounted
// (its ack POST is in scratch_s123_run3.log). Override with S143_DUPLICATE if
// that record is ever retired.
//
// Lives in supplier-tests because it needs the COMBINED capp+sapp session
// (auth.supplier.json): the SAPP leg creates, the CAPP leg reviews.
//
// ── PRECONDITION: a PO owned by the portal supplier, Inward Required = Yes,
//    with an Inwarded GRN and NO invoice yet.
//
// This is DISCOVERED, not pinned. The first run adopted PO-NSEFN-26-318 and the
// whole test took 2.0 min against ~35 min to build a chain from CXO — but that
// run also CONSUMED the PO, so a pinned id works exactly once. Instead the SAPP
// listing is scanned for a PO the supplier has not yet accepted (an unaccepted PO
// cannot carry an invoice), and each candidate is confirmed on the CAPP side to
// be invoice-free and Inward Required = Yes before it is adopted. When no
// candidate qualifies it falls back to the full chain build, so the test stays
// runnable either way.
//
// S143_PO_CODE + S143_PO_ID pin a specific PO and skip discovery;
// S143_FRESH_CHAIN=1 forces the chain build.
//
// Re-using data.savedPurchaseOrder is NOT an option and discovery rejects it: a
// PO that already carries an invoice hits the known "2nd invoice sends the full
// PO qty" bug, whose symptom is indistinguishable from a validation refusal
// (S126b, 2026-09-08). The adopted PO must be invoice-free.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
const CAPP_BASE = 'https://nse-capp-uat.aerchain.io';

/** Point savedPurchaseOrder at a ready-made PO so the SAPP and CAPP helpers —
 *  all of which read it off disk — operate on it. Restored by the fixture guard. */
function adoptPurchaseOrder(code, id) {
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    current.savedPurchaseOrder = { code, id, url: `${CAPP_BASE}/purchase-orders/${id}` };
    fs.writeFileSync(DATA_PATH, JSON.stringify(current, null, 4) + '\n', 'utf-8');
    console.log(`[S143] adopted ${code} (id ${id}) as savedPurchaseOrder`);
}

/** Row-0 line-item cells of the CAPP PO page, keyed by AG Grid col-id.
 *  The grid PINS columns, so row-index 0 exists once per container and a single
 *  read returns only the pinned slice — merge all three. Col-ids captured live
 *  2026-09-23: line_items_quantity / _inward_quantity / _invoice_quantity. */
async function readPoLineRow(page) {
    return await page.evaluate(() => {
        const g = document.querySelector("[role='grid']");
        if (!g) return null;
        const cells = {};
        for (const sel of ['.ag-pinned-left-cols-container', '.ag-center-cols-container',
                           '.ag-pinned-right-cols-container']) {
            const row = g.querySelector(`${sel} [row-index='0']`);
            if (!row) continue;
            row.querySelectorAll('[col-id]').forEach(c => {
                cells[c.getAttribute('col-id')] = (c.textContent || '').replace(/\s+/g, ' ').trim();
            });
        }
        return cells;
    });
}

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;

/**
 * Find a PO the portal supplier can still invoice against — a CLEAN SLATE:
 * Inward Required = Yes, Invoice Quantity 0 and Inward Quantity 0, so this test
 * owns the whole PO and builds its own GRN.
 *
 * The qualification is NUMERIC, read off the line-item grid. An earlier version
 * asked whether an "Invoice-<code>" string appeared anywhere on the PO page, and
 * that is simply wrong: probed 2026-09-23, PO-NSEFN-26-328 / -325 / -324 / -323 /
 * -322 / -321 / -319 all render NO invoice code at all while their Invoice
 * Quantity reads 100 of 100. A text guard would have adopted a fully-invoiced PO
 * and walked straight into the "2nd invoice sends the full PO qty" bug, whose
 * symptom is indistinguishable from the validation refusal this test asserts.
 *
 * Returns { code, id } or null, in which case the caller builds a fresh chain.
 */
async function findReusablePo(page, shellUrl, max = 8) {
    await page.goto(`${shellUrl}/purchase-orders`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(12000);
    const codes = await page.evaluate(() => {
        const out = [];
        for (const tr of document.querySelectorAll('tr')) {
            const t = (tr.innerText || '').replace(/\s+/g, ' ').trim();
            const m = t.match(/PO-[A-Z]+-\d+-\d+/);
            // Cancelled/Completed/Short Closed POs can never take another invoice.
            if (m && !/Cancelled|Completed|Short Closed/.test(t)) out.push(m[0]);
        }
        return out;
    });
    console.log(`[S143] discovery — ${codes.length} open PO(s) on the SAPP listing`);

    for (const code of codes.slice(0, max)) {
        const cell = page.locator(`xpath=//*[normalize-space(text())='${code}']`).first();
        if (!(await cell.isVisible({ timeout: 5000 }).catch(() => false))) continue;
        await cell.click().catch(() => {});
        const opened = await page.waitForURL(/\/purchase-orders\/\d+/, { timeout: 20000 })
            .then(() => true).catch(() => false);
        if (opened) {
            await page.waitForTimeout(5000);
            const id = (page.url().match(/purchase-orders\/(\d+)/) || [])[1];
            if (id) {
                // The SAPP page cannot answer this — the invoice/inward columns live
                // on the CAPP view — so probe it in a throwaway tab.
                const probe = await page.context().newPage();
                let hit = null;
                try {
                    await probe.goto(`${CAPP_BASE}/purchase-orders/${id}`,
                        { waitUntil: 'domcontentloaded', timeout: 90000 });
                    await probe.waitForTimeout(10000);
                    const txt = (await probe.locator('body').innerText()).replace(/\s+/g, ' ');
                    const row = await readPoLineRow(probe) || {};
                    const inwardReq = /Inward Required Yes/.test(txt);
                    const invQty = num(row.line_items_invoice_quantity);
                    const inwQty = num(row.line_items_inward_quantity);
                    const clean = txt.includes(code) && inwardReq && invQty === 0 && inwQty === 0;
                    console.log(`[S143] discovery — ${code} (id ${id}): inwardRequired=${inwardReq} `
                        + `invoiceQty=${invQty} inwardQty=${inwQty} → ${clean ? 'CLEAN SLATE' : 'skip'}`);
                    if (clean) hit = { code, id };
                } finally {
                    await probe.close().catch(() => {});
                }
                if (hit) return hit;
            }
        }
        await page.goto(`${shellUrl}/purchase-orders`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(8000);
    }
    console.log('[S143] discovery — no clean-slate PO found');
    return null;
}

let dataSnapshot = null;

test.describe('Invoice — duplicate reference across the supplier and buyer portals', () => {

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S143' }); });

    test('a buyer-created reference is refused on the SAPP create form and again at CAPP review '
        + '@Invoice @Validation @Supplier @S143 @S144',
        async ({ page }) => {
            // The fast path is ~20 min; a full chain build is ~50.
            test.setTimeout(3600000);

            const a = new NSEFoundationActions(page);
            const s = new SupplierPortalActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            const duplicate = process.env.S143_DUPLICATE || 'INV-AUTO-20800';
            console.log(`[S143] duplicate (buyer-created) reference = "${duplicate}"`);

            // ── (1) PRECONDITION ────────────────────────────────────────────────
            const pinned = process.env.S143_PO_CODE && process.env.S143_PO_ID
                ? { code: process.env.S143_PO_CODE, id: process.env.S143_PO_ID }
                : null;
            const reusable = process.env.S143_FRESH_CHAIN ? null
                : pinned || await findReusablePo(page, s.getSupplierConfig().shellUrl);

            if (!reusable) {
                console.log('[S143] no reusable PO — building the full chain from CXO (~35 min)');
                await a.openApp(data);
                await buildToGrnViaSapp(a, s, data);
            } else {
                adoptPurchaseOrder(reusable.code, reusable.id);

                // Guard the adoption even when it came from discovery: a pinned pair
                // can be stale, and sending every step below at the wrong PO would
                // surface much later as an unrelated-looking refusal.
                await a.openSavedPurchaseOrder(data);
                const poText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
                expect(poText,
                    `CAPP /purchase-orders/${reusable.id} does not show ${reusable.code} — the id is `
                    + 'stale; clear S143_PO_CODE/S143_PO_ID or run with S143_FRESH_CHAIN=1')
                    .toContain(reusable.code);
                // NUMERIC, not textual — the PO page renders no invoice code even when
                // the line is fully invoiced (see findReusablePo).
                const row = await readPoLineRow(page) || {};
                expect(num(row.line_items_invoice_quantity),
                    `${reusable.code} already has invoiced quantity — the "2nd invoice sends the full PO `
                    + 'qty" bug would masquerade as a validation refusal')
                    .toBe(0);

                // SAPP accepts the PO (a no-op if it is already accepted).
                await s.openPoListing();
                await s.openSavedPoFromListing();
                await s.acceptPo();

                // GRN is buyer-side — the SAPP Create menu offers no GRN.
                await a.openSavedPurchaseOrder(data);
                await a.clickPoCreateGrn();
                await a.submitSelectPoItemsPopup();
                await a.fillGrnGeneralDetails(data);
                await a.fillGrnDocumentDetails(data);
                await a.assertGrnReceivedMatchesPoQty();
                await a.submitGrn();
                await a.saveGrnCode();
                await a.approveGrnUntilInwarded('Approved by automation');
                await a.assertGrnInwarded();
            }

            // ── (2) SAPP: duplicate refused, then created with a fresh reference ─
            await s.openPoListing();
            await s.openSavedPoFromListing();
            const invoiceCode = await s.createInvoiceFromPo(data, { duplicateFirst: duplicate });

            const first = s.lastDuplicateAttempt;
            expect(first, 'the duplicate rehearsal did not run').toBeTruthy();

            // S144 — the app must refuse a reference held by a BUYER-created invoice
            // when a SUPPLIER creates one. If it passes, the cross-portal check does
            // not exist, which is precisely what this scenario is here to find out.
            expect(first.refused,
                'the SAPP create form ACCEPTED a reference already held by the buyer-created invoice '
                + `${duplicate} — duplicate validation does not span the two portals. `
                + `Validations popup said: ${JSON.stringify(first.dialogText ?? '')}`)
                .toBeTruthy();
            // A silent block is a finding, not a pass: the scenario asks whether a
            // validation is DISPLAYED.
            expect(first.silent,
                'the duplicate was refused SILENTLY on the SAPP create form — no validation was shown. '
                + `Error-shaped text: ${JSON.stringify(first.errish ?? [])}`)
                .toBeFalsy();
            // Naming the collided invoice is what makes the message actionable, and it
            // proves the app matched the RIGHT invoice rather than rejecting on any
            // duplicate-ish condition.
            expect(first.messages.join(' '),
                `the SAPP validation names no existing invoice: ${JSON.stringify(first.messages)}`)
                .toMatch(/Invoice-[A-Z]+-\d+-\d+/);
            console.log(`[S144] SAPP creation refused the buyer-created reference`
                + (first.collided ? ` — collided with ${first.collided}` : ''));

            expect(invoiceCode,
                'the fresh reference did not produce an invoice, so there is nothing to review')
                .toBeTruthy();
            const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            console.log(`[S143] SAPP invoice created → ${built.savedInvoice?.code} `
                + `(id ${built.savedInvoice?.id}) — expected Pending Review in CAPP`);

            // ── (3) CAPP review edit: the SAME duplicate, now on an EDIT ─────────
            await a.openSavedInvoice(data);
            const onEdit = await s.openPendingReviewEditPage('S143');
            expect(onEdit,
                'the review edit page never opened — the SAPP invoice did not reach Pending Review, '
                + 'so the edit half of 143 has no surface to test').toBeTruthy();

            await a.fillInvoiceNumberExactly(duplicate);
            const second = await a.submitInvoiceExpectingDuplicateRejection({
                formUrlRe: /\/invoices\/\d+\/edit/,
            });

            expect(second.refused,
                'the duplicate reference was ACCEPTED when editing the Supplier Portal invoice at review '
                + '— the validation is missing on the edit path').toBeTruthy();
            expect(second.silent,
                'the duplicate was refused SILENTLY at CAPP review — no validation message was shown. '
                + `Error-shaped text: ${JSON.stringify(second.errish ?? [])}`)
                .toBeFalsy();
            expect(second.messages.join(' '),
                `the review validation names no existing invoice: ${JSON.stringify(second.messages)}`)
                .toMatch(/Invoice-[A-Z]+-\d+-\d+/);

            console.log(`[S143] review-edit refused the duplicate: ${JSON.stringify(second.messages)}`);
        });
});
