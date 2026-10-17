import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createApp } from '../server.js';
import { defaultData, releasedData } from '../src/store.js';

const root = path.resolve(import.meta.dirname, '..');
const work = path.join(root, '.local/demo-build');
const output = path.join(root, 'docs/Fieldnote-demo.mp4');
mkdirSync(work, { recursive: true });
const segments = [
  { seconds:30, title:'Fieldnote', subtitle:'Asset Intelligence Copilot', bullets:['600 wells · 125,198 inspections · 17,415 repairs','Final analysis date: 15 January 2027','Source-linked answers, not unsupported summaries'], text:'Welcome to Fieldnote, an asset intelligence copilot built for the FlytBase challenge. This video uses synthetic narration. The final snapshot contains six hundred wells, over one hundred twenty five thousand inspections, and seventeen thousand four hundred fifteen maintenance records. Fieldnote connects those records with operator notes and operating procedures, so an operational answer can be checked against its original evidence.' },
  { seconds:30, title:'System architecture', subtitle:'From a question to an auditable result', bullets:['Browser chat → Node.js API','Gemma 4 plan → scope and date checks','Deterministic tools → SQLite and full-text retrieval','Result → tables, charts, source citations'], text:'The browser sends a question to a Node.js application. In AI mode, Gemma four, through Google’s Gemini API, proposes a structured plan. The application checks literal scope, dates, and supported operations. Deterministic tools calculate the results from SQLite records and retrieved source documents. The browser then renders tables, charts, and citations. This is a hybrid architecture, with explicit rules protecting the numerical analysis.' },
  { seconds:30, title:'How it was built', subtitle:'Ingestion · planning · analysis · evidence', bullets:['Node.js 24 · SQLite / FTS5 · JavaScript browser UI','Snapshot revisions preserve original evidence','Shared field facts retain attribution','Private preferences and conversation history stay per user'], text:'The implementation separates ingestion, planning, field operations, memory, and presentation. Revised snapshots supersede changed record identifiers while retaining provenance. Shared operational claims keep the speaker and verification status, while private preferences stay with their author. The application was developed with AI assistance through OpenCode. Playwright drives browser verification, including the exact final questions, their named users, and their multi-turn sessions.' },
  { seconds:30, title:'Measured final-question replay', subtitle:'A recorded result, not an official answer key', bullets:['11 final questions · 21 browser turns','18 model-backed reads · 3 local memory writes','0 provider fallbacks in that saved run','Next: a fresh end-to-end gas-response audit in Local analysis'], text:'The saved final replay completed all twenty one turns of the eleven final questions. It recorded eighteen model-backed read turns, three local memory writes, and zero provider fallbacks. These are measured application results, not an official answer key. Missing measurements remain unknown, and risk rankings are labeled heuristics. For the next three minutes, we will run a fresh gas-response audit using the application’s explicitly selected local analysis mode.' },
  { seconds:30, text:'The live application is now open with the six hundred well dataset. We select Laura Simmons and local analysis, then enter the actual final question. Since November first, every time an operator note reports gas at a well, did someone reach that well within the operating procedure’s deadline? We submit through the normal browser composer. This executes the application, rather than replaying a saved answer.' },
  { seconds:30, text:'The answer contains twenty six operator gas reports. Seventeen met the field-response deadline and nine missed it. The table is backed by timestamped reports and response records. The deadline changes at January first: earlier reports allow twenty four hours, while January reports allow twelve. Only a later maintenance start or manual inspection on the same well qualifies. Drone inspections do not count as a field response.' },
  { seconds:30, text:'Now we inspect the result data. Filtering for missed responses isolates the exceptions that need attention. Each row retains the well, report timestamp, qualifying response, elapsed hours, and applicable deadline. This makes the compliance decision reviewable instead of presenting only a fleet total. The complete result remains available in the data panel, including rows that are paginated in the compact chat interface.' },
  { seconds:30, text:'Next we open Sources and inspect an original operator note behind the answer. The record contains the reported observation and its timestamp, along with attribution. This is the evidence that starts the response clock. Fieldnote keeps the original source accessible, so a reviewer can distinguish what the operator actually reported from the interpretation and calculation produced by the application.' },
  { seconds:30, text:'We now open the operating procedure that defines the response requirement. Its effective dates explain why the audit uses different deadlines before and after January first. The procedure is retrieved from the loaded challenge documents, not invented from general industry knowledge. A sourced note, an eligible response record, and the dated operating rule together determine whether each row is marked met or missed.' },
  { seconds:18, text:'Finally, the details panel shows how this answer was produced, including its local execution mode and technical plan. This completes the workflow from question to calculation to source evidence. The accompanying three-page report covers architecture and results for all eleven final questions.' },
];
writeFileSync(path.join(work, 'narration.json'), JSON.stringify(segments, null, 2));
execFileSync('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/narrate-demo.ps1'),'-Manifest',path.join(work,'narration.json'),'-OutputDirectory',work], { stdio:'inherit' });
const probe = file => JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
for (let i=0;i<segments.length;i++) {
  const duration = Number(probe(path.join(work,`${i}.wav`)).format.duration);
  const speed = duration > segments[i].seconds - 1 ? duration / (segments[i].seconds - 1) : 1;
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',path.join(work,`${i}.wav`),'-af',`atempo=${speed},apad`,'-t',String(segments[i].seconds),'-ar','48000','-ac','1',path.join(work,`padded-${i}.wav`)],{stdio:'inherit'});
}
writeFileSync(path.join(work,'concat.txt'),segments.map((_,i)=>`file 'padded-${i}.wav'`).join('\n'));
execFileSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',path.join(work,'concat.txt'),'-c','copy',path.join(work,'narration.wav')],{stdio:'inherit'});

