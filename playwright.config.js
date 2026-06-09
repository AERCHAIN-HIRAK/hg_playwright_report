import { defineConfig } from '@playwright/test';

export default defineConfig({

  testDir: './tests',

  reporter: [
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }]
  ],

  timeout: 120000,

  use: {
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [

    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    {
      name: 'tests',
      // Exclude the NSE Foundation spec — it has its own login
      testMatch: /testSuite(?!DirectPoGrn).*\.spec\.js/,
      use: {
        storageState: 'auth.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'nsef-tests',
      testMatch: /testSuiteDirectPoGrnInvoiceWorkflow\.spec\.js/,
      // Fresh browser — no stored state, no setup dependency
    }

  ]

});