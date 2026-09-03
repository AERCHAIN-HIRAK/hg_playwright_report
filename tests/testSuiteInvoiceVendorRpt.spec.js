import { test } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Vendor Type + RPT flag autopopulation (sheet scenarios 77–84)
//
//   77 PO Invoice   — PO view page (CAPP)      81 PO Invoice — SAPP PO view page
//   78 PO Invoice   — Invoice listing (CAPP)   82 PO Invoice — SAPP Invoice listing
//   79 Credit Note  — Invoice listing (CAPP)   83 Credit Note — SAPP Invoice listing
//   80 CXO Invoice  — Invoice listing (CAPP)   84 CXO Invoice — SAPP Invoice listing
//
// BLOCKED — the fields do not exist on this tenant.
//
// Probed live 2026-09-02 by opening /invoices/new, uploading the document and
// rendering EVERY invoice template with a supplier selected. Field ids on the
// form were enumerated each time:
//
//   PO Invoice NSEF     49 fields — vendor/RPT match: only "MSME vendor?"
//   NSEF Credit Note    46 fields — vendor/RPT match: only "MSME vendor?"
//   CXO Template (Dev)  42 fields — vendor/RPT match: only "MSME vendor?"
//   RC Invoice          19 fields — no match at all
//
// There is no "Vendor Type" and no "RPT"/"Related Party" field anywhere on any
// of them, before or after choosing the supplier. "MSME vendor?" is a different
// flag. The supplier's own Onboarding tab likewise exposes neither — it only
// offers an (empty) "Onboarding Template" picker, the real onboarding form being
// the Supplier Portal one.
//
// So these eight need the same thing scenario 108 needs: the correct template /
// tenant configuration. Until QA confirms which template carries Vendor Type and
// the RPT flag, there is nothing to assert. Once it is known, the work is small
// and mechanical — all eight are the same two-field check from eight entry
// points, and reportNonPoAutoFilled() in the page object already reads
// auto-filled fields by label.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice — Vendor Type & RPT flag', () => {
    test('Vendor Type and RPT flag autopopulate from Supplier Onboarding @Invoice @VendorRpt @S73 @S74 @S75 @S76 @S77 @S78 @S79 @S80', async () => {
        test.fixme(true, 'no Vendor Type / RPT field on any invoice template in this tenant — needs the correct template config (see the note above)');
    });
});
