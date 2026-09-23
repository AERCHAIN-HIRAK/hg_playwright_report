import { expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Org Settings › User Management › Roles — the Access permission list.
//
// Captured live 2026-09-23. Everything here is DESTRUCTIVE: a role's Access list
// is shared state that every user and every other suite depends on, so each
// helper is written to be idempotent and the caller is expected to restore in a
// finally block rather than trusting the happy path to reach its last step.
//
// Notes that cost time to find:
//  • The admin UI is a SEPARATE SUBDOMAIN. The v4 gear opens it in a new tab, but
//    the session cookie is shared, so navigating straight to it works and avoids
//    juggling two tabs.
//  • "Edit Role" is an ARIA LABEL on an icon button, not button text — a text
//    match finds nothing.
//  • Searching "admin" returns THREE roles (Admin, NSE Admin, Non Admin Role), so
//    the row has to be matched on the name starting the row, not on containment.
//  • The Access control is a MUI multi-select; its options are [role=option] with
//    a checkbox inside. All 31 were checked for Admin at the time of writing.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_BASE = 'https://nse-capp-admin-uat.aerchain.io';

export class roleAccessActions {

    constructor(page) { this.page = page; }

    async openRoles() {
        await this.page.goto(`${ADMIN_BASE}/user-management/roles`,
            { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.page.waitForTimeout(8000);
        await expect(this.page.getByPlaceholder('Search').first())
            .toBeVisible({ timeout: 20000 });
        console.log('[ROLE] Opened Org Settings › User Management › Roles');
    }

    async searchRole(term) {
        const box = this.page.getByPlaceholder('Search').first();
        await box.fill(term);
        await this.page.waitForTimeout(5000);
        console.log(`[ROLE] Searched roles for "${term}"`);
    }

    /** Open the editor for the role whose NAME is exactly `name`.
     *  The rows carry no test id, so the Edit Role icon is chosen by walking up to
     *  the first ancestor with text and requiring that text to START with the name
     *  — "Admin" must not match "NSE Admin" or "Non Admin Role". */
    async openRoleEditor(name) {
        const idx = await this.page.evaluate((roleName) => {
            const btns = [...document.querySelectorAll('button[aria-label="Edit Role"]')];
            return btns.findIndex((b) => {
                let n = b;
                for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
                    const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
                    if (t.length > 5) return t.startsWith(roleName);
                }
                return false;
            });
        }, name);
        expect(idx, `no role row whose name starts with "${name}"`).toBeGreaterThan(-1);
        await this.page.locator('button[aria-label="Edit Role"]').nth(idx).click();
        await expect(this.page.getByRole('button', { name: 'Update', exact: true }).first())
            .toBeVisible({ timeout: 20000 });
        console.log(`[ROLE] Opened the editor for role "${name}"`);
    }

    /** Open the ACCESS multi-select and leave its listbox on screen.
     *  The drawer has two comboboxes and the second one holds collaborator scopes,
     *  so the right one is identified by what its listbox actually offers rather
     *  than by position. */
    async openAccessDropdown() {
        const combos = this.page.locator('[role="combobox"]');
        const n = await combos.count();
        for (let i = 0; i < n; i++) {
            await combos.nth(i).click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(2500);
            const hasAccessOptions = await this.page
                .locator('[role="option"]', { hasText: 'All Access' }).first()
                .isVisible({ timeout: 3000 }).catch(() => false);
            if (hasAccessOptions) {
                console.log(`[ROLE] Access dropdown open (combobox ${i})`);
                return;
            }
            await this.page.keyboard.press('Escape').catch(() => {});
            await this.page.waitForTimeout(1200);
        }
        throw new Error('[ROLE] could not find the Access dropdown — no combobox offered "All Access"');
    }

    /** Whether an access option is currently ticked. Reads the checkbox, falling
     *  back to aria-selected. Requires the dropdown to be open. */
    async isAccessChecked(label) {
        const state = await this.page.evaluate((text) => {
            const opt = [...document.querySelectorAll('[role="option"]')]
                .find(o => (o.innerText || '').replace(/\s+/g, ' ').trim() === text);
            if (!opt) return null;
            const cb = opt.querySelector('input[type=checkbox]');
            return cb ? cb.checked : opt.getAttribute('aria-selected') === 'true';
        }, label);
        expect(state, `access option "${label}" is not in the dropdown`).not.toBeNull();
        return state;
    }

    /** Tick or untick an access option, verifying the new state. Idempotent, which
     *  is what makes it safe to call from a restore path that may or may not be
     *  needed. Returns true when it actually changed something. */
    async setAccessChecked(label, want) {
        const before = await this.isAccessChecked(label);
        if (before === want) {
            console.log(`[ROLE] "${label}" already ${want ? 'checked' : 'unchecked'} — no change`);
            return false;
        }
        const opt = this.page.locator('[role="option"]')
            .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
        await opt.scrollIntoViewIfNeeded().catch(() => {});
        await opt.click();
        await this.page.waitForTimeout(1500);
        const after = await this.isAccessChecked(label);
        expect(after, `clicking "${label}" did not change it to ${want}`).toBe(want);
        console.log(`[ROLE] "${label}" ${want ? 'CHECKED' : 'UNCHECKED'}`);
        return true;
    }

    /** Dismiss the dropdown so the drawer's Update button is reachable. */
    async closeDropdown() {
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(1500);
        console.log('[ROLE] Closed the Access dropdown');
    }

    async clickUpdate() {
        const btn = this.page.getByRole('button', { name: 'Update', exact: true }).first();
        await btn.waitFor({ state: 'visible', timeout: 15000 });
        await btn.click();
        await this.page.waitForTimeout(5000);
        console.log('[ROLE] Clicked Update');
    }

    /** One full edit: open Roles, find the role, toggle one access option, save. */
    async setRoleAccess(roleName, label, want) {
        await this.openRoles();
        await this.searchRole('admin');
        await this.openRoleEditor(roleName);
        await this.openAccessDropdown();
        const changed = await this.setAccessChecked(label, want);
        await this.closeDropdown();
        if (changed) await this.clickUpdate();
        else console.log('[ROLE] nothing to save');
        return changed;
    }
}
