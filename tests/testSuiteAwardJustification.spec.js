import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { buildRfxToForeclose } from '../pages/chainBuilders';
import data from '../pages/NSEFoundationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Award justification — long text is fully readable on hover
//
// Sheet scenario:
//   21  when an RFX Award is performed with long text in the Justification
//       fields, hovering the text displays the complete value
//
// QA's flow (2026-09-07): convert the RFX from an Intake → quote → foreclose →
// Award, filling the Justification Section fields with 300 CHARACTERS EACH →
// fill the allocated qty as usual → submit the award → hover each field and
// check the whole text shows and scrolls.
//
// Fields, per QA: Remarks and Initial Quote Remarks. NOT "Attachments" (an
// Upload control), NOT "Savings Against Initial Quote" (numeric), and NOT the
// field literally named "Justification" — that one lives under Cost Approval
// Note, and it is what the sheet's original "field is EMPTY on every award"
// note was looking at.
//
// Why this had to build its own data: the recorded blocker was that the
// Justification field is empty on every existing award and the page contains no
// truncated nodes, so there is nothing to hover. The only way to get a truncated
// justification is to award one with long text — hence the full chain.
//
// ⚠️ CREATES REAL RECORDS on UAT every run: one CXO, Intake, RFX, quote and
// award, all subjected "HG Automation …".
//
// Two shortcuts for iterating without a ~15 minute rebuild:
//   S21_RFX_ID=<id>     already-FORECLOSED RFX — skips the build, opens
//                       /rfx/<id>/new-award directly.
//   S21_AWARD_URL=<url> an award page that ALREADY has long justification text —
//                       skips everything and only runs the hover assertions.
// ─────────────────────────────────────────────────────────────────────────────

const CHARS = 300;
const FIELDS = ['Remarks', 'Initial Quote Remarks'];

/** Exactly `CHARS` characters, with a terminal marker so truncation is provable. */
function longText(tag) {
    const head = `S21-${tag.replace(/\s+/g, '')}-START-`;
    const tail = `-END-${tag.replace(/\s+/g, '')}`;
    const body = 'x'.repeat(CHARS - head.length - tail.length);
    const out = head + body + tail;
    if (out.length !== CHARS) throw new Error(`fixture text is ${out.length} chars, expected ${CHARS}`);
    return out;
}

test.describe('RFX Award — long justification text is fully readable on hover', () => {

    test('300-char justification text is entered, awarded, and shown in full on hover @RFX @Award @Justification @S21 @Slow', async ({ page }) => {
        test.setTimeout(2700000);   // 45 min — full CXO → … → award build

        const a = new NSEFoundationActions(page);
        await page.setViewportSize({ width: 1900, height: 1000 });

        /** label → the exact 300-char string that was entered */
        const sent = new Map(FIELDS.map(f => [f, longText(f)]));

        if (process.env.S21_AWARD_URL) {
            // Hover-only mode: assert against an award that already carries the text.
            await page.goto(process.env.S21_AWARD_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForTimeout(10000);
        } else {
            await a.openApp(data);

            // The award form MUST be reached by CLICKING Award on the Analysis
            // tab. Navigating straight to /rfx/<id>/new-award renders an
            // INCOMPLETE form: verified 2026-09-07 on RFX 1468, the direct URL
            // omits the "Remarks" and "Attachments" rows entirely, and every row
            // below them shifts up (Initial Quote Remarks lands on row 12 instead
            // of 14). Filling "the justification fields" there would silently
            // miss Remarks. That row shift is also why fillAwardRowValue resolves
            // rows by LABEL and never by index.
            if (process.env.S21_RFX_ID) {
                console.log(`[S21] RESUME — RFX ${process.env.S21_RFX_ID} (must already be Foreclosed)`);
                await page.goto(`${data.loginUrl}/quote-requests/${process.env.S21_RFX_ID}`,
                    { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForTimeout(8000);
            } else {
                await buildRfxToForeclose(a, data);
            }
            await a.clickAnalysisTab();
            await a.clickAwardButton();
            await page.waitForTimeout(8000);

            // ── Fill the Justification Section with 300 chars per field ───────
            for (const label of FIELDS) {
                await a.fillAwardRowValue(label, sent.get(label));
            }

            // ── Then the allocated quantity, exactly as the other chains do ───
            await a.fillAllocatedQuantity();

            // ── Submit the award and clear its approvals ──────────────────────
            await a.clickAwardButton();
            await a.submitWorkflowSummary();
            await a.completeAwardApprovals('Approved by automation — scenario 21');
            await page.waitForTimeout(6000);
            console.log(`[S21] award submitted and approved — now on ${page.url()}`);
        }

        // ── Hover each field: full text, real overflow, and it scrolls ────────
        const results = [];
        for (const label of FIELDS) {
            const r = await a.assertAwardRowHoverShowsFullText(label, sent.get(label));
            results.push({ label, ...r });

            expect(r.fullText,
                `hovering "${label}" did not reveal the complete ${CHARS}-char value (via ${r.how})`)
                .toBeTruthy();
            // The hover must be NECESSARY: if the cell were not clipped the value
            // would be readable without hovering and this scenario proves nothing.
            expect(r.cellClipped,
                `"${label}" is not truncated in the cell, so hovering reveals nothing new `
                + `— the ${CHARS}-char value is not being clipped at all`)
                .toBeTruthy();

            // Scrollability, only where the reveal actually overflows. Measured
            // 2026-09-07: at 300 chars the tooltip WRAPS (scrollHeight ==
            // clientHeight) and needs no scrolling, so asserting overflow here
            // would fail correct behaviour. If a longer value ever does overflow,
            // it must genuinely scroll.
            if (r.overflows) {
                expect(r.scrolled?.moved,
                    `"${label}" reveal overflows but did not scroll when driven (axis ${r.scrolled?.axis})`)
                    .toBeTruthy();
            } else {
                console.log(`[S21] "${label}" reveal shows all ${CHARS} chars without needing to scroll`);
            }
        }
        console.log(`[S21] ${JSON.stringify(results.map(r => ({ label: r.label, how: r.how,
            exact: r.exact, clipped: r.cellClipped, overflows: r.overflows, scrolled: r.scrolled?.axis ?? null })))}`);
    });
});
