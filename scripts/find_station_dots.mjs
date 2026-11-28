// Finds the station dots on an LLDA map. The labels are printed in the same
// two colours as the dots, so colour alone is not enough: a dot is round and
// solidly filled, a glyph is neither.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const [imgPath, outPath] = process.argv.slice(2);
const img = await loadImage(imgPath);
const W = img.width;
const H = img.height;
const c = createCanvas(W, H);
const cx = c.getContext('2d');
cx.drawImage(img, 0, 0);
const { data } = cx.getImageData(0, 0, W, H);

const kindOf = (r, g, b) => {
  if (b > r + 20 && b > 100 && r < 200) return 'lake';
  if (g > b + 20 && r < 160 && g < 180) return 'river';
  return null;
};

const kinds = new Uint8Array(W * H); // 0 none, 1 lake, 2 river
for (let i = 0, p = 0; i < data.length; i += 4, p++) {
  const k = kindOf(data[i], data[i + 1], data[i + 2]);
  kinds[p] = k === 'lake' ? 1 : k === 'river' ? 2 : 0;
}

const seen = new Uint8Array(W * H);
const blobs = [];
for (let p = 0; p < kinds.length; p++) {
  if (!kinds[p] || seen[p]) continue;
  const kind = kinds[p];
  const stack = [p];
  seen[p] = 1;
  const px = [];
  while (stack.length) {
    const q = stack.pop();
    px.push(q);
    const qx = q % W;
    const qy = (q / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx;
        const ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (kinds[r] === kind && !seen[r]) { seen[r] = 1; stack.push(r); }
      }
    }
  }
  if (px.length < 250 || px.length > 4000) continue;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0, sy = 0;
  for (const q of px) {
    const qx = q % W;
    const qy = (q / W) | 0;
    sx += qx; sy += qy;
    if (qx < x0) x0 = qx;
    if (qx > x1) x1 = qx;
    if (qy < y0) y0 = qy;
    if (qy > y1) y1 = qy;
  }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const aspect = bw / bh;
  const fill = px.length / (bw * bh);
  if (aspect < 0.72 || aspect > 1.4) continue;
  if (fill < 0.6) continue;
  blobs.push({
    kind: kind === 1 ? 'lake' : 'river',
    x: sx / px.length, y: sy / px.length,
    area: px.length, aspect: Number(aspect.toFixed(2)), fill: Number(fill.toFixed(2)),
  });
}

blobs.sort((a, b) => a.y - b.y || a.x - b.x);
blobs.forEach((b, i) => { b.i = i + 1; });
console.log(`${blobs.length} dots: ${blobs.filter((b) => b.kind === 'lake').length} lake, ${blobs.filter((b) => b.kind === 'river').length} river`);
console.log(`areas ${Math.min(...blobs.map((b) => b.area))}-${Math.max(...blobs.map((b) => b.area))}`);
writeFileSync(outPath, JSON.stringify(blobs, null, 1));
