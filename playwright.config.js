import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({

  testDir: './tests',

  reporter: [
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }]
  ],

  // Whole-test budget. A test still gets up to 120s overall, but no single
  // locator interaction below is allowed to stall the run.
  timeout: 120000,

  // Auto-retrying assertions (expect(locator).toBeVisible(), etc.) give up
  // after 30s instead of waiting the full test timeout.
  expect: {
    timeout: 30000,
  },

  use: {
    headless: false,
    // If a locator can't be acted on (not found / not actionable) within 30s,
    // the action throws → the test is marked failed → artifacts below are
    // captured. This stops the "error page shown but browser hangs open" case.
    actionTimeout: 30000,
    navigationTimeout: 30000,
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
      // Exclude the NSE Foundation specs — they have their own login
      testMatch: /testSuite(?!NSEFhappyPATHS|NsefCXOtest|IntakeNegative).*\.spec\.js/,
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
      testMatch: /testSuite(NSEFhappyPATHS|NsefCXOtest|IntakeNegative)\.spec\.js/,
      // Reuse the one-time NSEF login captured by nsef-setup.
      use: {
        storageState: 'auth.nsef.json',
      },
      dependencies: ['nsef-setup'],
    }

  ]

});