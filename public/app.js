import { answerQualityIssue } from '/answer-quality.js';

const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const state = { userId: '', chatId: crypto.randomUUID(), busy: false, bootstrap: null, answers: [], cleanups: [], navigation: 0, followLatest: true, chats: [], sourceRequest: 0 };
async function api(url, data) { const response = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}); const result = await response.json(); if (!response.ok) throw Error(result.error || 'Request failed.'); return result; }
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; setTimeout(() => $('#toast').style.display = 'none', 3500); }
function panel(title, back) { $('#drawer-title').textContent = title; $('#drawer-content').replaceChildren(); $('#drawer-back').hidden = !back; $('#drawer-back').onclick = back || null; if (!$('#drawer').open) $('#drawer').showModal(); $('#drawer').scrollTop = 0; return $('#drawer-content'); }
$('#close-drawer').onclick = () => $('#drawer').close();
$('#drawer').addEventListener('click', event => { if (event.target === $('#drawer')) { const r = $('#drawer').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#drawer').close(); } });
function documentView(text) {
  const box = el('div', undefined, 'document-view');
  const lines = text.split(/\r?\n/); let paragraph = [], code = null;
  const plain = value => value.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  const flush = () => { if (paragraph.length) box.append(el('p', plain(paragraph.join(' ')))); paragraph = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) { flush(); if (code) { box.append(el('pre', code.join('\n'))); code = null; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); box.append(el(/^#{1,2}\s/.test(line) ? 'h3' : 'h4', plain(line.replace(/^#+\s/, '')))); continue; }
    if (line.startsWith('|') && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      flush(); const headers = line.split('|').slice(1, -1).map(plain); const rows = []; i += 2;
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(Object.fromEntries(lines[i].split('|').slice(1, -1).map((cell, index) => [headers[index] || String(index), plain(cell.trim())])));
      i--; box.append(table(rows, headers)); continue;
    }
    if (/^[-*]\s/.test(line)) { flush(); box.append(el('p', '• ' + plain(line.replace(/^[-*]\s/, '')), 'document-list-item')); continue; }
    if (line.startsWith('>')) { flush(); box.append(el('blockquote', plain(line.replace(/^>\s?/, '')))); continue; }
    paragraph.push(line);
  }
  flush(); if (code) box.append(el('pre', code.join('\n'))); return box;
}
async function source(id, back) {
  const userId = state.userId, request = ++state.sourceRequest;
  try {
    const url = id.startsWith('CHAT-') ? `/api/conversation-source?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}` : id.startsWith('PREF-') ? `/api/preference-source?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}` : '/api/source?id=' + encodeURIComponent(id);
    const result = await api(url); if (state.userId !== userId || request !== state.sourceRequest) return;
    const box = panel(id.startsWith('CHAT-') ? 'Your earlier conversation' : id, back); box.append(el('p', result.source_path, 'source-path'));
    if (typeof result.body === 'string') box.append(documentView(result.body));
    else {
      const record = el('dl', undefined, 'source-record');
      for (const [key, value] of Object.entries(result.body)) { record.append(el('dt', labels[key] || key.replaceAll('_', ' ')), el('dd', display(value))); }
      box.append(record);
      if (result.kind === 'private_conversation') { const open = el('button', 'Open this conversation', 'primary'); open.onclick = () => { $('#drawer').close(); openConversation(result.body.chat_id); }; box.append(open); }
    }
    const raw = el('details', undefined, 'raw-data'); raw.append(el('summary', 'View original source'), el('pre', typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2))); box.append(raw);
  } catch (error) { toast(error.message); }
}
function evidenceButton(id, back) { const b = el('button', id.replace('fleet/well-types/', '').replace('fleet/sops/', ''), 'evidence-button'); b.onclick = () => source(id, back); return b; }
const display = value => value === null || value === undefined ? '—' : Array.isArray(value) ? value.some(v => typeof v === 'object') ? JSON.stringify(value, null, 2) : value.join('; ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const labels = { well: 'Well', type: 'Type', date: 'Date', delta_c: 'Above air °C', reason: 'Reason', recorded_status: 'Recorded status', barrels: 'Barrels', containment_hours: 'Contained after (h)', cost_usd: 'Recorded cost', inspection_id: 'Inspection', wellhead_c: 'Wellhead °C', ambient_c: 'Air °C', producing: 'Producing', inspector_note: 'Inspector note', reporting: 'Regulator report', verification_due: 'Verification due', report_due: 'Report due', rule: 'Rule source', repair_ids: 'Repair records', status: 'Status' };
function columns(rows, plan = {}) {
  const keys = Object.keys(rows[0] || {});
  if(plan.op==='recall_status')return ['well','area','status_now','last_repair'];
  if(plan.op==='recall'&&keys.includes('well'))return ['well','area','serial','lot',keys.includes('installation_cost_usd_thousands')?'installation_cost_usd_thousands':'installation_cost_usd','status'];
  if (keys.includes('recorded_status')) return ['well', 'delta_c', 'recorded_status', 'reason'];
  if (keys.includes('barrels')) {
    if (plan.lateContainment) return ['well', 'date', 'containment_hours', 'containment_limit_hours', 'repairs'];
    if (plan.reportableOnly) return ['well', 'date', 'barrels', 'reporting', 'report_due'];
    return ['well', 'date', 'barrels', 'inspection_id'];
  }
  if (plan.op === 'rca') return ['well', 'type', 'equipment', 'repairs', 'threshold'];
  if (keys.includes('days')) return ['well', 'type', 'days', 'readings'];
  return keys.filter(k => !['evidence', 'details', 'corrections', 'conflicts', 'lat', 'lon'].includes(k));
}
function table(rows, chosen) {
  const wrap = el('div', undefined, 'table-scroll'), t = el('table'); wrap.append(t);
  const cols = chosen || columns(rows), head = el('thead'), tr = el('tr'); head.append(tr); t.append(head);
  for (const c of cols) tr.append(el('th', labels[c] || c.replaceAll('_', ' ')));
  const body = el('tbody'); t.append(body);
  for (const row of rows) { const tr = el('tr'); for (const c of cols) { let value = c === 'cost_usd' ? money(row[c]) : display(row[c]); if (c === 'reason' && row.inspector_note && !value.includes(row.inspector_note) && !cols.includes('inspector_note')) value += ` Inspector: “${row.inspector_note}”`; const td = el('td', value); if (value.length > 80) td.className = 'long-cell'; tr.append(td); } body.append(tr); }
  return wrap;
}
function openSources(response, initialQuery = '', initialLimit = 40) {
  const box = panel(`Sources (${response.evidence.length})`);
  box.append(el('p', 'Inspect the original records behind this answer. Private conversation references are visible only for the selected user.', 'panel-intro'));
  const input = el('input', undefined, 'panel-search'); input.placeholder = 'Search sources or record IDs'; input.setAttribute('aria-label', 'Search sources');
  input.value = initialQuery;
  const list = el('div', undefined, 'source-list'), more = el('button', 'Show more sources', 'subtle'); let limit = initialLimit;
  const render = () => {
    const query = input.value.toLowerCase();
    const matched = response.evidence.filter(ref => `${ref.id} ${ref.title || ''} ${ref.kind} ${ref.path}`.toLowerCase().includes(query));
    list.replaceChildren();
    for (const ref of matched.slice(0, limit)) {
      const button = el('button', undefined, 'source-item'); button.setAttribute('aria-label', ref.id);
      button.append(el('span', ref.title || ref.id.replace('fleet/well-types/', '').replace('fleet/sops/', ''), 'source-item-title'), el('small', `${ref.kind.replaceAll('_', ' ')} · ${ref.path}`));
      button.onclick = () => source(ref.id, () => openSources(response, input.value, limit)); list.append(button);
    }
    if (!matched.length) list.append(el('p', 'No matching sources.'));
    more.hidden = matched.length <= limit;
  };
  input.oninput = () => { limit = 40; render(); }; more.onclick = () => { limit += 40; render(); };
  box.append(input, list, more); render();
}
function openData(response) {
  const box = panel('Result data');
  const input = el('input', undefined, 'panel-search'); input.placeholder = 'Filter results'; input.setAttribute('aria-label', 'Filter results');
  const content = el('div'), controls = el('div', undefined, 'pagination'), previous = el('button', 'Previous', 'subtle'), next = el('button', 'Next', 'subtle'), count = el('span');
  let page = 0; const pageSize = 20;
  const rows = response.rows.length === 1 && response.rows[0].details?.length ? response.rows[0].details.map(r => ({ well: response.rows[0].well, ...r })) : response.rows;
  const allColumns = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !['evidence', 'details', 'corrections', 'conflicts'].includes(k));
  const defaultColumns = response.visual === 'map' ? ['well', 'date', 'barrels', 'lat', 'lon', 'inspection_id'] : response.rows[0]?.details ? ['well', 'date', 'wellhead_c', 'ambient_c', 'delta_c', 'reason'] : columns(rows, response.plan);
  const fieldsLabel = el('label', undefined, 'fields-toggle'), fields = el('input'); fields.type = 'checkbox'; fieldsLabel.append(fields, document.createTextNode(' Show all fields'));
  const render = () => {
    const cols = fields.checked ? allColumns : defaultColumns;
    const query = input.value.toLowerCase();
    const filtered = rows.filter(r => cols.some(c => display(r[c]).toLowerCase().includes(query)));
    const start = page * pageSize;
    content.replaceChildren(filtered.length ? table(filtered.slice(start, start + pageSize), cols) : el('p', 'No matching results.'));
    count.textContent = filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}` : '0 results';
    previous.disabled = page === 0; next.disabled = start + pageSize >= filtered.length;
  };
  input.oninput = () => { page = 0; render(); }; fields.onchange = () => { page = 0; render(); }; previous.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); };
  controls.append(previous, count, next); box.append(input, fieldsLabel, content, controls); render();
}
function openAnalysis(response) {
  const box = panel('Answer details');
  box.append(el('h3', 'How this answer was produced'), el('p', answerMethod(response)));
  if (response.telemetry?.fallback_reason) box.append(el('div', response.telemetry.fallback_reason, 'notice'));
  const range = response.range ? `${response.range.start} to ${response.range.end}` : response.analysis_date;
  box.append(el('p', `Analysis date: ${response.analysis_date}. Period: ${range}.`));
  for (const [key, title] of [['pending', 'Open actions'], ['met', 'Requirements met']]) if (response[key]?.length) { box.append(el('h3', title)); for (const row of response[key]) box.append(el('p', `${row.well} · ${row.protocol}: ${row.detail}`)); }
  const raw = el('details', undefined, 'raw-data');
  raw.append(el('summary', 'Technical plan, model usage & retry diagnostics'), el('pre', JSON.stringify({ plan: response.plan, analysis_date: response.analysis_date, range: response.range, dataset_fingerprint: response.dataset_fingerprint, telemetry: response.telemetry, ...(response.next ? { next_ranked_well: response.next } : {}) }, null, 2)));
  box.append(raw);
}
function resultTitle(response) {
  if (response.plan?.op === 'status') return 'Latest inspection';
  const name = ({ line: 'Temperature trend', bar: 'Comparison', heatmap: 'Spills by area and month', map: 'Spill locations', table: 'Results', card: 'Overview' })[response.visual] || 'Results';
  return `${name}${response.range && response.range.start !== '0001-01-01' ? ` · ${response.range.start} — ${response.range.end}` : ''}`;
}
function card(row, { showReason = true, showInspector = true } = {}) {
  const box = el('div');
  if (!row.well || row.producing === undefined) { box.append(table([row])); return box; }
  const top = el('div', undefined, 'status-top'); top.append(el('span', row.well, 'well-id'));
  top.append(el('span', (row.producing === null ? 'Unknown' : row.producing ? 'Producing oil' : 'Not producing')+(row.unconfirmed?' · unconfirmed':''), `status-pill ${row.producing === null || row.unconfirmed ? 'unknown' : row.producing ? '' : 'down'}`)); box.append(top);
  box.append(el('div', [row.type, row.area].filter(Boolean).join(' / '), 'well-meta'));
  if (row.delta_c !== undefined) {
    const metrics = el('div', undefined, 'metrics');
    const inspected = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(row.date));
    const temperature=n=>new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:3}).format(n);
    for (const [label, value, detail] of [['ABOVE AMBIENT', `${temperature(row.delta_c)} °C`, `Production limit ≥ ${row.threshold_c} °C`], ['WELLHEAD', `${temperature(row.wellhead_c)} °C`, `Ambient ${temperature(row.ambient_c)} °C`], ['LAST INSPECTED', inspected, `${row.date.slice(0, 4)} · ${row.inspector} · ${row.method}`]]) {
      const m = el('div'); m.append(el('div', label, 'metric-label'), el('div', value, 'metric-value'), el('div', detail, 'metric-sub')); metrics.append(m);
    } box.append(metrics);
  }
  if (showReason) box.append(el('div', row.reason, 'detail-text'));
  if (row.recorded_status) box.append(el('div', `System status: ${row.recorded_status}`, 'well-meta'));
  if (showInspector && row.inspector_note) box.append(el('div', `Inspector note: “${row.inspector_note}”`, 'detail-text'));
  return box;
}
const svgNS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}, text) { const n = document.createElementNS(svgNS, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; }
function chart(rows, kind, metric) {
  const box = el('div'), width = 760, height = kind === 'bar' ? Math.max(180, rows.length * 52 + 50) : 280;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': kind === 'bar' ? 'Comparison bar chart' : 'Wellhead and ambient temperature over time', class: 'chart' }); box.append(svg);
  if (kind === 'bar') {
    const key = metric || ['days', 'cost_usd', 'barrels', 'repairs', 'total'].find(k => typeof rows[0]?.[k] === 'number') || Object.keys(rows[0] || {}).find(k => typeof rows[0][k] === 'number');
    const max = Math.max(...rows.map(r => Number(r[key]) || 0), 1);
    rows.forEach((r, index) => { const y = 18 + index * 50, value = Number(r[key]) || 0;
      svg.append(svgEl('text', { x: 0, y: y + 21 }, r.well || r.area || r.region || `Row ${index + 1}`));
      svg.append(svgEl('rect', { x: 122, y, width: 550, height: 31, rx: 4, fill: 'var(--chart-track)' }));
      const bar = svgEl('rect', { x: 122, y, width: value / max * 550, height: 31, rx: 4, fill: index === 0 ? '#c2a4ff' : '#7f63a8' }); bar.append(svgEl('title', {}, `${r.well || r.area}: ${value} ${key}`)); svg.append(bar);
      svg.append(svgEl('text', { x: Math.min(692, 134 + value / max * 550), y: y + 21, class: 'value-label' }, `${value}${key === 'days' ? ' days' : ''}`));
    });
  } else {
    const temperature = rows.some(r => typeof r.wellhead_c === 'number');
    const numeric = temperature ? ['wellhead_c', 'ambient_c'].filter(k => rows.some(r => typeof r[k] === 'number')) : Object.keys(rows[0] || {}).filter(k => typeof rows[0][k] === 'number' && !['lat','lon'].includes(k)).slice(0,3);
    if (!numeric.length) { box.replaceChildren(table(rows)); return box; }
    const min = Math.floor(Math.min(...rows.flatMap(r => numeric.map(k => r[k]))) / 10) * 10 - 5, max = Math.ceil(Math.max(...rows.flatMap(r => numeric.map(k => r[k]))) / 10) * 10 + 5;
    const dates = rows.map(r=>Date.parse(r.date || r.month || ''));
    const dated = dates.every(Number.isFinite), first = Math.min(...dates), last = Math.max(...dates);
    const x = i => 42 + (dated && last>first ? (dates[i]-first)/(last-first) : i/Math.max(1,rows.length-1))*675, y = v => 225 - (v - min) / (max - min) * 195;
    for (let tick = 0; tick <= 5; tick++) { const v = min + tick * (max - min) / 5; svg.append(svgEl('line', { x1: 42, x2: 730, y1: y(v), y2: y(v), stroke: 'var(--chart-grid)' }), svgEl('text', { x: 0, y: y(v) + 4 }, `${Math.round(v*10)/10}${temperature?'°':''}`)); }
    rows.forEach((r, i) => { if (r.producing === false) svg.append(svgEl('rect', { x: x(i) - 8, y: 25, width: 16, height: 205, fill: 'var(--chart-highlight)' })); });
    const ticks = [...new Map(rows.map((r,i)=>[r.date || r.month || i,{r,i}])).values()].sort((a,b)=>x(a.i)-x(b.i));
    ticks.forEach(({r,i},j)=> { if(j%Math.max(1,Math.ceil(ticks.length/8))===0 || j===ticks.length-1) svg.append(svgEl('text',{x:x(i),y:255,'text-anchor':'middle'},String(r.date || r.month || r.well || i+1).replace(/^\d{4}-/,''))); });
    const groups = [...new Set(rows.map(r => r.well))], palette = ['#c2a4ff','#94d8c4','#efbd83','#ff9caa','#8ab8ef','#e6c8ff','#d5d885','#8bd5e9'];
    numeric.forEach((key, series) => {
      for (const [groupIndex,well] of groups.entries()) {
        const color = palette[(groupIndex*numeric.length+series)%palette.length];
        const points = rows.map((r, i) => ({ ...r, i })).filter(r => r.well === well).sort((a,b)=>x(a.i)-x(b.i));
        svg.append(svgEl('polyline', { points: points.map(r => `${x(r.i)},${y(r[key])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5 }));
        points.forEach(r => { const point = svgEl('circle', { cx: x(r.i), cy: y(r[key]), r: 3.5, fill: r.producing === false && !series ? '#efbd83' : color }); point.append(svgEl('title', {}, `${r.well}, ${r.date}: ${key} ${r[key]}°C; ${r.producing ? 'producing' : 'not producing'}`)); svg.append(point); });
      }
    });
    const legend = el('div', undefined, 'legend');
    const entries = groups.flatMap((well,g)=>numeric.map((key,s)=>[`${groups.length>1?well+' · ':''}${labels[key] || key}`,palette[(g*numeric.length+s)%palette.length]]));
    if (temperature) entries.push(['Not producing','#efbd83']);
    for (const [name,color] of entries) { const span = el('span',name); span.style.setProperty('--color',color); legend.append(span); } box.append(legend);
  }
  return box;
}
function stackedChart(visual) {
  const box=el('div'),width=800,height=visual.rows.length*48+25,colors=['#c2a4ff','#94d8c4','#efbd83','#ff9caa','#8ab8ef'];
  const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':visual.title,class:'chart'});box.append(svg);
  visual.rows.forEach((row,index)=>{const y=index*48+5;svg.append(svgEl('text',{x:0,y:y+20},row.area));let x=185;visual.series.forEach((series,s)=>{const value=Number(row[series]||0),bar=svgEl('rect',{x,y,width:value/100*540,height:28,fill:colors[s%colors.length]});bar.append(svgEl('title',{},`${row.area}: ${series} ${value}%`));svg.append(bar);if(value>=8)svg.append(svgEl('text',{x:x+value/100*270,y:y+18,'text-anchor':'middle',style:'fill:#100b16;font-size:10px'},`${value}%`));x+=value/100*540;});});
  const legend=el('div',undefined,'legend');visual.series.forEach((series,i)=>{const item=el('span',series);item.style.setProperty('--color',colors[i%colors.length]);legend.append(item);});box.append(legend);return box;
}
function heatmap(response) {
  const wrap = el('div', undefined, 'table-scroll'), t = el('table', undefined, 'heat-table'), head = el('tr');
  head.append(el('th', 'Geographic area')); for (const month of response.months || []) head.append(el('th', month)); head.append(el('th', 'Total')); const thead = el('thead'); thead.append(head); t.append(thead);
  const body = el('tbody');
  for (const row of response.rows) { const tr = el('tr'); tr.append(el('td', row.area)); for (const month of response.months || []) { const value = row[month], td = el('td', String(value), 'heat-cell'); td.style.backgroundColor = `rgba(155,112,218,${.05 + value / Math.max(1, ...response.rows.flatMap(r => response.months.map(m => r[m]))) * .55})`; td.title = `${row.area}, ${month}: ${value} spills`; tr.append(td); } tr.append(el('td', String(row.total))); body.append(tr); } t.append(body); wrap.append(t); return wrap;
}
async function loadMapTile(img, url, signal) {
  let objectUrl;
  try {
    // A rejected tile can still be a valid PNG, so img.onerror alone is insufficient.
    // Default browser caching honors OSM's cache headers; do not cache-bust tiles.
    const response = await fetch(url, {
      credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    });
    if (!response.ok || !/^image\/(?:png|webp|jpeg)(?:;|$)/i.test(response.headers.get('content-type') || '')) return false;
    objectUrl = URL.createObjectURL(await response.blob());
    img.src = objectUrl;
    await img.decode();
    return true;
  } catch { return false; }
  finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
}
function map(rows) {
  const box = el('div'), canvas = el('div', undefined, 'map'); canvas.setAttribute('aria-label', 'Geographic spill map'); box.append(canvas);
  const grid = el('div', undefined, 'map-grid'); canvas.append(grid);
  const caption = el('p', 'Loading basemap. Well pins use geographic coordinates from the dataset.', 'map-caption'); caption.setAttribute('aria-live', 'polite'); box.append(caption);
  canvas.dataset.basemap = 'loading';
  const popup = el('div', undefined, 'map-popup'); canvas.append(popup);
  const attr = el('div', undefined, 'map-attribution'), link = el('a', '© OpenStreetMap contributors'); link.href = 'https://www.openstreetmap.org/copyright'; link.target = '_blank'; link.rel = 'noopener'; attr.append(link); canvas.append(attr);
  let lastSize = '', generation = 0, controller, visible = false, loadCurrent;
  const draw = () => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height || lastSize === `${width}:${height}`) return;
    lastSize = `${width}:${height}`;
    const token = ++generation; controller?.abort(); controller = new AbortController();
    grid.replaceChildren(); grid.hidden = false; popup.style.display = 'none';
    canvas.querySelectorAll('.map-tile-layer,.map-marker,.map-north').forEach(node => node.remove());
    const pins = rows.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    if (!pins.length) { caption.textContent = 'No coordinates available for these results.'; return; }
    const world = (r, zoom) => ({ x: (r.lon + 180) / 360 * 256 * 2 ** zoom, y: (1 - Math.log(Math.tan(r.lat * Math.PI / 180) + 1 / Math.cos(r.lat * Math.PI / 180)) / Math.PI) / 2 * 256 * 2 ** zoom });
    let zoom = 15, positions;
    do { positions = pins.map(r => world(r, zoom)); if (Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)) < width - 90 && Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)) < height - 90) break; zoom--; } while (zoom > 1);
    const centerX = (Math.min(...positions.map(p => p.x)) + Math.max(...positions.map(p => p.x))) / 2, centerY = (Math.min(...positions.map(p => p.y)) + Math.max(...positions.map(p => p.y))) / 2;
    const left = centerX - width / 2, top = centerY - height / 2;
    const worldSize = 256 * 2 ** zoom;
    const coordinates = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Geographic coordinate grid', class: 'map-coordinate-grid' });
    for (let tick = 1; tick <= 3; tick++) {
      const x = width * tick / 4, y = height * tick / 4;
      const lon = (left + x) / worldSize * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (top + y) / worldSize))) * 180 / Math.PI;
      coordinates.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: height }), svgEl('text', { x: x + 5, y: 15 }, `${lon.toFixed(3)}°`));
      coordinates.append(svgEl('line', { x1: 0, x2: width, y1: y, y2: y }), svgEl('text', { x: 7, y: y - 7 }, `${lat.toFixed(3)}°`));
    }
    grid.append(coordinates);
    const north = el('span', 'N ↑', 'map-north'); north.setAttribute('aria-label', 'North is up'); canvas.append(north);
    const tiles = el('div', undefined, 'map-tile-layer'); tiles.hidden = true; canvas.append(tiles);
    let started = false;
    loadCurrent = () => {
      if (started || token !== generation) return; started = true; canvas.dataset.basemap = 'loading';
      const loading = [];
      for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
        const img = el('img', undefined, 'map-tile'); img.alt = ''; img.style.left = x * 256 - left + 'px'; img.style.top = y * 256 - top + 'px'; tiles.append(img);
        loading.push(loadMapTile(img, `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, controller.signal));
      }
      Promise.all(loading).then(results => {
        if (token !== generation) return;
        if (results.every(Boolean)) { tiles.hidden = false; grid.hidden = true; canvas.dataset.basemap = 'ready'; caption.textContent = 'Geographic coordinates from well metadata. Select a pin for evidence.'; }
        else { tiles.remove(); canvas.dataset.basemap = 'unavailable'; caption.textContent = 'Basemap could not load completely. Showing a geographic coordinate view; well locations, barrels, dates and evidence remain available.'; }
      });
    };
    if (visible) loadCurrent();
    pins.forEach((r, i) => { const pin = el('button', String(i + 1), 'map-marker'); pin.style.left = positions[i].x - left + 'px'; pin.style.top = positions[i].y - top + 'px'; pin.setAttribute('aria-label', `${r.well}: ${r.barrels} barrels, ${r.date}`); pin.title = `${r.well} · ${r.lat}, ${r.lon}`; pin.onclick = () => { popup.replaceChildren(el('strong', `${r.well} · ${r.barrels} bbl`), el('div', `${r.date} / ${r.lat}, ${r.lon}`), evidenceButton(r.inspection_id)); popup.style.display = 'block'; }; canvas.append(pin); });
  };
  const sizeObserver = new ResizeObserver(draw); sizeObserver.observe(canvas);
  const visibilityObserver = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (visible) loadCurrent?.(); }, { root: $('#chat-scroll') }); visibilityObserver.observe(canvas);
  state.cleanups.push(() => { generation++; controller?.abort(); sizeObserver.disconnect(); visibilityObserver.disconnect(); });
  return box;
}
function addNotes(box, response) {
  const seen = new Set();
  for (const kind of ['corrections', 'conflicts']) {
    const entries = response.rows.flatMap(row => row[kind] || []).filter(text => { if (seen.has(text) || response.summary.includes(text)) return false; seen.add(text); return true; });
    if (!entries.length) continue;
    const notice = el('div', undefined, `notice ${kind === 'corrections' ? 'correction' : ''}`);
    notice.append(el('strong', kind === 'conflicts' ? 'Conflicting evidence / context' : 'Corrections applied'));
    for (const text of entries) notice.append(el('p', text)); box.append(notice);
  }
  if (response.pending?.length) {
    const details = el('details', undefined, 'pending-actions'); details.open = response.pending.length <= 3;
    details.append(el('summary', `Open actions (${response.pending.length})`));
    for (const row of response.pending.slice(0, 3)) details.append(el('div', `${row.protocol} — ${row.detail}`, 'pending-item'));
    if (response.pending.length > 3) { const more = el('button', 'View all open actions', 'text-button'); more.onclick = () => openAnalysis(response); details.append(more); }
    box.append(details);
  }
  if(response.reported_replacements?.length){const note=el('details',undefined,'pending-actions');note.append(el('summary',`Reported replacements awaiting work orders (${response.reported_replacements.length})`));for(const r of response.reported_replacements)note.append(el('p',`${r.well}: ${r.provenance}`));box.append(note);}
}
function answerMethod(response) {
  if (response.plan?.op === 'memory') return 'This is a lookup of the selected user’s private conversation history. No field manuals or other users’ histories were used, and no model call was needed.';
  if (response.needs_clarification) return 'More context is needed before a reliable answer can be given. Clarifications and source references are shown instead of an unsupported conclusion.';
  if (response.mode === 'local-fallback') return 'The model request failed. A local text parser selected the supported operation, and the evidence engine calculated the answer or quoted the cited rule. No local AI model was run.';
  if (response.mode !== 'model') return 'A local text parser selected the operation. The evidence engine applied the dataset rules and assembled this answer. No AI request was made.';
  if (response.plan.op === 'query') return `${response.telemetry?.model || 'The model'} wrote a read-only SQL query. SQLite executed it on the scoped, corrected records. The displayed values come from that query, with record IDs retained as evidence.`;
  if (response.plan.op === 'search') return `${response.telemetry?.model || 'The model'} helped retrieve relevant documents and write an answer from the supplied source excerpts. Source identifiers are checked before the response is shown.`;
  return `${response.telemetry?.model || 'The model'} proposed an analysis plan. For recognized domain questions, the local parser's core fields take precedence. Data tools then calculate the values, apply rules and corrections, and assemble the response. The model does not calculate the displayed numbers.`;
}
function renderAnswer(original, scroll = true, question = '') {
  const malformed = original.mode === 'model' && original.plan?.op === 'search' && answerQualityIssue(original.summary);
  const response = malformed ? { ...original, summary: 'This saved answer contains malformed model output and cannot be trusted. Ask again to generate a clean response.', rows: [], visual: 'none', needs_clarification: true } : original;
  const box = el('article', undefined, 'message answer-message');
  const heading = el('div', undefined, 'answer-heading'); heading.append(el('span', 'ƒ', 'answer-mark'), el('span', 'Fieldnote'));
  const mode = malformed ? 'Unverified saved answer' : response.plan?.op === 'memory' ? 'Private memory' : response.mode === 'model' ? 'AI + data tools' : 'Local analysis';
  const meta = el('span', `${mode} · ${response.analysis_date}`, 'answer-meta'); meta.title = response.telemetry?.model || mode; heading.append(meta);
  box.append(heading, el('div', response.summary, 'answer-summary'));
  if (response.mode === 'local-fallback') {
    const warning = el('div', undefined, 'notice fallback-notice');
    warning.append(el('span', response.needs_clarification ? 'Local fallback used. A reliable AI answer was unavailable.' : 'Local fallback used. This answer uses the evidence engine.'));
    const why = el('button', 'Why?', 'text-button'); why.onclick = () => openAnalysis(response); warning.append(why); box.append(warning);
  }
  const rawDocuments = response.rows.some(r => r.excerpt);
  const showVisual = response.visual !== 'none' && response.rows.length && !rawDocuments && !(response.plan?.op === 'search' && !response.plan.visual);
  if (showVisual) {
    const visual = el('section', undefined, 'visual'); visual.dataset.visual = response.visual;
    visual.append(el('h3', resultTitle(response), 'visual-title'));
    if (response.visual === 'card') response.rows.forEach(row => visual.append(card(row, { showReason: !response.summary.includes(row.reason), showInspector: !response.summary.includes(row.inspector_note) && !(row.conflicts || []).some(c => c.includes(row.inspector_note)) })));
    else if (['bar', 'line'].includes(response.visual)) visual.append(chart(response.visual === 'bar' ? response.rows.slice(0, 6) : response.rows, response.visual,response.chart_metric));
    else if (response.visual === 'heatmap') visual.append(heatmap(response));
    else if (response.visual === 'map') visual.append(map(response.rows));
    else visual.append(table(response.rows.slice(0, 8), columns(response.rows, response.plan)));
    const shown = response.visual === 'table' ? 8 : response.visual === 'bar' ? 6 : Infinity;
    if (response.rows.length > shown) {
      const more = el('button', `Showing ${shown} of ${response.rows.length} results · View all data`, 'result-more'); more.onclick = () => openData(response); visual.append(more);
      if (response.visual === 'bar') { const expand = el('button', 'Expand complete chart', 'result-more'); expand.onclick = () => { const panelBody = panel('Complete comparison chart'); panelBody.append(chart(response.rows, 'bar',response.chart_metric)); }; visual.append(expand); }
    }
    box.append(visual);
  }
  for(const extra of response.additional_visuals||[]){const section=el('section',undefined,'visual');section.dataset.visual=extra.type;section.append(el('h3',extra.title,'visual-title'));if(extra.type==='stacked_bar')section.append(stackedChart(extra));else section.append(table(extra.rows));box.append(section);}
  addNotes(box, response);
  const actions = el('div', undefined, 'answer-actions');
  if (response.evidence.length) { const sources = el('button', `Sources (${response.evidence.length})`, 'answer-action'); sources.onclick = () => openSources(response); actions.append(sources); }
  if (response.rows.length && !rawDocuments) { const data = el('button', `Data (${response.rows[0]?.details?.length || response.rows.length})`, 'answer-action'); data.title = 'View the complete accessible data table'; data.onclick = () => openData(response); actions.append(data); }
  const details = el('button', 'Details', 'answer-action'); details.onclick = () => openAnalysis(response); actions.append(details);
  const copy = el('button', 'Copy', 'answer-action'); copy.title = 'Copy answer text'; copy.onclick = async () => { try { await navigator.clipboard.writeText(response.summary); toast('Answer copied.'); } catch { toast('Could not access the clipboard. Select and copy the answer text.'); } }; actions.append(copy);
  if (question) { const again = el('button', 'Ask again', 'answer-action'); again.onclick = () => send(question); actions.append(again); }
  box.append(actions);
  $('#messages').append(box); state.answers.push(response); $('#welcome').hidden = true; document.body.classList.add('has-messages');
  if (scroll && state.followLatest) scrollToLatest();
}
function renderQuestion(question) { const box = el('div', question, 'message question-message'); $('#messages').append(box); $('#welcome').hidden = true; document.body.classList.add('has-messages'); }
function updateScrollState() {
  const scroller = $('#chat-scroll');
  state.followLatest = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  $('#jump-latest').hidden = state.followLatest || !state.answers.length;
}
function scrollToLatest() {
  state.followLatest = true;
  $('#chat-scroll').scrollTo({ top: $('#chat-scroll').scrollHeight, behavior: 'instant' });
  $('#jump-latest').hidden = true;
}
function clearConversation() {
  for (const cleanup of state.cleanups) cleanup(); state.cleanups = [];
  state.answers = []; $('#messages').replaceChildren(); $('#welcome').hidden = false;
  document.body.classList.remove('has-messages'); state.followLatest = true; $('#jump-latest').hidden = true;
  $('#chat-scroll').scrollTo({ top: 0, behavior: 'instant' });
}
function renderConversationList() {
  const query = $('#chat-search').value.toLowerCase(); $('#conversations').replaceChildren();
  for (const chat of state.chats.filter(c => c.title.toLowerCase().includes(query))) {
    const button = el('button', chat.title, 'conversation-link' + (chat.chat_id === state.chatId ? ' selected' : ''));
    button.title = `${chat.title} · ${chat.turns} message${chat.turns === 1 ? '' : 's'}`;
    button.onclick = () => openConversation(chat.chat_id); $('#conversations').append(button);
  }
  if (!state.chats.length) $('#conversations').append(el('p', 'Your chats will appear here.', 'empty-history'));
}
async function conversations() {
  const user = state.userId;
  const chats = await api('/api/conversations?userId=' + encodeURIComponent(user));
  if (user !== state.userId) return;
  state.chats = chats; renderConversationList();
}
async function openConversation(id) {
  if (state.busy) return;
  const user = state.userId, navigation = ++state.navigation;
  try {
    const history = await api(`/api/history?userId=${encodeURIComponent(user)}&chatId=${encodeURIComponent(id)}`);
    if (state.userId !== user || navigation !== state.navigation) return;
    clearConversation(); state.chatId = id;
    for (const h of history) { renderQuestion(h.question); renderAnswer(h.response, false, h.question); }
    if (narrowScreen.matches) setSidebar(false);
    renderConversationList(); requestAnimationFrame(scrollToLatest);
  } catch (error) { toast(error.message); }
}
async function newChat() {
  if (state.busy) return; state.navigation++; state.chatId = crypto.randomUUID(); clearConversation();
  if (narrowScreen.matches) setSidebar(false);
  await conversations(); $('#question').focus({ preventScroll: true });
}
function resizeComposer() { const input = $('#question'); input.style.height = 'auto'; input.style.height = Math.min(144, Math.max(26, input.scrollHeight)) + 'px'; }
async function send(question, { reuseQuestion = false } = {}) {
  if (state.busy || !question.trim()) return;
  state.busy = true; $('#send').disabled = true; $('#user').disabled = true; $('#new-chat').disabled = true;
  if (!reuseQuestion) renderQuestion(question); $('#question').value = ''; resizeComposer();
  const loading = el('div', $('#mode').value === 'model' ? 'Checking the question and evidence…' : 'Checking records…', 'loading'); $('#messages').append(loading); scrollToLatest(); $('#question').focus({ preventScroll: true });
  try {
    const response = await api('/api/chat', { question, userId: state.userId, chatId: state.chatId, today: $('#today').value, mode: $('#mode').value });
    loading.remove(); renderAnswer(response, true, question); await conversations();
  } catch (error) { loading.remove(); const box = el('div', error.message, 'error'); const retry = el('button', 'Retry', 'retry'); retry.onclick = () => { box.remove(); send(question, { reuseQuestion: true }); }; box.append(retry); $('#messages').append(box); if (state.followLatest) scrollToLatest(); }
  finally { state.busy = false; $('#send').disabled = false; $('#user').disabled = false; $('#new-chat').disabled = false; }
}
$('#composer').onsubmit = event => { event.preventDefault(); send($('#question').value); };
$('#question').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send($('#question').value); } };
$('#question').addEventListener('input', resizeComposer);
$('#chat-scroll').addEventListener('scroll', updateScrollState, { passive: true });
$('#jump-latest').onclick = scrollToLatest;
$('#chat-search').oninput = renderConversationList;
const narrowScreen = matchMedia('(max-width: 760px)');
function setSidebar(open, remember = false) {
  document.body.classList.toggle('sidebar-collapsed', !open);
  $('#toggle-sidebar').setAttribute('aria-expanded', String(open));
  $('#sidebar-backdrop').hidden = !narrowScreen.matches || !open;
  if (remember && !narrowScreen.matches) localStorage.setItem('fieldnote-sidebar-collapsed', open ? '0' : '1');
}
$('#toggle-sidebar').onclick = () => setSidebar(document.body.classList.contains('sidebar-collapsed'), true);
$('#sidebar-backdrop').onclick = () => setSidebar(false);
narrowScreen.addEventListener('change', () => setSidebar(!narrowScreen.matches && localStorage.getItem('fieldnote-sidebar-collapsed') !== '1'));
setSidebar(!narrowScreen.matches && localStorage.getItem('fieldnote-sidebar-collapsed') !== '1');
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#drawer').open && narrowScreen.matches) setSidebar(false); });
document.addEventListener('pointerdown', event => { const menu = $('.header-menu'); if (!menu.contains(event.target)) menu.open = false; });
document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => send(button.dataset.prompt));
$('#new-chat').onclick = newChat;
$('#chat-nav').onclick = () => { if (narrowScreen.matches) setSidebar(false); $('#question').focus({ preventScroll: true }); };
$('#user').onchange = async () => { state.userId = $('#user').value; state.chats = []; $('#chat-search').value = ''; $('#drawer').close(); localStorage.setItem('fieldnote-user', state.userId); updateIdentity(); await newChat(); };
function updateIdentity() { const user = state.bootstrap.users.find(u => u.user_id === state.userId); $('#role').textContent = `${user.role.replaceAll('_', ' ')} · ${state.bootstrap.teams.find(t => t.team_id === user.team_id)?.name || user.team_id}`; }
$('#knowledge-nav').onclick = async () => { const box = panel('Shared knowledge & correction history'); try { const entries = await api('/api/knowledge'); box.append(el('p', 'Well facts, inspection corrections, and type policies are shared. Private chat history is not included. Original measurements are retained.')); if (!entries.length) box.append(el('p', 'No runtime feedback yet. Share a field observation or correction in chat.')); for (const k of entries.reverse()) { const item = el('div', undefined, 'audit-item'); item.append(el('strong', `${k.kind.toUpperCase()} / ${k.asset_id || k.well_type} / ${k.author}`), el('div', k.text || k.reason), el('small', `${k.scope} · ${k.status || 'applied'} · ${k.created_at}`), evidenceButton(k.id)); if (k.original !== undefined) item.append(el('div', `Original: ${k.original} → corrected: ${k.value}`)); box.append(item); } } catch (error) { box.append(el('p', error.message)); } };
async function settings() {
  $('.header-menu').open = false;
  const box = panel('Dataset & model settings'); box.append(el('p', 'Load the sample and final datasets together. Imports validate record IDs, linked reports, and manual rules before replacing the active index.'));
  const overview = el('div', undefined, 'settings-stats');
  const renderStats = () => { overview.replaceChildren(); for (const [key, label] of [['wells','Wells'],['inspections','Inspections'],['repairs','Repairs'],['documents','Documents']]) { const metric = el('div'); metric.append(el('strong', Number(state.bootstrap.stats[key] || 0).toLocaleString()), el('span', label)); overview.append(metric); } };
  renderStats(); box.append(overview);
  const technical = el('details', undefined, 'raw-data'), pre = el('pre', JSON.stringify(state.bootstrap.stats, null, 2)); technical.append(el('summary', 'Dataset fingerprint & import details'), pre); box.append(technical);
  const label = el('label', 'Additional dataset directory (on this server)', 'settings-field'); label.htmlFor = 'dataset-path'; const input = el('input', undefined, 'settings-input'); input.id = 'dataset-path'; input.placeholder = 'C:/data/test-data'; const button = el('button', 'Validate & import dataset', 'primary');
  button.onclick = async () => { button.disabled = true; try { const stats = await api('/api/datasets', { path: input.value }); state.bootstrap.stats = stats; pre.textContent = JSON.stringify(stats, null, 2); renderStats(); updateStats(); toast('Dataset imported. New questions use the refreshed index.'); } catch (error) { toast(error.message); } finally { button.disabled = false; } };
  box.append(label, input, button, el('p', `Model: ${state.bootstrap.model}. ${state.bootstrap.model_ready ? 'Server API key configured. Select AI copilot below the composer.' : 'Set GEMINI_API_KEY or OPENAI_API_KEY in asset-copilot/.env and restart. Local analysis uses a limited language parser and no model calls.'}`), el('p', 'Analysis date: your supplied PDFs use 17 Oct 2026; the repository examples use 16 Oct. Both dates are available in the header. “Right now” uses the latest inspection on or before that date.'), el('p', 'This local challenge app uses the required user picker, not production authentication. All wells are shared; chat retrieval is scoped to the selected user.'));
}
$('#settings').onclick = settings; $('#data-nav').onclick = settings;
$('#export').onclick = async () => { $('.header-menu').open = false; try { const report = await api('/api/export?userId=' + encodeURIComponent(state.userId)); const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }); const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `fieldnote-${state.userId}-${$('#today').value}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } catch (error) { toast(error.message); } };
function updateStats() { $('#well-count').textContent = state.bootstrap.stats.wells.toLocaleString(); $('#inspection-count').textContent = state.bootstrap.stats.inspections.toLocaleString(); $('#model-label').textContent = state.bootstrap.model_ready ? `Model configured · ${state.bootstrap.model}` : 'Evidence engine ready · local mode'; }
try {
  state.bootstrap = await api('/api/bootstrap');
  for (const u of state.bootstrap.users) { const option = el('option', u.name); option.value = u.user_id; $('#user').append(option); }
  state.userId = state.bootstrap.users.find(u => u.user_id === localStorage.getItem('fieldnote-user'))?.user_id || state.bootstrap.users.find(u => u.name === 'Michael Turner')?.user_id || state.bootstrap.users[0].user_id;
  $('#user').value = state.userId; $('#today').value = state.bootstrap.today; $('#mode').value = state.bootstrap.model_ready ? 'model' : 'local'; updateIdentity(); updateStats(); resizeComposer(); await conversations();
} catch (error) { $('#messages').append(el('div', error.message, 'error')); }
