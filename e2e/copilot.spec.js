import { test, expect } from '@playwright/test';
import { questions } from '../tests/scenarios.js';
async function ask(page, question) {
  await page.getByLabel('Ask your copilot').fill(question);
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(page.locator('.error')).toHaveCount(0);
  return page.locator('.answer-message').last();
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('#well-count')).toHaveText('200'); await page.getByLabel('Reasoning mode').selectOption('local'); });
test('Welcome, status card, exact source and accessible keyboard input', async ({ page }) => {
  await expect(page.getByText('Every well has a story.')).toBeVisible();
  const answer = await ask(page, questions[0]);
  await expect(answer.locator('[data-visual="card"]')).toContainText('Not producing');
  await expect(answer).toContainText('3.2 °C');
  await answer.getByRole('button', { name: /^Sources/ }).click();
  await page.getByRole('button', { name: 'INS-0001-0203', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('25.6');
  await expect(page.locator('dialog')).toContainText('inspections.jsonl');
});
test('All analytical visuals render inline with accessible data', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  for (const [q, kind] of [[questions[1],'table'],[questions[2],'line'],[questions[5],'bar'],[questions[6],'map'],[questions[7],'heatmap']]) {
    const answer = await ask(page, q);
    await expect(answer.locator(`[data-visual="${kind}"]`)).toBeVisible();
    if (kind === 'map') { await expect(answer.locator('.map-marker')).toHaveCount(4); await answer.locator('.map-marker').first().click(); await expect(answer.locator('.map-popup')).toContainText('WELL-0151'); }
    if (['bar','line'].includes(kind)) await expect(answer.locator('svg')).toBeVisible();
  }
});
test('Correction reaches another user; conversations remain private', async ({ page }) => {
  await ask(page, questions[5]);
  await page.getByRole('button', { name: 'New conversation' }).click();
  await expect(await ask(page, questions[10])).toContainText('25,794');
  await ask(page, questions[11]);
  await page.getByLabel('Current user').selectOption('U-202');
  await expect(await ask(page, questions[14])).toContainText('Michael Turner');
  await expect(page.locator('.answer-message').last()).toContainText('Pump jack not moving');
  const noMemory = await ask(page, questions[10]);
  await expect(noMemory).toContainText('no such earlier conversation');
  await expect(noMemory).not.toContainText('25,794');
  await page.getByRole('button', { name: 'Shared knowledge' }).click();
  await expect(page.locator('dialog')).toContainText('Original: 24 → corrected: 41');
});
test('Narrow-screen usability and untrusted text stays text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await page.getByLabel('Current user').selectOption('U-201');
  const answer = await ask(page, 'WELL-0007 is down for planned work. <img src=x onerror=alert(1)>');
  await expect(answer).toContainText('<img src=x onerror=alert(1)>');
  await expect(answer.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Send question' })).toBeVisible();
});
test('Simultaneous readings align on a shared multi-well date axis', async ({ page }) => {
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat') && r.request().method()==='POST');
  const answer=await ask(page,'Show a line chart of WELL-0001 and WELL-0002 wellhead temperature against air temperature for the last 13 weeks.');
  const data=await (await pending).json();
  const one=data.rows.filter(r=>r.well==='WELL-0001'),two=data.rows.filter(r=>r.well==='WELL-0002');
  const date=one.find(r=>two.some(s=>s.date===r.date)).date;
  const lines=await answer.locator('svg polyline').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points').split(' ').map(p=>Number(p.split(',')[0]))));
  expect(lines[0][one.findIndex(r=>r.date===date)]).toBeCloseTo(lines[1][two.findIndex(r=>r.date===date)],5);
  await expect(answer.locator('.legend')).toContainText('WELL-0001');
  await expect(answer.locator('.legend')).toContainText('WELL-0002');
});
test('Unavailable model uses a visibly labeled supported local fallback', async ({ page }) => {
  await page.getByLabel('Reasoning mode').selectOption('model');
  const answer=await ask(page,questions[0]);
  await expect(answer.locator('.notice')).toContainText('Local fallback used');
  await expect(answer).toContainText('Not producing');
  await answer.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('No local AI model was run');
});

const tilePixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', 'base64');

test('Map tile requests include the real page origin as Referer', async ({ page }) => {
  const referrers = [];
  await page.route('https://tile.openstreetmap.org/**', async route => {
    referrers.push((await route.request().allHeaders()).referer || null);
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: tilePixel });
  });
  await ask(page, questions[6]);
  await expect.poll(() => referrers.length).toBeGreaterThan(0);
  expect(referrers.every(value => value === new URL(page.url()).origin + '/')).toBe(true);
  await expect(page.locator('.map')).toHaveAttribute('data-basemap', 'ready');
  await expect(page.locator('.map-tile').first()).toBeVisible();
  await expect(page.locator('.map-marker')).toHaveCount(4);
});

