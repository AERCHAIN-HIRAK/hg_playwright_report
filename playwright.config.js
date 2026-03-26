import { defineConfig } from '@playwright/test';

export default defineConfig({

  testDir: './tests',

  reporter: [
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }]
  ],

  use: {
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [

    {
      name: 'setup',
      testMatch: /auth.setup.js/,
    },

    {
      name: 'tests',
      testMatch: /.*\.spec\.js/,   // ✅ IMPORTANT FIX
      use: {
        storageState: 'auth.json',
      },
      dependencies: ['setup'],
    }

  ]

});