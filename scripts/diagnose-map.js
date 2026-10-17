import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

const { server } = createApp({ database: ':memory:' });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const requests = [], responses = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('request', request => {
    if (request.url().startsWith('https://tile.openstreetmap.org/')) requests.push({ url: request.url(), referer: request.headers().referer || null });
  });
  page.on('response', response => {
    if (response.url().startsWith('https://tile.openstreetmap.org/')) responses.push({ url: response.url(), status: response.status(), content_type: response.headers()['content-type'] });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#well-count').filter({ hasText: '200' }).waitFor();
  await page.getByLabel('Reasoning mode').selectOption('local');
  await page.getByLabel('Ask your copilot').fill('Show on a map every well in Northeast Block 8 with a real spill in the last 90 days.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.locator('.map-marker').first().waitFor();
  await page.waitForTimeout(8000);
  const pins = await page.locator('.map-marker').count();
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
  await page.locator('.map').screenshot({ path: fileURLToPath(new URL('../results/map-diagnostic.png', import.meta.url)) });
  const report = { generated_at: new Date().toISOString(), requests, responses, pins, basemap: await page.locator('.map').getAttribute('data-basemap'), caption: await page.locator('.map-caption').textContent() };
  writeFileSync(new URL('../results/map-diagnostic.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(pins, 4);
  assert.ok(responses.length, 'No tile response received.');
  assert.ok(responses.every(r => r.status === 200), 'A map tile was rejected.');
  assert.ok(requests.every(r => r.referer), 'Map tile requests lack an identifying browser Referer.');
  assert.equal(report.basemap, 'ready', 'Tile responses must decode and render successfully.');
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
