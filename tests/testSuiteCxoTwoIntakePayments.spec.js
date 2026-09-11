import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildToPaymentViaCapp, buildFromCompletedPrToPayment, buildAckToPayment } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Two Intake-to-Payment flows on ONE CXO — sheet scenario 1
//
//   "Verify that user can perform 2 Intake to Payments full flow for 1 CXO"
//
// QA's steps (2026-09-09): one CXO for qty 100, two intakes of 50 qty each, both
// carried through the full flow to Payment — and the two flows may run in
// PARALLEL.
//
// WHY EACH CHAIN NEEDS ITS OWN FIXTURE FILE
// -----------------------------------------
// Every save*Code helper rewrites pages/NSEFoundationData.json — savedIntake,
// savedSourcingEvent, savedRequisition, savedPurchaseOrder, savedGrn,
// savedInvoice — and openSaved* reads the same file back. Two chains running at
// once would interleave those writes and each would end up opening the OTHER
// chain's PO or invoice; the invoice-number counter would collide as well, and
// the app rejects a duplicate invoice reference.
//
// So each chain is handed its own copy of the fixture file via
// `new NSEFoundationActions(page, { dataPath })`. Both copies are seeded with
// the SAME savedCxo — that is what makes both intakes hang off one CXO — and
// with invoice-number seeds 500 apart so the two chains can never mint the same
// reference. The shared file is left untouched by the chains.
//
// The CXO is created FIRST, on the main page, because both chains depend on it.
// Only the two intake-to-payment flows overlap.
//
// WHY THE CHAINS RUN SEQUENTIALLY (RUN_PARALLEL = false)
// ------------------------------------------------------
// QA green-lit running the two flows in parallel, and the fixture isolation
// above makes that safe on OUR side. The APPLICATION is what does not tolerate
// it. Three runs on 2026-09-09, each failing at a different step, each only
// under concurrency:
//
//   1. QUOTE — two surrogate quotes as the SAME supplier at the same moment:
//      one is silently lost. RFX-26-268's quote form closed "successfully" yet
//      the RFX stayed Released at "0 out of 1 Supplier", while RFX-26-267
//      quoted fine. Surfaced ~40s later as assertSourcingStatusQuoted timing
//      out, far from the real event.
//   2. INVOICE — both invoices ended approvals on Sync Failed rather than
//      Pending Sync. Handled properly (either state is ackable, see
//      buildToPaymentViaCapp) rather than by serialising.
//   3. RFX APPROVAL — chain B's approveSourcingUntilReleased exhausted its
//      retries and returned WITHOUT throwing, so the chain went on to quote an
//      unreleased RFX and died at "Submit Quote not visible".
//
// Each fix exposed the next problem, so parallelism was costing runs rather
// than saving time. Sequential satisfies the scenario as written — "2 Intake to
// Payments full flow for 1 CXO" says nothing about concurrency — and uses only
// the chain path scenarios 2 and 6 already prove reliable.
//
// Flip RUN_PARALLEL to true to restore the concurrent form: the per-chain
// fixture copies and the quote mutex are still wired up and are what made the
// concurrent run get as far as it did.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_FIXTURE = path.resolve('pages/NSEFoundationData.json');

// ── Re-run just one leg, against a CXO that already exists ───────────────────
// Chain A takes ~20 minutes. Re-running it to get at chain B costs that every
// attempt, which is why this scenario has been so slow to land. These env vars
// let a single chain be re-run on its own against an existing Released CXO:
//
//   S1_CXO_CODE=CXO-FNSE-26-418 S1_CXO_ID=5824 S1_ONLY=B \
//     npx playwright test tests/testSuiteCxoTwoIntakePayments.spec.js --project=nsef-tests
//
// S1_ONLY=B also skips the cross-chain distinctness assertions (there is only
// one chain) and skips creating a CXO, so it does NOT write savedCxo to the
// shared fixture — the run stays isolated from anything else in flight.
const ONLY_CHAIN = (process.env.S1_ONLY || '').toUpperCase();      // '', 'A' or 'B'

