// Colour classes, number formatting and Class C judgement.
import { getValue } from './data.js';

// 5-class sequential palettes (ColorBrewer OrRd and Blues).
const PALETTE_BAD = ['#fdd49e', '#fdbb84', '#fc8d59', '#d7301f', '#7f0000'];
const PALETTE_NEUTRAL = ['#deebf7', '#9ecae1', '#6baed6', '#3182bd', '#08519c'];

// Which direction is "worse" for each parameter.
//   high:    higher values = more pollution (default)
//   low:     lower values = worse (dissolved oxygen)
//   neutral: no good/bad direction, shown in blue
const DIRECTION = { do: 'low', ph: 'neutral', temperature: 'neutral' };

export const direction = (key) => DIRECTION[key] || 'high';
export const isLog = (key) => key === 'total_coliform' || key === 'fecal_coliform';

/**
 * Class breaks from every value of this parameter across all years, so the
 * colours mean the same thing when the user switches year.
 */
export function computeBreaks(paramKey, stations, years) {
  const tf = isLog(paramKey) ? Math.log10 : (x) => x;
  const vals = [];
  for (const s of stations) {
    for (const y of years) {
      const v = getValue(s, paramKey, y);
      if (v === null) continue;
      if (isLog(paramKey) && v <= 0) continue; // log10 needs positive values
      vals.push(tf(v));
    }
  }
  vals.sort((a, b) => a - b);
  if (!vals.length) return [];
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const inv = isLog(paramKey) ? (x) => 10 ** x : (x) => x;
  const breaks = [0.2, 0.4, 0.6, 0.8].map((p) => inv(q(p)));
  return [...new Set(breaks.map((b) => roundNice(b)))];
}

function roundNice(x) {
  if (x === 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(x))) - 1);
  return Math.round(x / mag) * mag;
}

export function palette(paramKey) {
  const dir = direction(paramKey);
  if (dir === 'neutral') return PALETTE_NEUTRAL;
  if (dir === 'low') return [...PALETTE_BAD].reverse();
  return PALETTE_BAD;
}

/** Fill colour for a value, or null for "no data". */
export function colorFor(paramKey, value, breaks) {
  if (value === null || value === undefined) return null;
  const pal = palette(paramKey);
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return pal[Math.min(i, pal.length - 1)];
}

/** Legend rows: [{color, label}] from low to high. */
export function legendRows(param, breaks) {
  const pal = palette(param.key);
  const rows = [];
  const edges = [null, ...breaks, null];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    let label;
    if (lo === null) label = `under ${fmt(hi, param.key)}`;
    else if (hi === null) label = `${fmt(lo, param.key)} and above`;
    else label = `${fmt(lo, param.key)} – ${fmt(hi, param.key)}`;
    rows.push({ color: pal[Math.min(i, pal.length - 1)], label });
  }
  return rows;
}

/** Format a number for display. Large values get thousands separators. */
export function fmt(v, paramKey) {
  if (v === null || v === undefined) return '—';
  if (isLog(paramKey) || Math.abs(v) >= 1000) {
    return v.toLocaleString('en-US', { maximumSignificantDigits: 3 });
  }
  if (Math.abs(v) >= 100) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 10) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function fmtWithUnit(v, param) {
  if (v === null || v === undefined) return 'No data';
  return param.unit === 'units' ? fmt(v, param.key) : `${fmt(v, param.key)} ${param.unit}`;
}

/** Text for the Class C limit. */
export function criterionText(param) {
  const c = param.criterion;
  if (!c) return 'None set';
  const u = param.unit === 'units' ? '' : ` ${param.unit}`;
  if (c.kind === 'max') return `≤ ${fmt(c.value, param.key)}${u}`;
  if (c.kind === 'min') return `≥ ${fmt(c.value, param.key)}${u}`;
  return `${c.value[0]} – ${c.value[1]}`;
}

/** 'pass' | 'fail' | 'none' (no limit) | 'nodata' */
export function judge(param, v) {
  if (v === null || v === undefined) return 'nodata';
  const c = param.criterion;
  if (!c) return 'none';
  if (c.kind === 'max') return v > c.value ? 'fail' : 'pass';
  if (c.kind === 'min') return v < c.value ? 'fail' : 'pass';
  return v < c.value[0] || v > c.value[1] ? 'fail' : 'pass';
}

export const STATUS_TEXT = {
  pass: 'Meets',
  fail: 'Fails',
  none: 'No limit',
  nodata: 'Not sampled',
};

/** Sort key where a larger number means worse water. */
export function severity(paramKey, v) {
  if (paramKey === 'ph') return Math.abs(v - 7.5);
  return direction(paramKey) === 'low' ? -v : v;
}
