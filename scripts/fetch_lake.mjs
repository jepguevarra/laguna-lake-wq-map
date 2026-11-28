// Rebuilds scripts/source/laguna_lake_osm.geojson, the real shoreline of
// Laguna de Bay, from OpenStreetMap relation 79348 (natural=water, water=lake).
//
//   node scripts/fetch_lake.mjs
//
// The relation carries about 15,300 points, which is far more than a lake-scale
// map can show, so the rings are thinned with Douglas-Peucker to roughly 10 m.
// That is under half a pixel at zoom 14 and invisible at the zooms where the
// whole lake is in view, while cutting the file from 310 KB to about 60 KB.
//
// This replaces the hand trace in laguna_lake_traced.geojson for drawing.
// The trace is still used by build_app_data.py to decide which river stations
// sit inside the lake, because it shares the +/- 1.5 km error of the station
// coordinates it is compared against.
//
// OSM data is published under the ODbL and the map credits it.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELATION = '79348';
const TOLERANCE_DEG = 0.0001; // about 11 m at this latitude
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'source', 'laguna_lake_osm.geojson');

/** Douglas-Peucker. Degrees are treated as planar: at 14 N a degree of
    longitude is 0.97 of a degree of latitude, which does not matter here. */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let best = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > best) { best = d; far = i; }
    }
    if (far !== -1) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Five decimal places is about 1 m, well under the tolerance above. */
const round = (ring) => ring.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);

const close = (ring) => {
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  return fx === lx && fy === ly ? ring : [...ring, [fx, fy]];
};

const url = 'https://nominatim.openstreetmap.org/search'
  + '?q=Laguna%20de%20Bay&format=json&polygon_geojson=1&limit=5';

const res = await fetch(url, {
  headers: { 'User-Agent': 'laguna-lake-wq-map/1.0 (one-off lake boundary fetch)' },
});
if (!res.ok) throw new Error(`Nominatim replied ${res.status}`);

const hit = (await res.json()).find(
  (r) => r.osm_type === 'relation' && String(r.osm_id) === RELATION,
);
if (!hit) throw new Error(`relation ${RELATION} was not in the Nominatim results`);
if (hit.geojson?.type !== 'Polygon') throw new Error(`expected a Polygon, got ${hit.geojson?.type}`);

const before = hit.geojson.coordinates.reduce((n, r) => n + r.length, 0);
const rings = hit.geojson.coordinates
  .map((ring) => close(simplify(round(ring), TOLERANCE_DEG)))
  .filter((ring) => ring.length >= 4); // anything smaller is not a shape
const after = rings.reduce((n, r) => n + r.length, 0);

const fc = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'Laguna de Bay',
      source: `OpenStreetMap relation ${RELATION} (ODbL), thinned to about 10 m`,
    },
    geometry: { type: 'Polygon', coordinates: rings },
  }],
};

writeFileSync(OUT, JSON.stringify(fc), 'utf8');
console.log(
  `${OUT}\n`
  + `${rings.length} rings (1 shoreline, ${rings.length - 1} islands), `
  + `${before} points thinned to ${after}`,
);
