import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import { buildToGrnViaSapp } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice validation AT THE REVIEW STAGE — sheet scenarios 126(b) and 127
//
//   126  "duplicate Invoice reference numbers are validated when an existing
//         Invoice is edited and submitted"
//   127  "the subject character limit is validated when an Invoice is edited and
//         submitted with more than 240 characters"
//
// BOTH IN ONE FLOW, per QA 2026-09-08: a Pending-Review invoice is expensive to
// produce (~17 min of chain), and both checks live on the same review edit page.
// Order matters and is the order QA specified:
//
//   1. over-long Subject  -> assert the character-limit validation
//   2. restore the original Subject
//   3. duplicate reference -> assert the duplicate validation
//
// Doing the Subject first and restoring it means the duplicate check is not
// polluted by a second, unrelated validation still on screen.
//
// THE LIMIT IS 250, NOT 240. QA corrected the sheet's wording on 2026-09-08, so
// the test sends 255 characters — 5 over the real cap, rather than 241 which is
// UNDER it and would have scored a correct app as broken.
//
// The creation half lives in testSuiteInvoiceRefValidation.spec.js (CAPP,
// nsef-tests). THIS file covers the review half, which was blocked until QA
// supplied the route on 2026-09-08:
//
//   "when we create Invoice from SAPP that time the review stage is triggered,
//    in that review stage during review from CAPP we need to add the duplicate
//    reference and check that the validation is displayed properly or not"
//
// That is the ONLY way to reach a Review-stage invoice. A CAPP-created PO
// invoice goes straight to Pending Approval — verified 2026-09-07 on
// Invoice-FNSE-26-367, whose approval loop never reported a review state. The
// earlier note that "the SAPP route is ruled out" confused the two halves: SAPP
// is ruled out for the CREATION check, but it is the precondition here. The
// check itself is still CAPP-side, on the review edit page.
//
// Lives in the supplier-tests project because it needs the COMBINED capp+sapp
// session (auth.supplier.json) — the SAPP leg creates, the CAPP leg reviews.
//
// A FRESH PO IS REQUIRED, built CXO → … → PO → GRN by buildToGrnViaSapp.
// Re-using data.savedPurchaseOrder does not work: a PO that already carries an
// invoice hits the known "2nd invoice sends the full PO qty" bug, and its
// symptom is indistinguishable from a validation refusal — on PO-NSEFN-26-220
// the SAPP Approvers dialog simply would not close through four click attempts
// and no invoice was created (2026-09-08). QA confirmed the SAPP flow needs the
// full chain from CXO.
//
// ORDER MATTERS. The collision is read BEFORE the new invoice is created: the
// SAPP creation overwrites savedInvoice, so reading afterwards would return the
// invoice under test and its own number is not a duplicate of anything. The
// chain build does not touch savedInvoice, so reading it first is safe.
//
// The submit is expected to be REFUSED, so the invoice stays in Review and
// nothing is consumed.
// ─────────────────────────────────────────────────────────────────────────────

// The chain build rewrites savedCxo / savedIntake / savedSourcingEvent /
// savedRequisition / savedPurchaseOrder / savedGrn / savedInvoice in
// NSEFoundationData.json. Other suites read those as fixtures — notably the
// creation half of 126, which needs a savedPurchaseOrder with OPEN quantity,
// whereas this run leaves its PO carrying a Pending-Review invoice. So the file
// is snapshotted and restored, the same guard the reject-edit suite uses around
// throwaway records. The UAT records themselves remain, which is expected.
const DATA_PATH = path.resolve('pages/NSEFoundationData.json');
let dataSnapshot = null;