// Resume a chain from a PR that is ALREADY Completed, skipping intake → RFX →
// award → PR (~12 min). Everything from PO approval onward still runs:
//
//   S1_RESUME_PR_ID=1164 S1_RESUME_PR_CODE=PR-NSEFN-26-167 \
//     npx playwright test tests/testSuiteCxoTwoIntakePayments.spec.js --project=nsef-tests
//
// Use it when the tail (PO approve → GRN → invoice → ack → payment) is what
// failed; re-running the whole chain to reach it wastes the work already done
// and burns another CXO's remaining budget.
// Resume from an invoice that has already settled (Pending Sync / Sync Failed):
// run only acknowledge → Accounted → payment. The ack is one POST at the end of
// a ~20 min chain, so a transport blip should not cost the chain.
//
//   S1_RESUME_INVOICE_ID=1168 S1_RESUME_INVOICE_CODE=Invoice-FNSE-26-408 \
//   S1_RESUME_INVOICE_NUMBER=INV-AUTO-15226 \
//     npx playwright test tests/testSuiteCxoTwoIntakePayments.spec.js --project=nsef-tests
const RESUME_INVOICE = process.env.S1_RESUME_INVOICE_ID
    ? {
        code: process.env.S1_RESUME_INVOICE_CODE,
        id: process.env.S1_RESUME_INVOICE_ID,
        url: process.env.S1_RESUME_INVOICE_URL
            || `https://nse-capp-uat.aerchain.io/invoices/${process.env.S1_RESUME_INVOICE_ID}`,
        number: process.env.S1_RESUME_INVOICE_NUMBER,
    }
    : null;

const RESUME_PR = process.env.S1_RESUME_PR_ID
    ? {
        code: process.env.S1_RESUME_PR_CODE || 'PR-DRAFT',
        id: process.env.S1_RESUME_PR_ID,
        url: process.env.S1_RESUME_PR_URL
            || `https://nse-capp-uat.aerchain.io/requisitions/${process.env.S1_RESUME_PR_ID}`,
    }
    : null;
const REUSE_CXO = process.env.S1_CXO_CODE
    ? {
        code: process.env.S1_CXO_CODE,
        id: process.env.S1_CXO_ID || null,
        url: process.env.S1_CXO_URL
            || `https://nse-capp-v4-uat.aerchain.io/cxos/${process.env.S1_CXO_ID}/overview`,
    }
    : null;
const INTAKE_QTY = 50;              // half the CXO's 100, once per chain
const INVOICE_SEED_GAP = 500;       // keeps the two chains' invoice numbers apart
const RUN_PARALLEL = false;         // see the header note — the app, not the test, forces this

/** Renumber an invoice reference, keeping its prefix and padding. */
function withInvoiceNumber(ref, n) {
    const m = String(ref).match(/^(.*?)(\d+)$/);
    return m ? m[1] + String(n).padStart(m[2].length, '0') : `${ref}-${n}`;
}

/**
 * RESERVE this run's whole invoice-number range in the SHARED fixture before any
 * chain starts, and return the two per-chain seeds.
 *
 * The app rejects a duplicate invoice reference by DISABLING Proceed — a silent
 * submit block, not an error message. Carrying the counter forward only after
 * both chains succeed is therefore not enough: a run that dies mid-flight has
 * still burned its numbers on the server, and the next run reuses them and
 * blocks. That is exactly what happened on 2026-09-09 — two failed runs consumed
 * INV-AUTO-125 and -625, the shared file stayed at 124, and the next run's
 * chain A blocked on 125.
 *
 * Reserving up front makes the range monotonic whatever the outcome:
 * restoreFixtures carries invoice.invoiceNumber forward (never back), so the
 * reservation survives the afterAll restore even on failure.
 */
