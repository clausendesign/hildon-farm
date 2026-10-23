import { recordsFromCsv, summarise } from './cattle-data.mjs';
import { readProfile } from './farm-profile.mjs';

const $ = selector => document.querySelector(selector);
const PIN_KEY = 'hildon-farm-cattle-pin';
let pin = '', records = [];

const storage = {
  get() { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } },
  set(value) { try { value ? localStorage.setItem(PIN_KEY, value) : localStorage.removeItem(PIN_KEY); } catch { /* Asked again next visit. */ } },
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const kg = value => `${Math.round(value).toLocaleString('en-NZ')} kg`;
const signed = (value, digits = 0) => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(digits);
const niceDate = iso => iso ? new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : '–';
const label = animal => animal.vid || animal.eid;
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(method, body, query = '') {
  const response = await fetch(`/api/cattle${query}`, { method, headers: { 'Content-Type': 'application/json', 'x-farm-pin': pin }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: response.status });
  return data;
}

async function unlock(value) {
  pin = value;
  try {
    records = (await api('GET')).records;
    storage.set(pin);
    $('#gate').hidden = true; $('#herd').hidden = false;
    render();
  } catch (error) {
    storage.set('');
    $('#gate').hidden = false; $('#herd').hidden = true;
    $('#gate-status').textContent = error.status === 401 && value ? error.message : error.status === 503 ? error.message : '';
    $('#pin').focus();
  }
}

function render() {
  const summary = summarise(records);
  $('#stat-animals').textContent = summary.animals.length || '–';
  $('#stat-date').textContent = niceDate(summary.lastDate);
  $('#stat-average').textContent = summary.lastSessionAverage ? kg(summary.lastSessionAverage) : '–';
  $('#stat-gain').textContent = summary.averageDailyGain !== null ? `${signed(summary.averageDailyGain, 2)} kg/day` : '–';
  const query = $('#search').value.trim().toLowerCase();
  const shown = summary.animals.filter(a => !query || `${a.vid} ${a.eid}`.toLowerCase().includes(query));
  $('#rows').innerHTML = shown.map(a => `<tr data-key="${escape(a.key)}" tabindex="0"><td><strong>${escape(label(a))}</strong>${a.vid && a.eid ? `<small>${escape(a.eid)}</small>` : ''}</td><td>${kg(a.latest.weight)}</td><td class="${a.gain > 0 ? 'up' : a.gain < 0 ? 'down' : ''}">${a.gain === null ? '–' : `${signed(a.gain)} kg`}</td><td>${a.dailyGain === null ? '–' : `${signed(a.dailyGain, 2)} kg`}</td><td>${niceDate(a.latest.date)}</td></tr>`).join('');
  $('#empty').hidden = summary.animals.length > 0;
}

// A simple line of the animal's weights over time.
function chart(history) {
  if (history.length < 2) return '';
  const w = 560, h = 180, pad = 28;
  const times = history.map(r => Date.parse(r.date)), weights = history.map(r => r.weight);
  const [t0, t1] = [Math.min(...times), Math.max(...times)], [w0, w1] = [Math.min(...weights), Math.max(...weights)];
  const x = t => pad + ((t - t0) / (t1 - t0 || 1)) * (w - pad * 2), y = v => h - pad - ((v - w0) / (w1 - w0 || 1)) * (h - pad * 2);
  const points = history.map((r, i) => `${x(times[i]).toFixed(1)},${y(r.weight).toFixed(1)}`);
  return `<svg class="weight-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weight over time"><polyline points="${points.join(' ')}"/>${history.map((r, i) => `<circle cx="${x(times[i]).toFixed(1)}" cy="${y(r.weight).toFixed(1)}" r="4"/>`).join('')}<text x="${pad}" y="${h - 6}">${niceDate(history[0].date)}</text><text x="${w - pad}" y="${h - 6}" text-anchor="end">${niceDate(history.at(-1).date)}</text></svg>`;
}

