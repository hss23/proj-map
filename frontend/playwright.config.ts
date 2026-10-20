import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * End-to-end tests run the real stack: a freshly seeded backend (own DB file
 * and port) plus a production build of the frontend proxying to it. Nothing
 * touches the dev database or dev servers.
 */
const BACKEND_PORT = 4100;
const FRONTEND_PORT = 3100;
const E2E_DB = path.resolve(__dirname, '../backend/data/e2e.db');

export default defineConfig({
  testDir: './e2e',
  // Tests share one backend and mutate queues, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // Uses the locally installed Chrome by default (no browser download).
    // Set PW_CHANNEL=chromium after `npx playwright install chromium` (e.g. on CI).
    channel: process.env.PW_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off', // needs a separate ffmpeg download; traces + screenshots cover debugging
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL || 'chrome' },
    },
  ],
  webServer: [
    {
      // Fresh deterministic dataset on every run.
      command: 'npx tsx src/db/seed.ts && npx tsx src/index.ts',
      cwd: path.resolve(__dirname, '../backend'),
      env: { PORT: String(BACKEND_PORT), DB_PATH: E2E_DB, NODE_ENV: 'test' },
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npm run build && npx next start -p ${FRONTEND_PORT}`,
      env: { BACKEND_URL: `http://localhost:${BACKEND_PORT}`, NEXT_TELEMETRY_DISABLED: '1' },
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
