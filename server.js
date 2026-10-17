import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, defaultData } from './src/store.js';
import { Copilot } from './src/service.js';

export function createApp({ roots, database, today, allowRevisions } = {}) {
  const store = new Store({ roots: roots || (process.env.DATASET_PATHS ? process.env.DATASET_PATHS.split(';').filter(Boolean) : undefined), allowRevisions,file: database || path.join(import.meta.dirname, '.local/copilot.sqlite') });
  today=today || process.env.ANALYSIS_DATE || (store.docs.has('fleet/sops/operations-sop-rev2.md')?'2027-01-15':'2026-10-17');
  let copilot = new Copilot(store);
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const body = async req => {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 64000) throw Error('Request too large.'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://tile.openstreetmap.org data: blob:; connect-src 'self' https://tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin writes are not allowed.' });
      if (url.pathname === '/api/bootstrap') return json(res, 200, { stats: store.stats(), users: [...store.users.values()], areas: [...store.areas.values()], teams: [...store.teams.values()], today, model_ready: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY), model: process.env.COPILOT_MODEL || 'gemma-4-26b-a4b-it' });
      if (url.pathname === '/api/chat' && req.method === 'POST') { const input = await body(req); return json(res, 200, await copilot.ask(input)); }
      if (url.pathname === '/api/history') { const userId = url.searchParams.get('userId'); copilot.engine.user(userId); return json(res, 200, store.history(userId, url.searchParams.get('chatId'))); }
      if (url.pathname === '/api/conversations') { const userId = url.searchParams.get('userId'); copilot.engine.user(userId); return json(res, 200, store.chats(userId)); }
      if (url.pathname === '/api/knowledge') return json(res, 200, store.knowledge.map(k => ({ ...k, author: copilot.engine.author(k.author_user_id) })));
      if (url.pathname === '/api/source') { const source = store.source(url.searchParams.get('id')); return json(res, source ? 200 : 404, source || { error: 'Source not found.' }); }
      if (url.pathname === '/api/conversation-source') {
        const userId = url.searchParams.get('userId'); copilot.engine.user(userId);
        const id = url.searchParams.get('id');
        const record = store.history(userId).find(h => `CHAT-${h.id}` === id);
        return json(res, record ? 200 : 404, record ? { id, kind: 'private_conversation', source_path: `Your conversation · ${record.created_at}`, body: { question: record.question, chat_id: record.chat_id, created_at: record.created_at } } : { error: 'Conversation source not found for this user.' });
      }
      if(url.pathname==='/api/preference-source'){const userId=url.searchParams.get('userId');copilot.engine.user(userId);const pref=store.preferences(userId).find(p=>p.id===url.searchParams.get('id'));return json(res,pref?200:404,pref?{id:pref.id,kind:'private_preference',source_path:'Your private display preferences',body:pref}:{error:'Preference not found for this user.'});}
      if (url.pathname === '/api/export') { const userId = url.searchParams.get('userId'); copilot.engine.user(userId); return json(res, 200, { exported_at: new Date().toISOString(), stats: store.stats(), shared_knowledge: store.knowledge, conversations: store.history(userId) }); }
      if (url.pathname === '/api/datasets' && req.method === 'POST') {
        const input = await body(req);
        if (typeof input.path !== 'string' || !input.path.trim()) throw Error('Enter a local dataset directory containing fleet/ and assets/.');
        const roots = [...new Set([...store.roots, path.resolve(input.path)])];
        const revisions=Boolean(input.replaceExisting)||store.allowRevisions;
        const preflight = new Store({ roots,allowRevisions:revisions });
        try { new Copilot(preflight); } finally { preflight.close(); }
        store.roots = roots;store.allowRevisions=revisions; store.reload(); copilot = new Copilot(store);
        if(store.docs.has('fleet/sops/operations-sop-rev2.md'))today='2027-01-15';
        return json(res, 200, store.stats());
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'API endpoint not found.' });
      const names = { '/': 'public/index.html', '/app.js': 'public/app.js', '/styles.css': 'public/styles.css', '/favicon.svg': 'public/favicon.svg', '/answer-quality.js': 'shared/answer-quality.js' };
      const file = names[url.pathname];
      if (!file) { res.writeHead(404); return res.end('Not found'); }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8');
      res.end(readFileSync(path.join(import.meta.dirname, file)));
    } catch (error) { json(res, 400, { error: error.message }); }
  });
  server.on('close', () => store.close());
  return { server, store };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.ASSET_PORT || 3100);
  server.listen(port, host, () => console.log(`Fieldnote Asset Copilot: http://${host}:${port}`));
}
