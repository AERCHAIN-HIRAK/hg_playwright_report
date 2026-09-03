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
// The final proof is the invoice's own status: it must NOT have become
// Accounted. That is checked after the call, because an API that merely returns
// an error while still mutating state would be the real defect.
// ─────────────────────────────────────────────────────────────────────────────

const CASES = [
    { scenario: 115, label: 'Cancelled', pattern: 'Cancelled' },
    { scenario: 116, label: 'Rejected',  pattern: 'Rejected'  },
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

        // ── KNOWN BUG for the Rejected case — DEFERRED BY QA ─────────────────
        // Verified 2026-08-31:
        //   Cancelled invoice (Invoice-FNSE-26-346) → HTTP 400, success:false  ✔
        //   Rejected  invoice (Invoice-FNSE-26-350) → HTTP 200, success:true   ✘
        // The rejected invoice is NOT actually acknowledged — its status stays
        // Rejected — but the API reports success anyway. An integration caller
        // would record the acknowledgement as done when it never happened, which
        // is worse than a clean refusal.
        //
        // QA decision (2026-08-31): DEFERRED — in production nobody is expected
        // to acknowledge an invoice that is already Rejected, so this is not
        // worth blocking on. The Rejected case is therefore marked fixme rather
        // than left failing; the Cancelled case still runs and guards the
        // correct behaviour. Remove the fixme to re-open the check.
        test(`the ack API reports refusal for a ${c.label} invoice @Invoice @Ack @KnownBug @S${c.scenario}`, async ({ page }) => {
            test.fixme(c.label === 'Rejected',
                'DEFERRED by QA: ack API returns HTTP 200 success:true for a Rejected invoice. '
                + 'The invoice is not actually acknowledged, and acknowledging a rejected invoice is not a real production path.');

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
});