test.describe('Invoice — review-stage validations', () => {

    test.beforeAll(() => {
        dataSnapshot = snapshotFixtures();
    });

    test.afterAll(() => {
        restoreFixtures(dataSnapshot, { tag: 'S126b' });
    });

    test('at CAPP review: an over-long Subject and a duplicate reference are both refused '
        + '@Invoice @Validation @Review @S126 @S127',
        async ({ page }) => {
            // The chain build alone is ~35 min of real UAT work.
            test.setTimeout(3600000);

            const a = new NSEFoundationActions(page);
            const s = new SupplierPortalActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            // (0) The collision, off an invoice that ALREADY exists — before the
            //     SAPP leg replaces savedInvoice.
            const duplicate = await a.readSavedInvoiceNumber(data);
            const collidedWith = data.savedInvoice?.code;
            console.log(`[S126b] will re-use "${duplicate}" (held by ${collidedWith})`);

            // DEBUG FAST PATH. Set S126B_INVOICE_ID to the CAPP id of an invoice
            // ALREADY sitting in Pending Review to skip the ~17 min chain build and
            // exercise only the review-stage assertion. Not for CI: it depends on
            // ambient data. The default path below builds its own precondition.
            const reuseId = process.env.S126B_INVOICE_ID;
            if (reuseId) {
                console.log(`[S126b] FAST PATH — reusing invoice id ${reuseId}, skipping the chain build`);
                await page.goto(`https://nse-capp-uat.aerchain.io/invoices/${reuseId}`,
                    { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForTimeout(12000);
            } else {
                // (1) Build a FRESH PO (with its GRN) owned by the portal supplier.
                // Back to the v4 shell first: readSavedInvoiceNumber left the page on
                // the invoice DETAIL page, where there is no CXO tab — the chain's
                // first step then died on a 5s action timeout (2026-09-08).
                await a.openApp(data);
                await buildToGrnViaSapp(a, s, data);

                // (2) SAPP: create an invoice against it. It lands in CAPP as Pending
                //     Review — that is what makes the review stage reachable at all.
                await a.openApp(data);
                await s.openPoListing();
                await s.openSavedPoFromListing();
                await s.createInvoiceFromPo(data);
                // NB: log the FILE, not the imported `data` — the chain writes to disk
                // and the static import stays stale (it printed the previous run's PO).
                const built = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
                console.log(`[S126b] fresh chain built → PO ${built.savedPurchaseOrder?.code}, `
                    + `invoice ${built.savedInvoice?.code}`);
                await a.openSavedInvoice(data);
            }
            console.log('[S126b] SAPP invoice created — expected Pending Review in CAPP');

            // (3) CAPP: get onto the review EDIT page without submitting.
            const onEdit = await s.openPendingReviewEditPage('S126b');
            expect(onEdit,
                'the review edit page never opened — the SAPP invoice did not reach Pending Review, '
                + 'so this scenario has no surface to test').toBeTruthy();

            // (4) SCENARIO 127 — over-long Subject first, on the same edit page.
            const originalSubject = await a.readInvoiceSubject();
            const overLong = 'HG Automation subject limit check '.padEnd(255, 'X').slice(0, 255);
            expect(overLong.length, 'the probe string must exceed the 250-char cap').toBe(255);
            await a.fillInvoiceSubject(overLong);

            const subj = await a.submitInvoiceExpectingSubjectLimitRejection();
            // The scenario asks whether the limit IS validated. If the app accepts a
            // 255-character Subject and its Validations dialog never mentions a cap,
            // that is the defect this scenario exists to catch — so fail loudly and
            // quote the dialog, rather than softening it into a skip.
            expect(subj.enforced,
                `a ${subj.heldChars}-character Subject was NOT validated against the 250-char limit, even `
                + `after Proceed and the Workflow Summary submit. Last dialog: `
                + `${JSON.stringify(subj.dialogText ?? '')}; error-shaped text: `
                + `${JSON.stringify(subj.errish ?? [])}; url: ${subj.url ?? ''}`)
                .toBeTruthy();
            // If the over-long Subject had been accepted the invoice would have left
            // Pending Review, and the duplicate half below would then fail for a
            // reason that has nothing to do with duplicate references. Say so here.
            expect(subj.consumed,
                'the over-long Subject was accepted and the invoice submitted out of Pending Review — '
                + 'the precondition for the duplicate half is gone, so its result would be meaningless')
                .toBeFalsy();
            console.log(`[S127] subject-limit validation shown${subj.inline ? ' (inline)' : ''}: `
                + JSON.stringify(subj.messages));

            // (5) RELOAD to get a clean form, rather than typing the Subject back.
            //     After the failed submit the Workflow Summary popup STAYS OPEN — it
            //     offers Go back / Discard / Submit and no "Make Changes" — so the
            //     form behind it is inert and every fill is silently swallowed: four
            //     verified attempts to restore a 25-char Subject all read back 255
            //     (2026-09-08). A reload discards the unsaved 255-char value and
            //     leaves the invoice in Review, which is all the duplicate half needs.
            //     A bare reload of /invoices/<id>/edit does NOT render the form — the
            //     edit mode is only entered through the Review action — so re-enter
            //     the same way the flow got here the first time.
            const invId = (page.url().match(/\/invoices\/(\d+)/) || [])[1];
            await page.goto(`https://nse-capp-uat.aerchain.io/invoices/${invId}`,
                { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForTimeout(12000);
            const reEntered = await s.openPendingReviewEditPage('S126b');
            expect(reEntered,
                'could not re-enter the review edit page after the Subject validation, so the '
                + 'duplicate half cannot run').toBeTruthy();
            expect(await a.readInvoiceSubject(),
                're-entering review did not restore the original Subject, so the duplicate check '
                + 'would run on a still-invalid form')
                .toBe(originalSubject);

            // (6) SCENARIO 126(b) — overwrite the reference with the known collision.
            await a.fillInvoiceNumberExactly(duplicate);
            const result = await a.submitInvoiceExpectingDuplicateRejection({
                formUrlRe: /\/invoices\/\d+\/edit/,
            });

            expect(result.refused,
                'the duplicate reference was ACCEPTED at the review stage — the validation is missing')
                .toBeTruthy();
            // A silent block is a real finding, not a pass: the scenario asks whether
            // the validation is DISPLAYED, so name it rather than letting it slide.
            expect(result.silent,
                'the duplicate reference was refused SILENTLY at review — no validation message was '
                + `shown. Error-shaped text found: ${JSON.stringify(result.errish ?? [])}`)
                .toBeFalsy();
            // The message must name the invoice it collided with; that is what makes
            // it actionable, and it proves the app matched the RIGHT invoice rather
            // than rejecting on any duplicate-ish condition.
            expect(result.messages.join(' '),
                `the validation names no existing invoice: ${JSON.stringify(result.messages)}`)
                .toMatch(/Invoice-[A-Z]+-\d+-\d+/);

            console.log(`[S126b] validation shown: ${JSON.stringify(result.messages)}`);
        });
});
