import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { defaultData, releasedData } from '../src/store.js';
import { finalCases } from '../tests/final-cases.js';

const live=process.argv.includes('--live'),today='2027-01-15';
const {server,store}=createApp({roots:[defaultData,releasedData],allowRevisions:true,database:':memory:',today});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const results=[];let firstRecall=[],riskWells=[];
mkdirSync(new URL('../results/',import.meta.url),{recursive:true});
const save=()=>writeFileSync(new URL(`../results/final-${live?'live':'local'}-evaluation.json`,import.meta.url),JSON.stringify({generated_at:new Date().toISOString(),analysis_date:today,dataset:store.stats(),mode:live?'model-with-disclosed-fallback':'local',official_answer_key_available:false,completed_turns:results.length,passed_checks:results.filter(r=>r.pass).length,results},null,2));
try {
  for(const item of finalCases()) {
    const start=performance.now();let response;
    try {
      if(live)await new Promise(r=>setTimeout(r,1800));
      const http=await fetch(`http://127.0.0.1:${server.address().port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...item,today,mode:live?'model':'local'})});
      response=await http.json();assert.equal(http.status,200,response.error);assert.ok(response.summary?.length);
      assert.ok(response.evidence?.length||response.needs_clarification);
      if(item.number===1||item.number===2)assert.equal(response.unanswerable,true);
      if(item.number===3){assert.equal(response.plan.op,'gas_reports');assert.ok(response.rows.length);assert.ok(response.rows.every(r=>r.deadline_hours===(r.reported_at<'2027-01-01'?24:12)));}
      if(item.number===4){assert.equal(response.plan.op,'bypasses');assert.ok(response.rows.length);assert.ok(response.rows.filter(r=>r.approval==='MOC-2026-044').every(r=>r.approval_valid_until==='2027-02-28'));}
      if(item.number===5){assert.equal(response.plan.op,'regulator_letter');assert.ok(response.rows.every(r=>r.barrels>=5&&r.date>='2026-06-01'));}
      if(item.number===6){assert.equal(response.plan.op,'status_conflicts');assert.ok(response.rows.length);assert.equal(response.plan.myTeam,undefined);}
      if(item.number===7&&item.turn===1){assert.equal(response.rows.length,10);riskWells=response.rows.map(r=>r.well);assert.ok(response.rows.every(r=>r.operator_note_evidence&&r.last_repair));}
      if(item.number===7&&item.turn===2){assert.equal(response.rows.length,3);assert.ok(response.rows.every(r=>riskWells.includes(r.well)));}
      if(item.number===8&&item.turn===1){assert.equal(store.knowledge.at(-1).kind,'pump_replacement_claim');assert.equal(store.knowledge.at(-1).accepted,true);}
      if(item.number===8&&item.turn===2){assert.equal(store.preferences('U-601').length,1);assert.equal(store.preferences('U-301').length,0);}
      if(item.number===8&&item.turn===3){assert.ok(!response.rows.some(r=>r.well==='WELL-0333'));assert.equal(response.personalization,undefined);}
      if(item.number===8&&item.turn===4){assert.equal(store.knowledge.at(-1).accepted,false);assert.match(response.summary,/unconfirmed/);}
      if(item.number===8&&item.turn===5){assert.equal(response.personalization.costThousands,true);assert.ok(response.rows.every(r=>store.assets.get(r.well).meta.team_id==='TEAM-NW'));for(const r of response.rows){const job=store.assets.get(r.well).repairs.find(j=>j.maintenance_id===r.installation_id);assert.equal(r.installation_cost_usd_thousands,job.cost_usd.total/1000);}}
      if(item.number===9&&item.turn===1){firstRecall=response.well_ids;assert.ok(firstRecall.includes('WELL-0577'));assert.ok(!firstRecall.includes('WELL-0333'));}
      if(item.number===9&&item.turn===2){assert.equal(response.rows[0].lead,'Nathan Pierce');assert.equal(response.rows[0].wells,[...store.assets.values()].filter(a=>a.meta.team_id==='TEAM-NW').length);}
      if(item.number===9&&item.turn===3){assert.equal(response.rows.length,1);assert.equal(response.rows[0].result,'Missed');}
      if(item.number===9&&item.turn===4){assert.equal(response.unanswerable,true);assert.ok(response.rows.every(r=>r.h2s_ppm===null));}
      if(item.number===9&&item.turn===5){assert.ok(response.rows.length);assert.ok(response.rows.every(r=>firstRecall.includes(r.well)));assert.equal(response.plan.firstQuestion,true);}
      if(item.number===9&&item.turn===6){assert.equal(response.rows.length,1);assert.ok(response.plan.assets.includes(response.rows[0].well));}
      if(item.number===10){assert.equal(response.visual,'table');assert.equal(response.additional_visuals[0].type,'stacked_bar');for(const area of new Set(response.rows.map(r=>r.area)))assert.ok(Math.abs(response.rows.filter(r=>r.area===area).reduce((s,r)=>s+r.share_pct,0)-100)<.3);}
      if(item.number===11){assert.equal(response.plan.op,'hotter');assert.ok(response.rows.length>=4);assert.ok(response.methodology);}
      results.push({...item,pass:true,seconds:(performance.now()-start)/1000,response});console.log(`PASS Q${item.number}.${item.turn} ${response.plan.op}: ${response.rows.length} rows, ${((performance.now()-start)/1000).toFixed(2)}s`);
    }catch(error){results.push({...item,pass:false,error:error.message,seconds:(performance.now()-start)/1000,response});console.error(`FAIL Q${item.number}.${item.turn}: ${error.message}`);}
    save();
  }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log(`${results.filter(r=>r.pass).length}/${results.length} final turns passed the implemented source/rule checks. No official numerical answer key was supplied.`);
if(results.some(r=>!r.pass))process.exitCode=1;
