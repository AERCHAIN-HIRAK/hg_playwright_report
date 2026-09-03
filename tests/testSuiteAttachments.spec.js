import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Attachments — downloadable across modules
//
// Sheet scenario:
//   91  attachments in all the modules can be downloaded
//
// Verified live 2026-09-03 on Invoice-FNSE-26-334 (/invoices/1115):
// clicking `invoice_document.png` opens a NEW TAB at a presigned S3 URL
// (aerchain-test.s3.us-west-2.amazonaws.com/sqr-attachments/…) which serves
// **200 · 3,623,960 bytes · image/png**.
//
// Two traps:
//  1. It fires NO Playwright download event. Waiting on `page.waitForEvent(
//     'download')` times out and makes a working feature look broken — the file
//     is OPENED, not downloaded. Capture the popup instead.
//  2. The attachment anchors have NO href, NO download attribute and NO target;
//     navigation is JS-driven. They can only be recognised by the FILENAME in
//     their text, so a locator keyed on href finds nothing.
//
// Fetching the URL afterwards is the real assertion: a presigned link that has
// expired still OPENS a tab, but returns 403 with no bytes. Only the fetch
// distinguishes "downloadable" from "a link that goes nowhere".
//
// Read-only.
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = ['requisition', 'purchaseOrder', 'grn', 'invoice'];

test.describe('Attachments — downloadable across modules', () => {

    test.describe.configure({ timeout: 600000 });

    test('every module attachment that exists is served on click @Attachments @S91', async ({ page }) => {
        await page.setViewportSize({ width: 1800, height: 950 });

        const verified = [];
        const withoutAttachments = [];

        for (const key of MODULES) {
            const mod = data.modules[key];
            const detail = new v3DetailActions(page, mod);

            const found = await detail.findTransactionWithAttachment(data.baseUrl);
            if (!found) { withoutAttachments.push(mod.name); continue; }

            const result = await detail.openAttachmentAndVerify(found.attachments[0]);

            expect(result.url, `${mod.name}: the attachment did not open an attachment URL`)
                .toMatch(/attachment/i);
            expect(result.status, `${mod.name}: attachment URL returned ${result.status}`).toBe(200);
            expect(result.bytes, `${mod.name}: attachment served an empty body`).toBeGreaterThan(0);

            verified.push(`${mod.name}/${found.code} (${result.bytes}B ${result.contentType})`);
        }

        console.log(`[S91] verified: ${verified.join(' · ') || 'none'}`);
        console.log(`[S91] no attachment present: ${withoutAttachments.join(', ') || 'none'}`);

        // Without this the test would pass vacuously in a tenant where nothing
        // has an attachment — which is exactly the state Requisition, PO and GRN
        // are in today.
        expect(verified.length,
            'no module had an attachment to verify, so this proves nothing — ' +
            'attach a file to a Requisition / PO / GRN / Invoice and re-run')
            .toBeGreaterThan(0);
    });
});
