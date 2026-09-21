import { test, expect } from '@playwright/test';
import { supplierActions } from '../pages/supplierActions';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier onboarding — mandatory IFSC validation
//
// Sheet scenarios:
//   135  submission blocked when the mandatory IFSC field is blank during creation
//   136  the same validation fires when IFSC is CLEARED while editing an existing supplier
//
// Scenario 100 ("supplier matching percentage displayed beside the supplier
// name") was RETIRED by QA on 2026-09-08 and its test removed. It had been a
// confirmed gap: no percentage is rendered anywhere in this tenant — checked the
// supplier view page, the Onboarding tab, and the Create Supplier form while
// typing a deliberately colliding name.
//
// Where IFSC actually lives: the onboarding form at /suppliers/{id}/update.
// It is on neither the Create Supplier form nor the supplier's Onboarding tab —
// which is why the earlier probe recorded IFSC as "not on this form" and parked
// both scenarios. The template carries TWO of them: "RTGS IFSC Code" and
// "NEFT IFSC Code".
//
// Verified live 2026-09-03 on supplier 30480 (HG HF Test Supplier 01 30 06,
// Pending Review): clearing both and submitting produces
//     RTGS IFSC Code is Mandatory
//     NEFT IFSC Code is Mandatory
//     Please fill mandatory fields
// with ZERO write requests attempted — the form blocks entirely client-side.
//
// Two traps encoded here:
//  1. The IFSC inputs carry NO mandatory asterisk, no `required` and no
//     `aria-required`, yet the form rejects them when blank. Asserting
//     mandatoriness from the DOM marker would wrongly conclude IFSC is optional.
//  2. Their ids are "RTGS IFSC Code-<random>" — the suffix is regenerated on
//     every render, so only the id PREFIX can be matched.
//
// Non-destructive by construction, twice over: the submit never reaches the
// server, AND every non-GET request is aborted at the route layer for the life
// of these tests. If the app ever regresses to ACCEPTING a blank IFSC, the
// abort prevents the mutation and the `attemptedWrites` assertion reports it
// instead of the test silently damaging a supplier.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Supplier onboarding — mandatory IFSC', () => {

    test.describe.configure({ timeout: 300000 });

    /** @type {supplierActions} */
    let sup;
    /** @type {string[]} */
    let attemptedWrites;

    test.beforeEach(async ({ page }) => {
        sup = new supplierActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        attemptedWrites = [];
    });

    /**
     * Abort every non-GET request from here on, recording what was attempted.
     *
     * Installed EXPLICITLY rather than in beforeEach (QA, 2026-09-21): scenario
     * 135 now creates its own supplier first, and creation is all writes. The
     * guard goes up once the data exists and before the IFSC submit, which is
     * the only part that must not reach the server.
     */
    async function installWriteGuard(page) {
        await page.route('**/*', route => {
            const req = route.request();
            if (req.method() === 'GET') return route.continue();
            attemptedWrites.push(`${req.method()} ${req.url()}`);
            return route.abort();
        });
    }

    // ── 135 ───────────────────────────────────────────────────────────────────

    test('a blank IFSC blocks the onboarding submission @Supplier @Validation @S135', async ({ page }) => {
        // A NEW supplier, per QA (2026-09-21) — not whichever pre-Registered one
        // happens to be on the listing. Creation needs writes, so this runs
        // BEFORE the write guard goes up.
        test.setTimeout(900000);
        const made = await sup.createSupplierUpToOnboardingRequested();
        console.log(`[S135] created ${made.code} (${made.name}, id ${made.id})`);

        // From here nothing may reach the server.
        await installWriteGuard(page);

        expect(await sup.openOnboardingForm(made.id),
            `the onboarding form did not open for the new supplier ${made.code}`).toBeTruthy();
        const found = { ...made, ifsc: await sup.getIfscFields() };
        expect(found.ifsc.length, 'template exposes no IFSC field').toBeGreaterThan(0);
        console.log(`[S135] IFSC fields: ${found.ifsc.map(f => f.label).join(' · ')}`);

        // Leave IFSC blank and submit.
        await sup.setIfscFields('');
        const messages = await sup.submitOnboardingAndReadValidation();

        const ifscErrors = messages.filter(m => /ifsc/i.test(m) && /mandatory/i.test(m));
        expect(ifscErrors.length,
            `a blank IFSC was NOT reported as mandatory — messages were ${JSON.stringify(messages)}`)
            .toBeGreaterThan(0);

        // Every IFSC field on the template must be named, not just the first.
        for (const field of found.ifsc) {
            expect(ifscErrors.some(m => m.includes(field.label)),
                `no mandatory message naming "${field.label}"`).toBeTruthy();
        }

        // The form must still be open — a blocked submit must not navigate away.
        expect(await sup.isOnboardingFormOpen(),
            'the form closed, so the blank submit was not actually blocked').toBeTruthy();

        expect(attemptedWrites,
            'the app tried to WRITE despite a blank mandatory IFSC — validation regressed')
            .toEqual([]);
    });

    // ── 136 ───────────────────────────────────────────────────────────────────

    test('clearing a stored IFSC while editing raises the same validation @Supplier @Validation @S136', async ({ page }) => {
        await installWriteGuard(page);
        // requireValue: the fields must ALREADY hold a value, otherwise this is
        // a creation-stage blank and indistinguishable from 135.
        const found = await sup.findOnboardingSupplier({ requireValue: true });
        test.skip(!found,
            'no supplier found whose onboarding form already holds an IFSC value to clear');
        console.log(`[S136] ${found.name} (${found.id}, ${found.status})`);

        // Precondition: this is an EDIT of stored values, not a fresh form.
        for (const field of found.ifsc) {
            expect((field.value || '').trim(),
                `${field.label} was blank, so this is not an edit of a stored value`).not.toBe('');
        }

        const cleared = await sup.setIfscFields('');
        expect(cleared.length, 'no IFSC field was cleared').toBeGreaterThan(0);

        const messages = await sup.submitOnboardingAndReadValidation();
        const ifscErrors = messages.filter(m => /ifsc/i.test(m) && /mandatory/i.test(m));
        expect(ifscErrors.length,
            `clearing a stored IFSC was NOT rejected — messages were ${JSON.stringify(messages)}`)
            .toBeGreaterThan(0);

        expect(await sup.isOnboardingFormOpen(),
            'the form closed, so the cleared-IFSC submit was not blocked').toBeTruthy();

        expect(attemptedWrites,
            'the app tried to WRITE with a cleared mandatory IFSC — validation regressed')
            .toEqual([]);
    });
});