function reserveInvoiceRange() {
    const cfg = JSON.parse(fs.readFileSync(SHARED_FIXTURE, 'utf-8'));
    const base = trailingNum(cfg.invoice.invoiceNumber);
    const seeds = { A: base, B: base + INVOICE_SEED_GAP };
    cfg.invoice.invoiceNumber = withInvoiceNumber(cfg.invoice.invoiceNumber, base + 2 * INVOICE_SEED_GAP);
    fs.writeFileSync(SHARED_FIXTURE, JSON.stringify(cfg, null, 4), 'utf-8');
    console.log(`[S1] reserved invoice numbers ${base + 1}..${base + 2 * INVOICE_SEED_GAP} `
        + `(shared counter → ${cfg.invoice.invoiceNumber})`);
    return seeds;
}

/** Write a chain-private copy of the fixture file and return its path. */
function makeChainFixture(tag, savedCxo, invoiceSeed) {
    const cfg = JSON.parse(fs.readFileSync(SHARED_FIXTURE, 'utf-8'));
    if (savedCxo) cfg.savedCxo = savedCxo;
    if (RESUME_PR) cfg.savedRequisition = RESUME_PR;
    if (RESUME_INVOICE) {
        cfg.savedInvoice = { code: RESUME_INVOICE.code, id: RESUME_INVOICE.id, url: RESUME_INVOICE.url };
        // The ack sends this as response_body_reference, so it must be the number
        // the invoice actually carries — NOT a fresh seed.
        if (RESUME_INVOICE.number) cfg.invoice.invoiceNumber = RESUME_INVOICE.number;
    }
    cfg.invoice.invoiceNumber = withInvoiceNumber(cfg.invoice.invoiceNumber, invoiceSeed);
    // …but a RESUME must keep the invoice's REAL reference: the ack sends it as
    // response_body_reference. Applying the seed after the resume block sent
    // INV-AUTO-16225 for an invoice numbered INV-AUTO-15226 on 2026-09-10.
    if (RESUME_INVOICE?.number) cfg.invoice.invoiceNumber = RESUME_INVOICE.number;
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', `nsef-s1-${tag}-`));
    const file = path.join(dir, 'NSEFoundationData.json');
    fs.writeFileSync(file, JSON.stringify(cfg, null, 4), 'utf-8');
    console.log(`[S1:${tag}] fixture copy ${file} (invoice seed ${cfg.invoice.invoiceNumber})`);
    return file;
}

/** Trailing integer of e.g. "INV-AUTO-119" → 119. */
const trailingNum = (v) => {
    const m = String(v ?? '').match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : -1;
};

/**
 * WHY THIS SCENARIO NEEDS LONGER ACTION TIMEOUTS
 * ----------------------------------------------
 * playwright.config.js sets a deliberately tight actionTimeout of 5s so a
 * missing element fails fast instead of burning the test timeout. That budget is
 * fine for a short spec, but this scenario walks ~100 UI steps across BOTH
 * frontends, and the v3 pages (PO, GRN, Invoice) re-render their header actions
 * and grids well after `domcontentloaded`. Five separate runs on 2026-09-10 died
 * on a different optimistic click each time — the intake Company dropdown, the
 * PO Create menu, invoice submit, the intake submission popup — every one of
 * them an element that WAS there moments later.
 *
 * page.setDefaultTimeout overrides the config default FOR THIS PAGE ONLY, so
 * scenario 1 gets room to breathe without touching the 40+ other suites that
 * share the config (including the negative suites, which want the fast fail).
 */
const ACTION_TIMEOUT_MS = 20_000;
const NAV_TIMEOUT_MS = 60_000;
function widenActionTimeouts(context) {
    // CONTEXT level, not page level: several steps in this chain open a NEW TAB
    // that the page object creates for itself (the award's Requisition link, the
    // PRC → PO link). A page-level default cannot reach those, so run 14 still
    // hit the config's 15s navigationTimeout inside
    // openRequisitionAndSaveCode → newPage.waitForLoadState. Context defaults are
    // inherited by every page the context opens, popups included.
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
}

