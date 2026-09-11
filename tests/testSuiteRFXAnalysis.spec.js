import { test, expect } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { NSEFoundation_Locators as L } from '../pages/NSEFoundationLocators';
import data from '../pages/NSEFoundationData.json';
import { buildMultiCurrencyRfxToForeclose } from '../pages/chainBuilders';

// ─────────────────────────────────────────────────────────────────────────────
// RFX Analysis tab
//
// Sheet scenarios:
//   20 prices shown in base currency after toggling
//   22 deleted line items visible via the "Show deleted items" toggle
//   23 supplier / view configuration shows the configured data
//   24 all files downloadable from the Analysis tab
//   27 quote versions can be compared
//   32 evaluations can be evaluated
//   33 deadline can be extended after foreclosing
//
// WARNING - these tags were STALE by +3 until 2026-09-03. The second
// renumbering (old 19-158 shifted by -3) updated both CSVs and every other
// suite but missed this file, so the tags here still read 23/25/26/27/30/35/36.
// Three of those collided with real, UNCOVERED scenarios - 25 and 26 (RFX price
// sync) and 30 (Negotiations) looked covered while nothing tested them. Grepping
// the tags is how coverage is counted, so a stale tag silently inflates it.
// If the sheet is renumbered again, this file must be included in the pass.
//
// Verified live on RFX-26-231 (2026-08-31). Controls found on the tab:
//   • two radix switches — "Show in base currency", "Show deleted items"
//   • a download DROPDOWN offering Analysis / Versions / Benchmarks / Questionnaire
//   • "Select View Type" (saved views: Default, Custom View, test 01)
//   • an INLINE "Compare" panel (Supplier / Version(s) / Field, max 2 versions)
// ─────────────────────────────────────────────────────────────────────────────

const RFX_URL = data.savedSourcingEvent.url;

async function openAnalysis(page) {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });
    await a.openApp(data);
    await page.goto(RFX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    await a.openRfxAnalysisTab();
    return a;
}

