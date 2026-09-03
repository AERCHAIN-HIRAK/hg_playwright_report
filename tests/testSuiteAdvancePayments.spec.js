import { test, expect } from '@playwright/test';
import { advanceActions } from '../pages/advanceActions';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Advances — payments shown in the Advance's Transactions tab
//
// Sheet scenario:
//   102  payments done for the advance display all the respective payments from
//        the Advance transaction tab
//
// The Advances module is reached directly at /advances — it has no module-switcher
// entry like the other v3 listings. (/advance resolves to a different tabbed view;
// /advance-payments 404s.)
//
// Verified live 2026-09-03:
//   Advance-FNSE-26-4 (Paid,     ₹1,000) → Payment-FNSE-26-23 · Advance Payment · ₹1,000
//   Advance-FNSE-26-2 (Paid,     ₹500)   → Payment-FNSE-26-18 · Advance Payment · ₹500
//   Advance-FNSE-26-1 (Utilised, ₹1,500) → Payment-FNSE-26-12 · Advance Payment · ₹1,500
//   Advance-FNSE-26-5 (Accounted, ₹4,234) → "No data"
//
// That last row is why the test filters on Paid/Utilised: **Accounted does NOT
// imply paid**, so asserting "every advance lists a payment" would fail on
// correct behaviour.
//
// The oracle is RECONCILIATION, not mere presence: the payment amounts must sum
// to the advance's own amount. A test that only counted rows would pass even if
// the tab listed somebody else's payment.
//
// Read-only.
// ─────────────────────────────────────────────────────────────────────────────

const PAID_STATUSES = /^(paid|utilised|utilized)$/i;

test.describe('Advances — payments in the Transactions tab', () => {

    test.describe.configure({ timeout: 240000 });

    /** @type {advanceActions} */
    let adv;

    test.beforeEach(async ({ page }) => {
        adv = new advanceActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    test('a paid advance lists its payments and the amounts reconcile @Advance @Payments @S102', async () => {
        const advances = await adv.listAdvances(data.baseUrl);
        expect(advances.length, 'the Advances listing is empty').toBeGreaterThan(0);

        const paid = advances.filter(a => PAID_STATUSES.test(a.status));
        test.skip(!paid.length,
            `no Paid/Utilised advance to check (statuses seen: ${[...new Set(advances.map(a => a.status))].join(', ')})`);

        let checked = 0;
        for (const a of paid) {
            const payments = await adv.readPayments(a.id, data.baseUrl);

            expect(payments.length,
                `${a.code} is ${a.status} but its Transactions tab lists no payment`).toBeGreaterThan(0);

            for (const p of payments) {
                expect(p.code, `a payment row on ${a.code} has no code`).toMatch(/^Payment-/);
                expect(p.type, `unexpected transaction type "${p.type}" on ${a.code}`)
                    .toMatch(/Advance Payment/i);
                expect(Number.isNaN(p.paid), `payment ${p.code} has an unparseable amount "${p.paidText}"`)
                    .toBeFalsy();
            }

            // Reconciliation — the real assertion. Presence alone would pass even
            // if the tab showed a payment belonging to a different advance.
            const total = payments.reduce((sum, p) => sum + p.paid, 0);
            expect(total,
                `${a.code} is ${a.amountText} but its payments total ${total}`)
                .toBeCloseTo(a.amount, 2);

            console.log(`[S102] ${a.code} (${a.status}, ${a.amountText}) → ${payments.length} payment(s) totalling ${total}`);
            checked++;
        }

        expect(checked, 'no advance was actually checked').toBeGreaterThan(0);
    });

    test('an advance with no payment shows an empty Transactions tab @Advance @Payments @S102', async () => {
        const advances = await adv.listAdvances(data.baseUrl);
        const unpaid = advances.filter(a => !PAID_STATUSES.test(a.status));
        test.skip(!unpaid.length, 'every advance is Paid/Utilised — no contrast case available');

        // Contrast case: without it, "paid advances list payments" could just mean
        // "the tab always lists something". Accounted advances legitimately have
        // none (Advance-FNSE-26-5 is Accounted with no payment).
        let sawEmpty = false;
        for (const a of unpaid) {
            const payments = await adv.readPayments(a.id, data.baseUrl);
            console.log(`[S102] ${a.code} (${a.status}) → ${payments.length} payment(s)`);
            if (!payments.length) { sawEmpty = true; break; }
        }
        expect(sawEmpty,
            'every non-paid advance still listed payments, so the tab is not reflecting payment state')
            .toBeTruthy();
    });
});
