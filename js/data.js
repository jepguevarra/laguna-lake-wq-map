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

/** Value for one station, parameter and year, or null when not sampled. */
export function getValue(station, paramKey, year) {
  const v = station.values?.[paramKey]?.[String(year)];
  return v === undefined ? null : v;
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
  return `${station.municipality}, ${station.province}`;
}