let dataSnapshot = null;

test.describe('CXO — two Intake-to-Payment flows on one CXO', () => {

    // The global actionTimeout is 5s, tuned for short suites. This chain is ~120
    // interactions against a slow shared UAT, and several failures here were just
    // a control taking >5s to become clickable (the Process Request dialog
    // loading its body, a grid re-rendering). 20s removes that class of failure
    // without hiding a genuinely stuck control.
    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });

    // Only the CXO step writes the shared file; the chains write their own
    // copies. Restore the shared fixtures, having first carried the invoice
    // counter forward past everything the two chains consumed — rolling it back
    // would hand the next run a reference the server already holds.
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S1' }); });

    test('one CXO of 100 qty funds two 50-qty intakes, each paid in full '
        + '@CXO @Intake @Payment @E2E @S1 @Slow', async ({ browser }) => {
        test.setTimeout(7_200_000); // 2 h — two full intake-to-payment chains, in parallel

        // ── The shared CXO (qty 100 × 2,000), created once — or reused. ─────
        let savedCxo = REUSE_CXO;
        if ((RESUME_PR || RESUME_INVOICE) && !savedCxo) {
            savedCxo = null;   // resuming from a PR — the CXO is already spent for
            console.log(RESUME_INVOICE
                ? `[S1] resuming from settled invoice ${RESUME_INVOICE.code} (${RESUME_INVOICE.url})`
                : `[S1] resuming from Completed PR ${RESUME_PR.code} (${RESUME_PR.url})`);
        } else if (savedCxo) {
            console.log(`[S1] reusing existing CXO ${savedCxo.code} (${savedCxo.url})`);
        } else {
        const cxoContext = await browser.newContext({ storageState: 'auth.nsef.json' });
        widenActionTimeouts(cxoContext);
        const cxoPage = await cxoContext.newPage();
        await cxoPage.setViewportSize({ width: 1800, height: 900 });
        const cxoActions = new NSEFoundationActions(cxoPage);

        await cxoActions.openApp(data);
        await cxoActions.clickCxoTab();
        await cxoActions.assertCxoListingPage();
        await cxoActions.clickCreateCxo();
        await cxoActions.assertCxoCreatePage();
        await cxoActions.createAndReleaseCxo(data);
        await cxoActions.takeScreenshot('s1_cxo_released');

        savedCxo = JSON.parse(fs.readFileSync(SHARED_FIXTURE, 'utf-8')).savedCxo;
        expect(savedCxo?.code, 'the shared CXO must have been saved').toBeTruthy();
        console.log(`[S1] shared CXO ${savedCxo.code} — both intakes will link to it`);
        await cxoContext.close();
        }

        // ── Two chains, each on its own context and its own fixture copy. ────
        const seeds = reserveInvoiceRange();
        const chains = [
            { tag: 'A', fixture: makeChainFixture('A', savedCxo, seeds.A) },
            { tag: 'B', fixture: makeChainFixture('B', savedCxo, seeds.B) },
        ];

        // Serialises the quote block across the two chains — see the header note.
        let quoteGate = Promise.resolve();
        const quoteLock = (fn) => {
            const turn = quoteGate.then(fn, fn);
            quoteGate = turn.then(() => {}, () => {}); // a failed quote must not wedge the gate
            return turn;
        };

        const runChain = async ({ tag, fixture }) => {
            const context = await browser.newContext({ storageState: 'auth.nsef.json' });
            widenActionTimeouts(context);
            const page = await context.newPage();
            await page.setViewportSize({ width: 1800, height: 900 });
            const a = new NSEFoundationActions(page, { dataPath: fixture });
            try {
                await a.openApp(data);
                // skipCxo → the intake links to the savedCxo already in this copy.
                const { utr, invoiceAmount } = RESUME_INVOICE
                    ? await buildAckToPayment(a, data)
                    : RESUME_PR
                    ? await buildFromCompletedPrToPayment(a, data)
                    : await buildToPaymentViaCapp(a, data, {
                        skipCxo: true,
                        intakeQty: INTAKE_QTY,
                        quoteLock,
                    });
                const done = JSON.parse(fs.readFileSync(fixture, 'utf-8'));
                console.log(`[S1:${tag}] intake ${done.savedIntake?.code} → PO ${done.savedPurchaseOrder?.code} `
                    + `→ invoice ${done.savedInvoice?.code} paid ${invoiceAmount} (UTR ${utr})`);
                await a.takeScreenshot(`s1_chain${tag}_payment_completed`);
                return { tag, utr, invoiceAmount, ...done };
            } finally {
                await context.close().catch(() => {});
            }
        };

        // Sequential by default (see the header). Promise.all is kept for the
        // parallel form so flipping RUN_PARALLEL is the only change needed.
        let chainA, chainB;
        if (ONLY_CHAIN === 'A' || ONLY_CHAIN === 'B') {
            const pick = chains.find(c => c.tag === ONLY_CHAIN);
            console.log(`[S1] S1_ONLY=${ONLY_CHAIN} — running that chain alone`);
            const done = await runChain(pick);
            expect(done.savedInvoice?.code, `chain ${ONLY_CHAIN} invoice`).toBeTruthy();
            const from = savedCxo ? `on CXO ${savedCxo.code}`
                : RESUME_INVOICE ? `(resumed from invoice ${RESUME_INVOICE.code})`
                : RESUME_PR ? `(resumed from PR ${RESUME_PR.code})`
                : '';
            console.log(`[S1] chain ${ONLY_CHAIN} reached a paid invoice ${from}`.trim());
            return;
        }
        if (RUN_PARALLEL) {
            [chainA, chainB] = await Promise.all(chains.map(runChain));
        } else {
            chainA = await runChain(chains[0]);
            console.log('[S1] chain A complete — starting chain B');
            chainB = await runChain(chains[1]);
        }

        // ── Both flows really were distinct, and both reached a paid invoice. ─
        expect(chainA.savedIntake?.code, 'chain A intake').toBeTruthy();
        expect(chainB.savedIntake?.code, 'chain B intake').toBeTruthy();
        expect(chainA.savedIntake.code, 'the two chains must be separate intakes')
            .not.toBe(chainB.savedIntake.code);
        expect(chainA.savedInvoice.code, 'the two chains must be separate invoices')
            .not.toBe(chainB.savedInvoice.code);
        expect(chainA.invoice.invoiceNumber, 'invoice references must not collide')
            .not.toBe(chainB.invoice.invoiceNumber);
        expect(chainA.utr, 'payment UTRs must not collide').not.toBe(chainB.utr);

        console.log(`[S1] CXO ${savedCxo.code} carried both flows to payment: `
            + `${chainA.savedIntake.code} and ${chainB.savedIntake.code}`);

        // ── Belt and braces: the range was already reserved up front, but if a
        //    chain somehow consumed more than its seed window, record that too.
        const highest = Math.max(trailingNum(chainA.invoice.invoiceNumber),
                                 trailingNum(chainB.invoice.invoiceNumber));
        const shared = JSON.parse(fs.readFileSync(SHARED_FIXTURE, 'utf-8'));
        if (highest > trailingNum(shared.invoice.invoiceNumber)) {
            const m = String(shared.invoice.invoiceNumber).match(/^(.*?)(\d+)$/);
            shared.invoice.invoiceNumber = m[1] + String(highest).padStart(m[2].length, '0');
            fs.writeFileSync(SHARED_FIXTURE, JSON.stringify(shared, null, 4), 'utf-8');
            console.log(`[S1] invoice counter carried forward to ${shared.invoice.invoiceNumber}`);
        }
    });

});
