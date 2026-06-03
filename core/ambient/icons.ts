/**
 * Runtime-generated toolbar icons via OffscreenCanvas.
 *
 * Concept: an **aurora orb in a glass squircle**. No flat shapes, no stacked
 * rects — a rounded-square "app tile" holding a flowing sunset-aurora mesh
 * (deep ink → sky blue → coral pink), a glass top highlight, and a soft
 * colored outer glow so the mark pops on light *and* dark Chrome toolbars.
 *
 * No PNG assets shipped. Rendered at 80×80 and downscaled to 16 / 32 / 48 for
 * `chrome.action.setIcon`. Rendering large + drawImage downscale gives far
 * crisper aurora blending at the 16 px toolbar size than rendering natively.
 *
 * Motion model — `energy`:
 *   idle / success / focus  → energy 0   : STATIC frame. The service worker
 *                                           must be allowed to sleep, so the
 *                                           idle icon never animates. It still
 *                                           reads as "alive" via the mesh.
 *   thinking                → energy 0.55 : aurora blobs drift, gentle breathe.
 *   working                 → energy 1.0  : blobs orbit faster + wider, stronger
 *                                           breathe + hotter glow. Reads as busy.
 *
 * The continuous breathing-glass lives in the popup/side-panel DOM (free,
 * 60 fps). Here we pay GPU only while a job is actually running.
 *
 * Any variant can also carry a `dot` overlay (suggestions / duplicates / error)
 * painted bottom-right — replaces the native chrome badge for counters so the
 * orb stays visible at 16 px.
 */

import type { IconVariant } from './intent';

const SIZES = [16, 32, 48] as const;
const RENDER = 80; // internal design resolution

// ---- Jade/teal duotone aurora ----------------------------------------------
// Single-hue family on purpose: a blue→pink→purple sweep reads as Siri / an AI
// assistant. Staying inside the green-teal range reads as *this* brand.
const INK_DEEP = '#06201E'; // deep teal-black base
const TEAL = '#14B8A6'; // teal
const JADE = '#2DD4BF'; // jade (brightest body)
const EMERALD = '#0F766E'; // emerald (depth / shadow side)
const MINT = '#6EE7B7'; // mint highlight spark
const GLASS = 'rgba(255,255,255,0.92)';

const cache = new Map<string, Record<number, ImageData>>();

/** 0 = static, >0 = animated. Drives flow + breathe amplitude and glow heat. */
function energyFor(v: IconVariant): number {
  if (v === 'working') return 1.0;
  if (v === 'thinking') return 0.55;
  return 0;
}

function cacheKey(variant: IconVariant, phase: number, dotColor: string | null): string {
  // Animated variants quantize to ~18 phase buckets → cache the whole ring.
  const p = energyFor(variant) > 0 ? Math.round(phase * 1000) : 0;
  return `${variant}|${p}|${dotColor ?? ''}`;
}

export function getIcon(
  variant: IconVariant,
  phase = 0,
  dotColor: string | null = null,
): Record<number, ImageData> {
  const key = cacheKey(variant, phase, dotColor);
  const hit = cache.get(key);
  if (hit) return hit;

  const big = renderMaster(variant, phase, dotColor);
  const out: Record<number, ImageData> = {};
  for (const size of SIZES) out[size] = downscale(big, size);

  cache.set(key, out);
  if (cache.size > 64) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return out;
}

