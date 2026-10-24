// The numbers: latest processor schedules, the season so far against last season, and local sale results.
import { isDairyBeef } from './briefing-answers.mjs';

const DAY = 86400000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nz = (v, opts = {}) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', ...opts }).format(new Date(v + 'T12:00:00+13:00'));
const safeUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' ? esc(u.href) : '#'; } catch { return '#'; } };
const TABS = { cattle: { label: 'Beef', species: ['cattle'] }, lambs: { label: 'Lamb', species: ['lambs'] } };
// Each chart also shows the three months before the season starts (from 1 July), so the run-in is visible.
const LEAD = 92;
const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

// The NZ meat season runs 1 October to 30 September.
const seasonStart = date => { const d = new Date(date + 'T00:00:00Z'), y = d.getUTCMonth() >= 9 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return Date.UTC(y, 9, 1); };
const seasonName = start => { const y = new Date(start).getUTCFullYear(); return `${y}–${String(y + 1).slice(2)}`; };
const money = (v, unit) => unit === 'c/kg CW' ? `$${(v / 100).toFixed(2)}` : `$${Math.round(v)}`;
const unitShort = unit => unit === 'c/kg CW' ? '/kg CW' : '/head';
const diff = (v, before, unit) => unit === 'c/kg CW' ? `${Math.abs(v - before)}c/kg` : `$${Math.abs(Math.round(v - before))}`;

function change(now, before, unit, label) {
  if (!before) return '';
  const pct = (now - before) / before * 100, dir = now > before ? 'up' : now < before ? 'down' : 'same';
  const text = dir === 'same' ? 'No change' : `${dir === 'up' ? '▲' : '▼'} ${diff(now, before, unit)} · ${Math.abs(pct).toFixed(1)}%`;
  return `<div class="hub-change ${dir}"><span>${label}</span><strong>${text}</strong></div>`;
}

// One plain-language line a farmer can take away from each schedule.
function takeaway(s, unit) {
  const c = s.compare || {}, parts = [];
  if (c.yearAgo) { const pct = (s.value - c.yearAgo) / c.yearAgo * 100; parts.push(Math.abs(pct) < 1 ? 'Much the same as this time last year.' : `${diff(s.value, c.yearAgo, unit)} ${pct > 0 ? 'ahead of' : 'behind'} this time last year.`); }
  if (c.high52 && c.low52 && c.high52 > c.low52) {
    const pos = (s.value - c.low52) / (c.high52 - c.low52);
    parts.push(s.value >= c.high52 ? 'Sitting at its 52-week high.' : s.value <= c.low52 ? 'Sitting at its 52-week low.' : pos > 0.75 ? 'Near the top of its 52-week range.' : pos < 0.25 ? 'Near the bottom of its 52-week range.' : 'Mid-way through its 52-week range.');
  }
  return parts.join(' ');
}

function tile(s, meta) {
  const c = s.compare || {}, range = c.high52 > c.low52 ? Math.min(100, Math.max(0, (s.value - c.low52) / (c.high52 - c.low52) * 100)) : null;
  return `<article class="hub-tile">
    <div class="kicker">${esc(meta.label)} · ${esc(meta.island)}</div>
    <div class="hub-value">${money(s.value, meta.unit)}<small>${unitShort(meta.unit)}</small></div>
    <div class="meta">Processor schedule average · week of ${nz(s.weekOf, { year: 'numeric' })}</div>
    <p class="hub-takeaway">${esc(takeaway(s, meta.unit))}</p>
    <div class="hub-changes">${change(s.value, c.fourWeeksAgo, meta.unit, 'vs 4 weeks ago')}${change(s.value, c.threeMonthsAgo, meta.unit, 'vs 3 months ago')}${change(s.value, c.yearAgo, meta.unit, 'vs a year ago')}</div>
    ${range === null ? '' : `<div class="hub-range" aria-label="52-week range ${money(c.low52, meta.unit)} to ${money(c.high52, meta.unit)}"><div class="hub-range-track"><span style="left:${range}%"></span></div><div class="hub-range-ends"><span>${money(c.low52, meta.unit)} low</span><span>52 weeks</span><span>${money(c.high52, meta.unit)} high</span></div></div>`}
  </article>`;
}

