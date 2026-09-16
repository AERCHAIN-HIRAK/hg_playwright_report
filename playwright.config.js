import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({

  testDir: './tests',

  reporter: [
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }]
  ],

  // Whole-test budget. A test still gets up to 30s overall, but no single
  // locator interaction below is allowed to stall the run.
  timeout: 30000,

  // Auto-retrying assertions (expect(locator).toBeVisible(), etc.) give up
  // after 5s instead of waiting the full test timeout.
  expect: {
    timeout: 5000,
  },

  use: {
    headless: false,
    // If a locator can't be acted on (not found / not actionable) within 5s,
    // the action throws → the test is marked failed → artifacts below are
    // captured. This stops the "error page shown but browser hangs open" case.
    actionTimeout: 5000,
    // Navigation gets a far bigger budget than a locator action. 5s was too tight
    // for this app's listing/base pages under a headed run: the whole-suite run on
    // 2026-08-25 lost two tests purely to `page.goto` expiring on
    // /intakes and on the base URL, before either test's real assertions ran.
    // `waitUntil: 'load'` waits for every subresource, so this must tolerate a
    // slow page, not just a slow server.
    navigationTimeout: 15000,
    screenshot: 'only-on-failure',
    // PW_LIGHT=1 turns off video and trace capture. Both buffer for the WHOLE
    // test, and on a long headed run that is enough to get the process killed:
    // the 10-invoice scenario-116 run was OOM-killed by macOS at ~25 min on
    // 2026-09-15. Screenshots and the error-context DOM snapshot still survive,
    // and those are what actually diagnose failures here. Default is unchanged.
    video: process.env.PW_LIGHT ? 'off' : 'retain-on-failure',
    // Trace on failure even if a run forgets the `--trace on` CLI flag.
    trace: process.env.PW_LIGHT ? 'off' : 'retain-on-failure',
  },

  projects: [

    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    {
      name: 'tests',
      // Exclude the NSE Foundation + Supplier specs — they have their own login
      testMatch: /testSuite(?!NSEFhappyPATHS|CxoInvoice|NsefCXOtest|IntakeNegative|IntakeListing|NSETracksHotfixes|RFXtests|SupplierPortal|allmodulesrejectedit|InvoiceDisputed|ModuleListings|CrossModuleDocs|Requisition|ActivityTimeline|RFXAnalysis|SaveEditSubmit|Dashboard|SupplierOnboarding|PurchaseOrder|InvoiceAckRules|CxoClone|QaClarified|Reports|AuctionFlow|AllReports|ShortClose|DoubleSubmit|RfxEvaluation|InvoiceVendorRpt|PrEdit|PrcView|SupplierIfsc|GrnCancel|InvoiceMsme|PoAmendBudget|RfxCollab|InvoiceCancel|AdvancePayments|Attachments|InvoiceCancelGrn|AwardJustification|InvoiceRefValidation|InvoiceReviewValidation|PoRecall|RejectedNotPending|CxoRevertPartialBudget|IntakePartialRfxReuse|CxoTwoIntakePayments|AwardCancelReaward|IntakeBulkUpload|IntakeOverQtyRfx|IntakeDoubleTabRfx|AwardAttachmentCarry|PoRejectEditPrc|PrCloneBudget|ShortCloseBudget|InvoiceNoDuplicates).*\.spec\.js/,
      use: {
        storageState: 'auth.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'nsef-setup',
      testMatch: /auth\.nsef\.setup\.js/,
    },

    {
      name: 'nsef-tests',
      testMatch: /testSuite(NSEFhappyPATHS|CxoInvoice|NsefCXOtest|IntakeNegative|IntakeListing|NSETracksHotfixes|RFXtests|allmodulesrejectedit|InvoiceDisputed|ModuleListings|CrossModuleDocs|Requisition|ActivityTimeline|RFXAnalysis|SaveEditSubmit|Dashboard|SupplierOnboarding|PurchaseOrder|InvoiceAckRules|CxoClone|QaClarified|Reports|AuctionFlow|AllReports|ShortClose|DoubleSubmit|RfxEvaluation|InvoiceVendorRpt|PrEdit|PrcView|SupplierIfsc|GrnCancel|InvoiceMsme|PoAmendBudget|RfxCollab|InvoiceCancel|AdvancePayments|Attachments|InvoiceCancelGrn|AwardJustification|InvoiceRefValidation|PoRecall|RejectedNotPending|CxoRevertPartialBudget|IntakePartialRfxReuse|CxoTwoIntakePayments|AwardCancelReaward|IntakeBulkUpload|IntakeOverQtyRfx|IntakeDoubleTabRfx|AwardAttachmentCarry|PoRejectEditPrc|PrCloneBudget|ShortCloseBudget|InvoiceNoDuplicates)\.spec\.js/,
      // Reuse the one-time NSEF login captured by nsef-setup.
      use: {
        storageState: 'auth.nsef.json',
      },
      dependencies: ['nsef-setup'],
    },

    {
      name: 'supplier-setup',
      testMatch: /auth\.supplier\.setup\.js/,
    },

    {
      name: 'supplier-tests',
      testMatch: /testSuite(SupplierPortal|InvoiceReviewValidation)\.spec\.js/,
      // Combined CAPP + SAPP session so both portals are authenticated.
      use: {
        storageState: 'auth.supplier.json',
      },
      dependencies: ['supplier-setup'],
    }

  ]

});