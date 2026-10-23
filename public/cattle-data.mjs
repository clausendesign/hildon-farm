// Reading weigh-session exports (Datamars / Tru-Test CSV) and working out gains.

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = String(text).replace(/^﻿/, '');
  const delimiter = (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

const HEADERS = {
  eid: /^(eid|electronic ?id|rfid|nait( ?(number|no|tag|id))?|tag ?eid|e\.?i\.?d\.? ?(number|no)?)$/i,
  vid: /^(vid|visual ?(id|tag)|management ?(tag|number|no)|tag|ear ?tag|animal ?(id|tag))$/i,
  weight: /^(weight|live ?weight|wt|weight ?\(?kg\)?|kg)$/i,
  date: /^(date|weigh(ing)? ?date|session ?date|recorded( ?date)?|date ?recorded|date ?\/? ?time|timestamp)$/i,
};

// Finds which column is which, from the header row of a session export.
export function mapColumns(header) {
  const map = {};
  header.forEach((name, index) => {
    const key = name.trim();
    for (const [field, pattern] of Object.entries(HEADERS)) if (map[field] === undefined && pattern.test(key)) { map[field] = index; break; }
  });
  return map;
}

export function toIsoDate(value) {
  const text = String(value || '').trim();
  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // New Zealand order: day/month/year.
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Turns an export into weigh records. A file without a date column uses the date chosen on screen.
export function recordsFromCsv(text, { fallbackDate, source = '', addedBy = '' } = {}) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex(row => { const map = mapColumns(row); return map.weight !== undefined && (map.eid !== undefined || map.vid !== undefined); });
  if (headerIndex < 0) return { records: [], problem: 'I couldn’t find a weight column and a tag column in that file.' };
  const map = mapColumns(rows[headerIndex]);
  const records = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const weight = parseFloat(String(row[map.weight] ?? '').replace(/[^\d.]/g, ''));
    const eid = map.eid !== undefined ? String(row[map.eid] ?? '').replace(/\s+/g, '') : '';
    const vid = map.vid !== undefined ? String(row[map.vid] ?? '').trim() : '';
    const date = (map.date !== undefined && toIsoDate(row[map.date])) || fallbackDate;
    if ((!eid && !vid) || !(weight > 0) || !date) { skipped++; continue; }
    records.push({ eid, vid, weight, date, source, addedBy });
  }
  return { records, skipped, hasDates: map.date !== undefined };
}

const DAY = 86400000;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

// One entry per animal with its history, latest weight and average daily gain.
export function summarise(records) {
  const animals = new Map();
  for (const r of records) {
    const key = r.eid || r.vid;
    if (!animals.has(key)) animals.set(key, { key, eid: r.eid, vid: r.vid, history: [] });
    const animal = animals.get(key);
    if (r.vid && !animal.vid) animal.vid = r.vid;
    if (r.eid && !animal.eid) animal.eid = r.eid;
    animal.history.push(r);
  }
  const list = [...animals.values()].map(animal => {
    animal.history.sort((a, b) => a.date.localeCompare(b.date));
    const latest = animal.history.at(-1), previous = animal.history.at(-2), first = animal.history[0];
    const gap = previous ? days(previous.date, latest.date) : 0;
    const span = days(first.date, latest.date);
    return {
      ...animal, latest, previous,
      gain: previous ? latest.weight - previous.weight : null,
      dailyGain: previous && gap > 0 ? (latest.weight - previous.weight) / gap : null,
      overallDailyGain: span > 0 ? (latest.weight - first.weight) / span : null,
    };
  });
  list.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || (a.vid || a.eid).localeCompare(b.vid || b.eid, undefined, { numeric: true }));
  const lastDate = list.reduce((max, a) => a.latest.date > max ? a.latest.date : max, '');
  const lastSession = list.filter(a => a.latest.date === lastDate);
  const gains = lastSession.map(a => a.dailyGain).filter(v => v !== null);
  return {
    animals: list,
    lastDate,
    lastSessionCount: lastSession.length,
    lastSessionAverage: lastSession.length ? lastSession.reduce((s, a) => s + a.latest.weight, 0) / lastSession.length : null,
    averageDailyGain: gains.length ? gains.reduce((s, v) => s + v, 0) / gains.length : null,
  };
}
