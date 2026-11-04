import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import {
  W, H, INK, COLOR_NAMES, COLOR_NAMES_LIGHT, SIZES,
  drawPage, drawStroke, hits, pushPoint, mapInk, makePdf, textFont,
} from '../lib/board';
import '../styles/board.css';

const API = import.meta.env.VITE_API_URL;
const PATTERNS = ['plain', 'grid', 'lines', 'dots'];
const PATTERN_NAMES = { plain: 'Plain', grid: 'Grid', lines: 'Ruled', dots: 'Dots' };
const SHAPES = ['line', 'arrow', 'rect', 'ellipse'];
const sizeKind = (tool) => (tool === 'pen' ? 'pen' : tool === 'hl' ? 'hl' : tool === 'erase' ? 'erase' : tool === 'text' ? 'text' : 'shape');
const backupKey = (boardId, pageId) => `board:${boardId}:${pageId}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: server copy still exists */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ── Icons (24px grid, stroke-based) ──
const I = {
  pen: <path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z M13.5 7l3.5 3.5" />,
  hl: <path d="M7 15l-3 5h6l1.5-2.5 M7 15l8.5-9.5a2 2 0 0 1 2.9-.1l.2.2a2 2 0 0 1-.1 2.9L9 17z" />,
  erase: <path d="M9 20h11 M4.6 14.6l7.8-7.8a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L12 19H8.4z M8.5 10.7l5.8 5.8" />,
  laser: <><circle cx="17.5" cy="6.5" r="2.5" /><path d="M15.5 8.5L4 20" /></>,
  text: <path d="M5 6V4.5h14V6 M12 4.5V19.5 M9 19.5h6" />,
  line: <path d="M5 19L19 5" />,
  arrow: <path d="M5 19L19 5 M10 5h9v9" />,
  rect: <rect x="4.5" y="6.5" width="15" height="11" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  undo: <path d="M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3" />,
  pages: <><rect x="4" y="5" width="7" height="6" rx="1" /><rect x="13" y="5" width="7" height="6" rx="1" /><rect x="4" y="13" width="7" height="6" rx="1" /><rect x="13" y="13" width="7" height="6" rx="1" /></>,
  full: <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />,
  prev: <path d="M14.5 6l-6 6 6 6" />,
  next: <path d="M9.5 6l6 6-6 6" />,
  plus: <path d="M12 5v14 M5 12h14" />,
  close: <path d="M6 6l12 12 M18 6L6 18" />,
  keys: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01 M11 10h.01 M15 10h.01 M8 14h8" /></>,
};
const Icon = ({ name }) => <svg viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>;

// ── Page thumbnail ──
function Thumb({ page, version }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    drawPage(ctx, page);
  }, [page, version]);
  return <canvas ref={ref} width={192} height={108} className="wb-thumb-cv" />;
}

export default function Whiteboard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [idx, setIdx] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [tool, setTool] = useState('pen');
  const [shape, setShape] = useState('arrow');
  const [colorIdx, setColorIdx] = useState(0);
  const [sizes, setSizes] = useState({ pen: 1, hl: 1, erase: 1, text: 1, shape: 1 });
  const [status, setStatus] = useState('saved');
  const [showPages, setShowPages] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [publish, setPublish] = useState(null);       // { paper, busy, progress }
  const [textEdit, setTextEdit] = useState(null);     // { x, y, value }
  const [toast, setToast] = useState('');
  const [versions, setVersions] = useState({});
  const [, setTick] = useState(0);                     // re-render after page edits (bg, history)
  const [titleDraft, setTitleDraft] = useState('');

  const pagesRef = useRef([]);
  const histRef = useRef(new Map());
  const dirtyRef = useRef(new Set());
  const saveTimer = useRef(null);
  const retryTimer = useRef(null);
  const savingRef = useRef(false);
  const baseRef = useRef(null);
  const liveRef = useRef(null);
  const surfRef = useRef(null);
  const geo = useRef({ k: 1, cw: W, ch: H, dpr: 1 });
  const drawRef = useRef(null);     // gesture in progress
  const hoverRef = useRef(null);    // pointer position for the cursor
  const laserRef = useRef([]);
  const rafRef = useRef(0);
  const penSeen = useRef(false);
  const textRef = useRef(null);
  const stateRef = useRef({});

  const page = pagesRef.current[idx];
  const bg = page?.bg || 'dark';
  const kind = sizeKind(tool);
  const size = SIZES[kind][sizes[kind]];
  const color = INK[bg][colorIdx];
  stateRef.current = { tool, shape, color, size, sizes, colorIdx, idx, bg, textEdit };

  // ── Load ──
  useEffect(() => {
    axios.get(`${API}/boards/${id}`).then(({ data }) => {
      let restored = 0;
      const pages = data.pages.map(p => {
        const local = store.get(backupKey(id, p._id));
        if (local && local.at > new Date(p.updatedAt).getTime() && Array.isArray(local.strokes)) {
          restored++; dirtyRef.current.add(p._id);
          return { ...p, strokes: local.strokes, bg: local.bg || p.bg, pattern: local.pattern || p.pattern };
        }
        return p;
      });
      pagesRef.current = pages;
      setPageCount(pages.length);
      setMeta(data);
      setTitleDraft(data.title);
      if (restored) { setStatus('unsaved'); setToast(`Restored unsaved work on ${restored} page${restored > 1 ? 's' : ''} from this laptop`); scheduleSave(200); }
    }).catch(e => setError(e.response?.data?.message || 'Could not open this board'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Saving ──
  const flush = useCallback(async () => {
    if (savingRef.current) return false;
    const ids = [...dirtyRef.current];
    if (!ids.length) { setStatus('saved'); return true; }
    savingRef.current = true;
    setStatus('saving');
    let ok = true;
    for (const pid of ids) {
      const p = pagesRef.current.find(x => x._id === pid);
      if (!p) { dirtyRef.current.delete(pid); continue; }
      const sent = p.strokes;
      try {
        await axios.put(`${API}/boards/${id}/pages/${pid}`, { strokes: sent, bg: p.bg, pattern: p.pattern });
        if (p.strokes === sent) { dirtyRef.current.delete(pid); store.del(backupKey(id, pid)); }
      } catch (e) {
        ok = false;
        if (e.response?.status === 400) setToast(e.response.data?.message || 'Could not save this page');
      }
    }
    savingRef.current = false;
    if (!ok) {
      setStatus('offline');
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => flush(), 5000);
    } else setStatus(dirtyRef.current.size ? 'unsaved' : 'saved');
    if (ok && dirtyRef.current.size) scheduleSave(400);
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const scheduleSave = (ms = 1200) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush(), ms);
  };

  const markDirty = (p) => {
    dirtyRef.current.add(p._id);
    store.set(backupKey(id, p._id), { at: Date.now(), strokes: p.strokes, bg: p.bg, pattern: p.pattern });
    setStatus(s => (s === 'offline' ? s : 'unsaved'));
    setVersions(v => ({ ...v, [p._id]: (v[p._id] || 0) + 1 }));
    scheduleSave();
  };

  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(saveTimer.current); clearTimeout(retryTimer.current); };
  }, []);

  // ── History ──
  const hist = (pid) => {
    if (!histRef.current.has(pid)) histRef.current.set(pid, { undo: [], redo: [] });
    return histRef.current.get(pid);
  };
  const remember = (p, before) => {
    const h = hist(p._id);
    h.undo.push(before);
    if (h.undo.length > 150) h.undo.shift();
    h.redo = [];
  };
  const undo = () => {
    const p = pagesRef.current[stateRef.current.idx]; if (!p) return;
    const h = hist(p._id); if (!h.undo.length) return;
    h.redo.push(p.strokes); p.strokes = h.undo.pop();
    redrawBase(); markDirty(p); setTick(t => t + 1);
  };
  const redo = () => {
    const p = pagesRef.current[stateRef.current.idx]; if (!p) return;
    const h = hist(p._id); if (!h.redo.length) return;
    h.undo.push(p.strokes); p.strokes = h.redo.pop();
    redrawBase(); markDirty(p); setTick(t => t + 1);
  };

  // ── Canvas layout ──
  const layout = useCallback(() => {
    const surf = surfRef.current; if (!surf) return;
    const box = surf.parentElement.getBoundingClientRect();
    const cw = Math.floor(Math.min(box.width, box.height * (W / H)));
    const ch = Math.floor(cw * (H / W));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    geo.current = { k: cw / W, cw, ch, dpr };
    surf.style.width = `${cw}px`; surf.style.height = `${ch}px`;
    for (const c of [baseRef.current, liveRef.current]) {
      if (!c) continue;
      c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
      c.getContext('2d').setTransform(geo.current.k * dpr, 0, 0, geo.current.k * dpr, 0, 0);
    }
    redrawBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redrawBase = () => {
    const c = baseRef.current; const p = pagesRef.current[stateRef.current.idx];
    if (!c || !p) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(geo.current.k * geo.current.dpr, 0, 0, geo.current.k * geo.current.dpr, 0, 0);
    drawPage(ctx, p);
  };

  useLayoutEffect(() => {
    if (!meta) return;
    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(surfRef.current.parentElement);
    return () => ro.disconnect();
  }, [meta, layout]);

  useEffect(() => { redrawBase(); drawLive(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idx, meta]);

  // ── Live layer: stroke in progress, laser, cursor ──
  const drawLive = () => {
    const c = liveRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const { k, dpr } = geo.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    const st = stateRef.current;
    const g = drawRef.current;
    if (g?.stroke) drawStroke(ctx, { ...g.stroke }, st.bg);

    // Laser trail: fades over 0.7 s
    const now = performance.now();
    const trail = laserRef.current = laserRef.current.filter(pt => now - pt.t < 700);
    if (trail.length) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = '#FF2D55'; ctx.shadowBlur = 14;
      for (let i = 1; i < trail.length; i++) {
        const a = 1 - (now - trail[i].t) / 700;
        if (trail[i].gap) continue;
        ctx.strokeStyle = `rgba(255, 64, 100, ${a})`;
        ctx.lineWidth = 5 * a + 1;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
      ctx.restore();
    }

    // Cursor
    const hv = hoverRef.current;
    if (hv && !st.textEdit) {
      ctx.save();
      if (st.tool === 'erase' || g?.erase) {
        ctx.strokeStyle = st.bg === 'dark' ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.6)';
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath(); ctx.arc(hv.x, hv.y, SIZES.erase[st.sizes.erase] / 2, 0, Math.PI * 2); ctx.stroke();
      } else if (st.tool === 'laser') {
        ctx.fillStyle = '#FF4064'; ctx.shadowColor = '#FF2D55'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(hv.x, hv.y, 7, 0, Math.PI * 2); ctx.fill();
      } else if (st.tool !== 'text' && !g) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = st.tool === 'hl' ? 0.45 : 0.9;
        ctx.beginPath(); ctx.arc(hv.x, hv.y, Math.max(2, st.size / 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (trail.length) scheduleLive();
  };
  const scheduleLive = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawLive(); });
  };

  // ── Pointer input ──
  const pos = (e) => {
    const r = liveRef.current.getBoundingClientRect();
    const k = geo.current.k;
    return { x: Math.max(0, Math.min(W, (e.clientX - r.left) / k)), y: Math.max(0, Math.min(H, (e.clientY - r.top) / k)) };
  };
  const pressure = (e) => (e.pointerType === 'pen' ? Math.max(0.08, e.pressure || 0.5) : 0.5);

  const eraseAt = (g, x, y) => {
    const p = pagesRef.current[stateRef.current.idx];
    const r = SIZES.erase[stateRef.current.sizes.erase] / 2;
    const keep = p.strokes.filter(s => !hits(s, x, y, r));
    if (keep.length !== p.strokes.length) { p.strokes = keep; g.changed = true; redrawBase(); }
  };

  const onDown = (e) => {
    if (e.pointerType === 'pen') penSeen.current = true;
    if (e.pointerType === 'touch' && penSeen.current) return;   // palm rejection once a pen is used
    if (e.button !== 0 && e.button !== 5 && e.pointerType !== 'pen') return;
    const st = stateRef.current;
    const p = pagesRef.current[st.idx]; if (!p) return;
    setShowShapes(false);
    const { x, y } = pos(e);

    if (st.textEdit) { commitText(); return; }

    // The pen's eraser end (or barrel button mapped to eraser) erases.
    const penEraser = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32));
    let t = penEraser ? 'erase' : st.tool;
    if (t === 'pen' && e.shiftKey) t = 'line';

    if (t === 'text') {
      const hit = [...p.strokes].reverse().find(s => s.t === 'text' && hits(s, x, y, 4));
      if (hit) {   // edit existing text
        const before = p.strokes;
        p.strokes = p.strokes.filter(s => s !== hit); redrawBase();
        setTextEdit({ x: hit.x, y: hit.y, value: hit.tx, size: hit.s, color: hit.c, before });
      } else {
        setTextEdit({ x, y: Math.max(0, y - st.size * 0.6), value: '', size: st.size, color: st.color });
      }
      e.preventDefault();
      return;
    }

    try { liveRef.current.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const g = { id: e.pointerId, before: p.strokes };
    if (t === 'erase') { g.erase = true; eraseAt(g, x, y); }
    else if (t === 'laser') { g.laser = true; laserRef.current.push({ x, y, t: performance.now(), gap: true }); }
    else if (t === 'pen' || t === 'hl') {
      g.stroke = { t, c: st.color, s: st.size, p: [], ...(e.pointerType === 'pen' && t === 'pen' ? { m: 1 } : {}) };
      pushPoint(g.stroke.p, x, y, pressure(e));
    } else {
      const sh = t === 'shape' ? st.shape : t;
      g.stroke = { t: sh, c: st.color, s: SIZES.shape[st.sizes.shape], p: [x, y, 1, x, y, 1] };
      g.shapeStart = { x, y };
    }
    drawRef.current = g;
    hoverRef.current = { x, y };
    drawLive();
  };

  const onMove = (e) => {
    if (e.pointerType === 'touch' && penSeen.current) return;
    const { x, y } = pos(e);
    hoverRef.current = { x, y };
    const g = drawRef.current;
    if (!g || g.id !== e.pointerId) {
      if (stateRef.current.tool === 'laser' && e.pointerType !== 'touch') {
        laserRef.current.push({ x, y, t: performance.now() });
      }
      scheduleLive();
      return;
    }
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) {
      const q = pos(ev);
      if (g.erase) eraseAt(g, q.x, q.y);
      else if (g.laser) laserRef.current.push({ x: q.x, y: q.y, t: performance.now() });
      else if (g.stroke.t === 'pen' || g.stroke.t === 'hl') {
        const pts = g.stroke.p;
        const lx = pts[pts.length - 3], ly = pts[pts.length - 2];
        if (Math.hypot(q.x - lx, q.y - ly) >= 0.8) pushPoint(pts, q.x, q.y, pressure(ev));
      } else {
        let ex = q.x, ey = q.y;
        if (ev.shiftKey && (g.stroke.t === 'line' || g.stroke.t === 'arrow')) {   // snap to 45°
          const a = Math.round(Math.atan2(ey - g.shapeStart.y, ex - g.shapeStart.x) / (Math.PI / 4)) * (Math.PI / 4);
          const d = Math.hypot(ex - g.shapeStart.x, ey - g.shapeStart.y);
          ex = g.shapeStart.x + d * Math.cos(a); ey = g.shapeStart.y + d * Math.sin(a);
        } else if (ev.shiftKey) {   // square / circle
          const d = Math.max(Math.abs(ex - g.shapeStart.x), Math.abs(ey - g.shapeStart.y));
          ex = g.shapeStart.x + Math.sign(ex - g.shapeStart.x || 1) * d; ey = g.shapeStart.y + Math.sign(ey - g.shapeStart.y || 1) * d;
        }
        g.stroke.p = [g.shapeStart.x, g.shapeStart.y, 1, Math.round(ex * 10) / 10, Math.round(ey * 10) / 10, 1];
      }
    }
    scheduleLive();
  };

  const onUp = (e) => {
    const g = drawRef.current;
    if (!g || g.id !== e.pointerId) return;
    drawRef.current = null;
    const p = pagesRef.current[stateRef.current.idx];
    if (g.erase) {
      if (g.changed) { remember(p, g.before); markDirty(p); setTick(t => t + 1); }
    } else if (g.stroke) {
      const s = g.stroke;
      const tiny = s.t !== 'pen' && s.t !== 'hl' && Math.hypot(s.p[3] - s.p[0], s.p[4] - s.p[1]) < 4;
      if (!tiny) {
        const before = p.strokes;
        p.strokes = [...before, s];
        remember(p, before);
        const ctx = baseRef.current.getContext('2d');
        drawStroke(ctx, s, p.bg);
        markDirty(p);
        setTick(t => t + 1);
      }
    }
    drawLive();
  };

  const onLeave = () => { if (!drawRef.current) { hoverRef.current = null; drawLive(); } };

  // ── Text ──
  const commitText = () => {
    const te = stateRef.current.textEdit; if (!te) return;
    stateRef.current.textEdit = null;   // blur + click can both land here: commit once
    const p = pagesRef.current[stateRef.current.idx];
    const value = (textRef.current?.value ?? te.value).replace(/\s+$/, '');
    const before = te.before || p.strokes;
    if (value) {
      p.strokes = [...p.strokes, { t: 'text', x: Math.round(te.x), y: Math.round(te.y), c: te.color, s: te.size, tx: value }];
    }
    if (value || te.before) { remember(p, before); markDirty(p); }
    setTextEdit(null);
    redrawBase();
  };
  useEffect(() => { if (textEdit) setTimeout(() => textRef.current?.focus(), 0); }, [textEdit]);

  // ── Pages ──
  const go = (i) => {
    if (stateRef.current.textEdit) commitText();
    const n = pagesRef.current.length;
    if (i < 0 || i >= n) return;
    setIdx(i);
  };
  const addPage = async (copy = false) => {
    const cur = pagesRef.current[idx];
    try {
      await flush();
      const { data } = await axios.post(`${API}/boards/${id}/pages`, {
        after: cur?._id, bg: cur?.bg, pattern: cur?.pattern, ...(copy ? { strokes: cur.strokes } : {}),
      });
      pagesRef.current.splice(idx + 1, 0, { ...data, strokes: data.strokes || [] });
      setPageCount(pagesRef.current.length);
      go(idx + 1);
    } catch (e) { setToast(e.response?.data?.message || 'Could not add a page. Check your internet.'); }
  };
  const deletePage = async () => {
    const cur = pagesRef.current[idx];
    if (pagesRef.current.length <= 1) { setToast('A board needs at least one page'); return; }
    if (cur.strokes.length && !window.confirm(`Delete page ${idx + 1}? This can’t be undone.`)) return;
    try {
      await axios.delete(`${API}/boards/${id}/pages/${cur._id}`);
      dirtyRef.current.delete(cur._id); store.del(backupKey(id, cur._id));
      pagesRef.current.splice(idx, 1);
      setPageCount(pagesRef.current.length);
      const next = Math.max(0, idx - 1);
      if (next === idx) { redrawBase(); setTick(t => t + 1); } else setIdx(next);
    } catch (e) { setToast(e.response?.data?.message || 'Could not delete the page'); }
  };
  const movePage = async (dir) => {
    const j = idx + dir; const arr = pagesRef.current;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setIdx(j);
    try { await axios.put(`${API}/boards/${id}/order`, { pageOrder: arr.map(p => p._id) }); }
    catch (e) { setToast(e.response?.data?.message || 'Could not reorder pages'); }
  };
  const clearPage = () => {
    const p = pagesRef.current[idx];
    if (!p?.strokes.length) return;
    remember(p, p.strokes); p.strokes = []; redrawBase(); markDirty(p); setTick(t => t + 1);
    setToast('Page cleared. Ctrl+Z brings it back.');
  };
  const toggleBg = () => {
    const p = pagesRef.current[idx]; if (!p) return;
    const to = p.bg === 'dark' ? 'light' : 'dark';
    const before = p.strokes;
    p.strokes = before.map(s => ({ ...s, c: mapInk(s.c, p.bg, to) }));
    p.bg = to;
    remember(p, before);
    redrawBase(); markDirty(p); setTick(t => t + 1);
  };
  const cyclePattern = () => {
    const p = pagesRef.current[idx]; if (!p) return;
    p.pattern = PATTERNS[(PATTERNS.indexOf(p.pattern) + 1) % PATTERNS.length];
    redrawBase(); markDirty(p); setTick(t => t + 1);
  };

  const pickTool = (t) => { if (stateRef.current.textEdit) commitText(); setTool(t); setShowShapes(false); };
  const bumpSize = (d) => setSizes(s => ({ ...s, [kind]: Math.max(0, Math.min(2, s[kind] + d)) }));
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => setToast('Fullscreen is blocked in this browser'));
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        if (e.key === 'Escape' && e.target === textRef.current) { e.preventDefault(); commitText(); }
        return;
      }
      if (publish) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 's') { e.preventDefault(); flush(); return; }
      if (mod) return;
      const map = { p: 'pen', h: 'hl', e: 'erase', l: 'laser', t: 'text' };
      if (map[k]) { pickTool(map[k]); return; }
      const shapeKeys = { i: 'line', a: 'arrow', r: 'rect', o: 'ellipse' };
      if (shapeKeys[k]) { setShape(shapeKeys[k]); pickTool('shape'); return; }
      if (k >= '1' && k <= '6') { setColorIdx(Number(k) - 1); if (['erase', 'laser'].includes(stateRef.current.tool)) pickTool('pen'); return; }
      if (k === '[') { bumpSize(-1); return; }
      if (k === ']') { bumpSize(1); return; }
      if (k === 'n') { addPage(); return; }
      if (k === 'arrowright' || k === 'pagedown') { e.preventDefault(); go(stateRef.current.idx + 1); return; }
      if (k === 'arrowleft' || k === 'pageup') { e.preventDefault(); go(stateRef.current.idx - 1); return; }
      if (k === 'f') { fullscreen(); return; }
      if (k === 'b') { toggleBg(); return; }
      if (k === 'g') { cyclePattern(); return; }
      if (k === 'u') { setUiHidden(v => !v); return; }
      if (k === '?') { setShowKeys(v => !v); return; }
      if (k === 'escape') { setShowKeys(false); setShowShapes(false); setShowPages(false); return; }
      if (k === 'delete') { clearPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Publish ──
  const exportPdf = async (upload) => {
    if (stateRef.current.textEdit) commitText();
    const paper = publish?.paper;
    setPublish(p => ({ ...p, busy: upload ? 'publish' : 'download', progress: 0 }));
    try {
      await flush();
      const pages = pagesRef.current.filter((p, i) => p.strokes.length || i === 0);
      const doc = await makePdf(pages, {
        title: meta.title, paper,
        onProgress: (n, of) => setPublish(p => ({ ...p, progress: Math.round((n / of) * 100) })),
      });
      const filename = `${meta.title.replace(/[^\w\- ]+/g, '').trim() || 'whiteboard'}.pdf`;
      if (!upload) { doc.save(filename); setPublish(p => ({ ...p, busy: '' })); return; }
      const fd = new FormData();
      fd.append('file', new File([doc.output('blob')], filename, { type: 'application/pdf' }));
      fd.append('pages', String(pages.length));
      const { data } = await axios.post(`${API}/boards/${id}/notes`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMeta(m => ({ ...m, notes: { ...data.notes } }));
      setPublish(null);
      setToast(data.where === 'class+lesson'
        ? 'Notes published. Students see them in the class and under the recording.'
        : data.where === 'class' ? 'Notes published to the class. They’ll also appear under the recording once you add it.'
          : 'Notes saved');
    } catch (e) {
      setPublish(p => ({ ...p, busy: '' }));
      setToast(e.response?.data?.message || 'Could not make the notes. Try again.');
    }
  };

  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (!t || t === meta.title) { setTitleDraft(meta.title); return; }
    try { await axios.put(`${API}/boards/${id}`, { title: t }); setMeta(m => ({ ...m, title: t })); }
    catch { setTitleDraft(meta.title); setToast('Could not rename'); }
  };

  const exit = async () => { await flush(); navigate(meta?.event ? '/admin?tab=today' : '/admin/boards'); };

  if (error) return <div className="wb-error"><p>{error}</p><button className="btn btn-ghost" onClick={() => navigate('/admin/boards')}>All boards</button></div>;
  if (!meta || !page) return <div className="wb-root wb-loading">Opening board…</div>;

  const h = histRef.current.get(page._id);
  const names = bg === 'dark' ? COLOR_NAMES : COLOR_NAMES_LIGHT;
  const statusText = { saved: 'Saved', saving: 'Saving…', unsaved: 'Saving soon', offline: 'Offline. Kept on this laptop' }[status];
  const { k } = geo.current;

  const ToolBtn = ({ t, label, keyHint, icon }) => (
    <button type="button" className={`wb-tool ${tool === t ? 'on' : ''}`} onClick={() => pickTool(t)}
      aria-pressed={tool === t} aria-label={label} title={`${label} (${keyHint})`}>
      <Icon name={icon || t} />
    </button>
  );

  return (
    <div className={`wb-root ${uiHidden ? 'ui-hidden' : ''} ${bg}`}>
      {/* ── Top bar ── */}
      <header className="wb-top">
        <button type="button" className="wb-icon-btn" onClick={exit} aria-label="Close board" title="Close board"><Icon name="close" /></button>
        <div className="wb-title-wrap">
          <input className="wb-title" value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Board title" />
          {meta.session && <span className="wb-class">Class {meta.session.number}, {meta.event.title}</span>}
        </div>
        <span className={`wb-status ${status}`} role="status">{statusText}</span>
        <div className="wb-top-actions">
          <button type="button" className="wb-icon-btn" onClick={() => setShowKeys(v => !v)} aria-label="Keyboard shortcuts" title="Shortcuts (?)"><Icon name="keys" /></button>
          <button type="button" className="wb-icon-btn" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (F)"><Icon name="full" /></button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPublish({ paper: false, busy: '', progress: 0 })}>
            {meta.notes ? 'Update notes' : 'Publish notes'}
          </button>
        </div>
      </header>

      {/* ── Tool rail ── */}
      <aside className="wb-rail" aria-label="Tools">
        <ToolBtn t="pen" label="Pen" keyHint="P" />
        <ToolBtn t="hl" label="Highlighter" keyHint="H" />
        <ToolBtn t="erase" label="Eraser" keyHint="E" />
        <div className="wb-shape-wrap">
          <button type="button" className={`wb-tool ${tool === 'shape' ? 'on' : ''}`} aria-label={`Shapes, ${shape}`} title="Shapes (I line, A arrow, R box, O circle)"
            onClick={() => { if (tool === 'shape') setShowShapes(v => !v); else { pickTool('shape'); setShowShapes(true); } }}>
            <Icon name={shape} />
          </button>
          {showShapes && (
            <div className="wb-pop">
              {SHAPES.map(s => (
                <button key={s} type="button" className={`wb-tool ${shape === s && tool === 'shape' ? 'on' : ''}`} aria-label={s}
                  onClick={() => { setShape(s); setTool('shape'); setShowShapes(false); }}><Icon name={s} /></button>
              ))}
            </div>
          )}
        </div>
        <ToolBtn t="text" label="Text" keyHint="T" />
        <ToolBtn t="laser" label="Laser pointer" keyHint="L" />

        <div className="wb-sep" />
        <div className="wb-colors" role="group" aria-label="Colour">
          {INK[bg].map((c, i) => (
            <button key={c} type="button" className={`wb-swatch ${colorIdx === i ? 'on' : ''}`} style={{ '--sw': c }}
              aria-label={names[i]} aria-pressed={colorIdx === i} title={`${names[i]} (${i + 1})`}
              onClick={() => { setColorIdx(i); if (['erase', 'laser'].includes(tool)) pickTool('pen'); }} />
          ))}
        </div>
        <div className="wb-sep" />
        <div className="wb-sizes" role="group" aria-label="Size">
          {[0, 1, 2].map(i => (
            <button key={i} type="button" className={`wb-size ${sizes[kind] === i ? 'on' : ''}`} aria-label={['Thin', 'Medium', 'Thick'][i]}
              title={`${['Thin', 'Medium', 'Thick'][i]} ([ and ])`} onClick={() => setSizes(s => ({ ...s, [kind]: i }))}>
              <span style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
        </div>
        <div className="wb-sep" />
        <button type="button" className="wb-tool" onClick={undo} disabled={!h?.undo.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button type="button" className="wb-tool" onClick={redo} disabled={!h?.redo.length} aria-label="Redo" title="Redo (Ctrl+Y)"><Icon name="redo" /></button>
      </aside>

      {/* ── Board ── */}
      <main className="wb-stage">
        <div className="wb-surface" ref={surfRef}>
          <canvas ref={baseRef} className="wb-cv" />
          <canvas ref={liveRef} className={`wb-cv wb-live tool-${tool}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave}
            onContextMenu={e => e.preventDefault()} />
          {textEdit && (
            <textarea ref={textRef} className="wb-text-edit" defaultValue={textEdit.value} spellCheck={false} autoFocus
              style={{
                left: textEdit.x * k, top: textEdit.y * k,
                font: textFont(textEdit.size * k), color: textEdit.color, lineHeight: 1.3,
                maxWidth: (W - textEdit.x) * k,
              }}
              onBlur={commitText}
              onInput={e => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
              placeholder="Type, Esc to finish" />
          )}
        </div>
      </main>

      {/* ── Page bar ── */}
      <footer className="wb-bottom">
        <div className="wb-pagenav">
          <button type="button" className="wb-icon-btn" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous page" title="Previous page (←)"><Icon name="prev" /></button>
          <button type="button" className="wb-pageno" onClick={() => setShowPages(v => !v)} aria-expanded={showPages} title="All pages">
            Page {idx + 1} of {pageCount}
          </button>
          <button type="button" className="wb-icon-btn" onClick={() => go(idx + 1)} disabled={idx >= pageCount - 1} aria-label="Next page" title="Next page (→)"><Icon name="next" /></button>
          <button type="button" className="wb-add" onClick={() => addPage()} title="New page (N)"><Icon name="plus" />New page</button>
        </div>
        <div className="wb-pageopts">
          <button type="button" className="wb-chip" onClick={toggleBg} title="Switch board colour (B)">{bg === 'dark' ? 'Dark board' : 'White board'}</button>
          <button type="button" className="wb-chip" onClick={cyclePattern} title="Background lines (G)">{PATTERN_NAMES[page.pattern]}</button>
          <button type="button" className="wb-chip" onClick={clearPage} disabled={!page.strokes.length} title="Clear this page (Delete)">Clear page</button>
        </div>
      </footer>

      {showPages && (
        <div className="wb-strip" role="dialog" aria-label="Pages">
          <div className="wb-strip-head">
            <span>{pageCount} pages</span>
            <div className="wb-strip-actions">
              <button type="button" onClick={() => movePage(-1)} disabled={idx === 0}>Move left</button>
              <button type="button" onClick={() => movePage(1)} disabled={idx >= pageCount - 1}>Move right</button>
              <button type="button" onClick={() => addPage(true)}>Duplicate</button>
              <button type="button" className="danger" onClick={deletePage} disabled={pageCount <= 1}>Delete page</button>
              <button type="button" onClick={() => setShowPages(false)}>Done</button>
            </div>
          </div>
          <div className="wb-thumbs">
            {pagesRef.current.map((p, i) => (
              <button key={p._id} type="button" className={`wb-thumb ${i === idx ? 'on' : ''}`} onClick={() => go(i)} aria-label={`Page ${i + 1}`}>
                <Thumb page={p} version={`${versions[p._id] || 0}-${p.bg}-${p.pattern}-${p.strokes.length}`} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showKeys && (
        <div className="wb-keys" role="dialog" aria-label="Shortcuts" onClick={() => setShowKeys(false)}>
          <div className="wb-keys-card" onClick={e => e.stopPropagation()}>
            <h2>Shortcuts</h2>
            <p className="wb-keys-tip">Map your pen tablet’s side keys to these. The pen’s eraser end erases automatically.</p>
            <dl>
              {[
                ['P', 'Pen'], ['H', 'Highlighter'], ['E', 'Eraser'], ['L', 'Laser pointer'], ['T', 'Text (Esc to finish)'],
                ['I / A / R / O', 'Line, arrow, box, circle'], ['Shift', 'Straight line with pen, square, 45° snap'],
                ['1 to 6', 'Colours'], ['[ and ]', 'Thinner, thicker'], ['Ctrl+Z / Ctrl+Y', 'Undo, redo'],
                ['N', 'New page'], ['← →', 'Previous, next page'], ['B', 'Dark or white board'], ['G', 'Grid, ruled, dots'],
                ['F', 'Fullscreen'], ['U', 'Hide or show the toolbars'], ['Delete', 'Clear page'],
              ].map(([key, what]) => <div key={key}><dt>{key}</dt><dd>{what}</dd></div>)}
            </dl>
          </div>
        </div>
      )}

      {publish && (
        <div className="wb-modal" role="dialog" aria-modal="true" aria-label="Publish notes" onClick={() => !publish.busy && setPublish(null)}>
          <div className="wb-modal-card" onClick={e => e.stopPropagation()}>
            <h2>{meta.notes ? 'Update the notes' : 'Turn this board into notes'}</h2>
            <p className="wb-modal-sub">
              {pagesRef.current.filter((p, i) => p.strokes.length || i === 0).length} pages become one PDF, one page per board page.
              {meta.session
                ? <> Students in <strong>{meta.event.title}</strong> get it in Class {meta.session.number}{meta.session.hasLesson ? ' and under its recording' : ', and under the recording once you add it'}.</>
                : <> This board isn’t linked to a class, so you can download the PDF and share it.</>}
            </p>
            <fieldset className="wb-paper">
              <legend>Notes style</legend>
              <label><input type="radio" name="paper" checked={!publish.paper} onChange={() => setPublish(p => ({ ...p, paper: false }))} /> Same as the board</label>
              <label><input type="radio" name="paper" checked={publish.paper} onChange={() => setPublish(p => ({ ...p, paper: true }))} /> White paper, easy to print</label>
            </fieldset>
            {publish.busy && <div className="wb-progress"><span style={{ width: `${publish.progress}%` }} /></div>}
            <div className="wb-modal-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(publish.busy)} onClick={() => exportPdf(false)}>
                {publish.busy === 'download' ? 'Making PDF…' : 'Download PDF'}
              </button>
              {meta.session && (
                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(publish.busy)} onClick={() => exportPdf(true)}>
                  {publish.busy === 'publish' ? `Publishing… ${publish.progress}%` : meta.notes ? 'Update for students' : 'Publish to students'}
                </button>
              )}
            </div>
            {meta.notes?.publishedAt && (
              <p className="wb-modal-foot">
                Last published {new Date(meta.notes.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                {' · '}<a href={meta.notes.url} target="_blank" rel="noreferrer">Open current PDF</a>
              </p>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
