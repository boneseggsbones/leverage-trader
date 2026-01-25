import { defineConfig } from '@playwright/test';

// Playwright config: restrict testDir to the playwright tests folder so Jest-style backend
// tests (e.g. backend/src/*.test.ts) aren't picked up by the Playwright runner.
export default defineConfig({
  testDir: 'tests/playwright',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  // testMatch is the replacement for deprecated ignoreTestFiles
  testMatch: '**/*.spec.ts',
});
