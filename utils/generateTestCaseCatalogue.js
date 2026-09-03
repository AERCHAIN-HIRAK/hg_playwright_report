/**
 * Regenerates NSE_E2E_TestCases.pdf — the E2E Test Case Catalogue.
 *
 * The catalogue is built from the LIVE test tree, never from a hand-kept list:
 * `playwright test --list --reporter=json` is the source of truth for suites,
 * describe groups, test titles, tags and counts. Add or rename a test and this
 * script picks it up on the next run.
 *
 *   node utils/generateTestCaseCatalogue.js
 *   node utils/generateTestCaseCatalogue.js --list-json test-results/list.json
 *
 * Only the display name / one-line description of each spec file is editorial —
 * that lives in SUITES below. A spec file missing from SUITES still appears in
 * the PDF (falling back to its filename) and is reported on stderr, so a new
 * suite can never be silently dropped.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_PDF = path.join(ROOT, 'NSE_E2E_TestCases.pdf');

// Display order + editorial copy. Order here is the order in the PDF; any spec
// file not listed is appended at the end.
const SUITES = [
    {
        file: 'testSuiteNSEFhappyPATHS.spec.js',
        name: 'NSEF Happy Paths',
        description:
            'End-to-end procure-to-pay happy path (Intake → CXO → Sourcing → PR → PO → GRN → Invoice).',
    },
    {
        file: 'testSuiteNsefCXOtest.spec.js',
        name: 'CXO Tests',
        description:
            'CXO create validation, More-dropdown actions, document lifecycle, and the CXO listing page.',
    },
    {
        file: 'testSuiteCxoInvoice.spec.js',
        name: 'Non-PO (CXO) Invoice',
        description:
            'Invoice raised straight against a released CXO — no Intake, RFX or PO: create → invoice → approve → acknowledge → Accounted, plus the budget parent checks.',
    },
    {
        file: 'testSuiteIntakeNegative.spec.js',
        name: 'Intake Negative',
        description:
            'Intake create validation, workflow reject/recall, document lifecycle, and More-dropdown actions.',
    },
    {
        file: 'testSuiteIntakeListing.spec.js',
        name: 'Intake Listing',
        description: 'Intake listing page: tabs, search, filters, sorting, pagination, navigation.',
    },
    {
        file: 'testSuiteModuleListings.spec.js',
        name: 'Module Listings (Requisition / PO / GRN / Invoice)',
        description:
            'One parametrised suite over the four v3 listing pages: load, view-type tabs, search (positive, negative, edge), sorting, column filters, pagination and row navigation.',
    },
    {
        file: 'testSuiteRFXtests.spec.js',
        name: 'RFX / Sourcing Tests',
        description:
            'Quote-request listing negatives, More-dropdown flows, and reject during the sourcing workflow.',
    },
    {
        file: 'testSuiteallmodulesrejectedit.spec.js',
        name: 'Reject → Edit → Resubmit',
        description:
            'One test per module: the document is rejected mid-approval, re-opened, its quantity and title changed, resubmitted — then the fresh workflow and the downstream effect of the changed quantity are verified.',
    },
    {
        file: 'testSuiteNSETracksHotfixes.spec.js',
        name: 'NSE Tracks Hotfixes',
        description: 'Targeted hotfix regression checks.',
    },
    {
        file: 'testSuiteSupplierPortal.spec.js',
        name: 'Supplier Portal',
        description:
            'Supplier-side (SAPP) procure-to-pay happy path: quote an RFX, accept the PO, and raise the invoice in the supplier portal, with CAPP-side review and approvals.',
    },
    {
        file: 'testSuiteQaClarified.spec.js',
        name: 'QA-Clarified Scenarios',
        description:
            'Scenarios whose entry points QA walked through: the CXO side panel opened from the listing row, the parent Intake reached via the RFX Transactions tab, the PO document downloaded from General Details, the Intake and budget links on an intake-sourced Requisition, bulk supplier reminders on an RFX, and converting a foreclosed RFX to an auction.',
    },
    {
        file: 'testSuiteDoubleSubmit.spec.js',
        name: 'Double-click Protection',
        description:
            'Double-clicking the Submit confirmation must not create two transactions. Asserted on the create request itself, since the UI looks identical either way. Creates one real CXO per run.',
    },
    {
        file: 'testSuiteShortClose.spec.js',
        name: 'Purchase Order Short Close',
        description:
            'Short closing a partially-received PO: the undelivered balance is closed out and the action is withdrawn afterwards. DESTRUCTIVE - a passing run consumes one In-progress PO.',
    },
    {
        file: 'testSuiteAllReports.spec.js',
        name: 'Reports Module Health',
        description:
            'A sample of reports (Invoice Register, PO Register, GRN Report, PR Ageing Report) each generate over the last 3 months and render their WebDataRocks grid without error. Admin Reports are excluded (403 for this login).',
    },
    {
        file: 'testSuiteAuctionFlow.spec.js',
        name: 'RFX to Auction (self-created data)',
        description:
            'Scenario 32 built on data the test creates itself: clone an RFX, add a second supplier, quote from both, foreclose, then convert to an auction. WORK IN PROGRESS - currently skipped; the clone submit does not complete. Scenario 32 is covered meanwhile by the QA-Clarified suite.',
    },
    {
        file: 'testSuiteReports.spec.js',
        name: 'Reports and Email Report Logs',
        description:
            'Generating a report over the last 3 months, downloading it, emailing it, and confirming the send is recorded in the Email Report Logs with a success status and its own download link. Admin Reports are excluded — that route is 403 for the NSEF login.',
    },
    {
        file: 'testSuiteCxoClone.spec.js',
        name: 'CXO Clone Reference Rules',
        description:
            'Whether a clone may be submitted with the reference unchanged: allowed from a Cancelled CXO, required to change from a Released one. NOTE: a passing clone creates a real CXO.',
    },
    {
        file: 'testSuiteInvoiceAckRules.spec.js',
        name: 'Invoice Acknowledgement Rules',
        description:
            'Cancelled and Rejected invoices must not be acknowledged. Drives the acknowledgement API directly and checks both the resulting invoice status and whether the API reports the refusal honestly.',
    },
    {
        file: 'testSuitePurchaseOrder.spec.js',
        name: 'Purchase Order Actions',
        description:
            'Which actions a Purchase Order exposes at each status, covering the preconditions for the short-close, recall, clone and advance-payment scenarios.',
    },
    {
        file: 'testSuiteDashboard.spec.js',
        name: "User's Dashboard",
        description:
            'V4 Dashboard: logo navigation, the My Pending Approval view type, and a cross-check that its pending count agrees with the module listing.',
    },
    {
        file: 'testSuiteSupplierOnboarding.spec.js',
        name: 'Supplier Module',
        description:
            'Supplier listing, the Create Supplier form and its mandatory-field validation, the Onboarding tab on a registered supplier, and availability of the Block action.',
    },
    {
        file: 'testSuiteSaveEditSubmit.spec.js',
        name: 'Save → Edit → Submit',
        description:
            'A record is saved as a Draft without submitting, reopened, edited, then submitted — and the workflow must start from the edited values. Snapshots and restores the shared data fixture so the throwaway drafts cannot repoint it.',
    },
    {
        file: 'testSuiteRFXAnalysis.spec.js',
        name: 'RFX Analysis Tab',
        description:
            'Analysis tab of a sourcing event: base-currency and deleted-item toggles, the four exports, saved view types and configuration controls, quote-version comparison, plus Add Evaluation and Extend Deadline.',
    },
    {
        file: 'testSuiteActivityTimeline.spec.js',
        name: 'Activity Timeline',
        description:
            'Activity Log panel on CXO, Intake and RFX: the panel opens with entries, and both exports (Download Activities / Download Comments) produce a non-empty file.',
    },
    {
        file: 'testSuiteCrossModuleDocs.spec.js',
        name: 'Cross-module Documents & Reassignment',
        description:
            'Regenerate and download the transaction document, and open the Reassign User dialog, across Requisition, Purchase Order, GRN and Invoice. A module that does not expose the action is skipped with the menu contents recorded.',
    },
    {
        file: 'testSuiteRequisition.spec.js',
        name: 'Requisition Detail',
        description:
            'Requisition view page: the related-transaction links (Award, CXO, Intake, Budget), the ag-Grid line-item section, and back navigation to the listing.',
    },
    {
        file: 'testSuiteInvoiceDisputed.spec.js',
        name: 'Invoice → Disputed',
        description:
            'Routes that land an invoice in Disputed status (GRN/Invoice quantity mismatch, unmatched GRN, no GRN at all).',
    },
];

/* ── test tree ────────────────────────────────────────────────────────────── */