function showAnimal(key) {
  const animal = summarise(records).animals.find(a => a.key === key);
  if (!animal) return;
  $('#animal-body').innerHTML = `<div class="eyebrow">${animal.eid ? `NAIT ${escape(animal.eid)}` : 'NO NAIT TAG RECORDED'}</div><h2>${escape(label(animal))}</h2>
    <div class="stats small"><div><span>Latest</span><strong>${kg(animal.latest.weight)}</strong></div><div><span>Since first weighing</span><strong>${animal.overallDailyGain === null ? '–' : `${signed(animal.overallDailyGain, 2)} kg/day`}</strong></div></div>
    ${chart(animal.history)}
    <table><thead><tr><th>Date</th><th>Weight</th><th>Change</th><th></th></tr></thead><tbody>${animal.history.slice().reverse().map((r, i, list) => { const before = list[i + 1]; return `<tr><td>${niceDate(r.date)}</td><td>${kg(r.weight)}</td><td>${before ? `${signed(r.weight - before.weight)} kg` : '–'}</td><td><button class="remove" data-id="${escape(r.id)}" aria-label="Remove this weight">Remove</button></td></tr>`; }).join('')}</tbody></table>`;
  $('#animal').showModal();
}

async function save(newRecords, what) {
  $('#status').textContent = 'Saving…';
  try {
    const result = await api('POST', { records: newRecords });
    records = (await api('GET')).records;
    render();
    $('#status').textContent = `${what}: ${result.added} new weight${result.added === 1 ? '' : 's'} saved${result.skipped ? `, ${result.skipped} already on file` : ''}.`;
  } catch (error) { $('#status').textContent = error.message; }
}

async function importFile(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name)) { $('#status').textContent = 'Please export the session from Datamars as a CSV file.'; return; }
  const text = await file.text();
  const addedBy = readProfile().name || '';
  let result = recordsFromCsv(text, { source: file.name, addedBy });
  if (!result.records.length && !result.problem) result = recordsFromCsv(text, { source: file.name, addedBy, fallbackDate: today() });
  if (result.problem) { $('#status').textContent = result.problem; return; }
  if (!result.hasDates) {
    const date = prompt('This file has no dates. What day were they weighed? (YYYY-MM-DD)', today());
    if (!date) return;
    result = recordsFromCsv(text, { source: file.name, addedBy, fallbackDate: date });
  }
  await save(result.records, file.name);
}

$('#gate').addEventListener('submit', event => { event.preventDefault(); unlock($('#pin').value.trim()); });
$('#file').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(type => drop.addEventListener(type, () => drop.classList.remove('over')));
drop.addEventListener('drop', event => { event.preventDefault(); importFile(event.dataTransfer.files[0]); });
$('#m-date').value = today();
$('#manual').addEventListener('submit', event => {
  event.preventDefault();
  const tag = $('#m-tag').value.trim();
  const isNait = /^\d{15}$/.test(tag.replace(/\s+/g, ''));
  save([{ eid: isNait ? tag.replace(/\s+/g, '') : '', vid: isNait ? '' : tag, weight: Number($('#m-weight').value), date: $('#m-date').value, source: 'Typed in', addedBy: readProfile().name || '' }], 'Added');
  $('#m-weight').value = ''; $('#m-tag').focus();
});
$('#search').addEventListener('input', render);
$('#rows').addEventListener('click', event => { const row = event.target.closest('tr'); if (row) showAnimal(row.dataset.key); });
$('#rows').addEventListener('keydown', event => { const row = event.target.closest('tr'); if (row && event.key === 'Enter') showAnimal(row.dataset.key); });
$('#animal').addEventListener('click', async event => {
  const button = event.target.closest('.remove');
  if (!button || !confirm('Remove this weight?')) return;
  try { await api('DELETE', null, `?id=${encodeURIComponent(button.dataset.id)}`); records = records.filter(r => r.id !== button.dataset.id); render(); $('#animal').close(); }
  catch (error) { alert(error.message); }
});

unlock(storage.get());
