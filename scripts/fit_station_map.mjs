// Georeferences an LLDA station map by matching the lake it draws against the
// exact OpenStreetMap polygon. Lining up two shapes beats guessing control
// points by eye, and the overlap score says plainly how well it worked.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';

const [imgPath, geoPath, outPath] = process.argv.slice(2);
const SCALE_W = 520; // working width for the fit

const isLake = (r, g, b) => b - r > 20 && g - b <= 20 && r < 248;

/* ---- 1. lake mask from the map image ---- */
const img = await loadImage(imgPath);
const W = SCALE_W;
const H = Math.round((img.height / img.width) * W);
const c = createCanvas(W, H);
const cx = c.getContext('2d');
cx.drawImage(img, 0, 0, W, H);
const { data } = cx.getImageData(0, 0, W, H);
const mask = new Uint8Array(W * H);
for (let i = 0, p = 0; i < data.length; i += 4, p++) {
  if (isLake(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
}

/* ---- 2. keep the largest blob: the lake, not the sea at the margins ---- */
const label = new Int32Array(W * H).fill(-1);
let best = { id: -1, size: 0 };
let next = 0;
for (let p = 0; p < mask.length; p++) {
  if (!mask[p] || label[p] !== -1) continue;
  const id = next++;
  const stack = [p];
  label[p] = id;
  let size = 0;
  while (stack.length) {
    const q = stack.pop();
    size++;
    const qx = q % W;
    const qy = (q / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = qx + dx;
      const ny = qy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const r = ny * W + nx;
      if (mask[r] && label[r] === -1) { label[r] = id; stack.push(r); }
    }
  }
  if (size > best.size) best = { id, size };
}
const lake = new Uint8Array(W * H);
let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
for (let p = 0; p < lake.length; p++) {
  if (label[p] !== best.id) continue;
  lake[p] = 1;
  const px = p % W;
  const py = (p / W) | 0;
  if (px < bx0) bx0 = px;
  if (px > bx1) bx1 = px;
  if (py < by0) by0 = py;
  if (py > by1) by1 = py;
}
console.log(`lake blob ${best.size} px, bbox x ${bx0}-${bx1}, y ${by0}-${by1} (of ${W}x${H})`);

/* ---- 3. the OSM polygon ---- */
const rings = JSON.parse(readFileSync(geoPath, 'utf8')).features[0].geometry.coordinates;
let lon0 = 180, lat0 = 90, lon1 = -180, lat1 = -90;
for (const [lon, lat] of rings[0]) {
  if (lon < lon0) lon0 = lon;
  if (lon > lon1) lon1 = lon;
  if (lat < lat0) lat0 = lat;
  if (lat > lat1) lat1 = lat;
}
console.log(`osm bbox lon ${lon0.toFixed(4)}-${lon1.toFixed(4)}, lat ${lat0.toFixed(4)}-${lat1.toFixed(4)}`);

/** Even-odd test across every ring, so islands punch holes. */
function inPolygon(lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/* ---- 4. score a candidate transform by overlap ---- */
function score(ax, bx, ay, by) {
  let inter = 0;
  let union = 0;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const m = lake[py * W + px];
      const p = inPolygon(ax * px + bx, ay * py + by) ? 1 : 0;
      if (m || p) union++;
      if (m && p) inter++;
    }
  }
  return inter / union;
}

// Start by lining the bounding boxes up, then nudge.
let ax = (lon1 - lon0) / (bx1 - bx0);
let bx = lon0 - ax * bx0;
let ay = (lat0 - lat1) / (by1 - by0); // y grows downward, latitude grows up
let by = lat1 - ay * by0;
let bestFit = { ax, bx, ay, by, s: score(ax, bx, ay, by) };
console.log(`bbox fit IoU ${bestFit.s.toFixed(4)}`);

for (const step of [0.02, 0.01, 0.005, 0.002]) {
  let improved = true;
  while (improved) {
    improved = false;
    for (const [dax, dbx, day, dby] of [
      [step, 0, 0, 0], [-step, 0, 0, 0], [0, step, 0, 0], [0, -step, 0, 0],
      [0, 0, step, 0], [0, 0, -step, 0], [0, 0, 0, step], [0, 0, 0, -step],
    ]) {
      const t = {
        ax: bestFit.ax * (1 + dax), bx: bestFit.bx + dbx * (lon1 - lon0),
        ay: bestFit.ay * (1 + day), by: bestFit.by + dby * (lat1 - lat0),
      };
      const s = score(t.ax, t.bx, t.ay, t.by);
      if (s > bestFit.s + 1e-6) { bestFit = { ...t, s }; improved = true; }
    }
  }
  console.log(`  after step ${step}: IoU ${bestFit.s.toFixed(4)}`);
}

// Express the transform against the ORIGINAL image pixels, not the working copy.
const k = img.width / W;
const out = {
  image: { width: img.width, height: img.height },
  iou: Number(bestFit.s.toFixed(4)),
  lonPerPx: bestFit.ax / k,
  lonAt0: bestFit.bx,
  latPerPx: bestFit.ay / k,
  latAt0: bestFit.by,
};
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nfinal IoU ${out.iou}`);
console.log(`lon = ${out.lonPerPx.toExponential(6)} * px + ${out.lonAt0.toFixed(6)}`);
console.log(`lat = ${out.latPerPx.toExponential(6)} * py + ${out.latAt0.toFixed(6)}`);
console.log(`metres per pixel approx ${(Math.abs(out.lonPerPx) * 111320 * Math.cos(14.4 * Math.PI / 180)).toFixed(1)} E-W, ${(Math.abs(out.latPerPx) * 110574).toFixed(1)} N-S`);
