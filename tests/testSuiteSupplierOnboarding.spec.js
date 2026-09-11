import { test, expect } from '@playwright/test';
import { supplier_Locators as S } from '../pages/supplierLocators';
import { V3_BASE_URL } from '../pages/v3ListingActions';
import { supplierActions, SupplierStatus } from '../pages/supplierActions';
import fs from 'fs';

// Handover between the create test and the onboarding-form test.
const S97_STATE = '.s97-state.json';

// Throwaway supplier nominated by QA for the destructive block/unblock check.
const BLOCK_SUPPLIER = 'HG Automation';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier module — create, mandatory validation, onboarding, block
//
// Sheet scenarios:
//   101 supplier Create and Onboarding works in the CAPP flow
//   143 every mandatory field in the template triggers validation when blank
//   147 a supplier can be blocked and unblocked across configured entities
//
// Two traps found live (2026-08-31), both encoded here:
//  1. The Create Supplier form embeds a SunEditor rich-text control which
//     injects HIDDEN "Submit" buttons. An XPath text match resolves one of those
//     and the click does nothing — the form appears to accept an empty submit
//     silently. Targeting the real button by ROLE shows the validation working
//     correctly. Every button here goes through getByRole.
//  2. IFSC and GST — scenarios 140/141/103 — are NOT on this form, nor on the
//     supplier's Onboarding tab. They belong to the supplier-facing onboarding
//     form reached through the Supplier Portal, so those scenarios are not
//     covered here.
//
// 147 IS exercised for real (QA 2026-09-02): `HG Automation SUPP` is the
// designated throwaway supplier, so the test blocks it, asserts Blocked, then
// unblocks it and asserts the status reverts to Registered. It restores the
// supplier even when an assertion fails, so a red run does not leave a blocked
// supplier behind for the PO/quote suites.
//
// 97 IS exercised for real too (QA walked the steps on 2026-09-02): the suite
// creates a supplier, drives its 3-stage workflow to Submitted and sends the
// onboarding request. That DOES add a permanent record to UAT each run — named
// "HG Auto Supplier <timestamp>" so the ones automation made are obvious.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Supplier module', () => {

    test.describe.configure({ timeout: 180000 });

    async function openSupplierListing(page) {
        await page.setViewportSize({ width: 1800, height: 900 });
        await page.goto(`${V3_BASE_URL}${S.listingUrlPath}`, {
            waitUntil: 'domcontentloaded', timeout: 60000,
        });
        // The listing defaults to "My Pending Approval", which is often empty —
        // switch to All so the row assertions mean something.
        await page.locator(`xpath=${S.tabByName('All')}`).first().click();
        await page.waitForFunction(
            () => document.querySelectorAll('tbody tr').length > 0,
            null, { timeout: 30000 },
        );
        await page.waitForTimeout(1200);
    }

    /** href of the first supplier whose Registration Status matches, else null. */
    async function findSupplierHref(page, statusPattern) {
        return page.evaluate((pattern) => {
            const re = new RegExp(pattern, 'i');
            const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim());
            const si = ths.findIndex(h => h.startsWith('Registration Status'));
            if (si === -1) return null;
            for (const r of document.querySelectorAll('tbody tr')) {
                const td = r.querySelectorAll('td');
                const status = ((td[si] || {}).textContent || '').trim();
                if (!re.test(status)) continue;
                const a = r.querySelector('a');
                if (a) return a.getAttribute('href');
            }
            return null;
        }, statusPattern);
    }

    test('supplier listing loads with records @Supplier @Listing', async ({ page }) => {
        await openSupplierListing(page);
        expect(await page.locator(`xpath=${S.tableRows}`).count()).toBeGreaterThan(0);
        await expect(page.locator(`xpath=${S.addNewButton}`).first()).toBeVisible();
    });

    test('Create Supplier form opens with its sections @Supplier @Create @S97', async ({ page }) => {
        await openSupplierListing(page);

        await page.getByRole('button', { name: 'Add New' }).first().click();
        await page.waitForTimeout(4000);

        await expect(page.locator(`xpath=${S.createFormHeading}`).first()).toBeVisible();
        await expect(page.locator(`xpath=${S.sectionSupplierDetails}`).first()).toBeVisible();
        await expect(page.locator(`xpath=${S.sectionUserDetails}`).first()).toBeVisible();
    });

    test('empty Create Supplier submit is blocked and names every missing field @Supplier @Validation @S138', async ({ page }) => {
        await openSupplierListing(page);

        await page.getByRole('button', { name: 'Add New' }).first().click();
        await page.waitForTimeout(4000);
        await expect(page.locator(`xpath=${S.createFormHeading}`).first()).toBeVisible();

        // getByRole, NOT an XPath text match — see the SunEditor note above.
        await page.getByRole('button', { name: 'Submit', exact: true }).first().click();
        await page.waitForTimeout(2500);

        // Still on the form: an empty supplier must not be created.
        await expect(page.locator(`xpath=${S.createFormHeading}`).first()).toBeVisible();

        const messages = await page.locator(`xpath=${S.mandatoryMessages}`).allInnerTexts();
        const unique = [...new Set(messages.map(m => m.trim()))].filter(Boolean);
        console.log(`[SUPPLIER] mandatory errors: ${JSON.stringify(unique)}`);

        expect(unique.length, 'empty submit produced no "is Mandatory" messages').toBeGreaterThan(0);
        // Fields confirmed mandatory on this template.
        for (const field of ['Name', 'Payment Spoc', 'Alternate Supplier Name']) {
            expect(unique.some(m => m.startsWith(field)),
                `no mandatory message for "${field}" (got ${JSON.stringify(unique)})`).toBeTruthy();
        }
        // The User Details grid must demand at least one row.
        await expect(page.locator(`xpath=${S.atleastOneRowMessage}`).first()).toBeVisible();
    });

    test('a registered supplier exposes its Onboarding tab @Supplier @Onboarding @S97', async ({ page }) => {
        await openSupplierListing(page);

        // Onboarding only makes sense once the supplier is past intake.
        const href = await findSupplierHref(page, 'Registered');
        test.skip(!href, 'no Registered supplier on the first page');

        await page.goto(`${V3_BASE_URL}${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);

        const tab = page.locator(`xpath=${S.onboardingTab}`).first();
        await tab.waitFor({ state: 'visible', timeout: 30000 });
        await tab.click();
        await page.waitForTimeout(5000);

        // The tab must render the supplier's own details, not an empty shell.
        await expect(page.locator(`xpath=${S.sectionSupplierDetails}`).first())
            .toBeVisible({ timeout: 20000 });
    });

    /** Search the listing for `name` and return the matching row's href, else null. */
    async function searchSupplierHref(page, name) {
        const box = page.locator(`xpath=${S.searchInput}`).first();
        await box.click();
        await box.fill(name);
        // Server-side filter behind a debounce — wait for the grid to settle.
        await page.waitForTimeout(5000);
        return page.locator(`xpath=${S.rowLinkByName(name)}`).first()
            .getAttribute('href').catch(() => null);
    }

    /** Open More → item → type the remark → Submit, then let the page settle. */
    async function runMoreAction(page, item, remark) {
        await page.getByRole('button', { name: 'More' }).first().click();
        await page.waitForTimeout(1500);
        await page.locator(`xpath=${S.menuItem(item)}`).first().click();
        await page.waitForTimeout(3000);
        await page.locator(`xpath=${S.dialogRemarks}`).first().fill(remark);
        await page.locator(`xpath=${S.dialogSubmit}`).first().click();
        await page.waitForTimeout(8000);
    }

    /** Reload and read the registration status shown beside the supplier title. */
    async function readStatus(page) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        for (const s of ['Registered', 'Blocked', 'Pending Approval', 'Rejected', 'Draft']) {
            if (await page.locator(`xpath=${S.statusChip(s)}`).count()) return s;
        }
        return '(unknown)';
    }

    test('a supplier can be blocked and unblocked @Supplier @Block @S142', async ({ page }) => {
        test.setTimeout(240000);

        await openSupplierListing(page);

        const href = await searchSupplierHref(page, BLOCK_SUPPLIER);
        expect(href, `supplier "${BLOCK_SUPPLIER}" not found on the listing`).toBeTruthy();

        await page.goto(`${V3_BASE_URL}${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);

        const before = await readStatus(page);
        console.log(`[SUPPLIER] ${BLOCK_SUPPLIER} → ${href}, status before = ${before}`);
        expect(before, 'the block scenario starts from a Registered supplier').toBe('Registered');

        let blocked = false;
        try {
            // ── Block ────────────────────────────────────────────────────────
            await page.getByRole('button', { name: 'More' }).first().click();
            await page.waitForTimeout(1500);
            const menu = (await page.locator('li[role="menuitem"]').allInnerTexts()).map(i => i.trim());
            console.log(`[SUPPLIER] More menu (Registered): ${JSON.stringify(menu)}`);
            expect(menu, 'a Registered supplier offers no Block action').toContain('Block');

            await page.locator(`xpath=${S.menuItem('Block')}`).first().click();
            await page.waitForTimeout(3000);
            await expect(page.locator(`xpath=${S.blockDialogHeading}`).first()).toBeVisible();

            await page.locator(`xpath=${S.dialogRemarks}`).first()
                .fill('Blocked by automation — scenario 147');
            await page.locator(`xpath=${S.dialogSubmit}`).first().click();
            await page.waitForTimeout(8000);
            blocked = true;

            expect(await readStatus(page), 'status did not move to Blocked').toBe('Blocked');

            // While blocked the menu must offer Unblock instead of Block.
            await page.getByRole('button', { name: 'More' }).first().click();
            await page.waitForTimeout(1500);
            const blockedMenu = (await page.locator('li[role="menuitem"]').allInnerTexts()).map(i => i.trim());
            console.log(`[SUPPLIER] More menu (Blocked): ${JSON.stringify(blockedMenu)}`);
            expect(blockedMenu).toContain('Unblock');
            expect(blockedMenu).not.toContain('Block');

            // ── Unblock ──────────────────────────────────────────────────────
            await page.locator(`xpath=${S.menuItem('Unblock')}`).first().click();
            await page.waitForTimeout(3000);
            await expect(page.locator(`xpath=${S.unblockDialogHeading}`).first()).toBeVisible();

            await page.locator(`xpath=${S.dialogRemarks}`).first()
                .fill('Unblocked by automation — scenario 147');
            await page.locator(`xpath=${S.dialogSubmit}`).first().click();
            await page.waitForTimeout(8000);
            blocked = false;

            expect(await readStatus(page), 'status did not revert to Registered').toBe('Registered');
        } finally {
            // Never leave the shared supplier blocked, whatever failed above.
            if (blocked) {
                console.log('[SUPPLIER] test failed while blocked — restoring');
                await runMoreAction(page, 'Unblock', 'Automation cleanup — restoring supplier')
                    .catch(e => console.log(`[SUPPLIER] cleanup unblock failed: ${e.message}`));
            }
        }
    });

    // ── 97: create → approve → Send Onboarding (QA's steps, 2026-09-02) ───────
    //
    //   1. Supplier module from all modules   2. Create New
    //   3. all mandatory fields               4. Submit → workflow triggered
    //   5. approve till Submitted             6. Send Onboarding → keep the
    //                                            template → Submit
    //
    // Mandatory set, established by submitting the form empty and reading the
    // "<field> is Mandatory" messages: Name · Payment Spoc · Alternate Supplier
    // Name · NDA required? · at least one User Details row.
    //
    // CREATES A REAL SUPPLIER on every run. That is inherent to the scenario —
    // there is no draft mode — so the records are named "HG Auto Supplier
    // <timestamp>" to keep them identifiable.
    test('a supplier can be created, approved and sent for onboarding @Supplier @Create @Onboarding @S97', async ({ page }) => {
        test.setTimeout(600000);

        const s = new supplierActions(page);
        page.setDefaultTimeout(30000);

        // 1-3. create form → mandatory fields
        await s.openListing();
        await s.openCreateForm();
        const name = await s.fillMandatoryFields();

        // 4. Submit → the Workflow Summary popup confirms the 3 approval stages
        await s.submitCreateForm();
        await s.confirmWorkflowSummary();

        // The supplier must now exist on the listing.
        await s.openListing();
        const href = await s.findSupplierHref(name);
        expect(href, `"${name}" was not created`).toBeTruthy();
        const id = href.split('/').pop();

        await page.goto(`${V3_BASE_URL}${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(8000);
        const code = (await page.evaluate(() => {
            const m = document.body.innerText.match(/\(([A-Z]+-\d+-\d+)\)/);
            return m ? m[1] : null;
        }));
        expect(code, 'no supplier code on the detail page').toBeTruthy();
        console.log(`[S97] created ${code} (${name}) → ${href}`);

        expect(await s.readSupplierStatus(code),
            'a new supplier should start in the approval workflow').toBe('Pending Approval');

        // 5. approve every stage until Submitted
        const status = await s.approveUntilSubmitted(id, code, 'Approved by automation — scenario 97');
        console.log(`[S97] status after the workflow = ${status}`);
        expect(status, 'the workflow did not reach Submitted').toBe('Submitted');

        // 6. Send Onboarding, leaving the template as-is
        await expect(page.locator(`xpath=${S.sendOnboardingBtn}`).first(),
            'a Submitted supplier offers no Send Onboarding').toBeVisible();

        const { template, status: httpStatus } = await s.sendOnboarding();
        expect(template, 'the onboarding dialog pre-selected no template').toBeTruthy();
        expect(httpStatus, 'the onboarding request was rejected').toBeLessThan(300);

        const after = await s.readSupplierStatus(code);
        console.log(`[S97] status after Send Onboarding = ${after}`);
        expect(after, 'the supplier did not move to Requested').toBe('Requested');

        fs.writeFileSync(S97_STATE, JSON.stringify({ id, code, name }, null, 2));
    });

    // ── 97 continued: complete the Supplier Onboarding form ───────────────────
    //
    // QA (2026-09-02): "add all the details in the supplier onboarding form by
    // clicking the Update button. Wherever Yes/No options are there, select No,
    // fill all the fields, and submit the form."
    //
    // The mandatory set is NOT hard-coded — the form is submitted once empty and
    // the "<field> is Mandatory" messages drive the fill, so this keeps working
    // if the onboarding template changes. On FNSE-26-3035 that was 65 fields of
    // 98: 29 pickers, 31 text, 3 file uploads and 2 dates.
    //
    // Runs on the supplier the previous test created; set S97_SUPPLIER_ID to
    // re-run it against an existing Requested supplier instead.
    test('the supplier onboarding form can be completed and submitted @Supplier @Onboarding @S97 @S138', async ({ page }) => {
        test.setTimeout(900000);

        const state = process.env.S97_SUPPLIER_ID
            ? { id: process.env.S97_SUPPLIER_ID, code: process.env.S97_SUPPLIER_CODE || '' }
            : (fs.existsSync(S97_STATE) ? JSON.parse(fs.readFileSync(S97_STATE, 'utf8')) : null);
        test.skip(!state, 'no supplier from the create test and no S97_SUPPLIER_ID');

        const s = new supplierActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });
        page.setDefaultTimeout(30000);

        const result = await s.fillAndSubmitOnboardingForm(state.id);
        console.log(`[S97] onboarding fill: ${JSON.stringify({
            mandatory: result.requested, pickers: result.autocomplete.length,
            text: result.text.length, dates: result.date.length, files: result.file.length,
            attachments: (result.attachments || []).length,
            skipped: result.skipped.length, http: result.httpStatus })}`);

        // ── Every attachment field must carry a file (QA, 2026-09-07) ─────────
        // The form has 4. This asserts the DISCOVERED set rather than the number,
        // so it still holds if the template gains a fifth, and it names any field
        // left empty instead of failing on a bare count.
        //
        // This is the check that would have caught the 2026-09-07 defect: `NDA` is
        // an attachment, but "Enter NDA" substring-matched the date input
        // "Enter NDA Start Date", so NDA was sent to the date picker, never
        // uploaded, and the submit was silently refused (http=null).
        const emptyAttachments = (result.attachments || []).filter(a => !a.hasFile).map(a => a.label);
        expect(emptyAttachments,
            `attachment fields left empty: ${JSON.stringify(emptyAttachments)}`).toEqual([]);
        expect((result.attachments || []).length,
            'expected at least the 4 known attachment fields on the onboarding form')
            .toBeGreaterThanOrEqual(4);

        // ── Sheet scenario 138 is satisfied here ──────────────────────────────
        // 138 asks that every mandatory field configured in the SUPPLIER
        // ONBOARDING template triggers validation when left blank. That is
        // exactly what pass 1 does: the form is submitted completely empty and
        // every "<field> is Mandatory" message is read back — 65 of them on this
        // template. The separate @S138 test above covers the CREATE SUPPLIER
        // template, which is a different template from the one 138 names.
        expect(result.requested,
            'submitting the onboarding form empty produced no mandatory-field validation (scenario 138)')
            .toBeGreaterThan(0);
        expect(result.skipped, `these mandatory fields could not be filled: ${JSON.stringify(result.skipped)}`)
            .toEqual([]);
        expect(result.remaining,
            `the form still reports missing fields after submit: ${JSON.stringify(result.remaining)}`)
            .toEqual([]);
        expect(result.httpStatus, 'the onboarding submit was rejected').toBeLessThan(300);

        // QA's rule: every Yes/No question must have been answered No.
        const yesNo = result.autocomplete.filter(a => /=(No|N)$/i.test(a));
        console.log(`[S97] Yes/No questions answered No: ${yesNo.length}`);
        expect(yesNo.length, 'no Yes/No question was answered').toBeGreaterThan(0);

        // ── Approve the onboarding through to Pending Sync (QA, 2026-09-07) ───
        // Submitting the form is not the end of the scenario: the onboarding has
        // its own approval stages, and clearing them all lands the supplier on
        // Pending Sync.
        //
        // PENDING SYNC IS THE END STATE ASSERTED HERE, on QA's instruction. The
        // step beyond it — Pending Sync → Registered — is driven by the downstream
        // integration, not by anything this test does, and it does not complete in
        // this UAT: FNSE-26-3040 was still "Pending Sync" minutes after all its
        // approvals cleared, so polling for Registered only ever burned the budget
        // and then failed on an environment dependency. That transition is sheet
        // scenario 141's subject, not 97's.
        // readSupplierStatus finds the status chip by the "(CODE)" beside the
        // title, so the code is required. S97_SUPPLIER_ID can be set without
        // S97_SUPPLIER_CODE, in which case read it off the detail page rather
        // than polling forever against an empty match.
        let code = state.code;
        if (!code) {
            await page.goto(`${V3_BASE_URL}/suppliers/${state.id}`,
                { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(8000);
            code = await page.evaluate(() => {
                const m = document.body.innerText.match(/\(([A-Z]+-\d+-\d+)\)/);
                return m ? m[1] : null;
            });
            expect(code, 'could not resolve the supplier code from the detail page').toBeTruthy();
            console.log(`[S97] resolved supplier code from the page: ${code}`);
        }

        const final = await s.approveUntilPendingSync(
            state.id, code, 'Onboarding approved by automation — scenario 97');
        console.log(`[S97] status after approving the onboarding = ${final}`);
        // Synced / Registered also pass — they mean the record moved PAST Pending
        // Sync, and failing on "it already progressed" would be a false negative.
        expect(final,
            `the onboarding approvals did not reach Pending Sync (ended at "${final}")`)
            .toMatch(SupplierStatus.PENDING_SYNC);
    });
});
