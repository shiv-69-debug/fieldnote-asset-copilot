import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';
import { defaultData, releasedData } from '../src/store.js';
import { finalCases } from '../tests/final-cases.js';
const live=process.argv.includes('--live');
const {server,store}=createApp({roots:[defaultData,releasedData],allowRevisions:true,database:':memory:',today:'2027-01-15'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(),results=[];
const folder=new URL('../results/final-browser/',import.meta.url);mkdirSync(folder,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#well-count').filter({hasText:'600'}).waitFor();
  await page.getByLabel('Reasoning mode').selectOption(live?'model':'local');let currentSession='';
  for(const item of finalCases()) {
    const session=item.userId+':'+item.chatId;
    if(await page.getByLabel('Current user').inputValue()!==item.userId)await page.getByLabel('Current user').selectOption(item.userId);
    if(currentSession!==session){await page.getByRole('button',{name:'New conversation'}).click();currentSession=session;}
    await page.getByLabel('Ask your copilot').fill(item.question);
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST',{timeout:300000});
    await page.getByRole('button',{name:'Send question'}).click();const http=await pending,response=await http.json();
    await page.locator('.loading').waitFor({state:'detached',timeout:300000});
    const errors=await page.locator('.error').count();
    const ok=http.status()===200&&errors===0&&Boolean(response.summary);
    results.push({...item,ok,response});
    await page.screenshot({path:fileURLToPath(new URL(`Q${item.number}-${item.turn}.png`,folder))});
    writeFileSync(new URL('../results/final-browser-evaluation.json',import.meta.url),JSON.stringify({generated_at:new Date().toISOString(),dataset:store.stats(),mode:live?'model-with-disclosed-fallback':'local',completed:results.length,passed:results.filter(r=>r.ok).length,results},null,2));
    console.log(`${ok?'PASS':'FAIL'} typed Q${item.number}.${item.turn} as ${store.users.get(item.userId).name}: ${response.plan?.op} (${response.mode})`);
    if(!ok)throw Error(response.error||'Browser displayed an error');
    if(live)await new Promise(resolve=>setTimeout(resolve,2000));
  }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