test('HTTP 403 images never cover the map; coordinates and evidence stay available', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    status: 403, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: tilePixel,
  }));
  const answer = await ask(page, questions[6]);
  await expect(answer.locator('.map-caption')).toContainText('geographic coordinate view');
  await expect(answer.locator('.map-tile:visible')).toHaveCount(0);
  await expect(answer.getByRole('img', { name: 'Geographic coordinate grid' })).toBeVisible();
  await expect(answer.locator('.map-marker')).toHaveCount(4);
  await answer.locator('.map-marker').first().click();
  await expect(answer.locator('.map-popup')).toContainText('32.12246, -102.18445');
  await expect(answer.locator('.map-popup')).toContainText('INS-0151-0201');
});

test('Chat gives messages most of the viewport while retaining readable text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ask(page, questions[0]);
  const layout = await page.evaluate(() => ({
    viewport: innerHeight,
    messages: document.querySelector('#chat-scroll').getBoundingClientRect().height,
    header: document.querySelector('main > header').getBoundingClientRect().height,
    composer: document.querySelector('.composer-wrap').getBoundingClientRect().height,
    font: parseFloat(getComputedStyle(document.querySelector('.answer-summary')).fontSize),
  }));
  expect(layout.messages / layout.viewport).toBeGreaterThan(.70);
  expect(layout.header).toBeLessThanOrEqual(76);
  expect(layout.composer).toBeLessThanOrEqual(150);
  expect(layout.font).toBeGreaterThanOrEqual(15);
});

test('Malformed saved-style model output and raw document dumps do not fill the chat', async ({ page }) => {
  await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    summary: 'The provided excerpts do not contain information regarding ' + '"'.repeat(2100),
    rows: [{ title: 'T200 manual', excerpt: 'Raw manual content '.repeat(1000) }], visual: 'table',
    evidence: [{ id: 'fleet/well-types/T200.md', kind: 'document', path: 'fleet/well-types/T200.md' }],
    analysis_date: '2026-10-17', mode: 'model', plan: { op: 'search' }, telemetry: { model: 'explicit-test-fixture' },
  }) }));
  const answer = await ask(page, 'Remembering past conversations');
  await expect(answer.locator('.answer-summary')).toContainText('malformed');
  await expect(answer.locator('.answer-summary')).not.toContainText('"'.repeat(80));
  await expect(answer.locator('table')).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Ask again', exact: true })).toBeVisible();
});

test('The recorded heading opens private memory sources instead of a manual dump', async ({ page }) => {
  await ask(page, questions[5]);
  await page.getByLabel('Reasoning mode').selectOption('model');
  const answer = await ask(page, 'Remembering past conversations');
  await expect(answer).toContainText('Michael Turner');
  await expect(answer).toContainText('Which discussion or wells');
  await expect(answer.locator('table')).toHaveCount(0);
  await answer.getByRole('button', { name: /^Sources/ }).click();
  await page.locator('.source-item').first().click();
  await expect(page.locator('dialog')).toContainText('Your earlier conversation');
  await expect(page.locator('dialog')).toContainText('most downtime');
});

test('Sidebar collapse, result filtering and latest-message navigation work', async ({ page }) => {
  const answer = await ask(page, 'Show the status of all wells in a table.');
  await expect(answer.locator('tbody tr')).toHaveCount(8);
  await answer.getByRole('button', { name: 'Data (200)', exact: true }).click();
  await page.getByLabel('Filter results').fill('WELL-0001');
  await expect(page.locator('dialog tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await ask(page, questions[0]);
  await page.locator('#chat-scroll').evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('button', { name: 'Jump to latest message' })).toBeVisible();
  await page.getByRole('button', { name: 'Jump to latest message' }).click();
  await expect(page.getByRole('button', { name: 'Jump to latest message' })).toBeHidden();
});
