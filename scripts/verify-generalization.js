import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from '../server.js';
const {server,store} = createApp({database:':memory:'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const results=[];
try {
  for (const question of [
    'What is the average difference between wellhead and air temperatures in Northeast Block 8 in 2026? Show a table.',
    'Which maintenance reports in 2026 say WS-03 was not met? Show a table.',
    'What must the crew do when an H2S monitor reads 10 ppm?',
  ]) {
    const httpResponse=await fetch(`http://127.0.0.1:${server.address().port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,userId:'U-201',mode:'model',today:'2026-10-17',chatId:'generalization'})});
    const response=await httpResponse.json();
    results.push({question,response});
    console.log('PLAN',JSON.stringify(response.plan));
    assert.equal(httpResponse.status,200,JSON.stringify(response));
    assert.ok(['model','local-fallback'].includes(response.mode));
    assert.ok(response.evidence.length);
    if(question.startsWith('What is the average')) {
      assert.equal(response.plan.op,'query');
      const readings=[...store.assets.values()].filter(a=>a.meta.area_id==='NE-08').flatMap(a=>a.inspections.filter(i=>i.inspected_at.startsWith('2026')));
      const mean=readings.reduce((n,i)=>n+i.wellhead_temp_c-i.ambient_temp_c,0)/readings.length;
      const numbers=Object.values(response.rows[0]).filter(v=>typeof v==='number');
      assert.ok(numbers.some(n=>Math.abs(n-mean)<.02),'Average must agree with independently calculated raw measurements.');
    } else if(question.includes('WS-03')) {
      assert.equal(response.plan.op,'report_checks'); assert.ok(response.rows.length>0);
      for(const row of response.rows) assert.match(JSON.stringify(row),/bump|Not met|not met/);
    } else { assert.match(response.summary,/upwind/i); assert.match(response.summary,/HSE/); assert.match(response.summary,/below 10|less than 10|<\s*10/i); }
    console.log('PASS',question,`(${response.mode})`);
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
} finally {
  mkdirSync(new URL('../results/',import.meta.url),{recursive:true});
  writeFileSync(new URL('../results/generalization.json',import.meta.url),JSON.stringify({generated_at:new Date().toISOString(),results},null,2));
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
