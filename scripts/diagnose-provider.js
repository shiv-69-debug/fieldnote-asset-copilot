// Replays the real planner request, without saving chats or logging credentials.
// The capture-only response below is not a provider call and is never counted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../src/store.js';
import { parseLocal, planWithModel } from '../src/planner.js';

const question = 'Is WELL-0001 producing oil right now? When was it last inspected, and by whom?';
const model = process.env.COPILOT_MODEL || 'gemma-4-26b-a4b-it';
const key = process.env.GEMINI_API_KEY;
if (!key) throw Error('This diagnostic needs GEMINI_API_KEY in the environment.');
const rounds = Number(process.env.PROBE_ROUNDS || 4);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 12) throw Error('PROBE_ROUNDS must be 1–12.');
const originalFetch = globalThis.fetch;
const store = new Store();
const context = { store, today: '2026-10-17', user: store.users.get('U-201') };
let captured;
try {
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(parseLocal(question, context)) }] } }] }), { status: 200 });
  };
  await planWithModel(question, context);
} finally { globalThis.fetch = originalFetch; store.close(); }
if (!captured) throw Error('Planner request capture failed.');

const variants = [{ name: 'production', body: captured }];
if (process.argv.includes('--minimal')) {
  variants.push({ name: 'minimal-provider-ping', body: { contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }] } });
}
if (process.argv.includes('--compare')) {
  const lean = structuredClone(captured);
  lean.generationConfig.responseSchema = { type: 'OBJECT', required: ['op'], properties: {
    op: { type: 'STRING' }, assets: { type: 'ARRAY', items: { type: 'STRING' } }, visual: { type: 'STRING' },
  } };
  variants.push({ name: 'smaller-schema-only', body: lean });
  const noThinking = structuredClone(captured);
  delete noThinking.generationConfig.thinkingConfig;
  variants.push({ name: 'omit-thinking-config-only', body: noThinking });
}
const results = [];
const redact = value => String(value || '').replaceAll(key, '<REDACTED>').replace(/AIza[\w-]{20,}/g, '<REDACTED>').slice(0, 800);
for (let round = 1; round <= rounds; round++) {
  // Rotate the order so one variant is not always the first request in a round.
  const ordered = [...variants.slice((round - 1) % variants.length), ...variants.slice(0, (round - 1) % variants.length)];
  for (const variant of ordered) {
    const started = Date.now();
    let outcome;
    try {
      const response = await originalFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(variant.body), signal: AbortSignal.timeout(90000),
      });
      const data = await response.json().catch(() => ({}));
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
      let plan; try { plan = JSON.parse(text); } catch { /* Report invalid output separately from HTTP errors. */ }
      outcome = {
        round, variant: variant.name, http_status: response.status, provider_code: data.error?.code,
        provider_status: data.error?.status, error: data.error ? redact(data.error.message) : undefined,
        finish_reason: candidate?.finishReason,
        valid_status_plan: variant.name === 'minimal-provider-ping' ? response.ok && text.trim() === 'OK' : response.ok && plan?.op === 'status' && plan.assets?.includes('WELL-0001'),
        seconds: (Date.now() - started) / 1000,
      };
    } catch (error) { outcome = { round, variant: variant.name, error: redact(error.message), seconds: (Date.now() - started) / 1000 }; }
    results.push(outcome); console.log(JSON.stringify(outcome));
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
}
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
const report = { generated_at: new Date().toISOString(), model, question, retries_per_probe: 0, results };
writeFileSync(new URL(`../results/${process.argv.includes('--minimal') ? 'provider-minimal-diagnostic' : 'provider-diagnostic'}.json`, import.meta.url), JSON.stringify(report, null, 2));
const failures = results.filter(r => r.http_status !== 200 || !r.valid_status_plan);
console.log(`${results.length - failures.length}/${results.length} requests returned a valid model plan; ${results.filter(r => r.http_status === 500).length} HTTP 500 responses.`);
if (failures.length) process.exitCode = 1;
