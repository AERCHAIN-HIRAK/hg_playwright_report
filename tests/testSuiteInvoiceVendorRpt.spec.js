import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Vendor Type + RPT flag autopopulation (sheet scenarios 73-80)
//
//   73 PO Invoice  — PO view page (CAPP)      77 PO Invoice  — SAPP PO view page
//   74 PO Invoice  — Invoice listing (CAPP)   78 PO Invoice  — SAPP Invoice listing
//   75 Credit Note — Invoice listing (CAPP)   79 Credit Note — SAPP Invoice listing
//   80 CXO Invoice — Invoice listing (CAPP)   80 CXO Invoice — SAPP Invoice listing
//
// CORRECTION (2026-09-08). These eight were previously recorded as BLOCKED with
// "the fields do not exist in this tenant". That was WRONG — a probe artifact.
// QA said the fields are on every invoice template, and a re-probe proved it:
//
//   PO Invoice NSEF     89 fields (probe said 49) — Vendor Type + RPT FLag present
//   NSEF Credit Note    85 fields (probe said 46) — present
//   CXO Template (Dev)  77 fields (probe said 42) — present
//   RC Invoice          51 fields (probe said 19) — neither field (not in scope)
//
// The old probe enumerated only the VISIBLE fields, and both live inside a
// collapsed accordion. Two further traps it would have hit regardless: the ids
// carry a per-render random suffix ("Vendor Type-V5GCVvt0Av7T"), and the app
// misspells the label as "RPT FLag" (capital L).
//
// Verified autopopulation, NSEF Credit Note template:
//   no supplier                          -> Vendor Type ""    RPT FLag ""
//   "HG Automation SUPP (FNSE-26-2993)"  -> Vendor Type "IT"   RPT FLag "N"
//
// TWO ROUTE SHAPES, because the Supplier picker differs by template:
//   · Credit Note / CXO Template — picker ENABLED. Both fields start blank and
//     fill when the supplier is chosen, so the TRANSITION is the assertion.
//   · PO Invoice — picker DISABLED, the PO supplies the supplier (QA, 2026-09-08).
//     Both fields are therefore already populated on arrival; asserting a
//     blank-then-filled transition here would be wrong.
//
// Expected values live in data.vendorRpt so they track the supplier's onboarding
// record rather than being frozen in the test.
//
// SCOPE (QA, 2026-09-08): the check is only whether the two fields autopopulate
// once the supplier is known — then move on to the next invoice type. No invoice
// is created, nothing is submitted; each test abandons the form after reading.
// ─────────────────────────────────────────────────────────────────────────────

const V = data.vendorRpt;

