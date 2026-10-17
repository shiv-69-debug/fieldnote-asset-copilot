import { Store, defaultData } from '../src/store.js';
import path from 'node:path';
const root = path.resolve(defaultData, '../test-data/dataset');
const s = new Store({ roots: [root] });
try {
  console.log('STATS', s.stats());
  const kinds = new Map(), patterns = new Map(), fields = new Set(), special = [];
  for (const a of s.assets.values()) {
    for (const i of a.inspections) Object.keys(i).forEach(k => fields.add(k));
    for (const n of a.notes) {
      kinds.set(n.note_type, (kinds.get(n.note_type) || 0) + 1);
      if (n.created_at >= '2026-10-01') {
        const text = n.text.replace(/WELL-\d+/g, 'WELL-ID').replace(/\d+(?:\.\d+)?/g, '#');
        patterns.set(text, (patterns.get(text) || 0) + 1);
      }
      if (n.note_type === 'data_correction' && special.length < 4) special.push(n);
    }
  }
  console.log('INSPECTION FIELDS', [...fields]); console.log('NOTE KINDS', [...kinds]);
  console.log('NOTE PATTERNS', [...patterns].sort((a,b) => b[1]-a[1]).slice(0,70));
  console.log('CORRECTIONS', special);
  console.log('HISTORY EXAMPLES', [...s.assets.values()].filter(a=>a.meta.type_history || a.meta.team_history || a.meta.status).slice(0,5).map(a=>a.meta));
  console.log('TEAMS', [...s.teams.values()]);
} finally { s.close(); }
