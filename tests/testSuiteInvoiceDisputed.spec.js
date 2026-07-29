import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE → DISPUTED.
//
// One test per route that lands an invoice in "Disputed" status. Steps for each
// case are dictated by QA and encoded here verbatim.
//
// Session: NSEF login (auth.nsef.json) via nsef-setup — same project as the
// reject-edit / CXO / RFX suites.
//
// Test cases:
//   (to be added)
// ─────────────────────────────────────────────────────────────────────────────

async function openApp(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    return a;
}

test.describe('Invoice → Disputed', () => {

    // Test cases go here.

});
