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
    navigationTimeout: 5000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Trace on failure even if a run forgets the `--trace on` CLI flag.
    trace: 'retain-on-failure',
  },

  projects: [

    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    {
      name: 'tests',
      // Exclude the NSE Foundation + Supplier specs — they have their own login
      testMatch: /testSuite(?!NSEFhappyPATHS|NsefCXOtest|IntakeNegative|IntakeListing|NSETracksHotfixes|RFXtests|SupplierPortal|allmodulesrejectedit|InvoiceDisputed).*\.spec\.js/,
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
      testMatch: /testSuite(NSEFhappyPATHS|NsefCXOtest|IntakeNegative|IntakeListing|NSETracksHotfixes|RFXtests|allmodulesrejectedit|InvoiceDisputed)\.spec\.js/,
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
      testMatch: /testSuiteSupplierPortal\.spec\.js/,
      // Combined CAPP + SAPP session so both portals are authenticated.
      use: {
        storageState: 'auth.supplier.json',
      },
      dependencies: ['supplier-setup'],
    }

  ]

});