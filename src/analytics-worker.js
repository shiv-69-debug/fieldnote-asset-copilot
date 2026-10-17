import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
try {
  const { tables, sql } = workerData;
  for (const [name, table] of Object.entries(tables)) {
    db.exec(`CREATE TABLE ${name} (${Object.entries(table.columns).map(([k, t]) => `${k} ${t}`).join(',')})`);
    const stmt = db.prepare(`INSERT INTO ${name} VALUES(${Object.keys(table.columns).map(() => '?').join(',')})`);
    db.exec('BEGIN');
    for (const row of table.rows) stmt.run(...row);
    db.exec('COMMIT');
  }
  db.exec('PRAGMA query_only=ON;');
  if (!/^\s*(SELECT|WITH)\b/i.test(sql) || /;|\b(?:pragma|attach|detach|insert|update|delete|drop|alter|create|load_extension|readfile|writefile|randomblob|recursive)\b/i.test(sql)) throw Error('Only a single read-only SELECT is allowed.');
  const result = [];
  for (const row of db.prepare(sql).iterate()) {
    result.push(row);
    if (result.length > 500) throw Error('Query returned more than 500 rows. Aggregate or narrow the question.');
  }
  parentPort.postMessage({ rows: result });
} catch (error) { parentPort.postMessage({ error: error.message }); }
finally { db.close(); }
