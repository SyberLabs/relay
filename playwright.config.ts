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
  // The full browser job runs the operative spec on a second D1; skip it
  // here so Inspect send still has daily start capacity on the shared DB.
  testIgnore: [
    ...(process.env.RELAY_E2E_SKIP_OPERATIVE
      ? ['operative-extension.spec.ts']
      : []),
    ...(process.env.RELAY_OWNER_A_JWT && process.env.RELAY_OWNER_B_JWT
      ? []
      : ['isolation.spec.ts']),
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
