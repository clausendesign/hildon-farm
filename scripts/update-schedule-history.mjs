// Refreshes the weekly schedule history behind the season charts from interest.co.nz's published charts.
// Usage: node scripts/update-schedule-history.mjs [site URL]   (needs MARKET_EDITOR_TOKEN or ~/.config/hildon-farm/editor-token)
// Only series with a historyNid in lib/market-series.ts are fetched: today that is the North Island P2 steer schedule.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { series } from '../lib/market-series.ts';

const site = (process.argv[2] || 'https://hildon-farm.hildonfarm.workers.dev').replace(/\/$/, '');
const token = (process.env.MARKET_EDITOR_TOKEN || readFileSync(`${homedir()}/.config/hildon-farm/editor-token`, 'utf8')).trim();
const wanted = Object.entries(series).filter(([, s]) => s.historyNid);
const body = new URLSearchParams(wanted.map(([, s]) => ['nids[]', s.historyNid]));
const response = await fetch('https://www.interest.co.nz/chart-data/get-csv-data', { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (Hildon Farm weekly history)' } });
if (!response.ok) throw new Error(`interest.co.nz chart data: HTTP ${response.status}`);
const charts = await response.json();
for (const [seriesId, s] of wanted) {
  const rows = charts[s.historyNid]?.csv_data?.[s.historyChart];
  if (!Array.isArray(rows) || rows.length < 10) throw new Error(`No chart data for ${seriesId}.`);
  // The chart tracks prices "as at Saturday each week"; each point is kept under its published (UTC) date, usually the following Sunday.
  const points = rows.map(([time, value]) => ({ weekOf: new Date(time).toISOString().slice(0, 10), value }));
  const deduped = [...new Map(points.map(p => [p.weekOf, p])).values()];
  const result = await fetch(`${site}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'import_schedule_history', arguments: { seriesId, points: deduped, sourceUrl: 'https://www.interest.co.nz/charts/rural/p2-steer2' } } }),
  }).then(r => r.json());
  const text = result?.result?.content?.[0]?.text;
  if (result?.result?.isError || !text) throw new Error(`${seriesId}: ${text || JSON.stringify(result).slice(0, 200)}`);
  const saved = JSON.parse(text);
  console.log(`${seriesId}: ${saved.weeks} weeks saved, ${saved.first} to ${saved.latest}.`);
}
