// Saves a refreshed market briefing to the live site, then reads it back to confirm.
// Usage: node scripts/update-brief.mjs <brief.json> [site URL]
// Get the current briefing with: node scripts/update-brief.mjs --get > current.json
// The editor token lives outside the repository, in ~/.config/hildon-farm/editor-token.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const [file, siteArg] = process.argv.slice(2);
const site = (siteArg || 'https://hildon-farm.hildonfarm.workers.dev').replace(/\/$/, '');
const token = readFileSync(`${homedir()}/.config/hildon-farm/editor-token`, 'utf8').trim();

async function call(name, args = {}) {
  const response = await fetch(`${site}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const data = await response.json();
  const text = data?.result?.content?.[0]?.text;
  if (data?.result?.isError || !text) throw new Error(text || JSON.stringify(data).slice(0, 300));
  return JSON.parse(text);
}

const current = await call('get_market_brief');
if (file === '--get') { console.log(JSON.stringify(current, null, 2)); process.exit(0); }
const brief = JSON.parse(readFileSync(file, 'utf8'));
delete brief.persisted;
const saved = await call('update_market_brief', { brief, expected_revision: current.revision || 0 });
const check = await call('get_market_brief');
if (!check.persisted || check.revision !== saved.revision) throw new Error('The briefing did not save as expected.');
console.log(`Saved briefing revision ${saved.revision}, checked ${check.checkedAt}, ${saved.forecastsRecorded} forecasts on record.`);
