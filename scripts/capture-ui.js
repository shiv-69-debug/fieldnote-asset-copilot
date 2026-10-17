import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createApp } from '../server.js';
const {server}=createApp({database:':memory:'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();
try {
  mkdirSync(new URL('../docs/assets/',import.meta.url),{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#well-count').filter({hasText:'200'}).waitFor();
  await page.getByLabel('Reasoning mode').selectOption('local');
  await page.screenshot({path:new URL('../docs/assets/workspace.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  await page.getByLabel('Ask your copilot').fill('Is WELL-0001 producing oil right now? When was it last inspected, and by whom?');
  await page.getByRole('button',{name:'Send question'}).click();
  await page.locator('[data-visual="card"]').waitFor();
  await page.locator('#chat-scroll').evaluate(node=>node.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:new URL('../docs/assets/status.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#chat-scroll').evaluate(node=>node.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:new URL('../docs/assets/mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  await page.getByRole('button',{name:'Toggle sidebar'}).click();
  await page.getByRole('button',{name:'New conversation'}).click();
  await page.locator('#welcome').waitFor({state:'visible'});
  await page.screenshot({path:new URL('../docs/assets/mobile-workspace.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  console.log('Captured actual local-mode UI screenshots in docs/assets/.');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
