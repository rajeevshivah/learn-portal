import { getStroke } from 'perfect-freehand';

// ── Whiteboard engine: page model, drawing, erasing, PDF export ──
// Every page is a fixed 1600 x 900 sheet (16:9), so it fits a laptop screen,
// a Meet screen-share and a landscape PDF page without reflowing.

export const W = 1600;
export const H = 900;

export const BG = { dark: '#0E1626', light: '#FBFAF6' };
// Same hue in the same slot on both boards, so switching board colour or
// exporting on white paper keeps every colour's meaning.
export const INK = {
  dark:  ['#F3F5F9', '#FFD54A', '#5CC8FF', '#6EE7A0', '#FF7A9A', '#C3A6FF'],
  light: ['#1B1F2A', '#B45309', '#1F5FD6', '#13804A', '#D23B3B', '#7A3FD0'],
};
export const COLOR_NAMES = ['White', 'Yellow', 'Blue', 'Green', 'Pink', 'Lavender'];
export const COLOR_NAMES_LIGHT = ['Black', 'Amber', 'Blue', 'Green', 'Red', 'Purple'];

export const SIZES = {
  pen:   [2.5, 5, 10],
  hl:    [16, 26, 40],
  shape: [2.5, 5, 9],
  text:  [26, 38, 56],
  erase: [10, 22, 44],
};

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

// ── Colour mapping between dark board and white paper ──
// A colour picked on one background keeps its slot on the other.
export function mapInk(color, from, to) {
  if (from === to) return color;
  const i = INK[from].indexOf(color);
  if (i >= 0) return INK[to][i];
  const j = INK[to].indexOf(color);
  return j >= 0 ? color : INK[to][0];
}

// ── Stroke geometry ──
const pts3 = (p) => { const out = []; for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]); return out; };

function svgPath(outline) {
  if (!outline.length) return '';
  const d = outline.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', ...outline[0], 'Q']);
  d.push('Z');
  return d.map(v => (typeof v === 'number' ? r2(v) : v)).join(' ');
}

const pathCache = new WeakMap();
function penPath(s) {
  let path = pathCache.get(s);
  if (path) return path;
  const outline = getStroke(pts3(s.p), {
    size: s.s * 2,
    thinning: s.m ? 0.62 : 0.5,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: !s.m,
    last: true,
    start: { taper: 0, cap: true },
    end: { taper: s.m ? 0 : 4, cap: true },
  });
  path = new Path2D(svgPath(outline));
  pathCache.set(s, path);
  return path;
}

function polyline(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length <= 3) ctx.lineTo(p[0] + 0.01, p[1]);
  for (let i = 3; i < p.length; i += 3) {
    // midpoint smoothing keeps fast highlighter strokes from looking jagged
    const mx = (p[i - 3] + p[i]) / 2, my = (p[i - 2] + p[i + 1]) / 2;
    ctx.quadraticCurveTo(p[i - 3], p[i - 2], mx, my);
  }
  if (p.length > 3) ctx.lineTo(p[p.length - 3], p[p.length - 2]);
}

const textLines = (s) => String(s.tx || '').split('\n');
export const textFont = (size) => `500 ${size}px "Inter", system-ui, sans-serif`;

function textBox(s) {
  const lines = textLines(s);
  const wMax = Math.max(...lines.map(l => l.length), 1) * s.s * 0.56;
  return { x: s.x, y: s.y, w: wMax, h: lines.length * s.s * 1.3 };
}

// ── Draw one stroke ──
export function drawStroke(ctx, s, bg, remapTo) {
  const color = remapTo ? mapInk(s.c, bg, remapTo) : s.c;
  const onBg = remapTo || bg;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (s.t) {
    case 'pen':
      ctx.fillStyle = color;
      ctx.fill(penPath(s));
      break;
    case 'hl':
      ctx.globalAlpha = onBg === 'dark' ? 0.34 : 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = s.s;
      polyline(ctx, s.p);
      ctx.stroke();
      break;
    case 'line':
    case 'arrow': {
      const [x1, y1, , x2, y2] = s.p;
      ctx.strokeStyle = color; ctx.lineWidth = s.s;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (s.t === 'arrow') {
        const a = Math.atan2(y2 - y1, x2 - x1), len = Math.max(16, s.s * 4.2);
        ctx.beginPath();
        ctx.moveTo(x2 - len * Math.cos(a - 0.45), y2 - len * Math.sin(a - 0.45));
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - len * Math.cos(a + 0.45), y2 - len * Math.sin(a + 0.45));
        ctx.stroke();
      }
      break;
    }
    case 'rect': {
      const [x1, y1, , x2, y2] = s.p;
      ctx.strokeStyle = color; ctx.lineWidth = s.s;
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      break;
    }
    case 'ellipse': {
      const [x1, y1, , x2, y2] = s.p;
      ctx.strokeStyle = color; ctx.lineWidth = s.s;
      ctx.beginPath();
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.fillStyle = color;
      ctx.font = textFont(s.s);
      ctx.textBaseline = 'top';
      textLines(s).forEach((l, i) => ctx.fillText(l, s.x, s.y + i * s.s * 1.3));
      break;
    }
    default:
  }
  ctx.restore();
}

