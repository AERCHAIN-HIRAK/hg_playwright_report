import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 113 — "Verify the system works as expected after clicking the
// Approve / Submit / Proceed button multiple times."
//
// Covered on the CXO create → Submit path as the representative case: a user
// double-clicks the workflow popup's Submit.
//
// The assertion is on the NETWORK, not the screen. Either way the app lands on
// one overview page, so a duplicate transaction would be created silently
// behind it — counting accepted create POSTs is the only way to see it.
//
// This creates ONE real CXO per run (that is the point — the test proves it is
// one and not two). The shared fixture file is snapshotted and restored, since
// helpers in this area write savedCxo as a side effect.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.resolve('pages/NSEFoundationData.json');

test.describe('Double-click protection on Submit', () => {

    test.describe.configure({ timeout: 300000 });

    let fixtureSnapshot;
    test.beforeEach(() => { fixtureSnapshot = fs.readFileSync(DATA_FILE, 'utf-8'); });
    test.afterEach(() => { fs.writeFileSync(DATA_FILE, fixtureSnapshot); });

    test('double-clicking Submit creates only one CXO @CXO @Submit @S108', async ({ page }) => {
        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);
        await a.openApp(data);

        await a.clickCxoTab();
        await a.assertCxoListingPage();
        await a.clickCreateCxo();
        await a.assertCxoCreatePage();
        await a.waitForCreatePageLoaded();
        await a.fillAllCxoSections(data);

        const calls = await a.submitCxoTwiceAndCountCreates();
        console.log(`[S113] non-GET calls: ${JSON.stringify(calls)}`);

        // The CXO create is POST /api/capp/v4/transactions/. The submit also
        // fires validate-items and eligible-users, which are not creates.
        const creates = calls.filter(c => /\/v4\/transactions\/?$/.test(c.url));
        console.log(`[S113] create calls: ${JSON.stringify(creates)}`);

        // The form must have been accepted at all …
        await a.assertCxoSubmittedSuccessfully();

        // … exactly once. Two accepted creates would mean a duplicate CXO.
        const accepted = creates.filter(c => c.status >= 200 && c.status < 300);
        // Exactly one: zero would mean the form never submitted (and the
        // assertion would pass vacuously), two would mean a duplicate CXO.
        expect(accepted.length,
            `double-clicking Submit produced ${accepted.length} accepted create requests. `
            + `Calls: ${JSON.stringify(creates)}`)
            .toBe(1);

        const url = page.url();
        console.log(`[S113] landed on ${url}`);
        expect(url, 'the CXO did not reach an overview page').toMatch(/\/cxos\/[^/]+\/overview/);
    });
});
