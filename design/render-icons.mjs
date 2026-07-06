// Renders the static extension icons (idle aurora orb, no overlays) from the
// canonical renderer in icon-preview.html into public/icon/{16,32,48,128}.png.
// Idle must stay static per the ambient-icon rules — phase 0, energy 0.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(dir, '..', 'public', 'icon');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(dir, 'icon-preview.html').replace(/\\/g, '/'));

const icons = await page.evaluate(async (sizes) => {
  // Same drawing pass as renderMaster() in this page, but with all fixed
  // geometry scaled by k so the master is crisp at 640 instead of 80.
  // Canvas transforms don't scale shadowBlur/lineWidth, hence manual ×k.
  function renderScaled(RENDER) {
    const k = RENDER / 80;
    const c = new OffscreenCanvas(RENDER, RENDER);
    const ctx = c.getContext('2d');
    const M = 11 * k, S = RENDER - M * 2, R = 22 * k, cx = RENDER / 2, cy = RENDER / 2;
    ctx.save();
    squircle(ctx, M, M, S, S, R);
    ctx.shadowColor = 'rgba(45,212,191,0.3)';
    ctx.shadowBlur = 7 * k;
    ctx.fillStyle = INK_DEEP;
    ctx.fill();
    ctx.restore();
    ctx.save();
    squircle(ctx, M, M, S, S, R);
    ctx.clip();
    paintAurora(ctx, M, S, 0, 0);
    paintGlass(ctx, M, S);
    const vg = ctx.createRadialGradient(cx, cy, S * 0.22, cx, cy, S * 0.62);
    vg.addColorStop(0, 'rgba(4,22,20,0)');
    vg.addColorStop(1, 'rgba(4,22,20,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(M, M, S, S);
    ctx.restore();
    squircle(ctx, M, M, S, S, R);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2 * k;
    ctx.stroke();
    squircle(ctx, M, M, S, S, R);
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1.25 * k;
    ctx.stroke();
    return c;
  }

  // Progressive halving keeps small sizes from aliasing on the big ratio.
  function downscale(master, size) {
    let src = master;
    while (src.width / 2 >= size * 2) {
      const half = new OffscreenCanvas(src.width / 2, src.height / 2);
      const hctx = half.getContext('2d');
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
    const out = new OffscreenCanvas(size, size);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, 0, 0, size, size);
    return out;
  }

  const master = renderScaled(640);
  const result = {};
  for (const size of sizes) {
    const canvas = size === 640 ? master : downscale(master, size);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    result[size] = btoa(bin);
  }
  return result;
}, [16, 32, 48, 128]);

for (const [size, b64] of Object.entries(icons)) {
  const file = path.join(outDir, `${size}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('wrote', file, fs.statSync(file).size, 'bytes');
}
await browser.close();