// ── Background + pattern ──
export function drawBackground(ctx, page, remapTo) {
  const bg = remapTo || page.bg;
  ctx.fillStyle = BG[bg];
  ctx.fillRect(0, 0, W, H);
  if (page.pattern === 'plain') return;
  ctx.save();
  ctx.strokeStyle = bg === 'dark' ? 'rgba(160, 185, 230, 0.10)' : 'rgba(40, 70, 120, 0.12)';
  ctx.fillStyle = bg === 'dark' ? 'rgba(160, 185, 230, 0.22)' : 'rgba(40, 70, 120, 0.25)';
  ctx.lineWidth = 1;
  if (page.pattern === 'grid') {
    ctx.beginPath();
    for (let x = 50; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 50; y < H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (page.pattern === 'lines') {
    ctx.beginPath();
    for (let y = 90; y < H; y += 56) { ctx.moveTo(60, y); ctx.lineTo(W - 60, y); }
    ctx.stroke();
  } else if (page.pattern === 'dots') {
    for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) { ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); }
  }
  ctx.restore();
}

export function drawPage(ctx, page, { remapTo } = {}) {
  drawBackground(ctx, page, remapTo);
  for (const s of page.strokes) drawStroke(ctx, s, page.bg, remapTo);
}

// ── Eraser hit testing ──
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function outlineSegments(s) {
  const [x1, y1, , x2, y2] = s.p || [];
  if (s.t === 'line' || s.t === 'arrow') return [[x1, y1, x2, y2]];
  if (s.t === 'rect') return [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]];
  if (s.t === 'ellipse') {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    const out = []; let px = cx + rx, py = cy;
    for (let i = 1; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2, nx = cx + rx * Math.cos(a), ny = cy + ry * Math.sin(a);
      out.push([px, py, nx, ny]); px = nx; py = ny;
    }
    return out;
  }
  const p = s.p, out = [];
  if (p.length <= 3) return [[p[0], p[1], p[0], p[1]]];
  for (let i = 3; i < p.length; i += 3) out.push([p[i - 3], p[i - 2], p[i], p[i + 1]]);
  return out;
}

export function hits(s, x, y, r) {
  if (s.t === 'text') {
    const b = textBox(s);
    return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
  }
  const reach = r + (s.t === 'pen' ? s.s : s.s / 2);
  return outlineSegments(s).some(([a, b, c, d]) => segDist(x, y, a, b, c, d) <= reach);
}

// ── Point helpers for the app ──
export const pushPoint = (arr, x, y, pr) => { arr.push(r1(x), r1(y), r2(pr)); };

// ── PDF of all pages ──
export async function makePdf(pages, { title = 'Whiteboard notes', paper = false, onProgress } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540], compress: true });
  const canvas = document.createElement('canvas');
  const scale = 1.25;   // 2000 x 1125: sharp on phones, small enough to download
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (document.fonts?.ready) await document.fonts.ready;
  for (let i = 0; i < pages.length; i++) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawPage(ctx, pages[i], { remapTo: paper ? 'light' : undefined });
    // page number, bottom right
    ctx.font = textFont(18);
    ctx.fillStyle = (paper ? 'light' : pages[i].bg) === 'dark' ? 'rgba(220,230,245,.45)' : 'rgba(30,40,60,.45)';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right';
    ctx.fillText(`${i + 1} / ${pages.length}`, W - 28, H - 22);
    ctx.textAlign = 'left';
    if (i > 0) doc.addPage([960, 540], 'landscape');
    doc.addImage(canvas.toDataURL('image/jpeg', 0.84), 'JPEG', 0, 0, 960, 540, undefined, 'FAST');
    onProgress?.(i + 1, pages.length);
    await new Promise(r => setTimeout(r, 0));   // keep the page responsive
  }
  doc.setProperties({ title, creator: 'codeWithShivah whiteboard' });
  return doc;
}
