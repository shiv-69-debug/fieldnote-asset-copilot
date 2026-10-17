import { day, within, windowFor, addHours, shift, prettyDate } from './dates.js';
import { FieldOperations } from './field-operations.js';

const round = n => Math.round(n * 10) / 10;
const clean = s => s.replaceAll('**', '').replace(/\s+/g, ' ');
export const SR = 'fleet/sops/spill-response-sop.md';
export const RC = 'fleet/sops/regulatory-compliance-sop.md';
export const WS = 'fleet/sops/field-work-sop.md';
const manual = type => `fleet/well-types/${type}.md`;
const sum = (rows, f) => round(rows.reduce((n, r) => n + f(r), 0));
export class Engine {
  constructor(store) {
    this.store = store;
    this.reportCache = new Map();
    this.thresholds = {};
    for (const [id, doc] of store.docs) if (id.startsWith('fleet/well-types/')) {
      const match = clean(doc.content).match(/at least (\d+(?:\.\d+)?) °C above ambient/i);
      if (!match) throw Error(`Cannot extract production threshold from ${id}.`);
      this.thresholds[id.split('/').pop().replace('.md', '')] = +match[1];
    }
    const sop = clean(store.docs.get(SR)?.content || '');
    const rc = clean(store.docs.get(RC)?.content || '');
    const need = (text, pattern, label) => { const m = text.match(pattern); if (!m) throw Error(`Cannot extract ${label}; review the source document.`); return +m[1]; };
    this.rules = {
      reportable: need(sop, /Reportable \| (\d+) bbl/i, 'reportability threshold'),
      major: need(sop, /Major \| (\d+) bbl/i, 'major threshold'),
      reportHours: need(sop, /written notice.*?within (\d+) hours/i, 'report deadline'),
      majorHours: need(sop, /or within (\d+) hours for a major/i, 'major deadline'),
      containmentHours: need(sop, /spill contained within (\d+) hours/i, 'containment deadline'),
      verificationDays: need(sop, /verified within (\d+) days/i, 'verification deadline'),
      responseDays: need(rc, /(?:respond|answered).*?within (\d+) days/i, 'NOV response deadline'),
      inspectionDays: need(rc, /at least once every (\d+) days/i, 'inspection interval'),
      consecutiveDownDays: need(rc, /more than (\d+) consecutive days/i, 'downtime escalation'),
    };
    const m = clean(store.docs.get(manual('T200')).content).match(/(Three|\d+) or more corrective/i);
    if (!m) throw Error('Cannot extract RCA threshold.');
    this.rcaThreshold = m[1].toLowerCase() === 'three' ? 3 : +m[1];
    this.field = new FieldOperations(this);
  }
  typeAt(asset,date) { return asset.meta.type_history?.find(h=>h.from<=day(date)&&(!h.to||h.to>=day(date)))?.well_type || asset.meta.well_type; }
  teamAt(asset,date) { return asset.meta.team_history?.find(h=>h.from<=day(date)&&(!h.to||h.to>=day(date)))?.team_id || asset.meta.team_id; }
  user(id) { const u = this.store.users.get(id); if (!u) throw Error('Choose a valid dataset user.'); return u; }
  author(id) { return this.store.users.get(id)?.name || id; }
  report(repair) { return this.store.docs.get(`${repair.maintenance_id}:report`)?.content || ''; }
  reportFacts(repair) {
    if (this.reportCache.has(repair.maintenance_id)) return this.reportCache.get(repair.maintenance_id);
    const text = clean(this.report(repair));
    const containment = text.match(/contained (?:about |within )?(\d+(?:\.\d+)?) hours after/i);
    const rows = [...this.report(repair).matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)].map(m => ({ protocol: clean(m[1]).trim(), status: clean(m[2]).trim(), detail: clean(m[3]).trim() })).filter(r => /^(WS-|SR-|RC-|Manual|HSE)/.test(r.protocol));
    const rootCause = this.report(repair).match(/## Root cause\s+([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim() || null;
    const result = { containmentHours: containment ? +containment[1] : null, open: /interim|work (?:is )?still in progress|Planned finish|Work done so far/i.test(text), checks: rows, rootCause };
    this.reportCache.set(repair.maintenance_id, result);
    return result;
  }
  effective(asset, inspection) {
    const value = { ...inspection, corrections: [] };
    for (const note of asset.notes.filter(n => ['correction','data_correction'].includes(n.note_type) && n.inspection_id === inspection.inspection_id)) {
      if(note.note_type==='data_correction' && ['wellhead_temp_c','ambient_temp_c','spill_est_volume_bbl','spill_detected','spill_area_pct'].includes(note.field)){value[note.field]=note.corrected_value;value.corrections.push({...note,original:note.original_value,value:note.corrected_value});}
      else if (/not (?:a (?:crude )?spill|crude|oil)|no crude|rainwater|wet soil|shadow/i.test(note.text)) { value.spill_detected = false; value.corrections.push(note); }
    }
    for (const correction of this.store.knowledge.filter(k => k.kind === 'correction' && k.inspection_id === inspection.inspection_id)) {
      value[correction.field] = correction.value;
      value.corrections.push(correction);
    }
    const difference=value.wellhead_temp_c-value.ambient_temp_c;
    value.delta_c = Math.round(difference*1000)/1000;
    value.well_type=this.typeAt(asset,inspection.inspected_at);
    value.threshold_c = this.thresholds[value.well_type];
    if (value.threshold_c === undefined) throw Error(`Missing manual for ${asset.meta.well_type}`);
    value.producing = difference + 1e-9 >= value.threshold_c;
    return value;
  }
  notes(asset, date, inspectionId, includePlanned = false) {
    const imported = asset.notes.filter(n => !['correction','data_correction'].includes(n.note_type) && day(n.created_at)<=date && ((!n.valid_from || n.valid_from <= date) && (!n.valid_to || n.valid_to >= date) || inspectionId && n.text.includes(inspectionId)));
    const shared = this.store.knowledge.filter(k => k.kind === 'note' && k.asset_id === asset.meta.asset_id && (includePlanned || (!k.valid_from || k.valid_from <= date) && (!k.valid_to || k.valid_to >= date)));
    return [...imported, ...shared];
  }
  status(asset, today) {
    const raw = asset.inspections.filter(i => day(i.inspected_at) <= today).at(-1);
    if (!raw) return { well: asset.meta.asset_id, producing: null, reason: 'No inspection on or before the analysis date.', evidence: [asset.meta.asset_id] };
    const i = this.effective(asset, raw), notes = this.notes(asset, today, i.inspection_id);
    const repairs = asset.repairs.filter(r => r.triggered_by_inspection_id === i.inspection_id || day(r.started_at) <= day(i.inspected_at) && (r.completed_at >= i.inspected_at || this.reportFacts(r).open));
    const reasons = [];
    for (const n of notes) if (/shut|planned|workover|back online|running/i.test(n.text)) reasons.push(`${this.author(n.author_user_id)}: ${n.text}${n.status === 'unconfirmed' ? ' [unconfirmed]' : ''}`);
    for (const r of repairs) reasons.push(`Repair ${r.maintenance_id}: ${r.issue}; started ${prettyDate(r.started_at)}; ${this.reportFacts(r).open || day(r.completed_at) > today ? 'still open (planned end is not proof of completion)' : 'completed ' + prettyDate(r.completed_at)}.`);
    const conflicts = [];
    if (i.producing && /not moving|stopped|shut in/i.test(i.notes)) conflicts.push(`The corrected reading disagrees with ${this.author(i.inspector_user_id)}'s inspection note: "${i.notes}". Please confirm the discrepancy.`);
    for (const n of notes.filter(n => n.status === 'unconfirmed')) conflicts.push(`${this.author(n.author_user_id)}'s statement is unconfirmed and conflicts with the latest inspection. Please confirm with a new field reading.`);
    const correctionText = i.corrections.map(c => `${c.field || 'detection'} corrected by ${this.author(c.author_user_id)}${c.original !== undefined ? ` from ${c.original} to ${c.value}` : ''}: ${c.reason || c.text}`);
    for (const field of ['wellhead_temp_c', 'ambient_temp_c']) {
      const revisions = i.corrections.filter(c => c.field === field);
      if (new Set(revisions.map(c => c.value)).size > 1 && new Set(revisions.map(c => c.author_user_id)).size > 1) conflicts.push(`Different users supplied conflicting ${field} corrections. The latest explicit correction is applied, with all earlier values retained; please confirm which measurement is authoritative.`);
    }
    return this.field.applyStatus(asset,today,{
      well: asset.meta.asset_id, type: asset.meta.well_type, area: this.store.areas.get(asset.meta.area_id)?.name,
      inspection_type:i.well_type,
      lat: asset.meta.location.lat, lon: asset.meta.location.lon,
      producing: i.producing, date: day(i.inspected_at), inspected_at: i.inspected_at, inspection_id: i.inspection_id,
      inspector: this.author(i.inspector_user_id), method: i.method, wellhead_c: i.wellhead_temp_c, ambient_c: i.ambient_temp_c,
      delta_c: i.delta_c, threshold_c: i.threshold_c,
      recorded_status: asset.meta.recorded_status + ((asset.meta.recorded_status === 'active') !== i.producing ? ' (out of date)' : ''),
      reason: reasons.join(' ') || (i.producing ? 'Temperature difference meets the well-type production rule.' : 'No recorded reason. Field check recommended.'),
      inspector_note: i.notes || '', corrections: correctionText, conflicts,
      evidence: [asset.meta.asset_id, i.inspection_id, i.inspector_user_id, manual(i.well_type), ...i.corrections.map(c => c.id || c.note_id), ...notes.map(n => n.id || n.note_id), ...repairs.flatMap(r => [r.maintenance_id, ...(r.report_file ? [`${r.maintenance_id}:report`] : [])])],
    });
  }
  select(plan, user) {
    const ids = plan.assets || [];
    for (const id of ids) if (!this.store.assets.has(id)) throw Error(`Unknown well ${id}.`);
    const area = plan.area && [...this.store.areas.values()].find(a => a.area_id.toLowerCase() === plan.area.toLowerCase() || a.name.toLowerCase() === plan.area.toLowerCase());
    if (plan.area && !area) throw Error(`Unknown geographic area: ${plan.area}.`);
    return [...this.store.assets.values()].filter(a => (!ids.length || ids.includes(a.meta.asset_id)) && (!area || a.meta.area_id === area.area_id) && (!plan.myTeam || a.meta.team_id === user.team_id) && (!plan.well_type || a.meta.well_type === plan.well_type));
  }
  spills(assets, range) {
    return assets.flatMap(a => a.inspections.filter(i => within(i.inspected_at, range)).map(i => ({ asset: a, inspection: this.effective(a, i) }))).filter(s => s.inspection.spill_detected);
  }
  spillRow({ asset: a, inspection: i }, today) {
    const repairs = a.repairs.filter(r => r.triggered_by_inspection_id === i.inspection_id), events = a.events.filter(e => e.related_inspection_id === i.inspection_id && day(e.date) <= today);
    const contained = repairs.map(r => this.reportFacts(r).containmentHours).find(n => n !== null);
    const volume = i.spill_est_volume_bbl, reportable = volume >= this.rules.reportable, major = volume >= this.rules.major;
    const hours = major ? this.rules.majorHours : this.rules.reportHours;
    const notice = events.find(e => e.event_type === 'spill_report_filed');
    const due = addHours(i.inspected_at, hours), verify = addHours(i.inspected_at, this.rules.verificationDays * 24);
    const verificationEvent = events.filter(e => e.event_type === 'site_inspection' && e.status === 'closed' && /Environmental/i.test(e.agency) && !/fail|residual|pending/i.test(e.detail)).sort((a,b) => a.date.localeCompare(b.date))[0];
    const verified = Boolean(verificationEvent);
    const notes = this.notes(a, day(i.inspected_at), i.inspection_id).filter(n => n.text.includes(i.inspection_id));
    return {
      well: a.meta.asset_id, area: this.store.areas.get(a.meta.area_id)?.name, date: day(i.inspected_at), inspected_at: i.inspected_at,
      inspection_id: i.inspection_id, barrels: volume, pad_area_pct: i.spill_area_pct, lat: a.meta.location.lat, lon: a.meta.location.lon,
      class: volume === null ? 'unknown volume' : major ? 'major' : reportable ? 'reportable' : volume >= 1 ? 'moderate' : 'minor',
      containment_hours: contained ?? null, containment_limit_hours: this.rules.containmentHours,
      report_due: reportable ? due : null, reporting: volume === null ? 'Volume unknown; reporting duty cannot be determined' : !reportable ? 'Not externally reportable' : notice ? `Written notice filed after ${notice.hours_to_report} hours${notice.hours_to_report > hours ? '; SR-01 breach' : '; within deadline'}` : `No written notice on record; ${day(due) < today ? 'overdue — possible SR-01 breach' : 'due ' + due}`,
      verification_due: reportable ? verify : null, verification: volume === null ? 'Unknown until volume is confirmed' : reportable ? verified ? 'Agency verification closed' : `${day(verify) < today ? 'Overdue' : 'Pending'} agency verification (SR-03)` : 'Agency verification not required',
      verification_date: verificationEvent?.date || null,
      repairs: repairs.map(r => r.maintenance_id), inspector_note: i.notes,
      corrections: i.corrections.map(c => `${this.author(c.author_user_id)} corrected ${c.field || 'detection'}${c.original !== undefined ? ` from ${c.original} to ${c.value}` : ''}. ${c.reason || c.text}`),
      conflicts: [...notes.map(n => `${this.author(n.author_user_id)}: ${n.text}`), ...(new Set(i.corrections.filter(c=>c.field==='spill_est_volume_bbl').map(c=>c.value)).size>1 && new Set(i.corrections.filter(c=>c.field==='spill_est_volume_bbl').map(c=>c.author_user_id)).size>1 ? ['Different users supplied conflicting spill-volume corrections. The latest explicit value is applied, but the disagreement is unresolved. Please confirm with field measurements.'] : [])],
      evidence: [i.inspection_id, a.meta.asset_id, SR, ...i.corrections.map(c => c.id || c.note_id), ...repairs.flatMap(r => [r.maintenance_id, ...(r.report_file ? [`${r.maintenance_id}:report`] : [])]), ...events.map(e => e.event_id), ...notes.map(n => n.id || n.note_id)],
    };
  }
  rca(assets, range, equipment) {
    const rows = [];
    for (const a of assets) {
      const kinds = equipment ? [equipment] : [...new Set(a.repairs.map(r => r.equipment_kind))];
      for (const kind of kinds) {
        const repairs = a.repairs.filter(r => r.maintenance_type === 'corrective' && r.equipment_kind === kind && within(r.started_at, range));
        const policies = this.store.knowledge.filter(k => k.kind === 'policy' && k.well_type === a.meta.well_type && k.equipment === kind && (!k.asset_id || k.asset_id===a.meta.asset_id));
        const policy = policies.filter(k=>k.asset_id===a.meta.asset_id).at(-1) || policies.at(-1), threshold = policy?.threshold || (a.meta.well_type==='T500'&&kind==='esp_pump'?2:this.rcaThreshold);
        if (repairs.length >= threshold) rows.push({ well: a.meta.asset_id, type: a.meta.well_type, equipment: kind, repairs: repairs.length, threshold, repair_ids: repairs.map(r => r.maintenance_id), rule: policy ? `${this.author(policy.author_user_id)}'s rule for ${policy.asset_id || policy.well_type} ${kind}; team policy, not the manual` : 'T200 manual section 10 (inherited by T350)', status: 'RCA required before the next repair is closed', evidence: [manual(a.meta.well_type), manual('T200'), ...(policy ? [policy.id] : []), ...repairs.flatMap(r => [r.maintenance_id, ...(r.report_file ? [`${r.maintenance_id}:report`] : [])])] });
      }
    }
    return rows;
  }
  compliance(assets, range, today) {
    const breaches = [], pending = [], met = [], evidence = [];
    for (const s of this.spills(assets, range)) {
      const row = this.spillRow(s, today), a = s.asset, i = s.inspection;
      evidence.push(...row.evidence);
      const add = (protocol, detail, refs = []) => breaches.push({ well: row.well, date: row.date, protocol, detail, evidence: [...row.evidence, ...refs] });
      if (row.containment_hours !== null && row.containment_hours > this.rules.containmentHours) add('SR-02', `Contained after about ${row.containment_hours} hours; limit ${this.rules.containmentHours} hours.`);
      if (row.report_due) {
        if (/breach/.test(row.reporting)) add('SR-01', row.reporting + `; written notice due ${row.report_due}.`);
        if (/Overdue/.test(row.verification)) add('SR-03', `Cleanup verification due ${prettyDate(row.verification_due)}; still open.`);
        else if (row.verification_date && row.verification_date > day(row.verification_due)) add('SR-03', `Agency verification was completed late on ${row.verification_date}; deadline was ${day(row.verification_due)}. Now closed.`);
        else if (/Pending/.test(row.verification)) pending.push({ well: row.well, protocol: 'SR-03', detail: `Agency cleanup verification due ${prettyDate(row.verification_due)}.`, evidence: row.evidence });
      }
      if (i.spill_est_volume_bbl === null || i.spill_area_pct === null) add('SR-04', 'A recorded spill is missing its required estimated volume or affected pad area.');
      const events = a.events.filter(e => e.related_inspection_id === i.inspection_id && day(e.date) <= today);
      for (const nov of events.filter(e => e.event_type === 'notice_of_violation')) {
        const due = shift(nov.date, this.rules.responseDays, 'days');
        const responses = events.filter(e => e.event_type === 'nov_response_filed' && e.date >= nov.date);
        if (due < today && (!responses.length || responses.every(r => r.date > due))) add('RC-04', `Notice ${nov.event_id} required a response by ${prettyDate(due)}; ${responses.length ? 'response was late' : 'none recorded'}.`, [nov.event_id, RC]);
      }
    }
    for (const a of assets) {
      const inspections = a.inspections.filter(i => day(i.inspected_at) <= today);
      for (let index = 1; index < inspections.length; index++) {
        const previous = inspections[index-1], current = inspections[index];
        const gap = Math.round((new Date(day(current.inspected_at)) - new Date(day(previous.inspected_at))) / 86400000);
        if (within(current.inspected_at, range) && gap > this.rules.inspectionDays) breaches.push({ well:a.meta.asset_id,date:day(current.inspected_at),protocol:'RC-01',detail:`${gap}-day gap between recorded inspections; limit ${this.rules.inspectionDays} days.`,evidence:[previous.inspection_id,current.inspection_id,RC] });
      }
      // Escalation evidence is not equivalent to actual downtime. Only consecutive
      // observed weekly readings establish a continuous sequence; gaps reset it.
      let run = [];
      const checkRun = () => {
        if (run.length * 7 <= this.rules.consecutiveDownDays || !run.some(i => within(i.inspected_at, range))) return;
        const notes = this.notes(a, day(run.at(-1).inspected_at));
        const reported = notes.some(n => /(?:notified|reported|informed).*supervisor|supervisor.*(?:notified|informed)/i.test(n.text));
        if (!reported) pending.push({ well:a.meta.asset_id,protocol:'RC-03',detail:`${run.length*7} days of consecutive observed downtime; supervisor reporting is required, but no confirmation is recorded. Check the reporting record; missing evidence alone is not a confirmed failure to notify.`,evidence:[RC,...run.map(i=>i.inspection_id)] });
      };
      for (const raw of inspections) { const i = this.effective(a,raw); if (!i.producing && (!run.length || (new Date(day(i.inspected_at))-new Date(day(run.at(-1).inspected_at)))/86400000 === 7)) run.push(i); else { checkRun(); run = i.producing ? [] : [i]; } } checkRun();
      for (const r of a.repairs.filter(r => within(r.started_at, range))) {
        for (const check of this.reportFacts(r).checks) if (check.status.toLowerCase() === 'not met' && /^(WS-|RC-)/.test(check.protocol)) {
          breaches.push({ well: a.meta.asset_id, date: day(r.started_at), protocol: check.protocol, detail: check.detail, evidence: [r.maintenance_id, `${r.maintenance_id}:report`, WS, RC] });
        }
      }
      for (const n of this.notes(a, today)) if (/not yet|not logged|not.*maintenance system/i.test(n.text)) pending.push({ well: a.meta.asset_id, protocol: 'Manual §4', detail: `${n.text} Open recordkeeping action (the example rubric classifies an in-progress planned shut-in here).`, evidence: [n.id || n.note_id, manual(a.meta.well_type)] });
      for (const r of a.repairs.filter(r => day(r.started_at).startsWith(today.slice(0, 4)) && day(r.started_at) <= today && /annual flowline integrity test/i.test(r.issue) && /pass/i.test(r.action_taken))) met.push({ well: a.meta.asset_id, protocol: 'RC-02', detail: `Annual flowline integrity test passed ${prettyDate(r.started_at)} (${r.maintenance_id}).`, evidence: [r.maintenance_id, RC] });
      const currentTest = a.repairs.some(r => day(r.started_at).startsWith(today.slice(0,4)) && day(r.started_at)<=today && /annual flowline integrity test/i.test(r.issue) && /pass/i.test(r.action_taken));
      if (!currentTest) pending.push({well:a.meta.asset_id,protocol:'RC-02',detail:`No passing annual flowline integrity test recorded for ${today.slice(0,4)}; due by year end.`,evidence:[a.meta.asset_id,RC]});
    }
    const rcas = this.rca(assets, windowFor({ count: 12, unit: 'months' }, today));
    for (const r of rcas) pending.push({ well: r.well, protocol: 'Manual §10', detail: `${r.equipment}: ${r.repairs} corrective repairs (${r.repair_ids.join(', ')}). Action required: ${r.status}.`, evidence: r.evidence });
    const fines = assets.flatMap(a => a.events.filter(e => within(e.date, range) && e.fine_usd > 0));
    evidence.push(...breaches.flatMap(r => r.evidence), ...pending.flatMap(r => r.evidence), ...met.flatMap(r => r.evidence), ...fines.map(e => e.event_id));
    return { breaches, pending, met, fines_usd: sum(fines, f => f.fine_usd), open_fines_usd: sum(fines.filter(f => f.status === 'open'), f => f.fine_usd), evidence };
  }
  run(plan, { userId, today }) {
    const user = this.user(userId), assets = this.select(plan, user), range = windowFor(plan.period || (['rca','compliance'].includes(plan.op)?{count:12,unit:'months'}:null), today);
    const extended=this.field.run(plan,{assets,user,today,range});
    if(extended){const ids=[...new Set(extended.evidence)].filter(id=>this.store.source(id));return {...extended,range:extended.comparison_period||range,analysis_date:today,plan,evidence:ids.map(id=>{const s=this.store.source(id);return {id,kind:s.kind,path:s.source_path};})};}
    let rows = [], summary = '', visual = 'table', evidence = [], extra = {};
    if (plan.op === 'status') {
      const all = assets.map(a => this.status(a, today));
      rows = all.filter(r => plan.onlyDown ? r.producing === false : true);
      visual = assets.length === 1 ? 'card' : 'table';
      summary = assets.length === 1 && rows.length ? `${rows[0].well}: ${rows[0].producing === null ? 'production unknown' : rows[0].producing ? 'Yes, producing oil' : 'No, not producing oil'}. ${rows[0].reason}` : `${rows.length} wells${plan.onlyDown ? ' not producing oil' : ''}.`;
      if (!rows.length) evidence.push(...all.flatMap(r=>r.evidence));
      const corrected = all.filter(r => r.producing && r.corrections?.length && plan.onlyDown);
      if (corrected.length) summary += ' Excluded after correction: ' + corrected.map(r => `${r.well} is producing (${r.delta_c} °C above ambient). ${r.corrections.join(' ')}`).join(' ');
      evidence.push(...corrected.flatMap(r => r.evidence));
    } else if (plan.op === 'temperature') {
      visual = 'line';
      rows = assets.flatMap(a => a.inspections.filter(i => within(i.inspected_at, range)).map(raw => { const i = this.effective(a, raw); return { well: a.meta.asset_id, date: day(i.inspected_at), wellhead_c: i.wellhead_temp_c, ambient_c: i.ambient_temp_c, delta_c: i.delta_c, threshold_c: i.threshold_c, producing: i.producing, evidence: [i.inspection_id, manual(a.meta.well_type), ...i.corrections.map(c => c.id || c.note_id)] }; }));
      summary = `${rows.length} readings. Not producing on ${rows.filter(r => !r.producing).map(r => `${r.well}: ${prettyDate(r.date)}`).join('; ') || 'none of the recorded dates'}.`;
    } else if (plan.op === 'downtime') {
      visual = assets.length === 1 && !plan.limit ? 'none' : 'bar';
      rows = assets.map(a => {
        const down = a.inspections.filter(i => within(i.inspected_at, range)).map(i => this.effective(a, i)).filter(i => !i.producing);
        const details = down.map(i => { const repairs = a.repairs.filter(r => r.triggered_by_inspection_id === i.inspection_id || r.started_at <= i.inspected_at && r.completed_at >= i.inspected_at); return { date: day(i.inspected_at), wellhead_c: i.wellhead_temp_c, ambient_c: i.ambient_temp_c, delta_c: i.delta_c, reason: repairs.map(r => `${r.issue} (${r.maintenance_id})`).join('; ') || 'No recorded reason', evidence: [i.inspection_id, ...i.corrections.map(c => c.id || c.note_id), ...repairs.flatMap(r => [r.maintenance_id, ...(r.report_file ? [`${r.maintenance_id}:report`] : [])])] }; });
        return { well: a.meta.asset_id, type: a.meta.well_type, days: down.length * 7, readings: down.length, details, evidence: [manual(a.meta.well_type), '02-dataset-guide.md', ...details.flatMap(r => r.evidence)] };
      }).sort((a, b) => b.days - a.days || a.well.localeCompare(b.well));
      if (plan.limit) { extra.next = rows[plan.limit] || null; rows = rows.slice(0, plan.limit); }
      summary = rows.map(r => `${r.well}: ${r.days} days`).join(' · ') + '. Each nonproducing inspection counts as 7 days; missed inspections add zero.';
    } else if (plan.op === 'spills' || plan.op === 'spill_detail') {
      rows = this.spills(assets, range).filter(s => !plan.eventDate || day(s.inspection.inspected_at) === plan.eventDate).map(s => this.spillRow(s, today));
      if (plan.reportableOnly) rows = rows.filter(r => r.barrels >= this.rules.reportable);
      if (plan.lateContainment) rows = rows.filter(r => r.containment_hours > this.rules.containmentHours);
      extra.total_barrels = sum(rows, r => r.barrels);
      const removed = assets.flatMap(a => a.inspections.filter(i => i.spill_detected && within(i.inspected_at, range)).map(i => this.effective(a, i)).filter(i => !i.spill_detected));
      extra.excluded_detections = removed.map(i => ({ inspection_id: i.inspection_id, corrections: i.corrections.map(c => c.note_id || c.id) }));
      evidence.push(...removed.flatMap(i => [i.inspection_id, ...i.corrections.map(c => c.note_id || c.id)]));
      summary = `${rows.length} real spills, ${extra.total_barrels} barrels total.${removed.length ? ` ${removed.length} corrected false detections excluded.` : ''}`;
      if (rows.some(r=>r.barrels===null)) summary = `${rows.length} real spills; ${extra.total_barrels} known barrels. ${rows.filter(r=>r.barrels===null).length} spills have unknown volume, so the complete volume and reporting obligations are not established.`;
      if (plan.op === 'spill_detail' && rows.length) summary = `Yes, the oil detection stands: ${rows[0].barrels} bbl (${rows[0].inspection_id}). Ordinary feedback does not override a detection; only a formal correction does. Both views and the linked repair are shown.`;
      if (plan.lateContainment) summary += ` SOP SR-02 containment limit: ${this.rules.containmentHours} hours. Times come from repair reports.`;
    } else if (plan.op === 'heatmap') {
      visual = 'heatmap';
      const spills = this.spills(assets, range), startMonth = +range.start.slice(5, 7), endMonth = +range.end.slice(5, 7);
      const months = [];
      let date = range.start === '0001-01-01' ? today.slice(0, 4) + '-01-01' : range.start.slice(0, 7) + '-01';
      while (date <= range.end && months.length < 120) { months.push(date.slice(0, 7)); date = shift(date, 1, 'months'); }
      for (const area of this.store.areas.values()) {
        if (!assets.some(a => a.meta.area_id === area.area_id)) continue;
        const relevant = spills.filter(s => s.asset.meta.area_id === area.area_id);
        rows.push({ area: area.name, ...Object.fromEntries(months.map(m => [m, relevant.filter(s => s.inspection.inspected_at.startsWith(m)).length])), total: relevant.length, evidence: [area.area_id, SR, ...relevant.map(s => s.inspection.inspection_id)] });
      }
      extra.months = months;
      evidence.push(...assets.flatMap(a => a.notes.filter(n => n.note_type === 'correction').map(n => n.note_id)), ...this.store.knowledge.filter(k => k.kind === 'correction').map(k => k.id));
      summary = `${sum(rows, r => r.total)} real spills by geographic area and month. Corrected false detections removed.`;
    } else if (plan.op === 'cost') {
      rows = assets.map(a => { const repairs = a.repairs.filter(r => within(r.started_at, range)); return { well: a.meta.asset_id, cost_usd: sum(repairs, r => r.cost_usd.total), repairs: repairs.length, includes_estimates: repairs.some(r => this.reportFacts(r).open), evidence: repairs.map(r => r.maintenance_id) }; });
      summary = rows.map(r => `${r.well}: USD ${r.cost_usd.toLocaleString('en-US')}`).join(' · ') + '. Costs selected by repair start date; open-job costs are recorded estimates.';
    } else if (plan.op === 'rca') {
      rows = this.rca(assets, plan.period ? range : windowFor({ count: 12, unit: 'months' }, today), plan.equipment);
      summary = `${rows.length} wells/equipment groups require root-cause analysis. ` + [...new Set(rows.map(r => r.rule))].join('; ') + '.';
    } else if (plan.op === 'compliance') {
      const result = this.compliance(assets, plan.period ? range : windowFor({ count: 12, unit: 'months' }, today), today);
      rows = result.breaches; extra = result; evidence.push(...result.evidence);
      summary = `${rows.length} breaches; USD ${result.fines_usd.toLocaleString('en-US')} recorded fines, USD ${result.open_fines_usd.toLocaleString('en-US')} still open. Pending actions are listed separately from breaches.`;
    } else if (plan.op === 'planned') {
      rows = assets.flatMap(a => this.notes(a, today, null, true).filter(n => /planned|workover|shut in/i.test(n.text)).map(n => ({ well: a.meta.asset_id, author: this.author(n.author_user_id), detail: n.text, valid_from: n.valid_from, valid_to: n.valid_to, status: n.status || 'recorded context', evidence: [n.note_id || n.id] })));
      summary = rows.length ? 'Yes. ' + rows.map(r => `${r.well}: ${r.detail} According to ${r.author}.`).join(' ') : 'No planned downtime is recorded for these wells.';
    } else if (plan.op === 'repairs') {
      rows = assets.flatMap(a => a.repairs.filter(r => within(r.started_at, range) && (!plan.equipment || r.equipment_kind === plan.equipment)).map(r => ({ well: a.meta.asset_id, repair: r.maintenance_id, date: day(r.started_at), issue: r.issue, equipment: r.equipment_kind, cost_usd: r.cost_usd.total, status: this.reportFacts(r).open ? 'open; estimated cost' : 'completed', evidence: [r.maintenance_id, ...(r.report_file ? [`${r.maintenance_id}:report`] : [])] })));
      if(plan.latestFirst)rows.sort((a,b)=>b.date.localeCompare(a.date));if(plan.limit)rows=rows.slice(0,plan.limit);
      summary = `${rows.length} repair records${plan.latestFirst?' (most recent first)':''}.`;
    } else if (plan.op === 'report_checks') {
      for (const a of assets) for (const r of a.repairs.filter(r=>within(r.started_at,range))) {
        const raw = a.inspections.find(i=>i.inspection_id===r.triggered_by_inspection_id), corrected = raw ? this.effective(a,raw).corrections : [];
        for (const check of this.reportFacts(r).checks.filter(c=>(!plan.protocol || c.protocol===plan.protocol) && (!plan.checkStatus || c.status.toLowerCase()===plan.checkStatus.toLowerCase()))) rows.push({well:a.meta.asset_id,date:day(r.started_at),repair:r.maintenance_id,protocol:check.protocol,status:check.status,detail:check.detail,basis:corrected.length?'Historical report; corrected inputs require re-evaluation':'Report-authored finding',evidence:[r.maintenance_id,r.maintenance_id+':report',...(raw?[raw.inspection_id]:[]),...corrected.map(c=>c.id||c.note_id),WS,SR,RC]});
      }
      summary = `${rows.length} matching report findings. These are the reports' own compliance statements; corrected inputs are flagged separately from current obligations.`;
    } else if (plan.op === 'search') {
      rows = this.store.search(plan.search || '', plan.assets?.length === 1 ? plan.assets[0] : null).map(r => ({ title: r.title, excerpt: r.excerpt, evidence: [r.id] }));
      summary = `Found ${rows.length} relevant document excerpts. These are retrieved evidence, not a completed field-wide compliance audit.`;
      const stop=new Set(['the','this','that','well','wells','tell','about','what','which','where','does','have','with','from','when','your','our','please','information']);
      const terms = ((plan.search || '').toLowerCase().match(/[a-z0-9-]{3,}/g) || []).filter(t=>!stop.has(t));
      const clauses = [...this.store.docs.values()].filter(d=>d.id.startsWith('fleet/sops/')).flatMap(d=>d.content.split('\n').filter(line=>/^\| \*\*(?:WS|SR|RC)-/.test(line)).map(line=>({doc:d,line,score:terms.filter(term=>line.toLowerCase().includes(term)).length})));
      clauses.sort((a,b)=>b.score-a.score);
      if (clauses[0]?.score>=2 && /sop|rule|procedure|protocol|limit|threshold|must|should|h2s|heat trace|safety|permit/i.test(plan.search||'')) {
        const best=clauses[0],parts=best.line.split('|').map(p=>clean(p).trim()).filter(Boolean);
        rows=[{protocol:parts[0],requirement:parts[1],evidence:[best.doc.id]}];
        summary=`${parts[0]} — ${parts[1]}`;
      }
    } else throw Error(`Unsupported analysis operation: ${plan.op}`);
    evidence.push(...rows.flatMap(r => r.evidence || []));
    const unique = [...new Set(evidence)].filter(id => this.store.source(id));
    return { summary, visual: plan.visual || visual, rows, ...extra, evidence: unique.map(id => { const s = this.store.source(id); return { id, kind: s.kind, path: s.source_path }; }), range, analysis_date: today, plan };
  }
}
