import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Copilot } from '../src/service.js';
import { answerQualityIssue, validateGroundedAnswer } from '../shared/answer-quality.js';

let store, copilot;
before(() => { store = new Store(); copilot = new Copilot(store); });
after(() => store.close());

test('The recorded memory heading uses private conversation context, not field manuals', async () => {
  await copilot.ask({ question: 'Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months?', userId: 'U-201', chatId: 'earlier' });
  const result = await copilot.ask({ question: 'Remembering past conversations', userId: 'U-201', chatId: 'new' });
  assert.equal(result.plan.op, 'memory');
  assert.equal(result.visual, 'none');
  assert.equal(result.rows.length, 0);
  assert.equal(result.needs_clarification, true);
  assert.match(result.summary, /Michael Turner/);
  assert.match(result.summary, /Which|which/);
  assert.ok(result.evidence.every(e => e.kind === 'private_conversation'));
  assert.ok(result.memory_context.some(c => c.question.includes('most downtime')));
  assert.equal(store.knowledge.length, 0);
  const costs = await copilot.ask({ question: 'For the three wells we discussed yesterday, what have repairs cost this year?', userId: 'U-201', chatId: 'new' });
  assert.equal(costs.rows.find(r => r.well === 'WELL-0121').cost_usd, 25794);
});

test('Memory requests never borrow another user’s conversations', async () => {
  const result = await copilot.ask({ question: 'Do you remember our previous conversations?', userId: 'U-202' });
  assert.equal(result.plan.op, 'memory');
  assert.equal(result.memory_context.length, 0);
  assert.match(result.summary, /Jessica Reed/);
  assert.doesNotMatch(result.summary, /WELL-0121|Michael Turner/);
});

test('Schema-valid output with the recorded repetitive-symbol failure is rejected', () => {
  const summary = 'The provided source excerpts do not contain information regarding ' + '"'.repeat(2100) + ' and the sources are insufficient.';
  assert.ok(answerQualityIssue(summary));
  assert.throws(() => validateGroundedAnswer({ summary, source_ids: ['manual'] }, ['manual']), /repetit|malformed/i);
});

test('Normal cited explanations remain valid and invented source IDs do not', () => {
  const result = { summary: 'At 10 ppm or more, stop work and move upwind. Return only below 10 ppm with HSE approval.', source_ids: ['WS-03'] };
  assert.equal(validateGroundedAnswer(result, ['WS-03']), result);
  assert.throws(() => validateGroundedAnswer(result, ['other']), /citations/);
});

test('Repeated malformed model synthesis becomes a concise clarification, not a stored text wall', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-key'; let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      const value = calls === 1 ? { search: 'scope' } : { summary: 'The source excerpts do not contain ' + '"'.repeat(2100), source_ids: ['fleet/well-types/T200.md'] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
    };
    const result = await copilot.ask({ question: 'Explain the scope of this field.', userId: 'U-201', mode: 'model' });
    assert.equal(calls, 3);
    assert.equal(result.needs_clarification, true);
    assert.equal(result.rows.length, 0);
    assert.equal(result.visual, 'none');
    assert.ok(result.summary.length < 400);
    assert.ok(!answerQualityIssue(result.summary));
    assert.equal(store.history('U-201').at(-1).response.summary, result.summary);
  } finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; }
});
