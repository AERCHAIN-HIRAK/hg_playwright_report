import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import { v3Detail_Locators as L } from '../pages/v3DetailLocators';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Cross-module document + reassignment coverage (v3 modules)
//
// Sheet scenarios:
//   41 Requisition · 42 PRC · 43 Purchase Order · 45 Invoice
//      → "document can be regenerated and downloaded from the view page"
//      (GRN retired by QA 2026-09-08 — confirmed capability gap)
//   46 Requisition · 47 PRC · 48 Purchase Order · 49 GRN · 50 Invoice
//      → "user can be reassigned"
//
// Merged into two parametrised describes rather than ten separate tests: all
// five modules share one header + "More" dropdown component, so the only real
// per-module variation is the menu label and which items are exposed.
//
// PRC (42/47) is covered separately — it has no top-level listing and is only
// reachable through a Requisition's conversion view.
//
// Assertions deliberately target the network call, not a toast: Regenerate
// Document produces no visible confirmation in this build (verified live
// 2026-08-31), it only fires POST .../regenerate-document.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: `scenario` here is this file's own older numbering, which is offset from
// the master sheet in this range — the GRN document pair was sheet row 41, not 44.
//
// The GRN entry was REMOVED on 2026-09-08: QA retired that scenario after it was
// confirmed a capability gap (the GRN "More" menu exposes only "Reassign User" —
// no Regenerate Document, no Download). GRN reassignment is unaffected and still
// runs below.
const DOC_MODULES = [
    { key: 'requisition',   scenario: 41 },
    { key: 'purchaseOrder', scenario: 43 },
    { key: 'invoice',       scenario: 45 },
].map(m => ({ ...data.modules[m.key], scenario: m.scenario }));

const REASSIGN_MODULES = [
    { key: 'requisition',   scenario: 46 },
    { key: 'purchaseOrder', scenario: 48 },
    { key: 'grn',           scenario: 49 },
    { key: 'invoice',       scenario: 50 },
].map(m => ({ ...data.modules[m.key], scenario: m.scenario }));

// Statuses where a transaction is still in flight, so reassignment has
// candidates. A Completed/Cancelled record legitimately reports "No users
// are available to be reassigned".
const ACTIVE_STATUSES = [
    'Submitted', 'Pending Approval', 'Partially Processed', 'Processed',
    'Active', 'Pending Sync', 'To-review', 'To-enrich', 'Draft',
];

test.describe('Cross-module — Regenerate + Download Document', () => {

    test.describe.configure({ timeout: 150000 });

    for (const mod of DOC_MODULES) {

        test(`${mod.name}: Regenerate Document succeeds from the view page @CrossModule @Document @S${mod.scenario}`, async ({ page }) => {
            const detail = new v3DetailActions(page, mod);
            await page.setViewportSize({ width: 1800, height: 900 });

            const code = await detail.openFirstTransactionFromListing(data.baseUrl);
            console.log(`[${mod.name}] opened ${code}`);

            const items = await detail.getMoreMenuItems();
            await detail.closeMenu();
            test.skip(
                !items.includes(L.menu_RegenerateDocument),
                `${mod.name} exposes no "Regenerate Document" action (menu: ${items.join(', ')})`,
            );

            await detail.regenerateDocumentAndAssert();
        });

        test(`${mod.name}: Download Document returns a non-empty file @CrossModule @Document @S${mod.scenario}`, async ({ page }) => {
            const detail = new v3DetailActions(page, mod);
            await page.setViewportSize({ width: 1800, height: 900 });

            const code = await detail.openFirstTransactionFromListing(data.baseUrl);
            console.log(`[${mod.name}] opened ${code}`);

            const items = await detail.getMoreMenuItems();
            await detail.closeMenu();
            const hasDownload = items.includes(L.menu_Download) || items.includes(L.menu_DownloadDocument);
            test.skip(!hasDownload, `${mod.name} exposes no download action (menu: ${items.join(', ')})`);

            // Regenerate first so a current document is guaranteed to exist.
            if (items.includes(L.menu_RegenerateDocument)) {
                await detail.regenerateDocumentAndAssert();
            }

            const file = await detail.downloadDocumentAndAssert();
            expect(file, 'no download was produced').not.toBeNull();
            console.log(`[${mod.name}] document via ${file.via}: ${file.name} (${file.size} bytes)`);
        });
    }
});

test.describe('Cross-module — Reassign User', () => {

    test.describe.configure({ timeout: 150000 });

    for (const mod of REASSIGN_MODULES) {

        test(`${mod.name}: Reassign User dialog opens from the view page @CrossModule @Reassign @S${mod.scenario}`, async ({ page }) => {
            const detail = new v3DetailActions(page, mod);
            await page.setViewportSize({ width: 1800, height: 900 });

            // Prefer an in-flight transaction so the dialog has real candidates.
            let code = await detail.openFirstTransactionWithStatus(ACTIVE_STATUSES, data.baseUrl);
            if (!code) code = await detail.openFirstTransactionFromListing(data.baseUrl);
            console.log(`[${mod.name}] opened ${code}`);

            const items = await detail.getMoreMenuItems();
            await detail.closeMenu();
            test.skip(
                !items.includes(L.menu_ReassignUser),
                `${mod.name} exposes no "Reassign User" action (menu: ${items.join(', ')})`,
            );

            await detail.openReassignUserDialog();
            await detail.assertDialogTitled('Reassign User');

            if (await detail.reassignHasNoCandidates()) {
                // Valid terminal state — record it rather than silently passing.
                console.log(`[${mod.name}] ${code} has no eligible reassignment targets`);
                await expect(page.locator(L.reassignNoUsers).first()).toBeVisible();
            } else {
                await expect(page.locator(L.dialogReassign).first()).toBeVisible();
            }

            await detail.closeDialog();
        });
    }
});
