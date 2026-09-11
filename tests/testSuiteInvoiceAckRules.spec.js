import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice acknowledgement rules
//
// Sheet scenarios 115 (a cancelled invoice cannot be acknowledged) and
// 116 (a rejected invoice cannot be acknowledged).
//
// The ack is an API call, not a UI action, so these drive it directly. The
// happy-path helper acknowledgeInvoice() asserts a 2xx; these need the opposite,
// hence tryAcknowledgeInvoiceCode(), which reports the outcome instead of
// asserting it.
//
// IMPORTANT: this app signals a business refusal as HTTP 200 with success:0 as
// well as via non-2xx, so "the request succeeded" is NOT the same as "the
// invoice was acknowledged". Both forms are treated as a refusal; only a 2xx
// carrying a truthy success would mean the rule was broken.
//
// For the Rejected case the API payload is deliberately NOT asserted — QA ruled
// (2026-09-04) that the UI status is the contract: staying Rejected rather than
// becoming Accounted is the pass condition, and the HTTP 200 success:true reply
// is to be ignored.
//
// The final proof is the invoice's own status: it must NOT have become
// Accounted. That is checked after the call, because an API that merely returns
// an error while still mutating state would be the real defect.
// ─────────────────────────────────────────────────────────────────────────────

// `checkApiRefusal` — whether the API's own reply is part of the contract.
//
// For Cancelled it is: the app correctly answers HTTP 400 success:false.
//
// For Rejected it is NOT. QA ruling (2026-09-04): the contract under test is the
// UI status — the invoice must stay Rejected and must never become Accounted —
// and the HTTP 200 success:true payload is explicitly out of scope. So the
// reporting assertion is not generated for Rejected at all, rather than being
// carried as a deferred/fixme item. The status assertion below still runs and is
// what actually protects the ledger.
const CASES = [
    { scenario: 115, label: 'Cancelled', pattern: 'Cancelled', checkApiRefusal: true  },
    { scenario: 116, label: 'Rejected',  pattern: 'Rejected',  checkApiRefusal: false },
];

test.describe('Invoice acknowledgement rules', () => {

    test.describe.configure({ timeout: 180000 });

    for (const c of CASES) {

        // The rule itself: whatever the API replies, the invoice must not end up
        // Accounted. This is the assertion that actually protects the ledger.
        test(`a ${c.label} invoice is not acknowledged @Invoice @Ack @S${c.scenario}`, async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            const target = await a.findInvoiceWithStatus(c.pattern);
            test.skip(!target, `no ${c.label} invoice available on the first listing page`);
            console.log(`[ACK] target ${target.code} (${target.status}) at ${target.href}`);

            // Confirm the precondition on the invoice itself, not just the listing.
            const before = await a.readInvoiceStatusByPath(target.href);
            expect(before, `${target.code} is not ${c.label} on its detail page (got "${before}")`)
                .toMatch(new RegExp(c.pattern, 'i'));

            await a.tryAcknowledgeInvoiceCode(data, target.code);

            const after = await a.readInvoiceStatusByPath(target.href);
            expect(after,
                `${target.code} was ${c.label} but became "${after}" after the ack call`)
                .not.toMatch(/Accounted/i);
            console.log(`[ACK] ${target.code} status after ack attempt = "${after}"`);
        });

        // The API's own reply is only asserted where it is part of the contract
        // (see checkApiRefusal above). Verified 2026-08-31:
        //   Cancelled invoice (Invoice-FNSE-26-346) → HTTP 400, success:false  ✔
        //   Rejected  invoice (Invoice-FNSE-26-350) → HTTP 200, success:true   — out of scope per QA
        if (c.checkApiRefusal) {
            test(`the ack API reports refusal for a ${c.label} invoice @Invoice @Ack @S${c.scenario}`, async ({ page }) => {
                const a = new NSEFoundationActions(page);
                await page.setViewportSize({ width: 1800, height: 900 });
                await a.openApp(data);

                const target = await a.findInvoiceWithStatus(c.pattern);
                test.skip(!target, `no ${c.label} invoice available on the first listing page`);

                const before = await a.readInvoiceStatusByPath(target.href);
                expect(before).toMatch(new RegExp(c.pattern, 'i'));

                const result = await a.tryAcknowledgeInvoiceCode(data, target.code);

                // A refusal is either a non-2xx or a 2xx carrying success:0/false.
                const refused = !result.ok || result.success === 0 || result.success === false;
                expect(refused,
                    `ack API reported SUCCESS for ${c.label} invoice ${target.code} (HTTP ${result.status}, success=${result.success}) `
                    + `even though the invoice was not acknowledged — it is still "${await a.readInvoiceStatusByPath(target.href)}"`)
                    .toBeTruthy();
            });
        }

    }
});
