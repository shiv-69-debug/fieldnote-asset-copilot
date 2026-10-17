import { Worker } from 'node:worker_threads';
import { day } from './dates.js';
export const analyticalSchema = `Read-only SQLite tables (already corrected, no private conversation data):
wells(source_id TEXT, well TEXT, type TEXT, area TEXT, team TEXT, recorded_status TEXT, lat REAL, lon REAL)
inspections(source_id TEXT, well TEXT, inspected_at TEXT, date TEXT, wellhead_c REAL, ambient_c REAL, delta_c REAL, threshold_c REAL, producing INTEGER, spill_detected INTEGER, barrels REAL, pad_area_pct REAL, inspector TEXT, method TEXT)
repairs(source_id TEXT, well TEXT, started_at TEXT, completed_at TEXT, equipment TEXT, maintenance_type TEXT, issue TEXT, cost_usd REAL, inspection_id TEXT, is_open INTEGER)
events(source_id TEXT, well TEXT, date TEXT, agency TEXT, event_type TEXT, protocol TEXT, inspection_id TEXT, hours_to_report REAL, fine_usd REAL, status TEXT)
report_facts(source_id TEXT, well TEXT, repair_id TEXT, inspection_id TEXT, containment_hours REAL, is_open INTEGER)
report_checks(source_id TEXT, well TEXT, repair_id TEXT, protocol TEXT, status TEXT, detail TEXT, basis_valid INTEGER, effective_status TEXT)
report_checks.status is the ORIGINAL report assertion. Corrections can make it stale: use effective_status for current conclusions; basis_valid=0 marks a superseded basis.
Every SQL output row MUST have source_ids as comma-separated provenance IDs, normally group_concat(DISTINCT inspections.source_id) or group_concat(DISTINCT repairs.source_id). For a row-level result use table.source_id AS source_ids. Return well IDs, area/person names. For aggregate joins include IDs of all tables contributing to the result. Use substr(started_at,1,10) for repair date filters. Never count maintenance duration as downtime. Inspections producing=0 each count as 7 days; missed inspections add nothing. Current inspection: latest inspected_at per well. Real spills: spill_detected=1. Maximum result 500 rows. No changes, PRAGMA, file access, recursive CTE, or multiple statements. Do not invent columns.`;
function table(columns, rows) { return { columns: Object.fromEntries(columns.map(([key, type]) => [key, type])), rows }; }
export async function analyticalQuery(engine, sql, today, assetScope) {
  if (typeof sql !== 'string' || sql.length > 16000) throw Error('Invalid analytical query.');
  const wells = [], inspections = [], repairs = [], events = [], reports = [], checks = [];
  for (const a of engine.store.assets.values()) {
    const m = a.meta;
    if (assetScope && !assetScope.includes(m.asset_id)) continue;
    wells.push([m.asset_id, m.asset_id, m.well_type, engine.store.areas.get(m.area_id)?.name || m.area_id, engine.store.teams.get(m.team_id)?.name || m.team_id, m.recorded_status, m.location.lat, m.location.lon]);
    for (const raw of a.inspections.filter(i => day(i.inspected_at) <= today)) {
      const i = engine.effective(a, raw);
      inspections.push([i.inspection_id, m.asset_id, i.inspected_at, day(i.inspected_at), i.wellhead_temp_c, i.ambient_temp_c, i.delta_c, i.threshold_c, +i.producing, +i.spill_detected, i.spill_detected ? i.spill_est_volume_bbl : null, i.spill_area_pct, engine.author(i.inspector_user_id), i.method]);
    }
    for (const r of a.repairs.filter(r => day(r.started_at) <= today)) {
      const facts = engine.reportFacts(r);
      repairs.push([r.maintenance_id, m.asset_id, r.started_at, r.completed_at, r.equipment_kind, r.maintenance_type, r.issue, r.cost_usd.total, r.triggered_by_inspection_id, +facts.open]);
      if (r.report_file) reports.push([r.maintenance_id + ':report', m.asset_id, r.maintenance_id, r.triggered_by_inspection_id, facts.containmentHours, +facts.open]);
      const raw = a.inspections.find(i=>i.inspection_id===r.triggered_by_inspection_id), effective = raw ? engine.effective(a,raw) : null;
      for (const check of facts.checks) {
        const revised = Boolean(effective?.corrections.length && check.protocol.startsWith('SR-'));
        let current = check.status;
        if (revised) {
          const spill = engine.spillRow({asset:a,inspection:effective},today);
          current = !effective.spill_detected ? 'Not applicable: corrected false detection' : check.protocol==='SR-03' ? spill.verification : check.protocol==='SR-01' ? spill.reporting : 'Re-evaluate against corrected inspection; original assertion retained';
        }
        checks.push([r.maintenance_id + ':report', m.asset_id, r.maintenance_id, check.protocol, check.status, check.detail,+!revised,current]);
      }
    }
    for (const e of a.events.filter(e => day(e.date) <= today)) events.push([e.event_id, m.asset_id, e.date, e.agency, e.event_type, e.protocol_id, e.related_inspection_id, e.hours_to_report, e.fine_usd, e.status]);
  }
  const cols = (names, numbers = []) => names.split(' ').map(n => [n, numbers.includes(n) ? 'REAL' : 'TEXT']);
  const tables = {
    wells: table(cols('source_id well type area team recorded_status lat lon', ['lat','lon']), wells),
    inspections: table(cols('source_id well inspected_at date wellhead_c ambient_c delta_c threshold_c producing spill_detected barrels pad_area_pct inspector method', ['wellhead_c','ambient_c','delta_c','threshold_c','producing','spill_detected','barrels','pad_area_pct']), inspections),
    repairs: table(cols('source_id well started_at completed_at equipment maintenance_type issue cost_usd inspection_id is_open', ['cost_usd','is_open']), repairs),
    events: table(cols('source_id well date agency event_type protocol inspection_id hours_to_report fine_usd status', ['hours_to_report','fine_usd']), events),
    report_facts: table(cols('source_id well repair_id inspection_id containment_hours is_open', ['containment_hours','is_open']), reports),
    report_checks: table(cols('source_id well repair_id protocol status detail basis_valid effective_status',['basis_valid']), checks),
  };
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analytics-worker.js', import.meta.url), { workerData: { tables, sql }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const timer = setTimeout(() => { worker.terminate(); reject(Error('Analytical query exceeded 8 seconds; narrow the query.')); }, 8000);
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('message', result => { clearTimeout(timer); if (result.error) reject(Error(result.error)); else resolve(result.rows); });
  });
}
