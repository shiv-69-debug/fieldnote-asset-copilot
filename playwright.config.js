import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3199', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/test-server.js', url: 'http://127.0.0.1:3199/api/bootstrap', reuseExistingServer: false, timeout: 60000 },
});
