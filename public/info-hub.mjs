// The numbers: latest processor schedules, the season so far against last season, and local sale results.
import { isDairyBeef } from './briefing-answers.mjs';

const DAY = 86400000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nz = (v, opts = {}) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', ...opts }).format(new Date(v + 'T12:00:00+13:00'));
const safeUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' ? esc(u.href) : '#'; } catch { return '#'; } };
const TABS = { lambs: { label: 'Lamb', species: ['lambs', 'sheep'] }, cattle: { label: 'Beef', species: ['cattle'] } };
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

function seasonChart(holder, points, meta) {
  const latest = points.filter(p => !p.derived).at(-1) || points.at(-1);
  if (!latest) { holder.innerHTML = `<div class="empty">No readings recorded for ${esc(meta.label)} yet.</div>`; return; }
  const thisStart = seasonStart(latest.weekOf), lastStart = Date.UTC(new Date(thisStart).getUTCFullYear() - 1, 9, 1);
  const seasons = [
    { key: 'this', name: `This season (${seasonName(thisStart)})`, start: thisStart, pts: [] },
    { key: 'last', name: `Last season (${seasonName(lastStart)})`, start: lastStart, pts: [] },
  ];
  for (const p of points) { const t = Date.parse(p.weekOf + 'T00:00:00Z'); for (const s of seasons) if (t >= s.start && t < s.start + 366 * DAY) s.pts.push({ ...p, x: (t - s.start) / DAY }); }
  const all = seasons.flatMap(s => s.pts);
  const lo = Math.min(...all.map(p => p.value)), hi = Math.max(...all.map(p => p.value));
  const pad = Math.max((hi - lo) * 0.15, hi * 0.03), step = niceStep((hi - lo + pad * 2) / 4);
  const yMin = Math.floor((lo - pad) / step) * step, yMax = Math.ceil((hi + pad) / step) * step;
  const W = Math.max(300, holder.clientWidth || 600), H = W < 520 ? 210 : 240, L = 52, R = 14, T = 14, B = 30;
  const x = d => L + d / 365 * (W - L - R), y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const ticks = []; for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);
  const monthX = MONTHS.map((m, i) => ({ m, d: (Date.UTC(2026 + (i >= 3 ? 1 : 0), (9 + i) % 12, 1) - Date.UTC(2026, 9, 1)) / DAY }));
  // Readings more than five weeks apart are not joined, so the line never suggests prices nobody recorded.
  const path = pts => pts.map((p, i) => `${i && p.x - pts[i - 1].x <= 35 ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const marks = s => s.pts.map(p => `<circle cx="${x(p.x).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" class="${p.derived ? 'derived' : ''}"/>`).join('');
  holder.innerHTML = `<svg class="hub-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(meta.label)}: this season against last season">
    ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${money(v, meta.unit)}</text>`).join('')}
    ${monthX.map(({ m, d }, i) => (W < 520 && i % 2) ? '' : `<text class="axis" x="${x(d)}" y="${H - 8}" text-anchor="start">${m}</text>`).join('')}
    ${seasons.map(s => `<g class="series ${s.key}"><path d="${path(s.pts)}"/>${marks(s)}</g>`).join('')}
    <line class="crosshair" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg><div class="hub-tip" hidden></div>`;
  const svg = holder.querySelector('svg'), tip = holder.querySelector('.hub-tip'), cross = svg.querySelector('.crosshair');
  const show = clientX => {
    const box = svg.getBoundingClientRect(), d = (clientX - box.left - L) / (W - L - R) * 365;
    const near = seasons.map(s => ({ s, p: s.pts.reduce((a, p) => !a || Math.abs(p.x - d) < Math.abs(a.x - d) ? p : a, null) })).filter(n => n.p && Math.abs(n.p.x - d) < 21);
    if (!near.length) { hide(); return; }
    const at = near[0].p.x; cross.setAttribute('x1', x(at)); cross.setAttribute('x2', x(at)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = near.map(({ s, p }) => `<div><span class="swatch ${s.key}"></span>${esc(s.key === 'this' ? 'This season' : 'Last season')} · ${nz(p.weekOf, { year: 'numeric' })}<strong>${money(p.value, meta.unit)}${unitShort(meta.unit)}</strong>${p.derived ? '<small>From the published comparison column, approximate week</small>' : ''}</div>`).join('');
    tip.hidden = false; tip.style.left = `${Math.min(Math.max(x(at) - 90, 0), W - 190)}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', e => show(e.clientX)); hit.addEventListener('pointerdown', e => show(e.clientX)); hit.addEventListener('pointerleave', hide);
  return seasons;
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
    const seriesIds = Object.keys(data.series).filter(id => species.includes(data.series[id].species));
    const latest = (brief.schedules || []).filter(s => seriesIds.includes(s.seriesId));
    const firstReal = data.schedules.find(p => !p.derived);
    body.innerHTML = `
      <h3 class="hub-subhead">Latest schedules<span>What processors are paying, averaged across their published schedules</span></h3>
      <div class="hub-tiles">${latest.length ? latest.map(s => tile(s, data.series[s.seriesId])).join('') : '<div class="empty">No schedule reading saved yet. The next daily refresh adds one.</div>'}</div>
      <h3 class="hub-subhead">The season so far<span>1 October to 30 September · this season against last</span></h3>
      <div class="hub-legend"><span><i class="swatch this"></i>This season</span><span><i class="swatch last"></i>Last season</span><span><i class="swatch derived"></i>Approximate week, from the published comparison</span></div>
      <div class="hub-charts">${seriesIds.map(id => `<figure class="hub-chart"><figcaption>${esc(data.series[id].label)} <small>${esc(data.series[id].island)} · ${esc(data.series[id].published)}</small></figcaption><div class="hub-plot" data-series="${id}"></div></figure>`).join('')}</div>
      <p class="meta hub-note">${firstReal ? `Weekly readings recorded from ${nz(firstReal.weekOf, { year: 'numeric' })}; the line joins up as each week is added.` : ''} Earlier points come from the comparison columns published alongside each reading. Schedules are for prime stock sent to the works, not store sale prices.</p>
      <details class="hub-data"><summary>Show the readings as a table</summary><div class="hub-table">${seriesIds.flatMap(id => data.schedules.filter(p => p.seriesId === id).slice().reverse().map(p => `<div class="hub-row"><span>${esc(data.series[id].label)}</span><span>${nz(p.weekOf, { year: 'numeric' })}${p.derived ? ' <small>approximate</small>' : ''}</span><span>${money(p.value, data.series[id].unit)}${unitShort(data.series[id].unit)}</span></div>`)).join('') || '<div class="empty">No readings yet.</div>'}</div></details>
      <h3 class="hub-subhead">Local sale results<span>Latest reported result for each class at nearby yards · ranges, not averages, unless stated</span></h3>
      ${salesTable(data.sales.filter(s => species.includes(s.species) && !isDairyBeef(s.classLabel)))}`;
    body.querySelectorAll('.hub-plot').forEach(el => seasonChart(el, data.schedules.filter(p => p.seriesId === el.dataset.series), data.series[el.dataset.series]));
  }

  return {
    async load(currentBrief) {
      brief = currentBrief;
      try { const r = await fetch('/api/market-history', { cache: 'no-store' }); if (!r.ok) throw Error('HTTP ' + r.status); data = await r.json(); draw(); }
      catch { root.querySelector('.hub-body').innerHTML = '<div class="empty">The numbers could not be loaded just now. Reload the briefing to try again.</div>'; }
    },
  };
}
