import { defineConfig, devices } from '@playwright/test';

/**
 * Matriz de navegadores y dispositivos (RNF-07 / RNF-08). El sistema debe estar levantado
 * (docker compose up -d --build) y las sesiones preparadas con `node e2e/prepare-sessions.js`.
 *   cd e2e && npm install && npx playwright install chromium firefox webkit && npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: 1,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'results/resultados.json' }]],
  outputDir: 'results/artefactos',
  use: {
    baseURL: process.env.BASE_URL ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    trace: 'off',
  },
  projects: [
    // Chrome / Edge (motor Chromium), Firefox y Safari (motor WebKit) en escritorio 1920×1080
    { name: 'chromium-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'firefox-1920', use: { ...devices['Desktop Firefox'], viewport: { width: 1920, height: 1080 } } },
    { name: 'webkit-1920', use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } } },
    // Portátil 1366×768
    { name: 'chromium-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'firefox-1366', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
    { name: 'webkit-1366', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
    // Tabletas ≥ 10,5" con pantalla táctil: iPad Pro 11" (Safari/WebKit) y tableta Android 10,5" (Chrome)
    { name: 'tablet-ipad-webkit', use: { ...devices['iPad Pro 11 landscape'] } },
    { name: 'tablet-ipad-vertical-webkit', use: { ...devices['iPad Pro 11'] } },
    { name: 'tablet-android-chromium', use: { ...devices['Galaxy Tab S4 landscape'], viewport: { width: 1280, height: 800 } } },
  ],
});
