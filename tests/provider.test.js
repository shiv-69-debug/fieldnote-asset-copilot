import test from 'node:test';
import assert from 'node:assert/strict';
import { modelJSON } from '../src/planner.js';

async function withTestKey(run) {
  const old = process.env.GEMINI_API_KEY;
  const key = 'provider-diagnostic-test-secret';
  process.env.GEMINI_API_KEY = key;
  try { await run(key); }
  finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
}

test('Repeated provider 500 errors preserve safe status details and all retry attempts', async () => {
  await withTestKey(async key => {
    let requests = 0;
    const waits = [];
    await assert.rejects(modelJSON('Return a status plan.', {
      sleep: async ms => waits.push(ms),
      fetchImpl: async () => {
        requests++;
        return new Response(JSON.stringify({ error: { code: 500, status: 'INTERNAL', message: `Internal error encountered. diagnostic ${key}` } }), { status: 500 });
      },
    }), error => {
      assert.equal(error.name, 'ModelProviderError');
      assert.equal(error.diagnostic.provider, 'Google Gemini API');
      assert.equal(error.diagnostic.attempts.length, 3);
      assert.ok(error.diagnostic.attempts.every(a => a.http_status === 500 && a.provider_status === 'INTERNAL'));
      assert.match(error.message, /Internal error encountered/);
      assert.doesNotMatch(JSON.stringify(error.diagnostic), new RegExp(key));
      assert.ok(!error.message.includes(key));
      return true;
    });
    assert.equal(requests, 3);
    assert.deepEqual(waits, [1500, 3000]);
  });
});

test('A recovered retry is recorded as a successful model call, with the earlier 500 visible', async () => {
  await withTestKey(async () => {
    let requests = 0;
    const result = await modelJSON('Return a status plan.', {
      sleep: async () => {},
      fetchImpl: async () => {
        requests++;
        if (requests === 1) return new Response(JSON.stringify({ error: { status: 'INTERNAL', message: 'Internal error encountered.' } }), { status: 500 });
        return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"op":"status"}' }] } }] }), { status: 200 });
      },
    });
    assert.equal(result.result.op, 'status');
    assert.deepEqual(result.attempts.map(a => a.http_status), [500, 200]);
  });
});
