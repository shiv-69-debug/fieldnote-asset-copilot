import { day, within, windowFor, shift, prettyDate } from './dates.js';

export const OPS = 'fleet/sops/operations-sop-rev2.md';
const RECALL = 'fleet/sops/supplier-recall-notice-2026-12-01.md';
const LETTER = 'fleet/sops/regulator-letter-2026-11-20.md';
const SR = 'fleet/sops/spill-response-sop.md', WS = 'fleet/sops/field-work-sop.md';
const rounded = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const median = values => { const s = values.slice().sort((a,b)=>a-b); return !s.length ? null : s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const clean = text => text.replaceAll('**','').replaceAll('\r','');
const dateText = text => { const value = new Date(text + ' UTC'); return Number.isNaN(value.valueOf()) ? null : day(value.toISOString()); };
const gasPattern = /smelled gas|gas (?:odor|odour|smell)|rotten[- ]egg|H2S monitor alarm/i;
const warningPattern = /rattl|squeal|fluid pound|tagging bottom|amps hunting|drive.*tripp|underload|vibrat|knock|grind|surging/i;
export function statusStatement(text) {
  if (/shut[- ]?in|shut (?:the )?well in/i.test(text)) return false;
  if (gasPattern.test(text) || /bypass|amps hunting|drive.*tripping|fluid pound|squeal|rattl|tagging bottom/i.test(text)) return null;
  if (/\brestarted\b|brought .*back online|put back on production|back online since/i.test(text)) return true;
  return null;
}

export class FieldOperations {
  constructor(engine) { this.e = engine; this.s = engine.store; }
  area(a) { return this.s.areas.get(a.meta.area_id)?.name || a.meta.area_id; }
  doc(id) { return clean(this.s.docs.get(id)?.content || ''); }
  notes(a,today) { return [...a.notes, ...this.s.knowledge.filter(k=>k.kind==='note'&&k.asset_id===a.meta.asset_id).map(k=>({...k,note_type:'operator_note',created_at:k.observed_at||`${k.analysis_date||day(k.created_at)}T12:00:00Z`}))].filter(n=>day(n.created_at)<=today).sort((a,b)=>a.created_at.localeCompare(b.created_at)); }
  lastRepair(a,today) { return a.repairs.filter(r=>day(r.started_at)<=today).at(-1); }
  repairRefs(r) { return r ? [r.maintenance_id,...(r.report_file?[r.maintenance_id+':report']:[])] : []; }
  latestStatusNote(a,today) { return this.notes(a,today).filter(n=>n.note_type==='operator_note' && n.text.includes(a.meta.asset_id) && (!n.valid_from||n.valid_from<=today) && statusStatement(n.text)!==null).at(-1); }
  applyStatus(a,today,result) {
    if (a.meta.decommissioned_on && a.meta.decommissioned_on<=today) return {...result,producing:false,unconfirmed:false,status_text:'Not producing oil (plugged and abandoned)',reason:`Permanently plugged and abandoned on ${a.meta.decommissioned_on}; a historical thermal reading does not establish current production.`,evidence:[...result.evidence,a.meta.asset_id]};
    if (!this.s.docs.has(OPS) || today<'2026-10-01') return result;
    const note=this.latestStatusNote(a,today), state=note?statusStatement(note.text):null;
    const newer=note && note.created_at>result.inspected_at;
    const producing=newer?state:result.producing;
    const reason=newer
      ? `${this.e.author(note.author_user_id)} recorded ${state?'a restart':'a shut-in'} at ${note.created_at}: “${note.text}” This is newer than inspection ${result.inspection_id}; OPS-3 gives the note precedence.${state?' Producing is unconfirmed until a new inspection confirms the restart.':''}`
      : `Inspection ${result.inspection_id} on ${result.date}: ${result.delta_c} °C above ambient versus the ${result.threshold_c} °C ${result.inspection_type || result.type} limit.${note?` The ${note.created_at} operator status note is older, so the inspection takes precedence under OPS-3.`:''}`;
    return {...result,inspection_producing:result.producing,producing,unconfirmed:Boolean(newer&&state),status_text:`${producing?'Producing oil':'Not producing oil'}${newer&&state?' (unconfirmed)':''}`,latest_operator_note:note?{id:note.note_id||note.id,at:note.created_at,text:note.text,producing:state,author:this.e.author(note.author_user_id)}:null,reason,recorded_status:a.meta.recorded_status+((a.meta.recorded_status==='active')!==producing?' (out of date)':''),evidence:[...result.evidence,OPS,...(note?[note.note_id||note.id,note.author_user_id]:[])]};
  }
  gasReports(assets,range,today) {
    const text=this.doc(OPS);
    const before=+(text.match(/(\d+) hours\*? for reports noted before/i)?.[1] || 24);
    const after=+(text.match(/(\d+) hours\*? for reports noted from/i)?.[1] || 12);
    const switchDate=dateText(text.match(/for reports noted from (\d+ \w+ \d{4})/)?.[1] || '1 Jan 2027');
    const rows=[];
    for(const a of assets) for(const n of this.notes(a,today).filter(n=>n.note_type==='operator_note'&&within(n.created_at,range)&&gasPattern.test(n.text))) {
      const candidates=[...a.repairs.filter(r=>r.started_at>n.created_at&&day(r.started_at)<=today).map(r=>({id:r.maintenance_id,time:r.started_at,kind:'maintenance'})),...a.inspections.filter(i=>i.method==='manual'&&i.inspected_at>n.created_at&&day(i.inspected_at)<=today).map(i=>({id:i.inspection_id,time:i.inspected_at,kind:'manual inspection'}))].sort((a,b)=>a.time.localeCompare(b.time));
      const response=candidates[0], hours=response?(new Date(response.time)-new Date(n.created_at))/3600000:null,limit=day(n.created_at)<switchDate?before:after;
      rows.push({well:a.meta.asset_id,area:this.area(a),reported_at:n.created_at,operator:this.e.author(n.author_user_id),operator_note:n.text,response_id:response?.id||'none',response_at:response?.time||null,response_kind:response?.kind||null,hours_to_response:hours===null?null:rounded(hours),deadline_hours:limit,deadline_at:new Date(new Date(n.created_at).getTime()+limit*3600000).toISOString(),result:hours!==null&&hours<=limit?'Met':'Missed',evidence:[n.note_id||n.id,n.author_user_id,...(response?[response.id]:[]),OPS,a.meta.asset_id]});
    }
    return rows.sort((a,b)=>a.reported_at.localeCompare(b.reported_at)||a.well.localeCompare(b.well));
  }
  bypasses(assets,today) {
    const approvals=[];
    for(const [id,d] of this.s.docs) if(/fleet\/sops\/moc-.*\.md$/.test(id)) {
      const text=clean(d.content),expiry=dateText(text.match(/approval expires on (\d+ \w+ \d{4})/i)?.[1]||'');
      const start=dateText(text.match(/Effective from (\d+ \w+ \d{4})/i)?.[1]||text.match(/Date: (\d+ \w+ \d{4})/i)?.[1]||'');
      const parent=text.match(/extends (MOC-\d+-\d+)/i)?.[1];
      approvals.push({id,memo:text.match(/MOC-\d+-\d+/)?.[0],wells:[...new Set(text.match(/WELL-\d+/g)||[])],start,expiry,parent});
    }
    for(const approval of approvals.filter(a=>a.parent)) { const original=approvals.find(a=>a.memo===approval.parent); if(original){approval.start=original.start;approval.wells=original.wells;approval.original=original.id;} }
    const rows=[];
    for(const a of assets) {
      let installed=null;
      const finish=removed=> {
        if(!installed)return;
        const matches=approvals.filter(p=>p.wells.includes(a.meta.asset_id)&&p.start<=day(installed.created_at)).sort((x,y)=>y.expiry.localeCompare(x.expiry));
        const approval=matches[0],end=removed?day(removed.created_at):today;
        const status=!approval?'Not approved':end>approval.expiry?'Expired':'Allowed';
        rows.push({well:a.meta.asset_id,area:this.area(a),bypass_in:day(installed.created_at),bypass_out:removed?day(removed.created_at):'still in',approval:approval?.memo||'none',approval_valid_until:approval?.expiry||null,status,currently_in_place:!removed,evidence:[a.meta.asset_id,installed.note_id,...(removed?[removed.note_id]:[]),OPS,...(approval?[approval.id,...(approval.original?[approval.original]:[])]:[])]});installed=null;
      };
      for(const n of this.notes(a,today).filter(n=>n.note_type==='operator_note'&&/bypass/i.test(n.text))) {
        if(/bypass (?:removed|pulled)|(?:took|take) the bypass out|bypass.*taken out/i.test(n.text))finish(n);
        else if(/bypass.*(?:in place|installed)|put the bypass in/i.test(n.text)) {if(!installed)installed=n;}
      }
      finish(null);
    }
    return rows.filter(r=>r.currently_in_place||r.status!=='Allowed').sort((a,b)=>a.area.localeCompare(b.area)||a.well.localeCompare(b.well));
  }
  recalled(assets,today) {
    const notice=this.doc(RECALL),affected=notice.split('Pumps from all other lots')[0];
    const lots=new Set(affected.match(/LOT-[\w-]+/g)||[]),model=notice.match(/Highline\s+(RP-\d+)/)?.[1];
    const due=dateText(notice.match(/\(by (\d+ \w+ \d{4})\)/)?.[1]||'');
    const rows=[],excluded=[],unknown=[];
    for(const a of assets) {
      if(this.e.typeAt(a,today)==='T500'||a.meta.decommissioned_on&&a.meta.decommissioned_on<=today)continue;
      const jobs=a.repairs.filter(r=>day(r.started_at)<=today&&r.equipment_kind==='downhole_pump'&&!/^Follow-up/i.test(r.issue)&&/pull|replac|install/i.test(r.action_taken+' '+r.issue));
      const job=jobs.at(-1); if(!job){unknown.push(a.meta.asset_id);continue;}
      const part=clean(this.e.report(job)).match(/Parts installed:\s*([^\n]+)/i)?.[1]||'';
      const lot=part.match(/LOT-[\w-]+/)?.[0], serial=part.match(/serial\s+([\w-]+)/i)?.[1];
      if(!lot){unknown.push(a.meta.asset_id);continue;}
      if(!lots.has(lot)||!part.includes(model))continue;
      const claims=this.s.knowledge.filter(k=>k.kind==='pump_replacement_claim'&&k.asset_id===a.meta.asset_id&&(!k.installation_id||k.installation_id===job.maintenance_id));
      const accepted=claims.filter(c=>c.accepted&&c.effective_from<=today&&c.effective_from>=day(job.started_at)).at(-1);
      const base={well:a.meta.asset_id,area:this.area(a),team:this.s.teams.get(a.meta.team_id)?.name,model,serial:serial||'not recorded',lot,installation_id:job.maintenance_id,installed_at:job.completed_at,installation_cost_usd:job.cost_usd.total,cost_basis:job.cost_revision?'Revised installation-job total; see cost revision':'Recorded installation-job total (labor and parts)',replacement_due:due,status:due&&today>due?'Overdue replacement':'Replacement required',provenance:`${job.maintenance_id}:report records the installed model, serial and lot.`,conflicts:claims.filter(c=>!c.accepted).map(c=>`${this.e.author(c.author_user_id)}: ${c.reason} Unconfirmed hearsay; not used to remove the pump.`),evidence:[a.meta.asset_id,job.maintenance_id,job.maintenance_id+':report',RECALL,...claims.map(c=>c.id)]};
      if(accepted)excluded.push({...base,status:'Reported replaced; work order not recorded',reported_by:this.e.author(accepted.author_user_id),effective_from:accepted.effective_from,provenance:`${this.e.author(accepted.author_user_id)} directly reported replacement effective ${accepted.effective_from}; no replacement job is on record.`,evidence:[...base.evidence,accepted.id]});
      else rows.push(base);
    }
    return {rows,excluded,unknown};
  }
  freezes(assets,range,today) {
    const rows=[];
    const threshold=-(+(this.doc(OPS).match(/below [−-](\d+) °C/)?.[1]||5));
    const deadline=+(this.doc(OPS).match(/within (\d+) days after the inspection/)?.[1]||7);
    for(const a of assets) for(const raw of a.inspections.filter(i=>within(i.inspected_at,range)&&[12,1,2].includes(+i.inspected_at.slice(5,7)))) {
      const i=this.e.effective(a,raw);if(!i.producing||i.ambient_temp_c>threshold)continue;
      const due=new Date(new Date(i.inspected_at).getTime()+deadline*86400000).toISOString();
      const check=a.repairs.filter(r=>/Heat trace check/i.test(r.issue)&&r.started_at>i.inspected_at&&day(r.started_at)<=today).sort((a,b)=>a.started_at.localeCompare(b.started_at))[0];
      rows.push({well:a.meta.asset_id,area:this.area(a),inspection_id:i.inspection_id,date:day(i.inspected_at),ambient_c:i.ambient_temp_c,delta_c:i.delta_c,type:i.well_type,check_id:check?.maintenance_id||'none',check_started_at:check?.started_at||null,deadline:due,result:check&&check.started_at<=due?'Met':day(due)<=today?'Missed':'Pending',evidence:[a.meta.asset_id,i.inspection_id,...i.corrections.map(c=>c.note_id||c.id),...(check?[check.maintenance_id]:[]),OPS,`fleet/well-types/${i.well_type}.md`]});
    }
    return rows;
  }
  risk(assets,range,today,{unrepaired=true}={}) {
    const rows=[];
    const gas=this.s.docs.has(OPS)?this.gasReports(assets,windowFor({count:12,unit:'months'},today),today):[];
    const recalled=this.recalled(assets,today).rows;
    for(const a of assets) {
      const noteEvidence=this.notes(a,today).filter(n=>n.note_type==='operator_note'&&within(n.created_at,range)&&warningPattern.test(n.text));
      const last=noteEvidence.at(-1), repairs=a.repairs.filter(r=>day(r.started_at)<=today), after=last?repairs.filter(r=>r.started_at>last.created_at):[];
      if(unrepaired&&(!last||after.length))continue;
      if(a.meta.decommissioned_on&&a.meta.decommissioned_on<=today)continue;
      const status=this.e.status(a,today), latest=repairs.at(-1), readings=a.inspections.filter(i=>day(i.inspected_at)<=today).slice(-4).map(i=>this.e.effective(a,i));
      let score=0;const signs=[],refs=[a.meta.asset_id,...status.evidence,...noteEvidence.map(n=>n.note_id),...this.repairRefs(latest)];
      const unanswered=gas.filter(g=>g.well===a.meta.asset_id&&g.response_id==='none');
      if(unanswered.length){score+=100;signs.push('Gas report has no qualifying field response; actual H2S concentration is unknown.');refs.push(...unanswered.flatMap(g=>g.evidence));}
      const drive=noteEvidence.some(n=>/drive.*tripp|underload/i.test(n.text));if(drive){score+=60;signs.push('Repeated drive trips/underload: T500 manual says treat repeated trips as a failure, not repeated resets.');}
      const decline=this.e.typeAt(a,today)==='T500'&&readings.length===4&&readings.slice(1).every((r,i)=>r.delta_c<readings[i].delta_c)&&readings[0].delta_c-readings[3].delta_c>=3;
      if(decline){score+=45;signs.push(`ESP delta fell ${rounded(readings[0].delta_c-readings[3].delta_c,1)} °C over four consecutive readings; drive/insulation check required within 14 days of ${day(readings[3].inspected_at)}.`);refs.push(...readings.map(r=>r.inspection_id));}
      if(!status.producing){score+=30;signs.push(`Currently not producing: ${status.reason}`);}
      const repeat=repairs.filter(r=>r.maintenance_type==='corrective'&&within(r.started_at,windowFor({count:12,unit:'months'},today))&&!/spill|crude release/i.test(r.issue));
      score+=Math.min(repeat.length,5)*5;if(repeat.length)signs.push(`${repeat.length} non-spill corrective jobs in the last 12 months.`);
      if(recalled.some(r=>r.well===a.meta.asset_id)){score+=20;signs.push('Known currently installed pump is subject to an overdue supplier recall.');refs.push(...recalled.find(r=>r.well===a.meta.asset_id).evidence);}
      if(last){score+=/hunting/i.test(last.text)?18:/fluid pound|tagging bottom/i.test(last.text)?15:12;score+=Math.min(noteEvidence.length,4)*3;}
      if(!signs.length)signs.push('Operator concern only; no stronger quantified warning found.');
      rows.push({rank:0,well:a.meta.asset_id,area:this.area(a),operator_note_evidence:noteEvidence.map(n=>`${n.created_at} — ${this.e.author(n.author_user_id)}: “${n.text}”`).join('\n')||'No qualifying recent mechanical note',warning_signs:signs.join(' '),last_repair:latest?`${latest.maintenance_id}, ${latest.started_at}: ${latest.issue}${this.e.reportFacts(latest).open?' (in progress)':''}`:'No repair recorded',triage_score:score,score_meaning:'Heuristic triage score, not a failure probability',evidence:[...refs,`fleet/well-types/${this.e.typeAt(a,today)}.md`,OPS]});
    }
    return rows.sort((a,b)=>b.triage_score-a.triage_score||a.well.localeCompare(b.well)).map((r,index)=>({...r,rank:index+1}));
  }
  run(plan,{assets,user,today,range}) {
    let rows=[],summary='',visual='table',extra={},evidence=[];
    switch(plan.op) {
      case 'overview': {
        rows=assets.map(a=>{const status=this.e.status(a,today),r=this.lastRepair(a,today);return {...status,team:this.s.teams.get(a.meta.team_id)?.name,installed_on:a.meta.installed_on,equipment:a.meta.equipment.map(e=>e.kind).join(', '),last_repair:r?`${r.maintenance_id}: ${r.issue} (${day(r.started_at)})`:'No repair recorded',repair_count:a.repairs.filter(r=>day(r.started_at)<=today).length,evidence:[...status.evidence,...this.repairRefs(r)]};});
        visual=rows.length===1?'card':'table'; summary=rows.map(r=>`${r.well} is a ${r.type} well in ${r.area}, operated by ${r.team}. ${r.status_text|| (r.producing?'Producing oil':'Not producing oil')}. Last inspection ${r.date} by ${r.inspector} (${r.method}); ${r.delta_c} °C above ambient. ${r.reason} Last repair: ${r.last_repair}.`).join('\n');break;
      }
      case 'reservoir_pressure': summary='A reservoir-pressure map cannot be supported by this dataset. Inspections contain temperatures and spill estimates, not reservoir/downhole pressure measurements. Pressure figures in manuals and repair reports are equipment ratings, maximum operating pressure or flowline pressure tests—not spatial reservoir pressure. Sharing one reservoir does not make those measurements interchangeable. Please supply reservoir pressure measurements with well, depth, timestamp and measurement conditions; I will not invent a pressure map.';visual='none';evidence=['02-dataset-guide.md',...this.s.docs.keys()].filter(id=>id==='02-dataset-guide.md'||id.startsWith('fleet/well-types/'));extra.unanswerable=true;break;
      case 'production_volume':summary='We cannot identify which well produced the most oil in 2026 from these records. Temperature differences indicate producing/not producing, but do not measure oil flow or cumulative production. Spill barrels are lost oil, not produced volumes, and downtime does not establish output. A valid ranking needs metered per-well production volumes or oil rates integrated over 2026. No best-producer ranking is supported.';visual='none';evidence=['02-dataset-guide.md',...this.s.docs.keys()].filter(id=>id==='02-dataset-guide.md'||id.startsWith('fleet/well-types/'));extra.unanswerable=true;break;
      case 'gas_reports':rows=this.gasReports(assets,range,today);summary=`${rows.length} operator gas reports: ${rows.filter(r=>r.result==='Met').length} met the field-response deadline; ${rows.filter(r=>r.result==='Missed').length} missed it. OPS-1 requires 24 hours before 1 Jan 2027 and 12 hours from that date. Only a later maintenance start or manual inspection on the same well qualifies; drone inspections do not.`;break;
      case 'bypasses':rows=this.bypasses(assets,today);summary=`${rows.filter(r=>r.currently_in_place).length} temporary bypasses are currently in place. The table also includes every historical unapproved/overstayed bypass. MOC extensions replace the earlier expiry for their named wells; expiry is the end of the stated day.`;break;
      case 'regulator_letter': {
        const text=this.doc(LETTER),areaNames=[...this.s.areas.values()].filter(a=>text.includes(a.name)).map(a=>a.area_id);
        const start=dateText(text.match(/since (\d+ \w+ \d{4})/i)?.[1]||''), phrase=text.match(/contains the sentence "([^"]+)"/)?.[1];
        if(!start||!phrase)throw Error('Regulator letter could not be interpreted; inspect its source.');
        const selected=[...this.s.assets.values()].filter(a=>areaNames.includes(a.meta.area_id));
        rows=this.e.spills(selected,{start,end:today}).filter(s=>s.inspection.spill_est_volume_bbl>=this.e.rules.reportable).map(({asset:a,inspection:i})=>{
          const jobs=a.repairs.filter(r=>r.triggered_by_inspection_id===i.inspection_id&&day(r.started_at)<=today&&/spill|crude release|remediat|contaminated/i.test(r.issue+' '+r.action_taken));
          const sampled=jobs.some(r=>{const section=this.e.report(r).match(/## Spill clean-up and waste\s+([\s\S]*?)(?=\n## |$)/i)?.[1]||'';return section.includes(phrase);});
          return {well:a.meta.asset_id,area:this.area(a),inspection:i.inspection_id,date:day(i.inspected_at),barrels:i.spill_est_volume_bbl,clean_up_job:jobs.map(r=>r.maintenance_id).join(', ')||'none',compliant:sampled?'Yes — required laboratory-sample sentence is in the clean-up section':'No — required laboratory-sample sentence missing from the clean-up report; field soil readings do not count',evidence:[a.meta.asset_id,i.inspection_id,...i.corrections.map(c=>c.note_id||c.id),...jobs.flatMap(r=>this.repairRefs(r)),LETTER,SR]};
        });summary=`The letter covers ${rows.length} real reportable spills in its named Northeast areas since ${start}; ${rows.filter(r=>r.compliant.startsWith('No')).length} lack the required lab-sample evidence. Compliance here uses the letter's specific sentence “${phrase}”, not general clean-up completion or field TPH readings. Results were required by 15 Jan 2027.`;break;
      }
      case 'status_conflicts': {
        for(const a of assets){const state=this.e.status(a,today),note=this.latestStatusNote(a,today);if(!note||state.inspection_producing===undefined||state.inspection_producing===statusStatement(note.text))continue;rows.push({well:a.meta.asset_id,area:this.area(a),latest_inspection:`${state.inspection_id}, ${state.inspected_at}: ${state.inspection_producing?'Producing':'Not producing'} (${state.delta_c} °C above ambient; limit ${state.threshold_c})`,latest_operator_note:`${note.created_at}: ${this.e.author(note.author_user_id)} — “${note.text}”`,status_now:state.status_text,why:state.reason,evidence:state.evidence});}
        summary=`${rows.length} wells have differing latest inspection and status-changing operator-note evidence. OPS-3 compares observation timestamps after inspection corrections: later shut-ins mean not producing; later restarts mean producing (unconfirmed). Routine rounds, gas reports and equipment remarks do not independently change status.`;break;
      }
      case 'risk':rows=this.risk(assets,plan.period?range:windowFor({count:1,unit:'months'},today),today).slice(0,plan.limit||10);summary=`These ${rows.length} wells have recent mechanical-warning notes and no maintenance job started after the latest qualifying note. This is an evidence-based triage ranking for a 90-day planning horizon, not calibrated failure probabilities. Drive trips, a qualifying ESP temperature decline, current nonproduction and repeated non-spill failures receive greater priority. Spill clean-up is not the predicted repair target.`;extra.ranking_method='Safety first; drive trips 60, ESP decline 45, nonproduction 30, recall 20, corrective history up to 25, note severity/frequency. No trained failure-probability model.';break;
      case 'priority':rows=this.risk(assets,windowFor({count:1,unit:'months'},today),today,{unrepaired:false}).slice(0,plan.limit||3);summary=`I would send a crew to ${rows.map(r=>r.well).join(', ')} first among the wells referenced in this conversation. This is a documented triage judgement: unresolved gas-response risk outranks equipment risks; repeated drive trips, thermal decline and nonproduction follow. Unknown gas concentration requires measurement, not an assumed ppm value.`;break;
      case 'recall': case 'recall_status': {
        const inventory=this.recalled(assets,today);extra.reported_replacements=inventory.excluded;extra.unknown_lot_wells=inventory.unknown;
        const affected=plan.op==='recall_status'?inventory.rows.filter(r=>!this.e.status(this.s.assets.get(r.well),today).producing):inventory.rows;
        rows=affected.map(r=>{const a=this.s.assets.get(r.well),status=this.e.status(a,today),repair=this.lastRepair(a,today);return {...r,...(plan.op==='recall_status'?{status_now:status.status_text||'Not producing oil',last_repair:repair?`${repair.maintenance_id} · ${repair.started_at} · ${repair.issue}`:'none',evidence:[...r.evidence,...status.evidence,...this.repairRefs(repair)]}:{})};});
        extra.well_ids=rows.map(r=>r.well);extra.recall_count=rows.length;
        summary=`${rows.length} known recalled pumps ${plan.op==='recall_status'?'are in wells currently not producing oil':'remain in the documented active inventory'}. Only the latest actual rod-pump replacement counts; follow-up checks do not replace pumps, unaffected lots and ESPs are excluded. ${inventory.excluded.length} replacement${inventory.excluded.length===1?' is':'s are'} reported by an identified responsible user but still await a work order. ${inventory.unknown.length} rod-lift wells lack a documented current manufacturing lot, so this is the known recalled inventory, not proof that every other pump is unaffected.`;
        if(plan.groupByArea){const detailed=rows;rows=[...this.s.areas.values()].map(a=>({area:a.name,known_recalled_pumps:detailed.filter(r=>r.area===a.name).length,wells:detailed.filter(r=>r.area===a.name).map(r=>r.well).join(', '),evidence:detailed.filter(r=>r.area===a.name).flatMap(r=>r.evidence)})).filter(r=>r.known_recalled_pumps);}
        evidence.push(RECALL,...inventory.excluded.flatMap(r=>r.evidence));break;
      }
      case 'team': {
        const team=[...this.s.teams.values()].find(t=>t.name.toLowerCase()===String(plan.team||'').toLowerCase())||this.s.teams.get(user.team_id);if(!team)throw Error('Which team do you mean?');
        const owned=[...this.s.assets.values()].filter(a=>this.e.teamAt(a,today)===team.team_id);
        rows=[{team:team.name,lead:this.e.author(team.lead_user_id),wells:owned.length,evidence:[team.team_id,team.lead_user_id,...owned.map(a=>a.meta.asset_id)]}];summary=`${team.name} is led by ${this.e.author(team.lead_user_id)} and runs ${owned.length} wells as of ${today}. Well-level ownership and dated team history take precedence over the area's team.`;extra.well_ids=[];break;
      }
      case 'freeze': {
        const all=this.freezes(assets,plan.period?range:{start:`${+today.slice(0,4)-1}-12-01`,end:`${+today.slice(0,4)-1}-12-31`},today); rows=all.filter(r=>r.result==='Missed').slice(0,plan.limit||all.length);
        summary=`OPS-5: from 1 Dec through 28 Feb, a producing well inspected at ambient temperature ≤ −5 °C needs a heat-trace-check maintenance job started within 7 days after the reading. Cold nonproducing readings need no check. ${all.filter(r=>r.result==='Missed').length} qualifying readings missed their deadline in the selected period.${rows.length?` Example: ${rows[0].well}, ${rows[0].inspection_id} on ${rows[0].date}.`:''}`;evidence.push(OPS);break;
      }
      case 'gas_reading': {
        const notes=assets.flatMap(a=>this.notes(a,today).filter(n=>gasPattern.test(n.text)&&(!plan.eventDate||day(n.created_at)===plan.eventDate)).map(n=>({a,n})));
        rows=notes.map(({a,n})=>{const ppm=n.text.match(/(\d+(?:\.\d+)?)\s*ppm/i);return {well:a.meta.asset_id,reported_at:n.created_at,note:n.text,h2s_ppm:ppm?+ppm[1]:null,measurement_status:ppm?'Explicit value in the operator note':'Not recorded; odor is not a quantitative reading',evidence:[n.note_id,n.author_user_id,a.meta.asset_id,OPS,WS]};});
        summary=rows.some(r=>r.h2s_ppm!==null)?'Only explicitly recorded ppm readings are shown.':"The H2S reading is not recorded for that gas-odor report. Smelling gas or noting an alarm does not establish an exact concentration. The 10 ppm stop-work threshold is a rule, not a measurement; readings from unrelated repair reports cannot be substituted.";extra.unanswerable=!rows.some(r=>r.h2s_ppm!==null);visual='none';break;
      }
      case 'waiting': {
        const delayed=[],missing=[];
        for(const a of assets)for(const r of a.repairs.filter(r=>within(r.started_at,range))){const report=clean(this.e.report(r));const match=report.match(/about (\d+(?:\.\d+)?) days longer than the repair itself because ([^.]+)\./i);if(!match){if(r.maintenance_type==='corrective')missing.push(r.maintenance_id);continue;}const reason=match[2];const category=/back.order|supplier|replacement part|parts? (?:delay|avail)/i.test(reason)?'Parts':/contractor|rig.*slot/i.test(reason)?'Contractors':/weather|rain|road|mud/i.test(reason)?'Weather':/crew/i.test(reason)?'Crews':'Other';delayed.push({well:a.meta.asset_id,area:this.area(a),repair:r.maintenance_id,reason:category,extra_days:+match[1],quote:match[0],estimated:this.e.reportFacts(r).open,evidence:[r.maintenance_id,r.maintenance_id+':report']});}
        const chart=[];
        for(const area of this.s.areas.values()){const areaJobs=delayed.filter(r=>r.area===area.name);if(!areaJobs.length)continue;const bar={area:area.name};for(const category of ['Parts','Crews','Contractors','Weather','Other']){const jobs=areaJobs.filter(r=>r.reason===category);bar[category]=rounded(100*jobs.length/areaJobs.length,1);if(jobs.length)rows.push({area:area.name,reason:category,jobs:jobs.length,share_pct:bar[category],typical_extra_days:median(jobs.map(r=>r.extra_days)),mean_extra_days:rounded(mean(jobs.map(r=>r.extra_days))),evidence:jobs.flatMap(r=>r.evidence)});}chart.push(bar);}
        const medians=[...this.s.areas.values()].map(a=>({area:a.name,median:median(delayed.filter(r=>r.area===a.name).map(r=>r.extra_days))})).filter(r=>r.median!==null).sort((a,b)=>b.median-a.median);
        summary=`${delayed.length} jobs have an explicit report statement quantifying extra shut-in waiting. Shares are within each area's documented delayed jobs; typical means median extra days, with means also shown. ${missing.length} other corrective jobs lack this explicit waiting statement and are not treated as zero delay. ${medians[0]?`${medians[0].area} has the highest area median (${medians[0].median} extra days).`:''} This is a descriptive comparison, not proof of an area's operational quality; equipment mix and reporting coverage can differ.`;
        extra.additional_visuals=[{type:'stacked_bar',title:'Share of documented delay reasons by area (%)',rows:chart,series:['Parts','Crews','Contractors','Weather','Other']}];extra.delay_jobs=delayed;extra.unclassified_corrective_jobs=missing.length;break;
      }
      case 'hotter': {
        const period=plan.period?range:{start:`${+today.slice(0,4)-1}-01-01`,end:`${+today.slice(0,4)-1}-12-31`};const cells=[];
        for(const a of assets){const groups=new Map();for(const raw of a.inspections.filter(i=>within(i.inspected_at,period))){const i=this.e.effective(a,raw);if(!i.producing)continue;const key=i.well_type+'|'+i.inspected_at.slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}for(const [key,readings]of groups){const[type,month]=key.split('|');cells.push({well:a.meta.asset_id,area:this.area(a),region:this.area(a).split(' Block ')[0],type,month,delta:mean(readings.map(i=>i.delta_c)),head:mean(readings.map(i=>i.wellhead_temp_c)),air:mean(readings.map(i=>i.ambient_temp_c)),ids:readings.map(i=>i.inspection_id)});}}
        const regions=[...new Set(cells.map(c=>c.region))], strata=[...new Set(cells.map(c=>c.type+'|'+c.month))], common=strata.filter(key=>regions.every(region=>cells.some(c=>c.region===region&&c.type+'|'+c.month===key)));
        const wins=new Map(regions.map(r=>[r,0]));for(const key of common){const values=regions.map(region=>({region,value:mean(cells.filter(c=>c.region===region&&c.type+'|'+c.month===key).map(c=>c.delta))})).sort((a,b)=>b.value-a.value);wins.set(values[0].region,wins.get(values[0].region)+1);}
        rows=regions.map(region=>{const own=cells.filter(c=>c.region===region),standardized=common.map(key=>mean(own.filter(c=>c.type+'|'+c.month===key).map(c=>c.delta)));return {region,wells:new Set(own.map(c=>c.well)).size,mean_wellhead_c:rounded(mean(own.map(c=>c.head))),mean_air_c:rounded(mean(own.map(c=>c.air))),mean_delta_c:rounded(mean(own.map(c=>c.delta))),matched_type_month_delta_c:standardized.length?rounded(mean(standardized)):null,hottest_type_months:wins.get(region),compared_type_months:common.length,evidence:own.flatMap(c=>[c.well,...c.ids])};}).sort((a,b)=>(b.matched_type_month_delta_c||0)-(a.matched_type_month_delta_c||0));
        const raw=rows.slice().sort((a,b)=>b.mean_wellhead_c-a.mean_wellhead_c)[0];
        summary=`Assuming “hotter” means operational wellhead temperatures, I compared ${period.start} to ${period.end}, using producing readings, each well equally weighted within type/month. Raw wellhead means are highest in ${raw?.region}; raw heat mixes weather, lift type and operation. After subtracting ambient and equally weighting the ${common.length} type/month strata present in every region, ${rows[0]?.region} has the highest mean delta, but is hottest in ${rows[0]?.hottest_type_months}/${common.length} comparisons. ${rows[0]?.hottest_type_months===common.length?'That is consistent across this comparison.':'There is no region that is universally hottest across all matched type/month comparisons.'} This does not establish reservoir heat or oil output.`;
        extra.comparison_period=period;extra.chart_metric='matched_type_month_delta_c';extra.methodology='Compare within historical well type and month, use well-month means, ambient-adjust, and equal-weight common strata. Nonproducing readings excluded.';visual='bar';evidence.push(...[...this.s.docs.keys()].filter(id=>id.startsWith('fleet/well-types/')));break;
      }
      default:return null;
    }
    evidence.push(...rows.flatMap(r=>r.evidence||[]));
    return {summary,visual:plan.visual||visual,rows,...extra,evidence};
  }
}