// Weekly averages across the five seasons before this one, so this season can be read against what is normal.
function seasonAverage(points, thisStart) {
  const weeks = new Map();
  for (let k = 1; k <= 5; k++) {
    const start = Date.UTC(new Date(thisStart).getUTCFullYear() - k, 9, 1), seen = new Map();
    for (const p of points) { const t = Date.parse(p.weekOf + 'T00:00:00Z'); if (t >= start - LEAD * DAY && t < start + 366 * DAY) seen.set(Math.min(52, Math.floor((t - start) / DAY / 7)), p.value); }
    for (const [w, v] of seen) (weeks.get(w) || weeks.set(w, []).get(w)).push(v);
  }
  return [...weeks].filter(([, vs]) => vs.length >= 3).sort((a, b) => a[0] - b[0])
    .map(([w, vs]) => ({ x: w * 7 + 3, value: vs.reduce((a, b) => a + b, 0) / vs.length, min: Math.min(...vs), max: Math.max(...vs), seasons: vs.length }));
}
// The usual shape of a season, by month: each season's weeks as a share of that season's own average, averaged
// over the last ten full seasons. Working within each season keeps a run of rising prices from posing as a pattern.
function seasonShape(points, thisStart) {
  const months = MONTHS.map(() => []);
  for (let k = 1; k <= 10; k++) {
    const start = Date.UTC(new Date(thisStart).getUTCFullYear() - k, 9, 1), seen = [];
    for (const p of points) { const t = Date.parse(p.weekOf + 'T00:00:00Z'); if (t >= start && t < start + 366 * DAY) seen.push([Math.min(11, Math.floor((t - start) / DAY / 30.44)), p.value]); }
    if (seen.length < 40) continue;
    const mean = seen.reduce((a, [, v]) => a + v, 0) / seen.length;
    for (const [m, v] of seen) months[m].push(v / mean);
  }
  return months.every(vs => vs.length >= 15) ? months.map((vs, m) => ({ month: MONTHS[m], value: vs.reduce((a, b) => a + b, 0) / vs.length })) : null;
}
const monthOf = x => x < 0 ? ['Jul', 'Aug', 'Sep'][Math.max(0, Math.min(2, Math.floor((x + LEAD) / 30.67)))] : MONTHS[Math.min(11, Math.floor(x / 30.44))];

