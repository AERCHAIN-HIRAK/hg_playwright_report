import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// CXO clone — reference rules
//
// Sheet scenario 107: a CANCELLED CXO can be cloned WITHOUT changing the reference
//
// (The companion rule for RELEASED / PROCESSED CXOs was sheet scenario 108,
//  which QA removed from the sheet on 2026-09-02 — see the retired block below.)
//
// ⚠️ ASSUMPTION, UNCONFIRMED. There is no field labelled "Reference" anywhere on
// the CXO — not on the clone form, not on the overview, not in the listing. The
// only reference-like value is **BRF**, which is a column inside the Item
// Details grid (value "Dont Touch" on the automation records), surfaced as a
// clickable <p class="cursor-pointer text-blue-500">. These tests therefore read
// "the reference" as the BRF, and submit the clone with it UNCHANGED.
//
// Observed live 2026-08-31 on a RELEASED source CXO (CXO-FNSE-26-372, /cxos/5746):
// submitting the clone untouched SUCCEEDED — "CXO request created successfully",
// new CXO at /cxos/5753. So scenario 108's rule either is not implemented, or
// "reference" means a field that could not be identified from the UI. The test
// below states both possibilities in its failure message rather than declaring
// a defect.
//
// SIDE EFFECT: a passing clone CREATES A REAL CXO on UAT. That is inherent to
// the scenario. The shared data fixture is snapshotted and restored so the new
// record cannot repoint savedCxo for other suites.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.resolve('pages/NSEFoundationData.json');

test.describe('CXO clone — reference rules', () => {

    test.describe.configure({ timeout: 240000 });

    let snapshot;
    test.beforeEach(() => { snapshot = fs.readFileSync(DATA_FILE, 'utf-8'); });
    test.afterEach(() => { fs.writeFileSync(DATA_FILE, snapshot); });

    test('a Cancelled CXO can be cloned without changing the reference @CXO @Clone @S103', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        await a.openApp(data);

        const source = await a.findCxoWithStatus('Cancelled');
        test.skip(!source, 'no Cancelled CXO on the first listing page');
        console.log(`[CLONE] source ${source.code} (${source.status})`);

        await a.startCxoClone(source.href);
        const result = await a.submitCloneUnchanged();

        expect(result.created,
            `cloning Cancelled ${source.code} with the reference unchanged was blocked — `
            + `still at ${result.url}, toasts: ${JSON.stringify(result.toasts)}`)
            .toBeTruthy();
    });

    // ── RETIRED — sheet scenario 108, removed by QA on 2026-09-02 ─────────────
    //
    // The rule was "cloning a Released / Processed / Partially Processed CXO
    // requires the reference to be changed". Live on 2026-08-31 a Released CXO
    // (CXO-FNSE-26-372) cloned with the BRF UNCHANGED was ACCEPTED — a new CXO
    // was created — reproduced twice. There is no field labelled "Reference"
    // anywhere on the CXO, so it was never possible to confirm which field the
    // rule meant; QA had also put it on hold as "not using the correct template".
    //
    // QA removed the scenario from the sheet, so the test is gone rather than
    // left failing. Scenario 107 (a Cancelled CXO clones WITHOUT changing the
    // reference) is unaffected and still covered above. The finding is kept here
    // in case the rule comes back with the right template.
});