test.describe('Invoice — Vendor Type & RPT flag autopopulation', () => {

    /** Shared: open the create form and choose `template`. */
    async function openTemplate(a, template) {
        await a.openNonPoInvoiceCreatePage({ direct: true });
        await a.uploadNonPoInvoiceDocument(data);
        await a.selectNonPoTemplate({ nonPoInvoice: { ...data.nonPoInvoice, template } });
        await a.expandNonPoSections();
    }

    /** Both flags present on the template and actually carrying a value. This is
     *  the whole check: the scenarios ask whether the two autopopulate from the
     *  supplier, so no invoice is ever submitted. */
    function assertPopulated(flags, where) {
        expect(flags.vendorType, `${where}: Vendor Type must be present on the template`).not.toBeNull();
        expect(flags.rptFlag,    `${where}: RPT FLag must be present on the template`).not.toBeNull();
        expect(flags.vendorType, `${where}: Vendor Type must autopopulate, not stay blank`).not.toBe('');
        expect(flags.rptFlag,    `${where}: RPT FLag must autopopulate, not stay blank`).not.toBe('');
    }

    /** Stronger form, usable only where the test chose the supplier itself and so
     *  knows which onboarding record the values must come from. */
    function assertMatchesOnboarding(flags, where) {
        assertPopulated(flags, where);
        expect(flags.vendorType, `${where}: Vendor Type must match the supplier's onboarding selection`)
            .toBe(V.expectedVendorType);
        expect(flags.rptFlag,    `${where}: RPT FLag must match the supplier's onboarding selection`)
            .toBe(V.expectedRptFlag);
    }

    // ── Supplier-pickable templates: assert the blank -> filled transition ────

    for (const template of V.supplierPickableTemplates) {
        const tag = template === 'NSEF Credit Note' ? '@S75 @S79' : '@S76 @S80';

        test(`${template}: both flags fill from the chosen supplier @Invoice @VendorRpt ${tag}`,
            async ({ page }) => {
                test.setTimeout(600000);

                const a = new NSEFoundationActions(page);
                await a.openApp(data);
                await openTemplate(a, template);

                // Before: the picker is live, so nothing can have populated yet.
                expect(await a.isNonPoSupplierLocked(),
                    `${template} is expected to offer an enabled Supplier picker`).toBe(false);
                const before = await a.readVendorRptFlags();
                expect(before.vendorType, `${template}: Vendor Type must exist before the supplier is chosen`)
                    .not.toBeNull();
                expect(before.rptFlag, `${template}: RPT FLag must exist before the supplier is chosen`)
                    .not.toBeNull();
                expect(before.vendorType, `${template}: Vendor Type must start blank`).toBe('');
                expect(before.rptFlag, `${template}: RPT FLag must start blank`).toBe('');

                const chosen = await a.selectNonPoSupplier(V.supplierSearch);
                const after = await a.readVendorRptFlags();

                console.log(`[VENDORRPT] ${template}: "${chosen}" -> `
                    + `Vendor Type="${after.vendorType}" RPT FLag="${after.rptFlag}"`);
                assertMatchesOnboarding(after, template);
            });
    }

    // ── PO-driven route: the supplier is fixed, so both arrive populated ─────
    //
    // This one CANNOT be reached through /invoices/new. Proven by a run on
    // 2026-09-08: loading the create page directly and picking the PO Invoice
    // template leaves the Supplier picker LOCKED AND EMPTY — there is no PO
    // attached and no PO field on the template to attach one, so both flags stay
    // blank. It is not an app defect, it is the wrong door.
    //
    // The real entry point is the PO view page: Create -> Invoice -> Select PO
    // Items -> Proceed, which carries the PO (and therefore its supplier) into
    // the form. Uses the saved PO, and abandons the form before submitting, so no
    // invoice is created.

    test(`${V.poDrivenTemplate}: both flags arrive populated from the PO's supplier `
        + '@Invoice @VendorRpt @S73 @S74 @S77 @S78', async ({ page }) => {
        test.setTimeout(600000);

        const a = new NSEFoundationActions(page);
        await a.openApp(data);

        await a.openSavedPurchaseOrder(data);
        await a.clickPoCreateInvoice();
        await a.submitSelectPoItemsForInvoice();
        await a.confirmInvoiceCreation();
        await a.uploadInvoiceDocument(data);

        // On this route the template is normally pre-resolved by the PO. Select it
        // only if the picker is still sitting empty.
        const tpl = page.locator('input[placeholder="Choose Template"]').first();
        if (await tpl.isVisible({ timeout: 20000 }).catch(() => false)
            && !(await tpl.inputValue().catch(() => '')).trim()) {
            await a.selectNonPoTemplate({ nonPoInvoice: { ...data.nonPoInvoice, template: V.poDrivenTemplate } });
        }
        await a.expandNonPoSections();

        // Reported, NOT asserted. An earlier version of this test required the
        // Supplier picker to be DISABLED on this route, reasoning that the PO owns
        // the supplier. The 2026-09-08 run disproved it: the PO pre-fills the
        // supplier but leaves the control ENABLED, and the test failed on that
        // assumption while the two flags it exists to check were correctly
        // populated (IT / N). The populated flags are the requirement; the state
        // of the picker is incidental.
        console.log(`[VENDORRPT] Supplier picker locked on the PO route: `
            + `${await a.isNonPoSupplierLocked()}`);

        const flags = await a.readVendorRptFlags();
        console.log(`[VENDORRPT] ${V.poDrivenTemplate} via ${data.savedPurchaseOrder.code}: `
            + `Vendor Type="${flags.vendorType}" RPT FLag="${flags.rptFlag}"`);

        // Only "populated", NOT equal to data.vendorRpt's IT/N: this route takes
        // whichever supplier its PO carries, which is not necessarily the one the
        // supplier-pickable tests choose. Pinning the values here would fail on
        // the data rather than on the feature.
        assertPopulated(flags, V.poDrivenTemplate);
    });
});