const {server,store} = createApp({roots:[defaultData,releasedData],allowRevisions:true,database:':memory:',today:'2027-01-15'});
assert.equal(store.assets.size,600);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:work,size:{width:1600,height:1000}}, reducedMotion:'reduce'});
const page = await context.newPage();
const video = page.video();
const start = performance.now();
const until = async seconds => { const remaining = seconds*1000-(performance.now()-start); if(remaining>0)await page.waitForTimeout(remaining); };
const badge = async () => page.evaluate(()=>{const b=document.createElement('div');b.textContent='SYNTHETIC NARRATION • LIVE LOCAL ANALYSIS';b.style.cssText='position:fixed;top:0;right:0;background:#251736;color:#d7c4ef;padding:5px 12px;font:12px Arial;z-index:99999;pointer-events:none';document.body.append(b);});
let response;
try {
  for(let i=0;i<4;i++) {
    const s=segments[i];
    await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#100c16;color:#f4edf9;font-family:Arial;padding:100px 120px}small{color:#b5a1c5;letter-spacing:3px}h1{font-size:68px;line-height:1.05;margin:32px 0;color:#d1afff}h2{font-size:30px;font-weight:400;color:#c2b5ce;margin-bottom:55px}li{font-size:29px;line-height:1.8}footer{position:fixed;bottom:45px;color:#9c8dab;font-size:18px}</style><small>FIELDNOTE / SYSTEM DESIGN / ${i+1} OF 4</small><h1>${s.title}</h1><h2>${s.subtitle}</h2><ul>${s.bullets.map(b=>`<li>${b}</li>`).join('')}</ul><footer>AI-generated synthetic narration · Architecture 0:00–2:00 · Live workflow 2:00–4:48</footer></html>`);
    await until((i+1)*30);
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#well-count').filter({hasText:'600'}).waitFor();
  await badge();
  await page.getByLabel('Current user').selectOption('U-401');
  await page.getByLabel('Reasoning mode').selectOption('local');
  await page.getByRole('button',{name:'New conversation'}).click();
  await page.getByLabel('Ask your copilot').pressSequentially('Since 1 Nov 2026, every time an operator note reports gas at a well, did we get someone out to that well in time under our operating procedures? List every report and whether the response met the deadline.',{delay:25});
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Send question'}).click();
  response=await(await pending).json();
  await page.locator('.loading').waitFor({state:'detached'});
  assert.equal(response.mode,'local');assert.equal(response.rows.length,26);assert.equal(response.rows.filter(r=>r.result==='Met').length,17);
  await page.locator('.answer-message').last().scrollIntoViewIfNeeded();
  await until(150);
  await page.locator('.answer-message').last().locator('.answer-summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(work,'live-answer.png')});
  await until(180);
  await page.locator('.answer-message').last().getByRole('button',{name:/^Data/}).click();
  await page.getByLabel('Filter results').fill('Missed');
  await until(210);
  await page.locator('#close-drawer').click();
  const openSource = async id => {
    await page.locator('.answer-message').last().getByRole('button',{name:/^Sources/}).click();
    await page.getByLabel('Search sources').fill(id);
    const sourceResponse = page.waitForResponse(r=>r.url().includes('/api/source?'));
    await page.getByRole('button',{name:id,exact:true}).click();
    await sourceResponse;
    await page.waitForTimeout(500);
  };
  const noteId=response.rows[0].evidence[0];
  await openSource(noteId);
  await page.screenshot({path:path.join(work,'live-note.png')});
  await until(240);
  await page.locator('#close-drawer').click();
  await openSource('fleet/sops/operations-sop-rev2.md');
  await page.screenshot({path:path.join(work,'live-rule.png')});
  await until(270);
  await page.locator('#close-drawer').click();
  await page.locator('.answer-message').last().getByRole('button',{name:'Details',exact:true}).click();
  await page.getByText('Technical plan, model usage & retry diagnostics',{exact:true}).click();
  await page.screenshot({path:path.join(work,'live-details.png')});
  await until(288);
} finally {
  await context.close();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
execFileSync('ffmpeg',['-y','-loglevel','error','-i',await video.path(),'-i',path.join(work,'narration.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-t','288',output],{stdio:'inherit'});
const metadata=probe(output);
assert(Number(metadata.format.duration)<=290);assert(metadata.streams.some(s=>s.codec_type==='audio'));assert(metadata.streams.some(s=>s.codec_type==='video'));
writeFileSync(path.join(root,'results/demo-verification.json'),JSON.stringify({generated_at:new Date().toISOString(),synthetic_narration:true,mode:response.mode,duration_seconds:Number(metadata.format.duration),video:'docs/Fieldnote-demo.mp4',scenario:'Q3 gas-response audit',reports:response.rows.length,met:17,missed:9,real_browser_execution:true,architecture_seconds:120,workflow_seconds:168},null,2));
console.log(`Created ${output}: ${metadata.format.duration}s, audio and video verified.`);
