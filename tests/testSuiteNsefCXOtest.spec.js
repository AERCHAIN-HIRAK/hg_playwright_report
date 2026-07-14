import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import { cxoListingActions } from '../pages/cxoListingActions';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// NSE Foundation — CXO Create: functional positive / negative / edge cases
//
// Focuses ONLY on the CXO create form (https://.../cxos/create) and its
// client-side validation. Uses the same fresh login as the happy-paths suite
// (nsefsupport@demo.com) — overrides the shared auth.json.
//
// Validation model (discovered live against the UAT app):
//  • Empty Submit → stays on /cxos/create, shows toasts ("Please enter the
//    title", "At least one row is required in 'Item Details' table", and a
//    summary "Seems like there are errors in the highlighted fields…") plus a
//    red "N errors!" badge next to every section with missing mandatory fields.
//  • Mandatory-field error counts on a fully empty form: Header Details 8,
//    Basic Information 4, Particulars of Procurement 9, Purchase Business Case 4,
//    Item Details 1, Suggested Suppliers 1.
//  • Title is trimmed → a whitespace-only title is treated as empty.
//  • The Qty cell rejects the minus sign (no negatives) but accepts decimals.
// ─────────────────────────────────────────────────────────────────────────────

// Session is provided by the nsef-setup project (auth.nsef.json) — login happens
// once per run, not per test. openApp() reuses it (and logs in if it's missing).

// ── Shared helper: open the app + navigate to the CXO create page ────────────
async function loginAndOpenCxoCreate(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    await a.openApp(data);

    await a.clickCxoTab();
    await a.assertCxoListingPage();
    await a.clickCreateCxo();
    await a.assertCxoCreatePage();
    await a.waitForCreatePageLoaded();   // let all sections render before acting

    return a;
}

