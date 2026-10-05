import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildRfxToForeclose } from '../pages/chainBuilders';
import { makeAwardAttachmentFiles } from '../pages/awardAttachments';
import data from '../pages/NSEFoundationData.json';
import { snapshotFixtures, restoreFixtures } from '../pages/fixtureGuard';

// ─────────────────────────────────────────────────────────────────────────────
// Award attachments carry forward to PR and PRC — sheet scenario 59
//
//   "Verify that attachments added in RFX award are carry forwarded to PR to PRC."
//
// QA's steps (2026-09-11): CXO → RFX → quote → foreclose → on the award page,
// SCROLL DOWN to the Attachment section and upload into its 3 asserted fields
// the award → approve it → check the auto-created PR carries the attachments →
// edit and submit the PR → check the auto-created PRC carries them too.
//
// THE FIELDS (found live 2026-09-11, rows 35-38):
//   Commercial Comparison | Vendor Quotes | Others   (Justification excluded,
//   QA 2026-09-21)
//
// TWO TRAPS, both encoded in the helpers:
//   · the award grid is VIRTUALISED. Before scrolling, the page exposes 6 file
//     inputs and one "Attachments" row, which reads as a single multi-file
//     control; after scrolling it exposes 21 and the real Attachment section.
//     Enumerating without scrolling describes a page that has not finished
//     existing — scrollAwardPageToBottom() first, always.
//   · there are TWO rows called "Justification" — a text row in the main grid
//     and an attachment row here — so a field must be resolved by label AND by
//     actually holding a file input, never by label alone.
//
// WHY ONE FILE PER FIELD
// ----------------------
// The award page shows only a COUNT ("Upload 1 File"), never a filename. Using
// the same file for every field would make the carry-forward check meaningless: "4
// files on the PR" could not be tied back to the field each came from. Each
// field gets a uniquely named copy and the PR/PRC assertions demand those exact
// names, so a carry-forward that drops or merges a field fails.
// ─────────────────────────────────────────────────────────────────────────────

// Award field -> PR field, per QA (2026-09-11). Only Justification is renamed;
// the PR calls it "Justification Att.". The duplicate "Justification Att." field
// that used to swallow this one was fixed by QA on 2026-09-11.
// JUSTIFICATION IS DELIBERATELY EXCLUDED (QA, 2026-09-21): the carry-forward is
// asserted on THREE fields, not four. Dropping it also retires the "two rows
// called Justification" trap documented above — the text row in the main grid
// can no longer be confused with the attachment row, because neither is used.
const AWARD_TO_PR = {
    'Commercial Comparison': 'Commercial Comparison',
    'Vendor Quotes': 'Vendor Quotes',
    'Others': 'Others',
};

/**
 * Fields whose uploaded file is NOT shown on the current PR/PRC view page.
 * Each attachment field under General Details lists its files as links, the
 * name truncated with "..." (verified live on PR 1327, 2026-10-05), so the
 * shown text must be a prefix of the exact file uploaded into THAT field.
 */
async function missingAttachments(pg, uploads) {
    await pg.waitForTimeout(8000);
    // Works on both layouts: the PR's General Details and the PRC's expanded
    // Rate Contract row. Find the label's text node, then climb to the nearest
    // small container that holds the file link(s).
    const shown = await pg.evaluate((labels) => Object.fromEntries(labels.map(l => {
        const links = [];
        for (const lab of [...document.querySelectorAll('*')]
            // VISIBLE only: the PR's Overview tab stays in the DOM (hidden) while
            // the PRC is shown, and would otherwise make the PRC check pass.
            .filter(e => e.children.length === 0 && e.textContent.trim() === l
                && e.getClientRects().length > 0)) {
            let box = lab.parentElement;
            for (let i = 0; i < 4 && box && !box.querySelector('a'); i++) box = box.parentElement;
            if (box && (box.innerText || '').length < 200) {
                links.push(...[...box.querySelectorAll('a')].map(x => x.textContent.trim()));
            }
        }
        return [l, links];
    })), Object.values(AWARD_TO_PR));
    console.log(`[S59] ${pg.url()} attachments: ${JSON.stringify(shown)}`);
    return Object.entries(AWARD_TO_PR).filter(([awardField, prField]) => {
        const file = uploads.find(u => u.field === awardField)?.name || '';
        return !(shown[prField] || []).some(t => t && file.startsWith(t.replace(/\.+$/, '')));
    }).map(([aw, pr]) => `${aw} -> ${pr}`);
}

let dataSnapshot = null;

