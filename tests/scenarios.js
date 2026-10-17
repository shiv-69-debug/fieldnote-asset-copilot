import assert from 'node:assert/strict';
export const questions = [
  'Is WELL-0001 producing oil right now? When was it last inspected, and by whom?',
  'Which wells in Northeast Block 8 are not producing oil right now, and why? Show them in a table.',
  "Show a line chart of WELL-0001's wellhead temperature against air temperature for the last 13 weeks, and mark when it was not producing oil.",
  'How many oil spills has WELL-0001 had in the last 4 years, and how much oil in total? List them in a table.',
  'How many days was WELL-0001 down in 2025?',
  'Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months? Show a bar chart.',
  'Show on a map every well in Northeast Block 8 with a real spill in the last 90 days.',
  'Show a heatmap of 2026 spills by geographic area and month.',
  'Which rules has WELL-0001 broken in the last 12 months, and what is still open?',
  'In Southwest Block 24, which spills in the last 90 days were not contained within the SOP time limit?',
  'For the three wells we discussed yesterday, what have repairs cost this year?',
  'The 15 Oct reading for WELL-0164 is wrong. The handheld thermal gun used in that inspection was faulty; the field crew re-measured the wellhead at 41.0 °C.',
  'The AI estimated the 24 Sep spill at WELL-0151 as 4.5 bbl. The field crew measured 5.4 bbl.',
  'Which wells in Northeast Block 7 need a root-cause analysis on their pump jack?',
  'Is WELL-0164 producing oil right now?',
  'FYI for everyone: WELL-0007 will be shut in from 17 Oct for a 10-day planned workover.',
  'WELL-0175 has been shut in for planned work since 14 Oct.',
  'Was the 20 Aug spill at WELL-0101 real oil?',
];
const ids = response => response.rows.map(r => r.well).sort();
const eqIds = (r, values) => assert.deepEqual(ids(r), values.map(n => `WELL-${String(n).padStart(4, '0')}`).sort());
const cited = (r, id) => assert.ok(r.evidence.some(e => e.id === id), `Missing evidence: ${id}`);
const content = r => JSON.stringify(r);
export async function scenario(number, ask, store) {
  let r;
  switch (number) {
    case 1:
      r = await ask(questions[0]);
      assert.equal(r.visual, 'card'); assert.equal(r.rows[0].producing, false);
      assert.equal(r.rows[0].delta_c, 3.2); assert.equal(r.rows[0].inspection_id, 'INS-0001-0203');
      assert.equal(r.rows[0].date, '2026-10-15'); assert.equal(r.rows[0].inspector, 'Ryan Brooks'); assert.equal(r.rows[0].method, 'drone');
      assert.match(r.rows[0].reason, /Jake Morales.*7 Oct.*rod string.*20 Oct/);
      assert.match(r.rows[0].recorded_status, /out of date/); cited(r, 'CTX-0001-003'); cited(r, 'fleet/well-types/T200.md'); break;
    case 2:
      r = await ask(questions[1]); eqIds(r, [164,170,172,175]); assert.equal(r.visual, 'table');
      assert.deepEqual(r.rows.map(r => r.delta_c), [4.1,2.9,5.7,0.4]);
      assert.ok(r.rows.every(r => r.type === 'T200' && r.date === '2026-10-15'));
      assert.match(r.rows[0].reason, /No recorded reason/); assert.match(r.rows[0].inspector_note, /Pump jack not moving/);
      cited(r, 'MNT-0170-031'); cited(r, 'MNT-0172-028'); break;
    case 3:
      r = await ask(questions[2]); assert.equal(r.visual, 'line'); assert.equal(r.rows.length, 13);
      assert.equal(r.rows[0].date, '2026-07-23'); assert.equal(r.rows.at(-1).date, '2026-10-15');
      assert.deepEqual(r.rows.filter(r => !r.producing).map(r => r.date), ['2026-10-08','2026-10-15']); break;
    case 4:
      r = await ask(questions[3]); assert.equal(r.visual, 'table'); assert.equal(r.rows.length, 6); assert.equal(r.total_barrels, 15.1);
      assert.deepEqual(r.rows.map(r => [r.date,r.barrels]), [['2023-03-16',.5],['2023-04-27',2.6],['2023-09-28',3.3],['2023-10-19',.3],['2026-06-11',6.8],['2026-10-01',1.6]]);
      cited(r, 'CTX-0001-001'); assert.equal(r.excluded_detections[0].inspection_id, 'INS-0001-0070'); break;
    case 5:
      r = await ask(questions[4]); assert.equal(r.rows[0].days, 21); assert.equal(r.visual, 'none');
      assert.deepEqual(r.rows[0].details.map(r => r.date), ['2025-07-24','2025-10-16','2025-10-23']);
      assert.equal(r.rows[0].details[0].delta_c, 8.5); cited(r, 'MNT-0001-021'); cited(r, 'MNT-0001-023'); break;
    case 6:
      r = await ask(questions[5]); eqIds(r, [121,138,107]); assert.equal(r.visual, 'bar');
      assert.deepEqual(Object.fromEntries(r.rows.map(r => [r.well,r.days])), { 'WELL-0121':49, 'WELL-0107':42, 'WELL-0138':42 });
      assert.equal(r.next.days, 28); assert.equal(r.next.well, 'WELL-0119'); break;
    case 7:
      r = await ask(questions[6]); eqIds(r, [151,165,175,186]); assert.equal(r.visual, 'map');
      assert.deepEqual(r.rows.map(r => [r.barrels,r.lat,r.lon]), [[4.5,32.12246,-102.18445],[1.2,32.15665,-102.14522],[3.9,32.18020,-102.14790],[.6,32.17552,-102.17775]]); break;
    case 8:
      r = await ask(questions[7]); assert.equal(r.visual, 'heatmap'); assert.equal(r.months.length, 10);
      assert.deepEqual(r.rows.map(row => r.months.map(m => row[m])), [[4,3,3,6,3,4,4,3,3,2],[7,4,5,6,5,5,3,1,5,2],[5,3,2,4,6,6,2,4,4,1],[4,4,4,3,2,4,4,0,1,0]]);
      assert.deepEqual(r.rows.map(r => r.total), [35,43,37,26]); break;
    case 9:
      r = await ask(questions[8]); assert.deepEqual(r.rows.map(r => r.protocol).sort(), ['RC-04','SR-01','SR-02','SR-03']);
      assert.equal(r.fines_usd, 5000); assert.equal(r.open_fines_usd, 5000);
      assert.match(content(r.pending), /MNT-0001-028.*MNT-0001-029.*MNT-0001-032/); assert.match(content(r.met), /7 Mar 2026/);
      cited(r, 'REG-0001-002'); cited(r, 'MNT-0001-029:report'); break;
    case 10:
      r = await ask(questions[9]); eqIds(r, [82,100]); assert.equal(r.visual, 'table');
      assert.deepEqual(r.rows.map(r => r.containment_hours), [7.1,8.1]); cited(r, 'MNT-0082-028:report'); cited(r, 'INS-0100-0196'); break;
    case 11:
      await ask(questions[5], 'U-201', 'yesterday'); r = await ask(questions[10], 'U-201', 'new-chat');
      eqIds(r, [121,138,107]); assert.equal(r.rows.find(r => r.well === 'WELL-0121').cost_usd, 25794);
      assert.equal(r.rows.find(r => r.well === 'WELL-0138').cost_usd, 46942); assert.equal(r.rows.find(r => r.well === 'WELL-0107').cost_usd, 5176); break;
    case 12:
      r = await ask(questions[11]); assert.match(r.summary, /41.*21.1.*producing/); assert.match(content(r), /Tyler Hughes.*Pump jack not moving/); assert.match(r.summary, /confirm/i);
      assert.equal(store.knowledge[0].inspection_id, 'INS-0164-0205'); assert.equal(store.knowledge[0].original, 24); assert.equal(store.knowledge[0].value, 41);
      r = await ask(questions[1]); eqIds(r, [170,172,175]); assert.match(r.summary, /WELL-0164.*producing/); break;
    case 13:
      r = await ask(questions[12]); assert.equal(store.knowledge[0].inspection_id, 'INS-0151-0201'); assert.equal(store.knowledge[0].original, 4.5);
      assert.match(r.summary, /reportable/); assert.match(r.summary, /possible SR-01 breach/); assert.match(r.summary, /2026-09-25T15:30/); assert.match(r.summary, /2026-11-23/); assert.match(r.summary, /6.4.*SR-02/); cited(r, 'MNT-0151-025:report'); break;
    case 14:
      r = await ask(questions[13]); eqIds(r, [108,121,138]); assert.ok(r.rows.every(r => r.repairs === 3));
      assert.ok(r.range.start.startsWith('2025-10-'));
      await ask('Note for all T350 wells: our team now wants a pump jack root-cause analysis after 2 repairs, not 3.');
      r = await ask(questions[13], 'U-201', 'new-chat'); eqIds(r, [108,120,121,138]); assert.match(r.summary, /Michael Turner.*not the manual/); break;
    case 15:
      await ask(questions[11]); await ask(questions[12]);
      r = await ask(questions[14], 'U-202'); assert.equal(r.rows[0].producing, true); assert.equal(r.rows[0].wellhead_c, 41);
      assert.match(content(r), /Michael Turner/); assert.match(content(r), /Pump jack not moving/);
      r = await ask('Which spills in Northeast Block 8 in the last 90 days needed a report to the regulator?', 'U-401'); eqIds(r, [151]); assert.equal(r.rows[0].barrels, 5.4); assert.match(r.rows[0].reporting, /overdue/); break;
    case 16:
      await ask(questions[15], 'U-102'); r = await ask('Is any downtime planned for WELL-0007?', 'U-201', 'new-chat');
      assert.match(r.summary, /17 Oct.*10-day.*Jake Morales/);
      await ask(questions[5], 'U-201', 'yesterday'); await ask(questions[10], 'U-201', 'new-chat');
      r = await ask(questions[10], 'U-202'); assert.equal(r.needs_clarification, true); assert.equal(r.rows.length, 0); assert.doesNotMatch(r.summary, /WELL-0121|25,794/); break;
    case 17:
      await ask(questions[16]); r = await ask('WELL-0175 is running fine.', 'U-204');
      assert.match(r.summary, /unconfirmed/); assert.match(r.summary, /Jessica Reed.*0.4.*not producing/); assert.match(content(r), /Michael Turner/);
      assert.equal(store.knowledge.length, 2); assert.equal(store.knowledge[1].status, 'unconfirmed');
      r = await ask('WELL-0001 is back online since 14 Oct.', 'U-102'); assert.match(r.summary, /unconfirmed/); assert.match(content(r), /20 Oct/); cited(r, 'CTX-0001-003'); break;
    case 18:
      r = await ask(questions[17]); assert.match(r.summary, /Yes/); assert.equal(r.rows[0].barrels, 1);
      assert.equal(r.rows[0].inspection_id, 'INS-0101-0197'); assert.match(content(r), /Ryan Brooks/); assert.match(content(r), /Chris Dalton/);
      cited(r, 'CTX-0101-002'); cited(r, 'CTX-0101-003'); cited(r, 'MNT-0101-029'); break;
    default: throw Error('Unknown scenario');
  }
  assert.ok(r.evidence.length || r.needs_clarification, 'Answer needs evidence');
  return r;
}