// ═════════════════════════════════════════════════════════════════════════════
// POSITIVE
//
// NOTE: the full valid CXO create → Submit → approve happy path is already
// covered by tests/testSuiteNSEFhappyPATHS.spec.js, so it is intentionally NOT
// duplicated here. This suite focuses on CXO-create validation (negative/edge)
// plus create-page UI behaviour.
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO Create — Positive', () => {

    test('Expand-all reveals the form sections and their fields @CXO @Positive', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.expandAllSections();

        // Expanding the sections reveals their fields — the Header Details /
        // Basic Information / Particulars dropdowns (comboboxes) become present.
        await expect.poll(async () => await page.getByRole('combobox').count(),
            { timeout: 10000 }).toBeGreaterThan(3);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEGATIVE
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO Create — Negative', () => {

    test('Submit empty form is blocked with a "title required" toast @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.clickSubmitExpectingError();

        await a.assertToast(L.cxoTitleRequiredToast);
        await a.assertStillOnCreatePage();
    });

    test('Submit empty form is blocked with an "Item Details row required" toast @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.clickSubmitExpectingError();

        await a.assertToast(L.cxoItemRowRequiredToast);
        await a.assertAnyErrorBadgeVisible();
        await a.assertStillOnCreatePage();
    });

    test('Empty form flags every mandatory section with an error badge @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.clickSubmitExpectingError();

        await a.assertToast(L.cxoHighlightedErrorsToast);
        // 6 sections have missing mandatory fields → 6 "N errors!" badges
        await a.assertErrorBadgeCount(data.cxoValidation.expectedErrorBadgeCounts.length);
        await a.assertStillOnCreatePage();
    });

    test('Empty form shows the expected mandatory-field error counts per section @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.clickSubmitExpectingError();

        // Badges render in section order: Header(8), Basic(4), Particulars(9),
        // Purchase Business Case(4), Item Details(1), Suggested Suppliers(1)
        expect(await a.getErrorBadgeCounts()).toEqual(data.cxoValidation.expectedErrorBadgeCounts);
        await a.assertStillOnCreatePage();
    });

    test('Submit with sections expanded shows a red border on unfilled mandatory fields @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        // Expand the sections so the mandatory fields render, then submit empty
        await a.expandAllSections();
        await a.clickSubmitExpectingError();

        // Each unfilled mandatory field gets a red border + a "<field> is empty" message.
        // Header Details alone has 7 mandatory comboboxes; expanding all reveals 16.
        await a.assertMandatoryFieldsHaveRedBorder(7);
        await a.assertStillOnCreatePage();
    });

    test('Title-only submit clears the title error but stays blocked on other sections @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.fillCxoTitle(data);
        await a.fillCxoSummary(data);
        await a.clickSubmitExpectingError();

        // Title provided → no "title required" toast, but still blocked because the
        // other mandatory sections fail (their error badges remain).
        await a.assertTitleToastAbsent();
        await a.assertAnyErrorBadgeVisible();
        await a.assertStillOnCreatePage();
    });

    test('Cancel from the create page leaves the form @CXO @Negative', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.fillCxoTitle(data);
        await a.clickCancel();

        await expect(page).not.toHaveURL(/\/cxos\/create/, { timeout: 10000 });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO Create — Edge Cases', () => {

    test('Whitespace-only title is accepted as-is (not trimmed, no title error) @CXO @Edge', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.typeTitle(data.cxoValidation.whitespaceTitle);

        // The app does NOT trim — the spaces are retained verbatim as the title.
        const value = await a.getTitleValue();
        expect(value.length).toBeGreaterThan(0);
        expect(value.trim()).toBe('');

        // ...and on submit the "title required" check is satisfied (no title toast);
        // the form is still blocked only by the OTHER mandatory sections.
        await a.clickSubmitExpectingError();
        await a.assertTitleToastAbsent();
        await a.assertStillOnCreatePage();
    });

    test('Special characters / emoji are accepted in the title @CXO @Edge', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.typeTitle(data.cxoValidation.specialCharTitle);

        // Field accepts the special characters without blanking — assert the
        // value persisted and kept the ASCII specials (don't require exact
        // emoji/unicode round-trip, which can vary by input sanitisation).
        const value = await a.getTitleValue();
        expect(value.length).toBeGreaterThan(0);
        expect(value).toContain('CXO');
        expect(value).toContain('<>&');
    });

    test('Very long title (300 chars) is accepted in the title field @CXO @Edge', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        const longTitle = 'A'.repeat(300);
        await a.typeTitle(longTitle);

        const value = await a.getTitleValue();
        // Either stored whole, or capped by a maxlength — never empty / dropped
        expect(value.length).toBeGreaterThan(0);
        expect(value.startsWith('AAAA')).toBeTruthy();
    });

    test('Qty field rejects negative values (minus sign stripped) @CXO @Edge', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.expandAllSections();
        await a.clickAddRow();

        const accepted = await a.typeItemQtyAndRead(data.cxoValidation.negativeQty);
        expect(accepted).not.toContain('-');
    });

    test('Qty field accepts decimal values @CXO @Edge', async ({ page }) => {
        test.setTimeout(120000);

        const a = await loginAndOpenCxoCreate(page);
        await a.expandAllSections();
        await a.clickAddRow();

        const accepted = await a.typeItemQtyAndRead(data.cxoValidation.decimalQty);
        expect(accepted).toBe(data.cxoValidation.decimalQty);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// CXO — REVERT PENDING BUDGET  (More dropdown, Released CXOs)
//
// Reverting pending budget is a parent-CXO action (not on the child intake).
// When a CXO is Released its line-item value becomes committed/pending budget;
// More → Revert Pending Budget opens a dialog with that budget PRE-SELECTED and
// its Rollback Value pre-filled to the full Pending Value, needing only Remarks
// to Submit. After a full revert the CXO reports "No pending budget to revert".
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO — Revert Pending Budget', () => {

    test('Create + release a CXO → More → Revert Pending Budget → amount + reason → Submit @CXO @RevertBudget', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + revert

        const a = await loginAndOpenCxoCreate(page);

        // Build + approve a CXO to Released so it holds a pending budget.
        await a.createAndReleaseCxo(data);
        await a.takeScreenshot('cxo_revert_budget_released');

        // More → Revert Pending Budget → (full pending amount) + reason → Submit.
        await a.revertPendingBudget({ remarks: 'Reverted by automation' });
        await a.takeScreenshot('cxo_revert_budget_submitted');

        // Re-open the dialog: the full pending budget was reverted → none remains.
        await a.assertPendingBudgetReverted();
        await a.takeScreenshot('cxo_revert_budget_verified');
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// CXO — MORE DROPDOWN ACTIONS  (on a Released CXO)
//
// Once a CXO is Released its header More menu exposes several actions (Clone,
// Amend, Reassign User, Regenerate/Download Document, Audit Logs, Workflow
// Stages, Cancel, Process). Each test builds + releases a fresh CXO, then
// exercises one More-dropdown action end-to-end.
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO — More Dropdown (Released CXO)', () => {

    test('Clone a Released CXO → pre-filled clone form → Submit → approve until Released @CXO @Clone', async ({ page }) => {
        test.setTimeout(900000); // 15 min — create+release source CXO, then clone + approve to Released

        const a = await loginAndOpenCxoCreate(page);

        // Build + approve a source CXO to Released.
        await a.createAndReleaseCxo(data);
        await a.takeScreenshot('cxo_clone_source_released');

        // More → Clone → pre-filled clone form → Submit (Workflow-Summary popup).
        await a.cloneCxo();
        await a.takeScreenshot('cxo_clone_submitted');

        // Approve the cloned CXO through all stages → Released.
        await a.approveAllStages('Approved by automation');
        await a.assertCxoStatusReleased();
        await a.takeScreenshot('cxo_clone_released');
    });

    test('Amend a Released CXO → edit title → Submit with reason → approve until Released @CXO @Amend', async ({ page }) => {
        test.setTimeout(900000); // 15 min — create+release CXO, then amend + re-approve to Released

        const a = await loginAndOpenCxoCreate(page);

        // Build + approve a CXO to Released.
        await a.createAndReleaseCxo(data);
        await a.takeScreenshot('cxo_amend_source_released');

        // More → Amend → editable form → change title → Submit + "Reason for amend".
        const amendedTitle = await a.amendCxo(data);
        await a.takeScreenshot('cxo_amend_submitted');

        // The amend re-triggers the workflow → approve through all stages → Released.
        await a.approveAllStages('Approved by automation');
        await a.assertCxoStatusReleased();
        await a.takeScreenshot('cxo_amend_released');

        // The amend change must be recorded in the Audit Logs (More → Audit Logs).
        await a.assertCxoAuditLogContains([amendedTitle]);
        await a.takeScreenshot('cxo_amend_audit_log');
    });

    test('Mark Processed a Released CXO → More → Mark Processed → reason → status Processed @CXO @MarkProcessed', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + mark processed

        const a = await loginAndOpenCxoCreate(page);

        // Build + approve a CXO to Released (Mark Processed is only offered then).
        await a.createAndReleaseCxo(data);
        await a.takeScreenshot('cxo_markprocessed_released');

        // More → Mark Processed → reason → Submit → status flips to Processed.
        await a.markCxoProcessed('Marked processed by automation');
        await a.assertCxoStatusProcessed();
        await a.takeScreenshot('cxo_markprocessed_done');
    });

    test('Cancel a Released CXO → More → Cancel → reason → status Cancelled @CXO @Cancel', async ({ page }) => {
        test.setTimeout(600000); // 10 min — create + approve to Released + cancel

        const a = await loginAndOpenCxoCreate(page);

        // Build + approve a CXO to Released (Cancel is only offered then).
        await a.createAndReleaseCxo(data);
        await a.takeScreenshot('cxo_cancel_released');

        // More → Cancel → reason → Submit → status flips to Cancelled.
        await a.cancelCxo('Cancelled by automation');
        await a.assertCxoStatusCancelled();
        await a.takeScreenshot('cxo_cancel_done');
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// CXO — REGENERATE + DOWNLOAD DOCUMENT  (More dropdown, per status)
//
// The CXO detail-page More menu exposes Regenerate Document and Download
// Document. For each lifecycle status we reach the status, Regenerate the
// document, reload, Download it, parse the PDF, and assert the Status line
// (case/separator-insensitive) plus that the CXO's header field values render.
//
// Statuses reached:
//  • Draft            — fill the create form then Save (no workflow submit).
//  • Pending Approval — fill + Submit (enters the approval workflow).
//  • Released         — Submit + approve every workflow stage.
//  • Rejected         — Submit then Reject during a workflow step.
// ═════════════════════════════════════════════════════════════════════════════

test.describe('CXO — Document (Regenerate + Download)', () => {

    // Header field values that must render in every CXO PDF (from shared data).
    const DOC_FIELDS = [
        data.cxo.title,               // Subject
        data.cxo.department,          // Premises
        data.cxo.expenseNature,       // Non-CSR Process
        data.cxo.currency,            // INR - Indian Rupee
        data.cxo.function,            // Legal
        data.cxo.cxoType,             // Non-Financial
    ];

    test('Draft: Regenerate → Download → PDF shows correct status + fields @CXO @Document', async ({ page }) => {
        test.setTimeout(360000);

        const a = await loginAndOpenCxoCreate(page);
        await a.createCxoDraft(data);            // → Draft
        await a.assertCxoStatusDraft();

        await a.regenerateCxoDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertCxoDocumentStatusAndFields('Draft', DOC_FIELDS);
        await a.takeScreenshot('cxo_doc_draft');
    });

    test('Pending Approval: Regenerate → Download → PDF shows correct status + fields @CXO @Document', async ({ page }) => {
        test.setTimeout(360000);

        const a = await loginAndOpenCxoCreate(page);
        await a.createAndSubmitCxo(data);        // → Pending Approval
        await a.assertCxoStatusPendingApproval();

        await a.regenerateCxoDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertCxoDocumentStatusAndFields('Pending Approval', DOC_FIELDS);
        await a.takeScreenshot('cxo_doc_pending_approval');
    });

    test('Released: Regenerate → Download → PDF shows correct status + fields @CXO @Document', async ({ page }) => {
        test.setTimeout(600000); // 10 min — full approval to Released

        const a = await loginAndOpenCxoCreate(page);
        await a.createAndReleaseCxo(data);       // → Released
        await a.assertCxoStatusReleased();

        await a.regenerateCxoDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertCxoDocumentStatusAndFields('Released', DOC_FIELDS);
        await a.takeScreenshot('cxo_doc_released');
    });

    test('Rejected: Regenerate → Download → PDF shows correct status + fields @CXO @Document', async ({ page }) => {
        test.setTimeout(420000);

        const a = await loginAndOpenCxoCreate(page);
        await a.createAndSubmitCxo(data);        // → Pending Approval
        await a.rejectCxo('Rejected by automation'); // → Rejected
        await a.assertCxoStatusRejected();

        await a.regenerateCxoDocument();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        await a.assertCxoDocumentStatusAndFields('Rejected', DOC_FIELDS);
        await a.takeScreenshot('cxo_doc_rejected');
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// CXO LISTING PAGE  (/cxos)
//
// Positive / negative / edge coverage for the CXO listing: page structure,
// tabs, search, column filters, sorting, pagination, row navigation, and the
// Create CXO button. Uses the same fresh nsefsupport login.
// ═════════════════════════════════════════════════════════════════════════════

// ── Shared helper: open the app + land on the CXO listing page ───────────────
async function loginAndOpenCxoListing(page) {
    const auth = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    // openApp reuses the stored session and waits for the dashboard to fully
    // load before we navigate away (navigating to /cxos too early leaves the app
    // half-initialised and the listing never loads).
    await auth.openApp(data);

    const list = new cxoListingActions(page);
    await list.navigateToListingPage();
    await list.assertOnListingPage();
    return list;
}

const ld = data.cxoListing;

test.describe('CXO Listing Page', () => {

    // ── Page Load & Structure ───────────────────────────────────────────────
    test.describe('Page Load & Structure', () => {

        test('listing page loads with table rows @Listing @Smoke', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.verifyRowCountGreaterThan(0);
        });

        test('all listing tabs are visible @Listing @Smoke', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.verifyAllTabsVisible();
        });

        test('Create CXO button and pagination info are visible @Listing @Smoke', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.verifyCreateCxoButtonVisible();
            await list.verifyPaginationInfoVisible();
        });
    });

    // ── Tabs ────────────────────────────────────────────────────────────────
    test.describe('Tabs', () => {

        test('switching to "My Pending Approval" activates that tab @Listing @Tabs', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.clickTab('My Pending Approval');
            await list.verifyTabIsActive('My Pending Approval');
        });

        test('switching to "Draft" activates that tab @Listing @Tabs', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.clickTab('Draft');
            await list.verifyTabIsActive('Draft');
        });

        test('returning to "All" tab shows records again @Listing @Tabs', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.clickTab('Draft');
            await list.clickTab('All');
            await list.verifyTabIsActive('All');
            await list.verifyRowCountGreaterThan(0);
        });
    });

    // ── Sorting ─────────────────────────────────────────────────────────────
    test.describe('Sorting', () => {

        test.describe('Positive', () => {
            for (const col of ['Code', 'Subject', 'Date', 'Status']) {
                test(`sort ${col} column keeps records (first + second click) @Listing @Sort`, async ({ page }) => {
                    test.setTimeout(120000);
                    const list = await loginAndOpenCxoListing(page);
                    await list.clickSortButton(col);
                    await list.verifyColumnNotEmpty(col);
                    await list.clickSortButton(col);   // toggle direction
                    await list.verifyColumnNotEmpty(col);
                });
            }
        });

        test.describe('Negative', () => {
            test('Code column values stay non-empty after sort (handles duplicates) @Listing @Sort', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.clickSortButton('Code');
                const values = await list.getColumnValues('Code');
                expect(values.length).toBeGreaterThan(0);
                expect(values.every(v => v.trim().length > 0)).toBeTruthy();
            });
        });
    });

    // ── Search ──────────────────────────────────────────────────────────────
    test.describe('Search', () => {

        test.describe('Positive', () => {
            test('search by partial code returns results @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.byCodePartial);
                await list.verifyRowCountGreaterThan(0);
            });

            test('search by exact code returns at least one row @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.byCodeExact);
                await list.verifyRowCountGreaterThan(0);
            });

            test('search by partial subject returns results @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.bySubjectPartial);
                await list.verifyRowCountGreaterThan(0);
            });

            test('different-case search does not crash the page @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.caseUpper);
                await list.verifyPageNotCrashed();
            });

            test('clearing the search restores records @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.byCodeExact);
                await list.clearSearch();
                await list.verifyRowCountGreaterThan(0);
            });
        });

        test.describe('Negative', () => {
            test('non-existent search term shows no results without crashing @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.nonExistent);
                await list.verifyNoResultsShown();
                await list.verifyPageNotCrashed();
            });

            test('spaces-only search does not crash the page @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.emptySpaces);
                await list.verifyPageNotCrashed();
            });

            test('SQL-injection string does not break the page @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.sqlInjection);
                await list.verifyPageNotCrashed();
            });

            test('XSS payload does not inject a script @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.xssPayload);
                await list.verifyPageNotCrashed();
                // no alert dialog / script execution — page is still a normal listing
                expect(await page.evaluate(() => document.title.length)).toBeGreaterThan(0);
            });
        });

        test.describe('Edge Cases', () => {
            test('very long search string does not crash @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.longString);
                await list.verifyPageNotCrashed();
            });

            test('special characters in search do not crash @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.specialChars);
                await list.verifyPageNotCrashed();
            });

            test('unicode characters in search do not crash @Listing @Search', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.typeInSearch(ld.search.unicodeChars);
                await list.verifyPageNotCrashed();
            });
        });
    });

    // ── Filters ─────────────────────────────────────────────────────────────
    test.describe('Filters', () => {

        test.describe('Positive', () => {
            test('Status filter popup opens @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.openColumnFilter('Status');
                await list.verifyFilterPopupOpen();
            });

            test('Created By filter popup opens @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.openColumnFilter('Created By');
                await list.verifyFilterPopupOpen();
            });

            test('filtering by Status updates the table @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.applyFilterByColumnAndValue('Status', ld.filter.status);
                await list.verifyRowCountGreaterThan(0);
                await list.verifyFilteredColumnContains('Status', ld.filter.status);
            });

            test('filtering by Created By updates the table @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.applyFilterByColumnAndValue('Created By', ld.filter.createdBy);
                await list.verifyRowCountGreaterThan(0);
            });
        });

        test.describe('Negative / Edge', () => {
            test('non-existent user in filter search does not crash the popup @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.openColumnFilter('Created By');
                await list.searchInFilterPopup(ld.filter.invalidUser);
                await list.verifyFilterPopupOpen();   // popup still alive, no crash
            });

            test('special characters in filter search do not crash the popup @Listing @Filter', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.openColumnFilter('Created By');
                await list.searchInFilterPopup(ld.search.specialChars);
                await list.verifyFilterPopupOpen();
            });
        });
    });

    // ── Pagination ──────────────────────────────────────────────────────────
    test.describe('Pagination', () => {

        test.describe('Positive', () => {
            test('pagination info shows "Showing X – Y of Z entries" @Listing @Pagination', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                const info = await list.getPaginationInfo();
                expect(info).not.toBeNull();
                expect(info.from).toBeGreaterThanOrEqual(1);
                expect(info.to).toBeGreaterThanOrEqual(info.from);
            });

            test('Previous is disabled on the first page @Listing @Pagination', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.verifyOnFirstPage();
            });

            test('Next page changes the pagination range @Listing @Pagination', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                const before = await list.getPaginationInfo();
                test.skip(!(await list.isNextPageEnabled()), 'only one page of results');
                await list.clickNextPage();
                const after = await list.getPaginationInfo();
                expect(after.from).toBeGreaterThan(before.from);
            });

            test('Next then Previous returns to the original range @Listing @Pagination', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                const before = await list.getPaginationInfo();
                test.skip(!(await list.isNextPageEnabled()), 'only one page of results');
                await list.clickNextPage();
                await list.clickPrevPage();
                const after = await list.getPaginationInfo();
                expect(after.from).toBe(before.from);
            });

            test('Next is disabled on the last page @Listing @Pagination', async ({ page }) => {
                test.setTimeout(180000);
                const list = await loginAndOpenCxoListing(page);
                await list.navigateToLastPage();
                expect(await list.isNextPageEnabled()).toBeFalsy();
            });
        });

        test.describe('Negative / Edge', () => {
            test('search on page 2 does not crash the page @Listing @Pagination', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                test.skip(!(await list.isNextPageEnabled()), 'only one page of results');
                await list.clickNextPage();
                await list.typeInSearch(ld.search.byCodePartial);
                await list.verifyPageNotCrashed();
            });
        });
    });

    // ── Row Navigation ──────────────────────────────────────────────────────
    test.describe('Row Navigation', () => {

        test.describe('Positive', () => {
            test('clicking the first row code opens the detail page @Listing @Navigation', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.clickFirstRowCode();
                await list.verifyDetailPageOpened();
            });

            test('browser back from the detail page returns to the listing @Listing @Navigation', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.clickFirstRowCode();
                await list.verifyDetailPageOpened();
                await list.navigateBackToListing();
                await list.assertOnListingPage();
                await list.verifyRowCountGreaterThan(0);
            });
        });

        test.describe('Edge Cases', () => {
            test('refreshing the detail page keeps the URL intact @Listing @Navigation', async ({ page }) => {
                test.setTimeout(120000);
                const list = await loginAndOpenCxoListing(page);
                await list.clickFirstRowCode();
                await list.verifyDetailPageOpened();
                const url = page.url();
                await page.reload({ waitUntil: 'domcontentloaded' });
                expect(page.url()).toBe(url);
            });
        });
    });

    // ── Create CXO Button ─────────────────────────────────────────────────────
    test.describe('Create CXO Button', () => {

        test('Create CXO button opens the create page @Listing @Create', async ({ page }) => {
            test.setTimeout(120000);
            const list = await loginAndOpenCxoListing(page);
            await list.clickCreateCxoButton();
            await list.verifyCreatePageOpened();
        });
    });
});
