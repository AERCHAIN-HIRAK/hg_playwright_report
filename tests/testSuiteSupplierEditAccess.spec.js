import { test, expect } from '@playwright/test';
import { supplierActions } from '../pages/supplierActions';
import { roleAccessActions } from '../pages/roleAccessActions';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Edit access is driven by the role's "Supplier | Create" permission —
// sheet scenario 139.
//
// Steps dictated by QA 2026-09-23:
//   1. Supplier listing → open a supplier → the Edit button IS present
//   2. Org Settings → User Management → Roles → search "admin" → edit Admin →
//      Access dropdown → UNCHECK "Supplier | Create" → click outside → Update
//   3. Supplier listing → open the SAME supplier → Edit is GONE
//   4. Same role edit → RE-CHECK "Supplier | Create" → Update
//   5. Supplier listing → open the SAME supplier → Edit is back
//
// The logged-in automation user really is governed by this role: probed
// 2026-09-23, nsefsupport@demo.com (NSEF Support Admin) holds the role "Admin",
// which is the role these steps edit. Searching "admin" also returns "NSE Admin"
// and "Non Admin Role", so the editor is opened by exact role name.
//
// ── THIS TEST MUTATES SHARED STATE ───────────────────────────────────────────
// Between steps 2 and 4 the Admin role — every automation user's role — has no
// Supplier Create access. Leaving it that way would break the supplier suites and
// anyone using the tenant. So the re-check is NOT trusted to the happy path: an
// afterAll forces the permission back on regardless of how the test ended, and it
// is idempotent, so the normal step-4 restore makes it a no-op. Step 5 still
// asserts the restore worked, which is the scenario's own final check.
//
// A FIXED supplier is used rather than "any": steps 3 and 5 must re-open the one
// from step 1, and a Registered supplier is required — probed 2026-09-23, only
// Registered suppliers carry the Edit control at all (Pending-Approval ones show
// Reject/Approve instead). HG Automation SUPP (FNSE-26-2993) is the portal
// supplier and is Registered.
//
// The Edit control is an ICON button carrying title="Edit" — it has no text, so a
// text-based lookup finds nothing.
//
// ── THE BUTTON IS NEVER HIDDEN, IT IS DISABLED ───────────────────────────────
// The first version of this test asserted the button DISAPPEARS, and failed:
// removing the permission (verified saved, and re-checked after a fresh login)
// left Edit on screen. QA corrected the expectation 2026-09-23 — access shows as
// COLOUR, not presence — and a live capture of both states confirms it:
//
//              access granted            access removed
//   disabled   false                     true
//   colour     rgb(51, 136, 235) blue    rgba(0, 0, 0, 0.25) grey
//   class      outLinedButton            outLinedButtonDisabled + Mui-disabled
//   cursor     pointer                   default (pointer-events: none)
//
// So the assertion is on the ENABLED state, which is what actually drives the
// grey. The colour is carried through the logs and failure messages because that
// is how the behaviour is described and reviewed, but it is not the assertion —
// an exact rgb() would break on any theme change while the semantics held.
// ─────────────────────────────────────────────────────────────────────────────

const SUPPLIER_NAME = process.env.S139_SUPPLIER || 'HG Automation SUPP';
const ROLE = process.env.S139_ROLE || 'Admin';
const PERMISSION = 'Supplier | Create';
const EDIT_BTN = 'button[title="Edit"]';

/** Open the supplier from the listing and report the Edit control's state.
 *  Returns { present, enabled, color }. */
async function readEditState(page, label) {
    const sup = new supplierActions(page);
    await sup.openListing();
    const href = await sup.findSupplierHref(SUPPLIER_NAME);
    expect(href, `supplier "${SUPPLIER_NAME}" not found on the listing`).toBeTruthy();
    await page.goto(`https://nse-capp-uat.aerchain.io${href}`,
        { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(12000);

    // Poll for the control itself: this detail page renders its action bar late,
    // and a single read would report "missing" for a page that had not finished.
    const btn = page.locator(EDIT_BTN).first();
    for (let i = 0; i < 6; i++) {
        if (await btn.count()) break;
        await page.waitForTimeout(2500);
    }
    const state = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Edit');
        if (!b) return { present: false, enabled: null, color: null };
        return { present: true, enabled: !b.disabled, color: getComputedStyle(b).color };
    });
    console.log(`[S139] ${label}: Edit ${state.present ? 'present' : 'MISSING'}`
        + `, ${state.enabled ? 'ENABLED (blue)' : 'DISABLED (greyed)'} — color ${state.color}`);
    return state;
}

test.describe('Supplier — Edit access follows the role permission', () => {

    // Unconditional safety net. Runs even when the test throws mid-flow, so the
    // tenant is never left with Admin stripped of Supplier Create.
    test.afterAll(async ({ browser }) => {
        const page = await browser.newPage();
        try {
            const r = new roleAccessActions(page);
            const changed = await r.setRoleAccess(ROLE, PERMISSION, true);
            console.log(changed
                ? `[S139] SAFETY NET restored "${PERMISSION}" on role ${ROLE}`
                : `[S139] safety net: "${PERMISSION}" already restored`);
        } catch (e) {
            console.error(`[S139] SAFETY NET FAILED — role ${ROLE} may still be missing `
                + `"${PERMISSION}". Restore it by hand. ${e.message}`);
            throw e;
        } finally {
            await page.close().catch(() => {});
        }
    });

    test('removing Supplier | Create greys out the supplier Edit button, and restoring it makes it live '
        + 'again @Supplier @Access @Roles @S139',
        async ({ page }) => {
            test.setTimeout(900000);
            await page.setViewportSize({ width: 1800, height: 950 });

            const r = new roleAccessActions(page);

            // (1) Baseline — Edit is live (blue) while the permission is held.
            const before = await readEditState(page, 'baseline');
            expect(before.present,
                `the Edit control is not on "${SUPPLIER_NAME}" at all — this scenario is about it being `
                + 'enabled or greyed, so a missing control means the precondition does not hold')
                .toBeTruthy();
            expect(before.enabled,
                `Edit is already greyed out on "${SUPPLIER_NAME}" before the permission is removed — the `
                + `role may already lack "${PERMISSION}", so the rest would prove nothing`)
                .toBeTruthy();

            // (2) Remove the permission.
            const removed = await r.setRoleAccess(ROLE, PERMISSION, false);
            expect(removed,
                `"${PERMISSION}" was already unchecked on role ${ROLE} — nothing was removed, so step 3 `
                + 'cannot attribute a greyed button to this test').toBeTruthy();

            // (3) Still there, but greyed out — NOT hidden.
            const off = await readEditState(page, 'permission removed');
            expect(off.present,
                'the Edit control vanished entirely after removing the permission — expected it to remain '
                + 'and go grey, so either the UI changed or this scenario needs rewriting')
                .toBeTruthy();
            expect(off.enabled,
                `Edit is STILL enabled (${off.color}) after removing "${PERMISSION}" from role ${ROLE} — `
                + 'the supplier detail page does not honour the permission')
                .toBeFalsy();

            // (4) Put it back — the scenario's own restore, ahead of the safety net.
            expect(await r.setRoleAccess(ROLE, PERMISSION, true),
                `"${PERMISSION}" was unexpectedly already checked before the restore`).toBeTruthy();

            // (5) And Edit goes live again.
            const on = await readEditState(page, 'permission restored');
            expect(on.enabled,
                `Edit is still greyed (${on.color}) after restoring "${PERMISSION}" — the permission `
                + 'change did not take effect')
                .toBeTruthy();
        });
});