function loadList() {
    const flag = process.argv.indexOf('--list-json');
    if (flag !== -1 && process.argv[flag + 1]) {
        return JSON.parse(fs.readFileSync(process.argv[flag + 1], 'utf8'));
    }
    // --list never runs a browser, so this is cheap and safe.
    const raw = execFileSync(
        'npx',
        ['playwright', 'test', '--list', '--reporter=json'],
        { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return JSON.parse(raw);
}

/** Playwright keeps tags in the title too ("… @RejectEdit @CXO") — strip them. */
function cleanTitle(title, tags) {
    let t = title;
    for (const tag of [...tags].reverse()) {
        t = t.replace(new RegExp(`\\s*@${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');
    }
    return t.trim();
}

/**
 * Flattens one spec file into ordered groups:
 *   [{ title: 'CXO Listing Page › Search › Positive', cases: [{title, tags}] }]
 * A group title is the full describe path; a test declared straight in the file
 * is grouped under the suite's display name.
 */
function groupsFor(fileNode, fallbackGroupTitle) {
    const groups = [];
    const push = (title, specs) => {
        if (!specs.length) return;
        groups.push({
            title,
            cases: specs.map((s) => ({
                title: cleanTitle(s.title, s.tags || []),
                tags: (s.tags || []).map((t) => `@${t}`),
            })),
        });
    };

    push(fallbackGroupTitle, fileNode.specs || []);
    const walk = (node, trail) => {
        for (const sub of node.suites || []) {
            const trailNext = [...trail, sub.title];
            push(trailNext.join(' › '), sub.specs || []);
            walk(sub, trailNext);
        }
    };
    walk(fileNode, []);
    return groups;
}

function buildModel(list) {
    const byFile = new Map();
    for (const node of list.suites || []) {
        if (!/\.spec\.js$/.test(node.file || node.title || '')) continue;
        byFile.set(path.basename(node.file || node.title), node);
    }

    const ordered = [];
    for (const meta of SUITES) {
        const node = byFile.get(meta.file);
        if (!node) {
            console.warn(`! ${meta.file} is in SUITES but has no tests — skipped`);
            continue;
        }
        byFile.delete(meta.file);
        ordered.push({ meta, node });
    }
    for (const [file, node] of byFile) {
        console.warn(`! ${file} is not described in SUITES — appended with a fallback name`);
        ordered.push({ meta: { file, name: file.replace(/\.spec\.js$/, ''), description: '' }, node });
    }

    let n = 0;
    return ordered.map(({ meta, node }) => {
        const groups = groupsFor(node, meta.name);
        for (const g of groups) for (const c of g.cases) c.n = ++n;
        return { ...meta, groups, count: groups.reduce((s, g) => s + g.cases.length, 0) };
    });
}

/* ── html ─────────────────────────────────────────────────────────────────── */

const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildHtml(suites) {
    const totalCases = suites.reduce((s, x) => s + x.count, 0);
    const today = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const contents = suites
        .map(
            (s) => `<div class="toc-row">
        <span class="toc-name">${esc(s.name)}</span>
        <span class="toc-count">${s.count} case${s.count === 1 ? '' : 's'}</span>
      </div>`,
        )
        .join('\n');

    const body = suites
        .map(
            (s) => `<section class="suite">
      <header class="suite-head">
        <div class="suite-num">${s.count}</div>
        <div class="suite-meta">
          <h2>${esc(s.name)}</h2>
          ${s.description ? `<p>${esc(s.description)}</p>` : ''}
          <code class="spec">${esc(s.file)}</code>
        </div>
      </header>
      ${s.groups
          .map(
              (g) => `<div class="group">
        <h3>${esc(g.title)}</h3>
        <table>
          <thead><tr><th class="c-n">#</th><th class="c-t">Test case</th><th class="c-g">Tags</th></tr></thead>
          <tbody>
            ${g.cases
                .map(
                    (c) => `<tr>
              <td class="c-n">${c.n}</td>
              <td class="c-t">${esc(c.title)}</td>
              <td class="c-g">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</td>
            </tr>`,
                )
                .join('\n')}
          </tbody>
        </table>
      </div>`,
          )
          .join('\n')}
    </section>`,
        )
        .join('\n');

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>NSE Foundation — E2E Test Case Catalogue</title>
<style>
  :root {
    --navy-900: #0f2a4a;
    --navy-700: #143d6e;
    --navy-500: #1b4f8a;
    --ink:      #3e4c59;
    --ink-soft: #52606d;
    --muted:    #8b97a6;
    --faint:    #9aa5b1;
    --line:     #e6ebf1;
    --row-alt:  #fafbfd;
    --chip-bg:  #eaf1fb;
    --chip-fg:  #25578f;
    --code-bg:  #f4f0fd;
    --code-fg:  #7a55d6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
  }

  /* ── cover ── */
  .cover {
    /* A4 content box: 1123px page height less the 46px footer margin. */
    height: 1077px;
    padding: 66px 52px;
    background: linear-gradient(135deg, #0f2b4b 0%, #143c6c 55%, #1a4d86 100%);
    color: #fff;
  }
  .kicker {
    font-size: 9px; letter-spacing: .24em; text-transform: uppercase;
    color: rgba(255,255,255,.55); margin-bottom: 26px;
  }
  .cover h1 { font-size: 31px; margin: 0 0 10px; letter-spacing: -.4px; }
  .cover .sub { font-size: 10.5px; color: rgba(255,255,255,.72); margin: 0; }
  .stats { display: flex; gap: 18px; margin: 44px 0 56px; }
  .stat {
    min-width: 118px; padding: 20px 24px 16px;
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16);
    border-radius: 10px;
  }
  .stat b { display: block; font-size: 34px; line-height: 1; margin-bottom: 12px; }
  .stat span { font-size: 7.5px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.6); }
  .toc-label {
    font-size: 8px; letter-spacing: .24em; text-transform: uppercase;
    color: rgba(255,255,255,.55); margin-bottom: 6px;
  }
  .toc-row {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 11px 2px; border-bottom: 1px solid rgba(255,255,255,.13);
  }
  .toc-name { font-size: 10.5px; font-weight: bold; }
  .toc-count { font-size: 9px; color: rgba(255,255,255,.7); }

  /* ── suites ── */
  .suite { page-break-before: always; padding: 26px 42px 0; }
  .suite-head { display: flex; gap: 18px; align-items: flex-start; padding-bottom: 16px; }
  .suite-num {
    flex: 0 0 auto; width: 62px; height: 62px; border-radius: 8px;
    background: #eef3fb; color: var(--navy-500);
    font-size: 25px; font-weight: bold; text-align: center; line-height: 62px;
  }
  .suite-meta { padding-top: 2px; }
  .suite-meta h2 { font-size: 19px; color: var(--navy-900); margin: 0 0 6px; }
  .suite-meta p { font-size: 9.5px; color: var(--ink-soft); margin: 0 0 9px; line-height: 1.45; }
  code.spec {
    display: inline-block; font-family: Menlo, Consolas, monospace; font-size: 8.5px;
    background: var(--code-bg); color: var(--code-fg);
    padding: 3px 8px; border-radius: 4px;
  }

  .group { padding-top: 14px; }
  .group h3 {
    font-size: 11px; color: var(--navy-700); margin: 0 0 2px;
    padding-left: 9px; border-left: 3px solid var(--navy-500);
    /* Never leave a group heading stranded at the foot of a page. */
    break-after: avoid; page-break-after: avoid;
  }
  /* A table that spills over a page break repeats its header (thead is a
     header-group by default) — but the header must not be the last thing on
     the page either. */
  thead { break-after: avoid; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-size: 7px; letter-spacing: .18em; text-transform: uppercase;
    color: var(--muted); font-weight: normal; text-align: left;
    padding: 10px 6px 6px; border-bottom: 1px solid var(--line);
  }
  tbody td {
    font-size: 9.5px; padding: 7px 6px; vertical-align: top;
    border-bottom: 1px solid #eef1f5; line-height: 1.35;
  }
  tbody tr:nth-child(even) td { background: var(--row-alt); }
  .c-n { width: 30px; color: var(--faint); text-align: right; }
  tbody td.c-n { font-size: 9px; }
  .c-t { color: var(--ink); }
  .c-g { width: 152px; }
  .tag {
    display: inline-block; font-family: Menlo, Consolas, monospace; font-size: 6.5px;
    background: var(--chip-bg); color: var(--chip-fg);
    padding: 2px 6px; border-radius: 999px; white-space: nowrap; margin: 1px 0;
  }
</style></head>
<body>
  <div class="cover">
    <div class="kicker">NSE Foundation · Quality Engineering</div>
    <h1>E2E Test Case Catalogue</h1>
    <p class="sub">Playwright automated test suites · ${esc(today)}</p>
    <div class="stats">
      <div class="stat"><b>${suites.length}</b><span>Suites</span></div>
      <div class="stat"><b>${totalCases}</b><span>Test cases</span></div>
    </div>
    <div class="toc-label">Contents</div>
    ${contents}
  </div>
  ${body}
</body></html>`;
}

/* ── render ───────────────────────────────────────────────────────────────── */

const FOOTER = `
<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#7b8794;
            padding:9px 42px 0;border-top:1px solid #e4e7eb;display:flex;justify-content:space-between;">
  <span>NSE Foundation — E2E Test Case Catalogue</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;

const suites = buildModel(loadList());
const html = buildHtml(suites);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
    path: OUT_PDF,
    format: 'A4',
    printBackground: true,
    // Top/left/right 0 so the cover's navy bleeds to the page edge; the bottom
    // margin is the footer band.
    margin: { top: '0px', right: '0px', bottom: '46px', left: '0px' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: FOOTER,
});
await browser.close();

const total = suites.reduce((s, x) => s + x.count, 0);
console.log(`${path.relative(ROOT, OUT_PDF)} — ${suites.length} suites, ${total} test cases`);
for (const s of suites) console.log(`  ${String(s.count).padStart(3)}  ${s.name}`);
