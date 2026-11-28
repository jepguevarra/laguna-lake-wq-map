// Builds data/stations.json from the transcribed LLDA quarterly tables.
//
//   node scripts/build_quarterly_data.mjs
//
// The 2009-2012 pipeline (build_app_data.py) produced one value per station
// per parameter per YEAR. These reports are monthly, so the axis here is a
// month string like "2026-01" rather than a year number.
//
// Inputs (scripts/source/quarterly/):
//   <quarter>-lake.csv, <quarter>-rivers.csv   transcribed values
//   stations-2026.csv                          coordinates, from the station
//                                              map (scripts/fit_station_map.mjs)
//   station-names.csv                          names and towns, from the reports
//
// Output: data/stations.json
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'source', 'quarterly');

// The lake tables are transcribed with bare roman numerals; the coordinate
// and name files use the report's own "Stn. I" form. Canonicalise to the latter.
const canon = (id) => (/^[IVX]+$/.test(id) ? 'Stn. ' + id : id);

const readCsv = (p) => {
  const [head, ...rows] = readFileSync(p, 'utf8').trim().split('\n');
  const cols = head.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
};

/* ---- stations ---- */
const coords = new Map(readCsv(join(SRC, 'stations-2026.csv')).map((r) => [r.station, r]));
const names = new Map(readCsv(join(SRC, 'station-names.csv')).map((r) => [r.station, r]));

/* ---- values ---- */
const files = readdirSync(SRC).filter((f) => /^\d{4}Q\d-(lake|rivers)\.csv$/.test(f)).sort();
const values = new Map();   // station -> param -> month -> number
const censored = new Map(); // station -> param -> month -> original text
const months = new Set();
const unitOf = new Map();
let read = 0;
for (const f of files) {
  for (const r of readCsv(join(SRC, f))) {
    const raw = r.value;
    // "<0.1" means below the detection limit. The limit itself is the honest
    // upper bound, so that is what gets charted, with the original kept so the
    // table can still show "<0.1" rather than pretending 0.1 was measured.
    const below = raw.startsWith('<');
    const num = Number(below ? raw.slice(1) : raw);
    if (!Number.isFinite(num)) throw new Error(`${f}: ${r.station} ${r.parameter} ${r.month} = "${raw}"`);
    const sid = canon(r.station);
    if (!values.has(sid)) { values.set(sid, {}); censored.set(sid, {}); }
    const v = values.get(sid);
    (v[r.parameter] ??= {})[r.month] = num;
    if (below) ((censored.get(sid)[r.parameter] ??= {}))[r.month] = raw;
    months.add(r.month);
    unitOf.set(r.parameter, r.unit);
    read++;
  }
}
const monthList = [...months].sort();

/* ---- parameter metadata, carried over from the 2009-2012 build ---- */
const old = JSON.parse(readFileSync(join(ROOT, 'data', 'stations.json'), 'utf8'));
const oldParam = new Map(old.meta.parameters.map((p) => [p.key, p]));
const present = [...unitOf.keys()];
const parameters = old.meta.parameters
  .filter((p) => present.includes(p.key))
  .map((p) => ({ ...p, unit: unitOf.get(p.key) ?? p.unit }));
const missingMeta = present.filter((k) => !oldParam.has(k));
if (missingMeta.length) throw new Error(`no metadata for ${missingMeta.join(', ')}`);

/* ---- assemble ---- */
const stations = [];
const problems = [];
for (const id of values.keys()) {
  const c = coords.get(id);
  const n = names.get(id);
  if (!c) { problems.push(`${id}: no coordinates`); continue; }
  if (!n) { problems.push(`${id}: no name`); continue; }
  stations.push({
    id,
    name: n.name,
    type: n.type,
    municipality: n.municipality || '',
    province: n.type === 'lake' ? 'Laguna de Bay' : '',
    lat: Number(c.lat),
    lon: Number(c.lon),
    movedToShore: false,
    values: values.get(id),
    censoredValues: censored.get(id),
    flaggedValues: {},
  });
}
// A station the reports list but never sampled still belongs on the map, drawn
// as not sampled. Station 20 (Jala-jala) is the standing case: replaced by
// Binangonan River in June 2022 but still printed in every table.
const unsampled = [];
for (const id of coords.keys()) {
  if (values.has(id)) continue;
  const n2 = names.get(id);
  if (!n2) { problems.push(id + ': no name'); continue; }
  const c2 = coords.get(id);
  unsampled.push(id);
  stations.push({
    id, name: n2.name, type: n2.type, municipality: n2.municipality || '',
    province: n2.type === 'lake' ? 'Laguna de Bay' : '',
    lat: Number(c2.lat), lon: Number(c2.lon), movedToShore: false,
    values: {}, censoredValues: {}, flaggedValues: {},
  });
}

stations.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id, undefined, { numeric: true }));

const out = {
  meta: {
    title: 'Laguna de Bay water quality, July 2025 to June 2026',
    source: 'Laguna Lake Development Authority quarterly water quality reports, Q3 2025 to Q2 2026',
    valueType: 'Monthly value. Fecal coliform is a geometric mean.',
    standard: old.meta.standard,
    months: monthList,
    coordinateNote: 'Positions were fitted from the station map printed in each report, georeferenced against the OpenStreetMap lake boundary (about 43 m per pixel).',
    parameters,
  },
  stations,
};
writeFileSync(join(ROOT, 'data', 'stations.json'), JSON.stringify(out, null, 1), 'utf8');

console.log(`${read} values from ${files.length} files`);
console.log(`${monthList.length} months: ${monthList[0]} to ${monthList[monthList.length - 1]}`);
console.log(`${stations.length} stations: ${stations.filter((s) => s.type === 'lake').length} lake, ${stations.filter((s) => s.type === 'tributary').length} river`);
console.log(`${parameters.length} parameters: ${parameters.map((p) => p.key).join(', ')}`);
const nCens = [...censored.values()].reduce((t, p) => t + Object.values(p).reduce((u, m) => u + Object.keys(m).length, 0), 0);
console.log(`${nCens} below-detection-limit readings kept as text`);
if (unsampled.length) console.log('never sampled in this period, drawn as not sampled: ' + unsampled.join(', '));
console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nno problems');
