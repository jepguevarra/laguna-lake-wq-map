// Loads the static JSON files and exposes simple lookups.

export async function loadData() {
  const [stationsRes, lakeRes] = await Promise.all([
    fetch('data/stations.json'),
    fetch('data/laguna-lake.geojson'),
  ]);
  if (!stationsRes.ok || !lakeRes.ok) {
    throw new Error('Could not load the data files.');
  }
  const { meta, stations } = await stationsRes.json();
  const lake = await lakeRes.json();

  const params = meta.parameters;
  const paramByKey = Object.fromEntries(params.map((p) => [p.key, p]));
  const stationById = Object.fromEntries(stations.map((s) => [s.id, s]));

  return { meta, stations, lake, params, paramByKey, stationById };
}

/** Value for one station, parameter and month, or null when not sampled. */
export function getValue(station, paramKey, month) {
  const v = station.values?.[paramKey]?.[String(month)];
  return v === undefined ? null : v;
}

/** The reading as the report printed it when it was below the detection
    limit, e.g. "<0.1". getValue returns that limit as a number, which is the
    honest upper bound, but a table should not claim 0.1 was measured. */
export function censoredText(station, paramKey, month) {
  return station.censoredValues?.[paramKey]?.[String(month)] ?? null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-06" reads as "Jun 2026". */
export function monthLabel(month) {
  const [y, m] = String(month).split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Short form for a crowded chart axis: "Jun 26". */
export function monthShort(month) {
  const [y, m] = String(month).split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** A list of months reads as "Jul 2025 to Jun 2026". */
export function monthRange(months) {
  if (!months?.length) return '';
  const first = monthLabel(months[0]);
  const last = monthLabel(months[months.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

/** Human-readable station type. */
export function typeLabel(station) {
  return station.type === 'lake' ? 'Lake station' : 'River station';
}

/** Station heading, e.g. "5 · Tunasan River - Downstream". */
export function stationTitle(station) {
  return `${station.id} · ${station.name}`;
}

/** Place line, e.g. "Muntinlupa, NCR". */
export function placeLabel(station) {
  if (station.type === 'lake') return 'Open water, Laguna de Bay';
  // The quarterly reports name the town but not the province, and for one
  // river (29, Saran) not even the town. Say so rather than print a stray comma.
  const parts = [station.municipality, station.province].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Town not stated in the report';
}
