import test from 'node:test';
import { Store } from '../src/store.js';
import { Copilot } from '../src/service.js';
import { scenario } from './scenarios.js';
for (const today of ['2026-10-16', '2026-10-17']) {
  for (let n = 1; n <= 18; n++) test(`Q${n}: complete conversational scenario, analysis date ${today}`, async () => {
    const store = new Store();
    try {
      const copilot = new Copilot(store);
      await scenario(n, (question, userId = 'U-201', chatId = 'first') => copilot.ask({ question, userId, chatId, today }), store);
    } finally { store.close(); }
  });
}