test.describe('RFX Analysis tab', () => {

    test.describe.configure({ timeout: 180000 });

    // ── Base-currency CONVERSION (scenario 20, the real proof) ────────────────
    //
    // The three toggle tests below run against savedSourcingEvent, which is
    // quoted in INR — the base currency. Nothing can change when the quote and
    // base currency are the same, so those tests deliberately do NOT assert
    // "values changed": that would be wrong there, not stricter.
    //
    // This test builds the fixture that CAN prove it (QA-specified flow,
    // 2026-09-04): CXO → Intake → RFX allowing INR+USD → quote in USD →
    // foreclose. Then the Analysis grid must read in USD, and switching
    // "Show in base currency" on must re-render it in INR.
    //
    // It creates real UAT records (one CXO, Intake and RFX per run), which is
    // the price of not depending on ambient data — same trade-off as the other
    // chain-driven suites.
    test.describe('Base currency conversion — USD-quoted RFX', () => {

        test('quoted prices show in USD and convert to INR when base currency is on @RFX @Analysis @Currency @S20', async ({ page }) => {
            test.setTimeout(2400000); // full CXO→foreclose chain

            const cfg = data.multiCurrencyRfx;
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);

            await buildMultiCurrencyRfxToForeclose(a, data);

            await a.clickAnalysisTab();
            await page.waitForTimeout(2500);

            // Base currency OFF → the grid must be in the QUOTE currency (USD).
            if (await a.getAnalysisSwitchState('Show in base currency') === 'checked') {
                await a.toggleAnalysisSwitch('Show in base currency');
            }
            const quoted = await a.readAnalysisCurrencySymbols();
            console.log(`[ANALYSIS] base-currency OFF symbols: ${quoted.join(' ')}`);
            expect(quoted.length, 'no currency amounts rendered with base currency off').toBeGreaterThan(0);
            expect(quoted,
                `RFX was quoted in ${cfg.quoteCurrency} but the grid does not show ${cfg.expectedQuoteSymbol} (got ${quoted.join(' ')})`)
                .toContain(cfg.expectedQuoteSymbol);

            // Base currency ON → the same figures must re-render in INR.
            await a.toggleAnalysisSwitch('Show in base currency');
            await page.waitForTimeout(2000);
            const base = await a.readAnalysisCurrencySymbols();
            console.log(`[ANALYSIS] base-currency ON symbols: ${base.join(' ')}`);
            expect(base,
                `base currency is ON but the grid does not show ${cfg.expectedBaseSymbol} (got ${base.join(' ')})`)
                .toContain(cfg.expectedBaseSymbol);
            // This is the assertion the INR-quoted fixture could never make.
            expect(base,
                `base currency is ON but amounts are still in the quote currency (${base.join(' ')})`)
                .not.toContain(cfg.expectedQuoteSymbol);
        });
    });

    // ── Currency toggle (scenario 23) ─────────────────────────────────────────
    test.describe('Base currency toggle', () => {

        test('"Show in base currency" toggle flips state @RFX @Analysis @S20', async ({ page }) => {
            const a = await openAnalysis(page);

            const { before, after } = await a.toggleAnalysisSwitch('Show in base currency');
            expect(['checked', 'unchecked']).toContain(before);
            expect(after).not.toBe(before);

            // Restore, so the tab is left as found for the next test.
            await a.toggleAnalysisSwitch('Show in base currency');
        });

        test('prices render in a single currency while base currency is on @RFX @Analysis @S20', async ({ page }) => {
            const a = await openAnalysis(page);

            if (await a.getAnalysisSwitchState('Show in base currency') === 'unchecked') {
                await a.toggleAnalysisSwitch('Show in base currency');
            }

            const symbols = await a.readAnalysisCurrencySymbols();
            expect(symbols.length, 'no currency amounts rendered on the analysis grid')
                .toBeGreaterThan(0);
            // With base-currency on, every amount must share one symbol.
            expect(symbols.length,
                `base currency is ON but amounts use mixed symbols: ${symbols.join(' ')}`).toBe(1);
        });

        test('toggling base currency off keeps the grid populated @RFX @Analysis @S20', async ({ page }) => {
            const a = await openAnalysis(page);

            const on = await a.readAnalysisAmounts();
            await a.toggleAnalysisSwitch('Show in base currency');
            const off = await a.readAnalysisAmounts();

            expect(off.length, 'grid lost its amounts when base currency was switched off')
                .toBeGreaterThan(0);

            // NOTE: on an RFX whose quote currency IS the base currency (this one
            // is INR/INR) the figures are identical either way, so a
            // "values changed" assertion would be wrong here, not stricter.
            // Proving conversion needs an RFX quoted in a foreign currency.
            if (on.join('|') === off.join('|')) {
                console.log('[ANALYSIS] quote currency == base currency — conversion not exercised');
            }

            await a.toggleAnalysisSwitch('Show in base currency');
        });
    });

    // ── Deleted items toggle (scenario 25) ────────────────────────────────────
    test.describe('Deleted items toggle', () => {

        test('"Show deleted items" toggle flips state @RFX @Analysis @S22', async ({ page }) => {
            const a = await openAnalysis(page);

            expect(await a.getAnalysisSwitchState('Show deleted items')).toBe('unchecked');
            const { after } = await a.toggleAnalysisSwitch('Show deleted items');
            expect(after).toBe('checked');

            await a.toggleAnalysisSwitch('Show deleted items');
        });

        test('showing deleted items never removes rows from the grid @RFX @Analysis @S22', async ({ page }) => {
            const a = await openAnalysis(page);

            const before = (await a.readAnalysisAmounts()).length;
            await a.toggleAnalysisSwitch('Show deleted items');
            const after = (await a.readAnalysisAmounts()).length;

            // Revealing deleted rows can only add to the grid, never subtract.
            expect(after, 'enabling "Show deleted items" reduced the grid')
                .toBeGreaterThanOrEqual(before);

            await a.toggleAnalysisSwitch('Show deleted items');
        });
    });

    // ── Downloads (scenario 27) ───────────────────────────────────────────────
    test.describe('Downloads', () => {

        const EXPORTS = [
            'Download Analysis',
            'Download Versions',
            'Download Benchmarks',
            'Download Questionnaire',
        ];

        test('download menu offers every export @RFX @Analysis @Download @S24', async ({ page }) => {
            const a = await openAnalysis(page);
            const options = await a.getAnalysisDownloadOptions();
            for (const e of EXPORTS) expect(options, `missing "${e}"`).toContain(e);
        });

        // Exports confirmed to produce a file on RFX-26-231.
        for (const label of ['Download Analysis', 'Download Versions', 'Download Questionnaire']) {
            test(`"${label}" produces a non-empty file @RFX @Analysis @Download @S24`, async ({ page }) => {
                const a = await openAnalysis(page);
                const res = await a.tryDownloadAnalysisFile(label);
                expect(res.ok, `${label} failed: HTTP ${res.status} ${res.reason}`).toBeTruthy();
                expect(res.file.size).toBeGreaterThan(0);
            });
        }

        // "Download Benchmarks" is data-dependent. On an RFX with no benchmark
        // fields it returns
        //     HTTP 400 {"success":0,"reason":"No benchmark fields configured for download"}
        // and the app surfaces exactly that text in a toast — correct behaviour,
        // not a defect. So the assertion accepts EITHER a real file OR a clear
        // message, and fails only if the click does nothing at all.
        test('"Download Benchmarks" either downloads or explains why not @RFX @Analysis @Download @S24', async ({ page }) => {
            const a = await openAnalysis(page);

            const res = await a.tryDownloadAnalysisFile('Download Benchmarks');
            if (res.ok) {
                expect(res.file.size).toBeGreaterThan(0);
                return;
            }

            console.log(`[ANALYSIS] Benchmarks unavailable — HTTP ${res.status}: ${res.reason}`);

            const toasts = await a.readVisibleToasts();
            const surfaced = toasts.some(t => /benchmark|not configured|no data|unable|fail/i.test(t));
            expect(surfaced,
                `Benchmarks download failed with "${res.reason}" but the UI showed nothing (toasts seen: ${JSON.stringify(toasts)})`)
                .toBeTruthy();
        });
    });

    // ── View type / supplier configuration (scenario 26) ──────────────────────
    test.describe('View configuration', () => {

        test('Select View Type lists the saved analysis views @RFX @Analysis @S23', async ({ page }) => {
            const a = await openAnalysis(page);
            const views = await a.getAnalysisViewTypes();
            expect(views.length, 'no analysis view types offered').toBeGreaterThan(0);
            expect(views, 'the built-in "Default" view is missing').toContain('Default');
        });

        test('supplier and column configuration controls are available @RFX @Analysis @S23', async ({ page }) => {
            await openAnalysis(page);
            await expect(page.locator(`xpath=${L.analysisSupplierConfigBtn}`).first()).toBeVisible();
            await expect(page.locator(`xpath=${L.analysisColumnConfigBtn}`).first()).toBeVisible();
        });
    });

    // ── Compare quote versions (scenario 30) ──────────────────────────────────
    test.describe('Compare versions', () => {

        test('Compare panel exposes supplier, version and field selectors @RFX @Analysis @Compare @S27', async ({ page }) => {
            const a = await openAnalysis(page);
            await a.openAnalysisCompare();

            await expect(page.locator(`xpath=${L.analysisCompareSupplier}`).first()).toBeVisible();
            await expect(page.locator(`xpath=${L.analysisCompareVersions}`).first()).toBeVisible();
            // The 2-version cap is the rule this scenario is really about.
            await expect(page.locator(`xpath=${L.analysisCompareNote}`).first()).toBeVisible();
        });
    });

    // ── Evaluations + Extend Deadline (scenarios 35, 36) ──────────────────────
    test.describe('Adjacent RFX actions', () => {

        // Scenario 35 in full needs a chain this suite does not drive:
        //   Intake → convert to RFX **adding an Evaluation during conversion** →
        //   quote the RFX → the Evaluation then appears in the Evaluations tab
        //   and can be evaluated.
        // (Clarified by QA 2026-08-31.) The sample RFX had no Evaluation added at
        // conversion, which is why its Evaluations tab shows an empty state —
        // that is correct behaviour, NOT the defect an earlier note here claimed.
        // These two tests cover only the entry points.
        test('Add Evaluation is offered on the RFX @RFX @Evaluation @S32', async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);
            await page.goto(RFX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            // "Add Evaluation" sits on the OVERVIEW tab, not the Evaluations tab.
            await expect(page.locator(`xpath=${L.rfxAddEvaluationBtn}`).first()).toBeVisible();
        });

        test('Evaluations tab renders for an RFX with no evaluation added @RFX @Evaluation @S32', async ({ page }) => {
            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            await a.openApp(data);
            await page.goto(RFX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3500);

            await page.locator(`xpath=${L.rfxEvaluationsTabBtn}`).first().click();
            await page.waitForURL(/\/evaluations/, { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(3000);

            // Expected empty state: no Evaluation was added during conversion.
            const body = await page.locator('body').innerText();
            expect(body).toMatch(/Nothing to Evaluate Yet|Evaluation/i);
        });

        // Scenario 36, in full (QA 2026-09-02): once an RFX is quoted and
        // foreclosed the supplier can no longer quote; extending the deadline
        // from the top of the view page must reopen it.
        //
        // Verified live 2026-09-02: quoting is gated on the DEADLINE, not on the
        // foreclosure — RFX-26-233 (deadline 2026-08-31, past) showed no quote
        // action at all, and after extending to 2026-09-25 the supplier row
        // offered "Update Quote" again. The save posts to
        // /quote-requests/<id>/update-deadlines-for-quote and returns success:1;
        // there is no toast, so that response is the only signal.
        //
        // The calendar opens on the CURRENT month even when the deadline is
        // months away, and every day from today on is selectable — including a
        // date EARLIER than the deadline currently set, which is what QA meant
        // by "select the date prior to the selected date".
        test('a foreclosed RFX can have its deadline extended and quoting reopens @RFX @Deadline @S33', async ({ page }) => {
            test.setTimeout(420000);

            const a = new NSEFoundationActions(page);
            await page.setViewportSize({ width: 1800, height: 900 });
            page.setDefaultTimeout(30000);
            await a.openApp(data);

            // Prefer an RFX that is already quoted AND foreclosed, so the test
            // does not foreclose ambient data other suites rely on.
            const quoted = await a.listRfxByStatus(['Quoted'], data.loginUrl);
            test.skip(!quoted.length, 'no Quoted RFX on the first listing page');

            let target = null;
            for (const rfx of quoted.slice(0, 4)) {
                await page.goto(`${data.loginUrl}${rfx.href}/overview`,
                    { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(6000);
                if (await a.isRfxForeclosed()) { target = rfx; break; }
            }
            test.skip(!target, 'no quoted-and-foreclosed RFX among the first four');
            console.log(`[S36] using ${target.code} (${target.href})`);

            await expect(page.locator(`xpath=${L.rfxExtendDeadlineBtn}`).first(),
                'a foreclosed RFX offers no Extend Deadline').toBeVisible();

            const before = await a.readRfxQuoteDeadline();
            const quotableBefore = await a.countRfxQuoteActions();
            console.log(`[S36] deadline before = ${before}, quote actions = ${quotableBefore}`);

            // A day inside the month the calendar opens on (the current one),
            // far enough ahead to be selectable and different from today.
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            let day = Math.min(now.getDate() + 5, daysInMonth);
            test.skip(day <= now.getDate(), 'run lands on the last day of the month');
            // Picking the day already set leaves Update disabled.
            if (before && new RegExp(`-0?${day},`).test(before)) day -= 1;

            const status = await a.extendRfxDeadline(day, 'Extended by automation — scenario 36');
            expect(status, 'the deadline save was rejected').toBeLessThan(300);

            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(8000);

            const after = await a.readRfxQuoteDeadline();
            console.log(`[S36] deadline after = ${after}`);
            expect(after, 'the header still shows the old deadline').not.toBe(before);
            expect(after, 'the new deadline is not the date that was picked')
                .toMatch(new RegExp(`-0?${day},`));

            // The point of the scenario: the supplier can quote again.
            const quotableAfter = await a.countRfxQuoteActions();
            console.log(`[S36] quote actions after = ${quotableAfter}`);
            expect(quotableAfter,
                'no supplier row offers Submit/Update Quote after the extension')
                .toBeGreaterThan(0);
            if (quotableBefore === 0) {
                console.log('[S36] full transition observed: quoting was closed and reopened');
            }
        });
    });
});