function renderMaster(
  variant: IconVariant,
  phase: number,
  dotColor: string | null,
): OffscreenCanvas {
  const c = new OffscreenCanvas(RENDER, RENDER);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.clearRect(0, 0, RENDER, RENDER);

  const energy = energyFor(variant);

  // Tile geometry — a generous squircle with margin for the outer glow.
  const M = 11; // margin
  const S = RENDER - M * 2; // tile size
  const R = 22; // corner radius → squircle feel
  const cx = RENDER / 2;
  const cy = RENDER / 2;

  // Breathe: scale the whole tile a touch. Idle is dead-still (energy 0).
  const breathe = 1 + energy * 0.045 * (Math.sin(phase * Math.PI * 2) * 0.5 + 0.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(breathe, breathe);
  ctx.translate(-cx, -cy);

  // ---- Outer glow ---------------------------------------------------------
  // A soft colored halo so the mark separates from any toolbar background.
  // Muted teal halo, larger + warming toward mint only while working. Kept
  // tight so the glow doesn't bleed past the squircle and soften it at 16px.
  ctx.save();
  squircle(ctx, M, M, S, S, R);
  ctx.shadowColor = energy >= 1 ? 'rgba(110,231,183,0.42)' : 'rgba(45,212,191,0.3)';
  ctx.shadowBlur = 7 + energy * 6;
  ctx.fillStyle = INK_DEEP;
  ctx.fill();
  if (energy > 0) {
    ctx.shadowColor = 'rgba(20,184,166,0.3)';
    ctx.shadowBlur = 5 + energy * 5;
    ctx.fill();
  }
  ctx.restore();

  // ---- Aurora mesh (clipped to the tile) ----------------------------------
  ctx.save();
  squircle(ctx, M, M, S, S, R);
  ctx.clip();
  paintAurora(ctx, M, S, energy, phase);
  paintGlass(ctx, M, S, R);
  // Inner vignette — darkens the tile edges so the orb reads as a rounded
  // volume with form, not a flat patch of glow.
  const vg = ctx.createRadialGradient(cx, cy, S * 0.22, cx, cy, S * 0.62);
  vg.addColorStop(0, 'rgba(4,22,20,0)');
  vg.addColorStop(1, 'rgba(4,22,20,0.4)');
  ctx.fillStyle = vg;
  ctx.fillRect(M, M, S, S);
  ctx.restore();

  // Dual rim: a hairline dark seat for edge crispness, then a light keyline so
  // the squircle silhouette stays defined on both light and dark toolbars.
  squircle(ctx, M, M, S, S, R);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  squircle(ctx, M, M, S, S, R);
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  ctx.restore(); // breathe

  // ---- Variant overlays ----------------------------------------------------
  if (variant === 'success') drawCheckSpark(ctx);
  else if (variant === 'focus') drawFocusRing(ctx, cx, cy);

  if (dotColor) drawCornerDot(ctx, dotColor);

  return c;
}

/**
 * Fake a fluid mesh-gradient aurora with a handful of soft radial blobs blended
 * additively over the deep base. Blob centers ride Lissajous paths scaled by
 * `energy`, so the liquid morphs while working and sits still when idle.
 */
function paintAurora(
  ctx: OffscreenCanvasRenderingContext2D,
  m: number,
  s: number,
  energy: number,
  phase: number,
): void {
  // Deep vertical base: teal-black top → slightly lifted teal lower.
  const base = ctx.createLinearGradient(0, m, 0, m + s);
  base.addColorStop(0, INK_DEEP);
  base.addColorStop(1, '#0C3A33');
  ctx.fillStyle = base;
  ctx.fillRect(m, m, s, s);

  const t = phase * Math.PI * 2;
  const drift = energy * s * 0.16; // how far blobs wander
  const blobR = s * 0.62;

  type Blob = { bx: number; by: number; px: number; py: number; color: string; a: number };
  // Single-hue jade/teal family. Muted alphas keep it moody, not a lightbox.
  const blobs: Blob[] = [
    { bx: 0.32, by: 0.30, px: 1.0, py: 0.7, color: JADE, a: 0.72 },
    { bx: 0.64, by: 0.74, px: -0.8, py: 1.0, color: TEAL, a: 0.72 },
    { bx: 0.74, by: 0.36, px: 0.9, py: -0.9, color: EMERALD, a: 0.62 },
    { bx: 0.30, by: 0.68, px: -1.0, py: -0.7, color: MINT, a: 0.5 },
  ];

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i]!;
    const ph = t + (i * Math.PI) / 2;
    const x = m + b.bx * s + Math.cos(ph) * b.px * drift;
    const y = m + b.by * s + Math.sin(ph) * b.py * drift;
    const g = ctx.createRadialGradient(x, y, 1, x, y, blobR);
    g.addColorStop(0, withAlpha(b.color, b.a));
    g.addColorStop(0.55, withAlpha(b.color, b.a * 0.35));
    g.addColorStop(1, withAlpha(b.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(m, m, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Subtle inner shade at the bottom to ground the orb.
  const shade = ctx.createLinearGradient(0, m + s * 0.55, 0, m + s);
  shade.addColorStop(0, 'rgba(6,32,30,0)');
  shade.addColorStop(1, 'rgba(6,32,30,0.4)');
  ctx.fillStyle = shade;
  ctx.fillRect(m, m, s, s);
}

/** Glass: a bright top-left sheen + a thin specular edge along the top. */
function paintGlass(
  ctx: OffscreenCanvasRenderingContext2D,
  m: number,
  s: number,
  _r: number,
): void {
  // Broad diagonal sheen — muted so the tile reads as deep glass, not a lamp.
  const sheen = ctx.createLinearGradient(m, m, m + s * 0.7, m + s * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.4, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(m, m, s, s);

  // Specular top edge — the wet-glass kicker.
  const edge = ctx.createLinearGradient(0, m, 0, m + s * 0.18);
  edge.addColorStop(0, 'rgba(255,255,255,0.36)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(m, m, s, s * 0.18);
}

function drawCheckSpark(ctx: OffscreenCanvasRenderingContext2D): void {
  // Jade pip, top-right, glass check. Success glows in the brand hue.
  const x = 62;
  const y = 16;
  ctx.save();
  ctx.shadowColor = 'rgba(45,212,191,0.7)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = JADE;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = GLASS;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 0.5);
  ctx.lineTo(x - 1.5, y + 5);
  ctx.lineTo(x + 6.5, y - 5);
  ctx.stroke();
}

function drawFocusRing(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.strokeStyle = GLASS;
  ctx.lineWidth = 3.4;
  ring(ctx, cx, cy, 18);
  ctx.lineWidth = 2.6;
  ring(ctx, cx, cy, 9);
  ctx.fillStyle = GLASS;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCornerDot(ctx: OffscreenCanvasRenderingContext2D, color: string): void {
  const x = 65;
  const y = 65;
  const r = 11;
  ctx.fillStyle = INK_DEEP;
  ctx.beginPath();
  ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(x - 3.5, y - 3.5, 0.5, x - 3.5, y - 3.5, r);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---- primitives ------------------------------------------------------------

function downscale(src: OffscreenCanvas, size: number): ImageData {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(src, 0, 0, RENDER, RENDER, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

/** Rounded-rect path tuned toward a squircle by the caller's radius. */
function squircle(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ring(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Expand a #rrggbb hex to an rgba() string with the given alpha. */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
