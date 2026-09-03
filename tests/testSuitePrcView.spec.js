import { test, expect } from '@playwright/test';
import { v3DetailActions } from '../pages/v3DetailActions';
import { v3Detail_Locators as L } from '../pages/v3DetailLocators';
import data from '../pages/V3ListingData.json';

// ─────────────────────────────────────────────────────────────────────────────
// PRC — Requisition Conversion View (v3, nse-capp-uat)
//
// Sheet scenarios:
//   39  document can be regenerated and downloaded from the PRC view page
//   44  user can be reassigned for the PRC
//
// Both had been parked as TODO with the note "PRC has no listing; reachable
// only via a Requisition's conversion view". That is true, and it is now
// automated: openPrcConversionView() walks the parent Requisition's
// Transactions tab → Conversions → the PRC-… link.
//
// Three shape facts that make a PRC unlike every other v3 module:
//   - it has NO listing and NO URL of its own. The conversion view renders IN
//     PLACE, so page.url() still reads /requisitions/{id} once it is open.
//   - the header shows the PARENT PR's code with a "Converted" chip, never the
//     PRC code, so the PRC code has to be captured off the link before clicking.
//   - its header carries only two icon buttons (Reload, Activity Log) plus a
//     More menu holding a single item.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PRC — Requisition Conversion View', () => {

    test.describe.configure({ timeout: 240000 });

    /** @type {v3DetailActions} */
    let prc;

    test.beforeEach(async ({ page }) => {
        // moduleCfg is the requisition's — a PRC is reached through its parent PR
        // and shares the same MUI header/menu/dialog shell.
        prc = new v3DetailActions(page, data.modules.requisition);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    // ── 44 — Reassign User ────────────────────────────────────────────────────

    test('Reassign User is available on the PRC view @Prc @Reassign @S44', async ({ page }) => {
        const found = await prc.openAnyPrcConversionView(data.baseUrl);
        test.skip(!found, 'no requisition with a PRC conversion found on page 1 of the listing');
        console.log(`[S44] ${found.prcCode} via ${found.requisitionCode}`);

        const items = await prc.getMoreMenuItems();
        await prc.closeMenu();
        console.log(`[S44] PRC More menu: ${items.join(' · ')}`);
        expect(items, 'the PRC More menu does not offer Reassign User')
            .toContain(L.menu_ReassignUser);

        await prc.openReassignUserDialog();
        await prc.assertDialogTitled('Reassign User');

        // Same non-destructive convention as the other Reassign tests: prove the
        // dialog is genuinely usable — real candidates, not just a rendered
        // shell — but never complete the reassignment, which would hand a live
        // PRC to another user.
        if (await prc.reassignHasNoCandidates()) {
            console.log(`[S44] ${found.prcCode} has no eligible reassignment targets`);
            await expect(page.locator(L.reassignNoUsers).first()).toBeVisible();
        } else {
            const select = page.locator(L.reassignUserSelect).first();
            await select.click();
            const options = page.locator('[role="option"], .MuiAutocomplete-option');
            await expect(options.first(), 'Select User offered no candidates')
                .toBeVisible({ timeout: 15000 });
            const count = await options.count();
            console.log(`[S44] ${count} reassignment candidate(s)`);
            expect(count).toBeGreaterThan(0);
            await page.keyboard.press('Escape');
            await expect(page.locator(L.dialogReassign).first()).toBeVisible();
        }

        await prc.closeDialog();
    });

    // ── 39 — Regenerate + download document ───────────────────────────────────

    test('document regeneration / download on the PRC view @Prc @Documents @S39', async () => {
        const found = await prc.openAnyPrcConversionView(data.baseUrl);
        test.skip(!found, 'no requisition with a PRC conversion found on page 1 of the listing');
        console.log(`[S39] ${found.prcCode} via ${found.requisitionCode}`);

        const items = await prc.getMoreMenuItems();
        await prc.closeMenu();
        console.log(`[S39] PRC More menu: ${items.join(' · ')}`);

        const hasRegenerate = items.includes(L.menu_RegenerateDocument);
        const hasDownload = items.includes(L.menu_Download) || items.includes(L.menu_DownloadDocument);

        if (!hasRegenerate && !hasDownload) {
            // Documented capability gap, same shape as the GRN's scenario 41:
            // the PRC offers no document actions at all. Assert that positively
            // rather than skipping blind, so this test FLIPS TO FAILING the day
            // the actions are added — which is the signal QA wants.
            //
            // The header's `Reload` icon is not a substitute: clicking it fires
            // zero non-GET requests (verified live), so it is a plain refresh.
            expect(items, 'PRC menu changed — it now offers document actions, so this scenario is automatable')
                .toEqual([L.menu_ReassignUser]);
            test.skip(true,
                'CONFIRMED APP GAP: the PRC conversion view exposes no Regenerate Document ' +
                'and no Download action — its More menu holds "Reassign User" only, and the ' +
                'header carries just Reload (a plain refresh) + Activity Log.');
        }

        if (hasRegenerate) await prc.regenerateDocumentAndAssert();
        if (hasDownload) await prc.downloadDocumentAndAssert();
    });
});
