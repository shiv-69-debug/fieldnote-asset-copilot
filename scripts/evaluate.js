import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from '../server.js';
import { scenario } from '../tests/scenarios.js';
const live = process.argv.includes('--live');
const today = process.env.ANALYSIS_DATE || '2026-10-17';
const cases = process.env.SCENARIOS ? process.env.SCENARIOS.split(',').map(Number) : Array.from({ length: 18 }, (_, i) => i + 1);
const results = [];
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
function checkpoint() {
  const turns = results.flatMap(r => r.turns);
  const report = { generated_at: new Date().toISOString(), analysis_date: today, transport:'HTTP /api/chat', mode: live ? 'live-model-with-explicit-fallback' : 'local-deterministic', model_turns: turns.filter(t => t.response.mode === 'model').length, fallback_turns: turns.filter(t => t.response.mode === 'local-fallback').length, passed: results.filter(r => r.pass).length, total: results.length, planned_total: cases.length, results };
  writeFileSync(new URL(`../results/${live ? 'live' : 'local'}-evaluation.json`, import.meta.url), JSON.stringify(report, null, 2));
  return report;
}
for (const number of cases) {
  const { server,store } = createApp({ database:':memory:',today }), turns = [], start = performance.now();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  try {
    await scenario(number, async (question, userId = 'U-201', chatId = 'first') => {
      if (live) await new Promise(resolve => setTimeout(resolve, 1800));
      const httpResponse = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,userId,chatId,today,mode:live?'model':'local'})});
      const response = await httpResponse.json();
      if (!httpResponse.ok) throw Error(response.error);
      turns.push({ question, userId, chatId, response });
      return response;
    }, store);
    results.push({ scenario: number, pass: true, turns, seconds: (performance.now() - start) / 1000 });
    console.log(`PASS Q${number} (${turns.length} turns)`);
  } catch (error) {
    results.push({ scenario: number, pass: false, error: error.message, turns, seconds: (performance.now() - start) / 1000 });
    console.error(`FAIL Q${number}: ${error.message}`);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); checkpoint(); }
}
const report = checkpoint();
console.log(`${report.passed}/${report.total} scenarios passed (${report.mode}).`);
if (report.passed !== report.total) process.exitCode = 1;