function seriesChart(holder, points, meta, note) {
  const latest = points.filter(p => !p.derived).at(-1) || points.at(-1);
  if (!latest) { holder.innerHTML = `<div class="empty">No readings recorded for ${esc(meta.label)} yet.</div>`; return; }
  const thisStart = seasonStart(latest.weekOf), lastStart = Date.UTC(new Date(thisStart).getUTCFullYear() - 1, 9, 1);
  const seasons = [
    { key: 'this', label: 'This season', start: thisStart, pts: [] },
    { key: 'last', label: 'Last season', start: lastStart, pts: [] },
  ];
  for (const p of points) { const t = Date.parse(p.weekOf + 'T00:00:00Z'); for (const s of seasons) if (t >= s.start - LEAD * DAY && t < s.start + 366 * DAY) s.pts.push({ ...p, x: (t - s.start) / DAY }); }
  const avg = seasonAverage(points, thisStart), dense = points.length > 30;
  const values = [...seasons.flatMap(s => s.pts.map(p => p.value)), ...avg.flatMap(a => [a.min, a.max])];
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, hi * 0.02), step = niceStep((hi - lo + pad * 2) / 4);
  const yMin = Math.floor((lo - pad) / step) * step, yMax = Math.ceil((hi + pad) / step) * step;
  const W = Math.max(300, holder.clientWidth || 600), H = W < 520 ? 220 : 260, L = 52, R = 14, T = 14, B = 30;
  const x = d => L + (d + LEAD) / (365 + LEAD) * (W - L - R), y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const ticks = []; for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);
  const monthX = ['Jul', 'Aug', 'Sep', ...MONTHS].map((m, i) => ({ m, d: (Date.UTC(2026, 6 + i, 1) - Date.UTC(2026, 9, 1)) / DAY }));
  const every = W < 420 ? 3 : W < 620 ? 2 : 1;
  // Readings more than five weeks apart are not joined, so the line never suggests prices nobody recorded.
  const path = pts => pts.map((p, i) => `${i && p.x - pts[i - 1].x <= 35 ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  // A weekly series is drawn as a line with its latest week marked; sparse readings show every point.
  const marks = s => (dense ? s.pts.slice(-1) : s.pts).map(p => `<circle cx="${x(p.x).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4.5" class="${p.derived ? 'derived' : ''}"/>`).join('');
  const band = avg.length ? `<path class="avg-band" d="${avg.map((a, i) => `${i ? 'L' : 'M'}${x(a.x).toFixed(1)},${y(a.max).toFixed(1)}`).join('')}${avg.slice().reverse().map(a => `L${x(a.x).toFixed(1)},${y(a.min).toFixed(1)}`).join('')}Z"/><path class="avg-line" d="${path(avg)}"/>` : '';
  holder.innerHTML = `<svg class="hub-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(meta.label)}: this season against last season${avg.length ? ' and the five-season average' : ''}">
    ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${money(v, meta.unit)}</text>`).join('')}
    <rect class="lead-in" x="${x(-LEAD)}" y="${T}" width="${x(0) - x(-LEAD)}" height="${H - T - B}"/>
    <line class="season-start" x1="${x(0)}" x2="${x(0)}" y1="${T}" y2="${H - B}"/><text class="axis season-label" x="${x(0) + 6}" y="${T + 12}">Season starts 1 Oct</text>
    ${monthX.map(({ m, d }, i) => i % every ? '' : `<text class="axis" x="${x(d)}" y="${H - 8}" text-anchor="start">${m}</text>`).join('')}
    ${band}
    ${seasons.slice().reverse().map(s => `<g class="series ${s.key}"><path d="${path(s.pts)}"/>${marks(s)}</g>`).join('')}
    <line class="crosshair" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg><div class="hub-tip" hidden></div>`;
  const svg = holder.querySelector('svg'), tip = holder.querySelector('.hub-tip'), cross = svg.querySelector('.crosshair');
  const nearest = (list, d, within) => { const p = list.reduce((a, p) => !a || Math.abs(p.x - d) < Math.abs(a.x - d) ? p : a, null); return p && Math.abs(p.x - d) < within ? p : null; };
  const show = clientX => {
    const box = svg.getBoundingClientRect(), d = (clientX - box.left - L) / (W - L - R) * (365 + LEAD) - LEAD;
    const rows = seasons.map(s => ({ s, p: nearest(s.pts, d, dense ? 6 : 21) })).filter(n => n.p), a = nearest(avg, d, 6);
    if (!rows.length && !a) { hide(); return; }
    const at = rows[0]?.p.x ?? a.x; cross.setAttribute('x1', x(at)); cross.setAttribute('x2', x(at)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = rows.map(({ s, p }) => `<div><span class="swatch ${s.key}"></span>${s.label}${p.x < 0 ? ', run-in' : ''} · ${nz(p.weekOf, { year: 'numeric' })}<strong>${money(p.value, meta.unit)}${unitShort(meta.unit)}</strong>${p.derived ? '<small>From the published comparison column, approximate week</small>' : ''}</div>`).join('')
      + (a ? `<div><span class="swatch avg"></span>5-season average, ${monthOf(a.x)}<strong>${money(a.value, meta.unit)}${unitShort(meta.unit)}</strong><small>Range ${money(a.min, meta.unit)} to ${money(a.max, meta.unit)}</small></div>` : '');
    tip.hidden = false; tip.style.left = `${Math.min(Math.max(x(at) - 100, 0), W - 210)}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', e => show(e.clientX)); hit.addEventListener('pointerdown', e => show(e.clientX)); hit.addEventListener('pointerleave', hide);
  if (note) note.textContent = insight(seasons, avg, meta, seasonShape(points, thisStart));
}

// The plain-language read of the chart: where this week sits against normal, last season, and the usual shape of a season.
function insight(seasons, avg, meta, shape) {
  const now = seasons[0].pts.filter(p => !p.derived).at(-1);
  if (!now) return '';
  const parts = [], fmt = v => `${money(v, meta.unit)}${unitShort(meta.unit)}`;
  const gap = (a, b) => { const d = Math.abs(Math.round(a - b)); return meta.unit !== 'c/kg CW' ? `$${d}` : d >= 100 ? `$${(d / 100).toFixed(2)}/kg` : `${d}c/kg`; };
  const a = avg.reduce((best, p) => !best || Math.abs(p.x - now.x) < Math.abs(best.x - now.x) ? p : best, null);
  if (a && Math.abs(a.x - now.x) < 8) parts.push(`At ${fmt(now.value)}, it is ${Math.abs(now.value - a.value) < 1 ? 'right on' : `${gap(now.value, a.value)} ${now.value > a.value ? 'above' : 'below'}`} the average for this time of year over the last five seasons (${fmt(a.value)}; range ${fmt(a.min)} to ${fmt(a.max)}).`);
  const last = seasons[1].pts.reduce((best, p) => !best || Math.abs(p.x - now.x) < Math.abs(best.x - now.x) ? p : best, null);
  if (last && Math.abs(last.x - now.x) < 10) parts.push(`This week last season it was ${fmt(last.value)}.`);
  if (shape) {
    const top = shape.reduce((m, p) => p.value > m.value ? p : m), bottom = shape.reduce((m, p) => p.value < m.value ? p : m);
    const full = { Oct: 'October', Nov: 'November', Dec: 'December', Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September' };
    parts.push(`Over the last ten seasons it has usually been strongest in ${full[top.month]} and weakest in ${full[bottom.month]}, about ${Math.round((top.value / bottom.value - 1) * 100)}% apart.`);
  }
  return parts.join(' ');
}

function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

function salesTable(sales) {
  const groups = new Map();
  for (const s of sales) { const k = [s.species, s.yard, s.classLabel, s.unit].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(s); }
  const rows = [...groups.values()].map(g => g.sort((a, b) => a.saleDate.localeCompare(b.saleDate))).sort((a, b) => b.at(-1).saleDate.localeCompare(a.at(-1).saleDate)).slice(0, 10);
  if (!rows.length) return '<div class="empty">No dated local sale results on record for this stock yet.</div>';
  const price = s => `<span class="hub-price">$${s.unit === 'NZD/head' ? Math.round(s.min) : s.min.toFixed(2)}${s.max !== s.min ? '–' + (s.unit === 'NZD/head' ? Math.round(s.max) : s.max.toFixed(2)) : ''}<small class="unit">${esc(s.unit.replace('NZD', ''))}</small></span>`;
  return `<div class="hub-table" role="table" aria-label="Latest local sale results"><div class="hub-row head" role="row"><span role="columnheader">Stock</span><span role="columnheader">Latest</span><span role="columnheader">Before that</span></div>${rows.map(g => {
    const s = g.at(-1), prev = g.at(-2);
    return `<div class="hub-row" role="row"><span role="cell"><strong>${esc(s.classLabel)}</strong><small>${esc(s.yard)} · ${esc(s.statistic)}</small></span><span role="cell">${price(s)}<small>${nz(s.saleDate)}${s.sourceUrl ? ` · <a href="${safeUrl(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher || 'Report')} ↗</a>` : ''}</small></span><span role="cell"><small class="hub-before">Before that</small>${prev ? `${price(prev)}<small>${nz(prev.saleDate)}</small>` : '<small>First on record</small>'}</span></div>`;
  }).join('')}</div>`;
}

export function mountHub(root) {
  let tab = 'cattle', data = null, brief = null;
  root.innerHTML = `<div class="section-head"><div><div class="eyebrow">STATS & SALES</div><h2>The numbers</h2></div><div class="filters hub-tabs" role="group" aria-label="Stock">${Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${t.label}</button>`).join('')}</div></div><div class="hub-body"><p class="loading-note">Loading the numbers…</p></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; root.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  let width = 0; new ResizeObserver(() => { if (data && Math.abs(root.clientWidth - width) > 30) draw(); }).observe(root);

  function draw() {
    width = root.clientWidth;
    const body = root.querySelector('.hub-body'), species = TABS[tab].species;
    const seriesIds = Object.keys(data.series).filter(id => species.includes(data.series[id].species) && !data.series[id].hidden);
    const latest = (brief.schedules || []).filter(s => seriesIds.includes(s.seriesId));
    // A full published weekly history is used where there is one; otherwise the readings saved with each briefing.
    const weekly = id => (data.charts?.[id]?.points?.length >= 10 ? data.charts[id].points : null);
    const pointsFor = id => weekly(id) || data.schedules.filter(p => p.seriesId === id);
    const anyWeekly = seriesIds.some(weekly), anyDerived = seriesIds.some(id => !weekly(id) && pointsFor(id).some(p => p.derived));
    const firstReal = id => data.schedules.find(p => p.seriesId === id && !p.derived);
    const notes = seriesIds.map(id => weekly(id)
      ? `${data.series[id].label}: the weekly North Island schedule average published by interest.co.nz, ${nz(weekly(id)[0].weekOf, { year: 'numeric' })} to ${nz(weekly(id).at(-1).weekOf, { year: 'numeric' })}.`
      : `${data.series[id].label}: weekly readings recorded here from ${firstReal(id) ? nz(firstReal(id).weekOf, { year: 'numeric' }) : 'the next refresh'}; hollow points come from the comparison columns published with each reading, so the line fills in week by week.`).join(' ');
    const seasonRows = id => pointsFor(id).filter(p => Date.parse(p.weekOf) >= Date.now() - 400 * DAY).slice().reverse();
    body.innerHTML = `
      <h3 class="hub-subhead">Latest schedule${latest.length > 1 ? 's' : ''}<span>What processors are paying, averaged across their published schedules</span></h3>
      <div class="hub-tiles">${latest.length ? latest.map(s => tile(s, data.series[s.seriesId])).join('') : '<div class="empty">No schedule reading saved yet. The next daily refresh adds one.</div>'}</div>
      <h3 class="hub-subhead">The season so far<span>Seasons run 1 October to 30 September, shown with the three months before · this season against last${anyWeekly ? ' and the five seasons before' : ''}</span></h3>
      <div class="hub-legend"><span><i class="swatch this"></i>This season</span><span><i class="swatch last"></i>Last season</span>${anyWeekly ? '<span><i class="swatch avg"></i>5-season average and range</span>' : ''}${anyDerived ? '<span><i class="swatch derived"></i>Approximate week, from the published comparison</span>' : ''}</div>
      <div class="hub-charts">${seriesIds.map(id => `<figure class="hub-chart"><figcaption>${esc(data.series[id].label)} <small>${esc(data.series[id].island)} · ${esc(data.series[id].published)}</small></figcaption><div class="hub-plot" data-series="${id}"></div><p class="hub-insight"></p></figure>`).join('')}</div>
      <p class="meta hub-note">${esc(notes)} Schedules are for prime stock sent to the works, not store sale prices.</p>
      <details class="hub-data"><summary>Show the last year of readings as a table</summary><div class="hub-table">${seriesIds.flatMap(id => seasonRows(id).map(p => `<div class="hub-row"><span>${esc(data.series[id].label)}</span><span>${nz(p.weekOf, { year: 'numeric' })}${p.derived ? ' <small>approximate</small>' : ''}</span><span>${money(p.value, data.series[id].unit)}${unitShort(data.series[id].unit)}</span></div>`)).join('') || '<div class="empty">No readings yet.</div>'}</div></details>
      <h3 class="hub-subhead">Local sale results<span>Latest reported result for each class at nearby yards · ranges, not averages, unless stated</span></h3>
      ${salesTable(data.sales.filter(s => species.includes(s.species) && !isDairyBeef(s.classLabel)))}`;
    body.querySelectorAll('.hub-plot').forEach(el => { const id = el.dataset.series; seriesChart(el, pointsFor(id), data.series[id], el.parentElement.querySelector('.hub-insight')); });
  }

  return {
    async load(currentBrief) {
      brief = currentBrief;
      try { const r = await fetch('/api/market-history', { cache: 'no-store' }); if (!r.ok) throw Error('HTTP ' + r.status); data = await r.json(); draw(); }
      catch { root.querySelector('.hub-body').innerHTML = '<div class="empty">The numbers could not be loaded just now. Reload the briefing to try again.</div>'; }
    },
  };
}
