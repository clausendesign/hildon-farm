import assert from 'node:assert/strict';
import { recordsFromCsv, summarise, toIsoDate } from '../public/cattle-data.mjs';

assert.equal(toIsoDate('12/08/2026'), '2026-08-12');
assert.equal(toIsoDate('2026-9-1 10:30'), '2026-09-01');
const first = recordsFromCsv('Session export\nEID,VID,Weight (kg),Date\n"982 000123456789",101,412.5,12/08/2026\n,,,\n982000123456790,102,398,12/08/2026');
assert.equal(first.records.length, 2); assert.equal(first.records[0].eid, '982000123456789');
const undated = recordsFromCsv('Tag;Weight\n7;300', { fallbackDate: '2026-10-01' });
assert.equal(undated.hasDates, false); assert.equal(undated.records[0].date, '2026-10-01');
assert.match(recordsFromCsv('Name,Colour\nBess,Red').problem, /weight column/);
const summary = summarise([...first.records, { eid: '982000123456789', vid: '101', weight: 448, date: '2026-09-21' }]);
const animal = summary.animals.find(a => a.vid === '101');
assert.equal(animal.gain, 35.5); assert.equal(animal.dailyGain.toFixed(2), '0.89');
assert.equal(summary.lastDate, '2026-09-21'); assert.equal(summary.lastSessionCount, 1);
console.log('Cattle checks passed: Datamars-style CSV, NZ dates, missing dates, tag matching and daily gains.');
