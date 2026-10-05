import { defineConfig, devices } from '@playwright/test'

/**
 * Ende-zu-Ende-Tests: echtes Backend (Wegwerf-SQLite mit Testdaten, backend/test/e2e-server.ts) + Frontend.
 * Eigene Ports (3100/5100), damit ein laufender Entwicklungs-Server nicht stört.
 *
 *   npm run e2e                     # Chromium (vorher einmal: npx playwright install chromium)
 *   PW_CHANNEL=msedge npm run e2e   # lokal installierten Edge/Chrome verwenden statt Download
 *
 * In der CI wird das Frontend vorher gebaut (`npm run build`) und mit `next start` gestartet.
 */
const FRONTEND_PORT = 3100
const BACKEND_PORT = 5100
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: FRONTEND_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL || undefined },
    },
  ],
  webServer: [
    {
      command: 'npx tsx test/e2e-server.ts',
      cwd: '../backend',
      url: `${BACKEND_URL}/health`,
      env: { PORT: String(BACKEND_PORT), CORS_ORIGIN: FRONTEND_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: process.env.CI ? `npx next start -p ${FRONTEND_PORT}` : `npx next dev -p ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      env: { NEXT_PUBLIC_API_URL: BACKEND_URL },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
