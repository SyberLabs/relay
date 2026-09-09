import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retrying data-changing journeys can conceal a broken first execution.
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.RELAY_TEST_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Isolation uses production Access JWTs from run-production.mjs.
  // The operative project runs first so Inspect send still has daily start
  // capacity on the shared fictional D1 (10 starts/owner/UTC day).
  projects: [
    {
      name: 'operative',
      testMatch: '**/operative-extension.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['operative'],
      testIgnore: [
        '**/operative-extension.spec.ts',
        ...(process.env.RELAY_OWNER_A_JWT && process.env.RELAY_OWNER_B_JWT
          ? []
          : ['**/isolation.spec.ts']),
      ],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