test.describe('Award attachments → PR → PRC', () => {

    test.use({ actionTimeout: 20000, navigationTimeout: 60000 });

    test.beforeAll(() => { dataSnapshot = snapshotFixtures(); });
    test.afterAll(() => { restoreFixtures(dataSnapshot, { tag: 'S59' }); });

    // Un-held 2026-10-05 (QA): the hold was the PR submit being blocked by
    // "Budget Amount is exceeded" because the run REUSED a stored CXO whose
    // budget earlier runs had consumed (budget is consumed at PR submit). The
    // chain now builds a FRESH CXO each run, as S12 does.
    test('attachments uploaded on the award reach the PR and the PRC '
        + '@RFX @Award @Attachments @S59 @Slow', async ({ page }) => {
        test.setTimeout(3_600_000); // 60 min

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
        await a.openApp(data);

        const uploads = makeAwardAttachmentFiles();
        const names = uploads.map(u => u.name);
        console.log(`[S59] upload set: ${JSON.stringify(names)}`);

        // ── fresh CXO → Intake → RFX → quote → foreclose ────────────────────
        await buildRfxToForeclose(a, data);
        console.log(`[S59] fresh CXO ${a.getSavedCxoCode()}`);
        const rfxCode = a.getSavedSourcingEvent().code;
        console.log(`[S59] foreclosed RFX ${rfxCode}`);

        // ── Award page → the 4 attachment fields ────────────────────────────
        await a.clickAnalysisTab();
        await a.clickAwardButton();
        await a.fillAllocatedQuantity();
        await a.scrollAwardPageToBottom();          // mount the Attachment section

        const fields = await a.listAwardAttachmentRows();
        expect(fields.length,
            `expected 4 attachment fields on the award page, found ${fields.length}: `
            + JSON.stringify(fields.map(f => f.label)))
            .toBe(4);

        for (const u of uploads) await a.uploadAwardAttachment(u.field, u.file);
        // All four bytes are now actually in S3 (each upload awaited its PUT).
        // Give the form a moment to settle before committing the award.
        await page.waitForTimeout(4000);
        await a.takeScreenshot('s59_award_attachments');

        // ── Submit the award → approve it → auto PR ─────────────────────────
        await a.clickAwardButton();
        await a.submitWorkflowSummary();

        // Did the AWARD actually keep the files? "Upload 1 File" was client-side
        // text on an unsaved form; if the submit dropped them, any later "the PR
        // has no attachments" is a TEST failure, not a carry-forward defect.
        // Establishing this before blaming the product (the lesson of scenario 17).
        const awardAtt = await a.readAttachmentSections();
        console.log(`[S59] award retains files: ${awardAtt.hasAny} (counts ${JSON.stringify(awardAtt.counts)})`);

        await a.completeAwardApprovals('Approved by automation — scenario 59');
        await a.clickAwardBackArrow();
        await a.waitForRequisitionCode();
        await a.openRequisitionAndSaveCode();
        // openRequisitionAndSaveCode opens the PR in a NEW TAB and only captures
        // the code - this page is still the awards view. openSavedRequisition is
        // what actually navigates here, which is why buildAwardToPrSubmitted
        // calls it next. Checking attachments before this scanned the awards
        // page and "found 0/4" against a page that never had them.
        await a.openSavedRequisition(data);
        const prCode = a.getSavedRequisition()?.code ?? '(pr)';
        console.log(`[S59] auto-created PR: ${prCode} @ ${page.url()}`);
        await a.takeScreenshot('s59_pr');

        // Precondition: the award must actually hold the files, or nothing said
        // about carry-forward means anything (the lesson of scenario 17).
        expect(awardAtt.hasAny,
            'the award itself kept none of the uploaded files, so this run cannot judge '
            + 'carry-forward — the upload is what needs fixing, not the app')
            .toBe(true);

        // ── The PR while still DRAFT — informational only ───────────────────
        // Recorded, not asserted: carry-forward may legitimately land at submit.
        console.log(`[S59] PR (draft) missing: ${JSON.stringify(await missingAttachments(a.page, uploads))}`);

        // ── Edit + submit the PR → auto PRC ─────────────────────────────────
        await a.openSavedRequisition(data);
        // The MUI edit form intermittently takes >30s to render its date field
        // (run 5 died exactly there, after Edit was clicked and the URL changed).
        // One reload-and-retry rather than a longer global timeout, which would
        // slow every other suite that shares clickPrEdit.
        try {
            await a.clickPrEdit();
        } catch (e) {
            console.log(`[S59] PR edit form did not render — retrying once: ${e.message.split('\n')[0]}`);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(5000);
            await a.openSavedRequisition(data);
            await a.clickPrEdit();
        }
        await a.fillPrEffectiveFromDate();
        await a.fillPrEffectiveToDate(data);
        await a.selectPrPurchaseType(data);
        await a.selectPrInwardRequiredYes();
        await a.selectPrInwardMatchingQuantity();
        await a.submitPr();
        await a.assertPrSubmitted();
        await a.saveRequisitionCode();
        console.log('[S59] PR edited and submitted');

        // ── Carry-forward: the submitted PR, field by field ─────────────────
        await a.openSavedRequisition(data);
        const prMissing = await missingAttachments(a.page, uploads);
        console.log(`[S59] PR missing: ${JSON.stringify(prMissing)}`);

        // ── Carry-forward: the PRC ──────────────────────────────────────────
        // The submitted PR auto-processes into the PRC; the Conversions section
        // only exists once it has (same wait as buildToPoViaCapp).
        await a.waitForPrStatus(['Processed', 'Completed']);
        await a.openSavedRequisition(data);
        await a.clickPrTransactionsTab();
        await a.expandPrConversionsSection();
        await a.openPrcFromConversions();
        await a.expandPrcRateContractSection();   // the attachments live in this row
        await a.takeScreenshot('s59_prc');
        const prcMissing = await missingAttachments(a.page, uploads);
        console.log(`[S59] PRC missing: ${JSON.stringify(prcMissing)}`);

        expect(prMissing, 'these award attachments did not reach the PR').toEqual([]);
        expect(prcMissing, 'these award attachments did not reach the PRC').toEqual([]);

        console.log(`[S59] all ${Object.keys(AWARD_TO_PR).length} award attachments carried RFX ${rfxCode} -> PR -> PRC`);
    });

});
