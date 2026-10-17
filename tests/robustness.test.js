import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Store, defaultData } from '../src/store.js';
import { Copilot } from '../src/service.js';
import { Engine } from '../src/engine.js';
import { windowFor, shift } from '../src/dates.js';
import { reconcilePlan } from '../src/planner.js';
import { analyticalQuery } from '../src/analytics.js';
let store, copilot;
before(() => { store = new Store(); copilot = new Copilot(store); });
after(() => store.close());
test('Temperature equality is producing for both types; absolute heat is irrelevant', () => {
  const a = store.assets.get('WELL-0001'), base = a.inspections[0];
  for (const [type, threshold] of [['T200',15],['T350',20]]) {
    const asset = { ...a, meta: { ...a.meta, well_type: type } };
    assert.equal(copilot.engine.effective(asset, { ...base, ambient_temp_c: 40, wellhead_temp_c: 40 + threshold }).producing, true);
    assert.equal(copilot.engine.effective(asset, { ...base, ambient_temp_c: 50, wellhead_temp_c: 50 + threshold - .1 }).producing, false);
  }
});
test('Calendar windows handle month ends and repair dates inclusively', () => {
  assert.equal(shift('2024-03-31', -1, 'months'), '2024-02-29');
  assert.equal(shift('2024-02-29', -1, 'years'), '2023-02-28');
  assert.deepEqual(windowFor({ count:4, unit:'months' }, '2026-10-17'), { start:'2026-06-17', end:'2026-10-17' });
  assert.deepEqual(windowFor({ year:2025 }, '2026-10-17'), { start:'2025-01-01', end:'2025-12-31' });
});
test('Spill class boundaries and major reporting use source-derived rules', () => {
  const asset = store.assets.get('WELL-0001'), base = asset.inspections.find(i => i.spill_detected);
  for (const [volume, classification, hours] of [[.9,'minor',null],[1,'moderate',null],[4.9,'moderate',null],[5,'reportable',24],[24.9,'reportable',24],[25,'major',2]]) {
    const inspection = copilot.engine.effective(asset, { ...base, spill_est_volume_bbl: volume });
    const r = copilot.engine.spillRow({ asset, inspection }, '2026-10-17');
    assert.equal(r.class, classification);
    assert.equal(r.report_due ? (new Date(r.report_due) - new Date(base.inspected_at)) / 3600000 : null, hours);
  }
});
test('Interim repair remains open after its planned finish', () => {
  const a = store.assets.get('WELL-0077');
  const r = a.repairs.find(r => r.maintenance_id === 'MNT-0077-025');
  assert.equal(copilot.engine.reportFacts(r).open, true);
  assert.match(copilot.engine.status(a, '2026-10-18').reason, /still open/);
});
test('Varying filenames are followed and containment is extracted from report text', () => {
  const a = store.assets.get('WELL-0001'), r = a.repairs.find(r => r.maintenance_id === 'MNT-0001-029');
  assert.match(r.report_file, /june-2026-flowline-spill/);
  assert.equal(copilot.engine.reportFacts(r).containmentHours, 7);
  assert.ok(store.search('bump tested monitor').some(r => r.id.includes('report') || r.id.includes('sop')));
});
test('Model plans cannot add scope filters or drop explicit user constraints', () => {
  const literal = { op:'downtime', assets:[], area:'Northeast Block 7', limit:3, period:{ count:4, unit:'months' }, visual:'bar' };
  const fixed = reconcilePlan({ op:'downtime', assets:[], area:literal.area, well_type:'T350', limit:50, visual:'table' }, literal);
  assert.deepEqual(fixed.plan, literal); assert.ok(fixed.adjustments.length > 0);
});
test('Unspecified or nonexistent correction targets ask clarification without writes', async () => {
  const before = store.knowledge.length;
  let r = await copilot.ask({ question:'WELL-0164 reading is wrong. The wellhead was re-measured at 42 °C.', userId:'U-201' });
  assert.equal(r.needs_clarification, true);
  r = await copilot.ask({ question:'The 12 Oct reading for WELL-0164 is wrong. The wellhead was re-measured at 42 °C.', userId:'U-201' });
  assert.equal(r.needs_clarification, true); assert.equal(store.knowledge.length, before);
});
test('Read-only analytical tools compute from effective records and cannot read private memory', async () => {
  const result = await analyticalQuery(copilot.engine, "SELECT well, count(*)*7 AS days, group_concat(source_id) AS source_ids FROM inspections WHERE well='WELL-0001' AND date BETWEEN '2025-01-01' AND '2025-12-31' AND producing=0 GROUP BY well", '2026-10-17');
  assert.equal(result[0].days, 21); assert.equal(result[0].source_ids.split(',').length, 3);
  const scope=copilot.engine.select({myTeam:true},copilot.engine.user('U-102')).map(a=>a.meta.asset_id);
  const scoped=await analyticalQuery(copilot.engine,'SELECT COUNT(*) AS wells FROM wells','2026-10-17',scope);
  assert.equal(scoped[0].wells,100);
  await assert.rejects(analyticalQuery(copilot.engine, 'SELECT * FROM conversations', '2026-10-17'), /no such table/);
  await assert.rejects(analyticalQuery(copilot.engine, 'DELETE FROM inspections', '2026-10-17'), /read-only SELECT/);
});
test('Appending unseen wells is additive, idempotent and survives restarts with private history', async () => {
  const local = path.resolve(import.meta.dirname, '../.local'); mkdirSync(local, { recursive:true });
  const temp = mkdtempSync(path.join(local,'import-test-')), root = path.join(temp, 'new-data'), dbfile = path.join(temp, 'state.sqlite');
  let persistent;
  try {
    mkdirSync(path.join(root,'fleet/well-types'), { recursive:true }); mkdirSync(path.join(root,'fleet/sops'), { recursive:true }); mkdirSync(path.join(root,'assets/WELL-9001'), { recursive:true });
    for (const file of ['users.json','well-types/T200.md','well-types/T350.md','sops/spill-response-sop.md','sops/regulatory-compliance-sop.md','sops/field-work-sop.md']) writeFileSync(path.join(root,'fleet',file), readFileSync(path.join(defaultData,'fleet',file)));
    const meta = structuredClone(store.assets.get('WELL-0001').meta); meta.asset_id = 'WELL-9001'; meta.area_id = 'NEW-01'; meta.last_inspection = { inspection_id:'INS-9001-001', inspected_at:'2026-10-16T10:00:00Z', inspector_user_id:'U-104' };
    writeFileSync(path.join(root,'fleet/areas.json'), JSON.stringify({ areas:[{ area_id:'NEW-01',name:'New Field',team_id:'TEAM-SW',asset_ids:['WELL-9001'],center:{lat:32,lon:-102} }],teams:[] }));
    writeFileSync(path.join(root,'assets/WELL-9001/metadata.json'), JSON.stringify(meta));
    writeFileSync(path.join(root,'assets/WELL-9001/inspections.jsonl'), JSON.stringify({ ...store.assets.get('WELL-0001').inspections[0], asset_id:'WELL-9001',inspection_id:'INS-9001-001', inspected_at:'2026-10-16T10:00:00Z',ambient_temp_c:20,wellhead_temp_c:35,spill_detected:false })+'\n');
    persistent = new Store({ roots:[defaultData,root],file:dbfile }); assert.equal(persistent.stats().wells,201);
    const c = new Copilot(persistent); const r = await c.ask({question:'Is WELL-9001 producing oil right now?',userId:'U-201',chatId:'private'}); assert.equal(r.rows[0].producing,true);
    persistent.saveKnowledge({kind:'note',asset_id:'WELL-9001',author_user_id:'U-201',text:'Shared observation',scope:'well'});
    persistent.reload(); assert.equal(persistent.stats().wells,201); assert.equal(persistent.knowledge.length,1);
    persistent.close(); persistent = new Store({file:dbfile}); assert.equal(persistent.stats().wells,201);
    assert.equal(persistent.history('U-201').length,1); assert.equal(persistent.history('U-202').length,0);
    assert.equal(persistent.knowledge[0].text,'Shared observation');
  } finally { persistent?.close(); rmSync(temp,{recursive:true,force:true}); }
});
test('Explicit date ranges are not expanded to whole years', async () => {
  const r=await copilot.ask({question:'How many days was WELL-0001 down from 1 July 2025 to 31 July 2025?',userId:'U-201'});
  assert.equal(r.rows[0].days,7);assert.deepEqual(r.range,{start:'2025-07-01',end:'2025-07-31'});
});
test('A single-well negative filter can return no matches without crashing', async () => {
  const r=await copilot.ask({question:'Which wells in WELL-0002 are not producing oil right now?',userId:'U-201'});
  assert.equal(r.rows.length,0);assert.ok(r.evidence.length);
});
test('Negative volumes cannot be turned into positive corrections', async () => {
  const count=store.knowledge.length;
  await assert.rejects(copilot.ask({question:'The 24 Sep spill estimate for WELL-0151 was wrong. The field crew measured -5 bbl.',userId:'U-201'}),/corrected measurement/);
  assert.equal(store.knowledge.length,count);
});
test('Well-specific policies do not propagate to other wells of that type', async () => {
  await copilot.ask({question:'For WELL-0102 T200 only, our team wants a pump jack root-cause analysis after 2 repairs.',userId:'U-201'});
  const r=copilot.engine.run({op:'rca',area:'Northeast Block 7',equipment:'pump_jack'},{userId:'U-201',today:'2026-10-17'});
  assert.deepEqual(r.rows.filter(r=>r.threshold===2).map(r=>r.well),['WELL-0102']);
});
test('An intervening single-well time series does not replace a private set of three wells', async () => {
  await copilot.ask({question:'Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months?',userId:'U-203'});
  await copilot.ask({question:'Show a line chart of WELL-0001 wellhead temperature for the last 13 weeks.',userId:'U-203'});
  const r=await copilot.ask({question:'For the three wells we discussed yesterday, what have repairs cost this year?',userId:'U-203',chatId:'new'});
  assert.deepEqual(r.rows.map(r=>r.well).sort(),['WELL-0107','WELL-0121','WELL-0138']);
});
test('Corrected positive detections and competing volume corrections remain visible', async () => {
  const a=store.assets.get('WELL-0001'),raw=a.inspections.find(i=>!i.spill_detected);
  const before=copilot.engine.spills([a],{start:'0001-01-01',end:'2026-10-17'}).length;
  store.saveKnowledge({kind:'correction',asset_id:a.meta.asset_id,inspection_id:raw.inspection_id,field:'spill_detected',value:true,original:false,author_user_id:'U-201'});
  assert.equal(copilot.engine.spills([a],{start:'0001-01-01',end:'2026-10-17'}).length,before+1);
  const detected=a.inspections.find(i=>i.spill_detected);
  const corrected={...a,notes:[...a.notes,{note_type:'correction',inspection_id:detected.inspection_id,note_id:'test-note',text:'Confirmed rainwater, not oil.'}]};
  assert.equal(copilot.engine.effective(corrected,detected).spill_detected,false);
  await copilot.ask({question:'The AI estimated the 24 Sep spill at WELL-0151 as 4.5 bbl. The field crew measured 5.4 bbl.',userId:'U-201'});
  const r=await copilot.ask({question:'The 24 Sep spill at WELL-0151 was wrong. The field crew measured 4.0 bbl.',userId:'U-401'});
  assert.match(r.rows[0].conflicts.join(' '),/conflicting.*unresolved/);
});
