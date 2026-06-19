import 'dotenv/config';
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
      testMatch: /testSuite(?!NSEFhappyPATHS|NsefCXOtest).*\.spec\.js/,
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
      testMatch: /testSuite(NSEFhappyPATHS|NsefCXOtest)\.spec\.js/,
      // Reuse the one-time NSEF login captured by nsef-setup.
      use: {
        storageState: 'auth.nsef.json',
      },
      dependencies: ['nsef-setup'],
    }

  ]

});