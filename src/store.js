import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const lines = file => existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
const cachedData = path.resolve(import.meta.dirname, '../../.cache/asset-intelligence-dataset/sample-data');
export const defaultData = existsSync(cachedData) ? cachedData : path.resolve(import.meta.dirname, '../data/sample-data');
export const releasedData = path.resolve(defaultData, '../test-data/dataset');
export class Store {
  constructor({ roots, file = ':memory:', allowRevisions } = {}) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, chat_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS conversation_owner ON conversations(user_id, created_at);
      CREATE INDEX IF NOT EXISTS conversation_chat ON conversations(user_id, chat_id);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, kind TEXT, asset_id TEXT, source_path TEXT, body TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS documents USING fts5(id UNINDEXED, asset_id UNINDEXED, title, content);
      CREATE TABLE IF NOT EXISTS datasets(root TEXT PRIMARY KEY, fingerprint TEXT, loaded_at TEXT);
      CREATE TABLE IF NOT EXISTS configuration(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS preferences(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL);
    `);
    const savedRoots = this.db.prepare('SELECT root FROM datasets ORDER BY rowid').all().map(r => r.root);
    this.allowRevisions = allowRevisions ?? this.db.prepare("SELECT value FROM configuration WHERE key='allow_revisions'").get()?.value === 'true';
    this.roots = (roots || (savedRoots.length ? savedRoots : [defaultData])).map(p => path.resolve(p));
    this.reload();
  }
  reload() {
    const assets = new Map(), users = new Map(), areas = new Map(), teams = new Map(), sources = new Map(), docs = new Map(), revisionCounts = new Map();
    const add = (id, kind, asset_id, source_path, body) => {
      const old = sources.get(id);
      if (old && JSON.stringify(old.body) !== JSON.stringify(body)) {
        if (!this.allowRevisions) throw Error(`Conflicting duplicate record ${id}; import as a newer snapshot to preserve and supersede the older version.`);
        const revision=(revisionCounts.get(id)||0)+1;revisionCounts.set(id,revision);
        const versionId = `${id}@snapshot-${revision}`;
        sources.set(versionId, { ...old, id: versionId, source_path: `${old.source_path} (superseded snapshot)` });
      }
      sources.set(id, { id, kind, asset_id, source_path, body });
    };
    const loadDoc = (file, id, asset_id = '', source_path = id) => {
      const content = readFileSync(file, 'utf8');
      add(id, 'document', asset_id, source_path, content);
      docs.set(id, { id, asset_id, title: content.split('\n')[0], content });
    };
    for (const root of this.roots) {
      if (!existsSync(path.join(root, 'fleet', 'areas.json'))) throw Error(`Dataset root must contain fleet/ and assets/: ${root}`);
      for (const u of json(path.join(root, 'fleet/users.json')).users) { users.set(u.user_id, u); add(u.user_id, 'user', '', 'fleet/users.json', u); }
      const geography = json(path.join(root, 'fleet/areas.json'));
      for (const a of geography.areas) { const old = areas.get(a.area_id); areas.set(a.area_id, old ? { ...a, asset_ids: [...new Set([...old.asset_ids, ...a.asset_ids])] } : a); }
      for (const t of geography.teams) teams.set(t.team_id, t);
      for (const folder of ['well-types', 'sops']) for (const name of readdirSync(path.join(root, 'fleet', folder)).filter(n => n.endsWith('.md'))) loadDoc(path.join(root, 'fleet', folder, name), `fleet/${folder}/${name}`);
      const guide = path.join(root, '../02-dataset-guide.md');
      if (existsSync(guide)) loadDoc(guide, '02-dataset-guide.md');
      for (const dir of readdirSync(path.join(root, 'assets'), { withFileTypes: true }).filter(d => d.isDirectory())) {
        const base = path.join(root, 'assets', dir.name), meta = json(path.join(base, 'metadata.json'));
        const existing = assets.get(meta.asset_id);
        const asset = existing || { meta, inspections: [], repairs: [], events: [], notes: [] };
        // Metadata is a snapshot; choose the snapshot with the latest inspection.
        if (!existing || this.allowRevisions || (meta.last_inspection?.inspected_at || '') > (existing.meta.last_inspection?.inspected_at || '')) asset.meta = meta;
        add(meta.asset_id, 'well', meta.asset_id, `assets/${dir.name}/metadata.json`, meta);
        for (const [file, kind, key, target] of [['inspections.jsonl', 'inspection', 'inspection_id', 'inspections'], ['maintenance.jsonl', 'repair', 'maintenance_id', 'repairs'], ['regulatory-events.jsonl', 'event', 'event_id', 'events'], ['context.jsonl', 'note', 'note_id', 'notes']]) {
          for (const row of lines(path.join(base, file))) {
            if (row.asset_id !== meta.asset_id) throw Error(`Wrong asset_id in ${dir.name}/${file}`);
            const present = sources.has(row[key]);
            add(row[key], kind, meta.asset_id, `assets/${dir.name}/${file}`, row);
            if (!present) asset[target].push(row);
            else if (this.allowRevisions) { const index = asset[target].findIndex(old=>old[key]===row[key]); if(index>=0)asset[target][index]=row; }
            if (row.report_file) {
              const resolved = path.resolve(base, row.report_file);
              if (!resolved.startsWith(base + path.sep)) throw Error('Report path escapes its well directory.');
              loadDoc(resolved, `${row.maintenance_id}:report`, meta.asset_id, `assets/${dir.name}/${row.report_file}`);
            }
          }
        }
        asset.inspections.sort((a, b) => a.inspected_at.localeCompare(b.inspected_at));
        asset.repairs.sort((a, b) => a.started_at.localeCompare(b.started_at));
        asset.notes.sort((a,b)=>a.created_at.localeCompare(b.created_at));
        assets.set(meta.asset_id, asset);
      }
    }
    for (const asset of assets.values()) {
      add(asset.meta.asset_id, 'well', asset.meta.asset_id, `assets/${asset.meta.asset_id}/metadata.json`, asset.meta);
      for (const r of asset.repairs) if (r.triggered_by_inspection_id && !sources.has(r.triggered_by_inspection_id)) throw Error(`Missing trigger ${r.triggered_by_inspection_id}`);
    }
    for (const a of areas.values()) add(a.area_id, 'area', '', 'fleet/areas.json', a);
    for (const t of teams.values()) add(t.team_id, 'team', '', 'fleet/areas.json', t);
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM sources; DELETE FROM documents; DELETE FROM datasets;');
      const ins = this.db.prepare('INSERT INTO sources VALUES(?,?,?,?,?)');
      for (const s of sources.values()) ins.run(s.id, s.kind, s.asset_id, s.source_path, JSON.stringify(s.body));
      const doc = this.db.prepare('INSERT INTO documents VALUES(?,?,?,?)');
      for (const d of docs.values()) doc.run(d.id, d.asset_id, d.title, d.content);
      const fingerprint = createHash('sha256').update(JSON.stringify([...sources.values()])).digest('hex');
      for (const root of this.roots) this.db.prepare('INSERT INTO datasets VALUES(?,?,?)').run(root, fingerprint, new Date().toISOString());
      this.db.prepare("INSERT OR REPLACE INTO configuration VALUES('allow_revisions',?)").run(String(this.allowRevisions));
      this.db.exec('COMMIT');
      Object.assign(this, { assets, users, areas, teams, sources, docs, fingerprint });
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get knowledge() { return this._knowledgeCache ??= this.db.prepare('SELECT body FROM knowledge ORDER BY rowid').all().map(r => JSON.parse(r.body)); }
  saveKnowledge(body) {
    const entry = { ...body, id: `FB-${randomUUID()}`, created_at: new Date().toISOString() };
    this.db.prepare('INSERT INTO knowledge VALUES(?,?)').run(entry.id, JSON.stringify(entry));
    this._knowledgeCache = null;
    return entry;
  }
  history(user, chat) {
    const rows = chat ? this.db.prepare('SELECT body FROM conversations WHERE user_id=? AND chat_id=? ORDER BY rowid').all(user, chat) : this.db.prepare('SELECT body FROM conversations WHERE user_id=? ORDER BY rowid').all(user);
    return rows.map(r => JSON.parse(r.body));
  }
  chats(user) {
    return this.db.prepare(`SELECT c.chat_id, COUNT(*) AS turns, MAX(c.created_at) AS updated_at,
      (SELECT json_extract(first.body, '$.question') FROM conversations first
       WHERE first.user_id = c.user_id AND first.chat_id = c.chat_id ORDER BY first.rowid LIMIT 1) AS title
      FROM conversations c WHERE c.user_id = ? GROUP BY c.chat_id ORDER BY MAX(c.rowid) DESC`).all(user);
  }
  remember(user, chat, body) {
    const id = randomUUID(), created_at = new Date().toISOString();
    const record = { ...body, id, user_id: user, chat_id: chat, created_at };
    this.db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(id, user, chat, created_at, JSON.stringify(record));
    return record;
  }
  savePreference(user, body) {
    const entry={...body,id:`PREF-${randomUUID()}`,user_id:user,created_at:new Date().toISOString()};
    this.db.prepare('INSERT INTO preferences VALUES(?,?,?)').run(entry.id,user,JSON.stringify(entry));return entry;
  }
  preferences(user) { return this.db.prepare('SELECT body FROM preferences WHERE user_id=? ORDER BY rowid').all(user).map(r=>JSON.parse(r.body)); }
  source(id) { return this.sources.get(id) || this.knowledge.map(k => ({ id: k.id, kind: 'feedback', source_path: 'Shared knowledge audit log', body: k })).find(k => k.id === id); }
  search(text, assetId) {
    const words = String(text).match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 15) || [];
    if (!words.length) return [];
    const query = words.map(w => '"' + w.replaceAll('"', '') + '"').join(' OR ');
    const reports = this.db.prepare(`SELECT id, title, snippet(documents,3,'','', ' … ',90) AS excerpt FROM documents WHERE documents MATCH ? ${assetId ? 'AND asset_id=?' : ''} ORDER BY rank LIMIT 12`).all(...(assetId ? [query, assetId] : [query]));
    const rules = this.db.prepare("SELECT id,title,content AS excerpt FROM documents WHERE documents MATCH ? AND asset_id='' ORDER BY rank LIMIT 3").all(query);
    const combined = [...rules,...reports];
    return combined.filter((r,index)=>index===combined.findIndex(other=>other.id===r.id));
  }
  stats() { return { wells: this.assets.size, inspections: [...this.assets.values()].reduce((n, a) => n + a.inspections.length, 0), repairs: [...this.assets.values()].reduce((n, a) => n + a.repairs.length, 0), documents: this.docs.size, fingerprint: this.fingerprint, datasets: this.roots.length }; }
  close() { this.db.close(); }
}
