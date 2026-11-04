const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Board = require('../models/Board');
const BoardPage = require('../models/BoardPage');
const LiveEvent = require('../models/LiveEvent');
const Episode = require('../models/Episode');
const { protect, adminOnly } = require('../middleware/auth');
const { cloudinary, uploadBoardPdf } = require('../config/cloudinary');
const { attachBoardNotes } = require('../utils/boardNotes');

// ── Teaching whiteboard (admin only) ─────────────────────
// Pages autosave one at a time. "Publish notes" uploads a PDF of all pages
// and attaches it to the class it belongs to.

router.use(protect, adminOnly);

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const MAX_PAGES = 200;
const MAX_STROKES = 20000;

const classLabel = async (boards) => {
  const ids = [...new Set(boards.filter(b => b.event).map(b => String(b.event)))];
  const events = await LiveEvent.find({ _id: { $in: ids } }).select('title slug sessions');
  const byId = new Map(events.map(e => [String(e._id), e]));
  return boards.map(b => {
    const ev = b.event ? byId.get(String(b.event)) : null;
    const sorted = ev ? [...ev.sessions].sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt)) : [];
    const idx = sorted.findIndex(s => String(s._id) === String(b.session));
    const s = idx >= 0 ? sorted[idx] : null;
    return {
      _id: b._id, title: b.title, pages: b.pageOrder.length, updatedAt: b.updatedAt,
      notes: b.notes?.url ? { url: b.notes.url, pages: b.notes.pages, publishedAt: b.notes.publishedAt } : null,
      event: ev ? { _id: ev._id, title: ev.title, slug: ev.slug } : null,
      session: s ? { _id: s._id, title: s.title, number: idx + 1, startsAt: s.startsAt, hasLesson: Boolean(s.publishedEpisode) } : null,
    };
  });
};

const newPage = async (board, { bg = 'dark', pattern = 'plain' } = {}) =>
  BoardPage.create({ board: board._id, bg: bg === 'light' ? 'light' : 'dark', pattern: ['plain', 'grid', 'lines', 'dots'].includes(pattern) ? pattern : 'plain' });

// ── List boards ──
router.get('/', asyncHandler(async (req, res) => {
  const boards = await Board.find().sort({ updatedAt: -1 }).limit(200);
  res.json(await classLabel(boards));
}));

// ── Standalone board ──
router.post('/', asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim() || `Board ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;
  const board = await Board.create({ title: title.slice(0, 160) });
  const page = await newPage(board, req.body);
  board.pageOrder = [page._id];
  await board.save();
  res.status(201).json({ _id: board._id });
}));

// ── The board for one class: opened if it exists, created if not ──
router.post('/for-class', asyncHandler(async (req, res) => {
  const { eventId, sessionId } = req.body;
  if (!isId(eventId) || !isId(sessionId)) return res.status(400).json({ message: 'Pick a class' });
  const event = await LiveEvent.findById(eventId).select('title sessions');
  const session = event?.sessions.id(sessionId);
  if (!session) return res.status(404).json({ message: 'Class not found' });
  let board = await Board.findOne({ event: eventId, session: sessionId });
  if (!board) {
    board = await Board.create({ title: session.title, event: eventId, session: sessionId });
    const page = await newPage(board, req.body);
    board.pageOrder = [page._id];
    await board.save();
  }
  res.json({ _id: board._id });
}));

const load = async (req, res) => {
  if (!isId(req.params.id)) { res.status(404).json({ message: 'Board not found' }); return null; }
  const board = await Board.findById(req.params.id);
  if (!board) { res.status(404).json({ message: 'Board not found' }); return null; }
  return board;
};

// ── One board with all its pages ──
router.get('/:id', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  const pages = await BoardPage.find({ board: board._id });
  const byId = new Map(pages.map(p => [String(p._id), p]));
  let ordered = board.pageOrder.map(id => byId.get(String(id))).filter(Boolean);
  // Pages missing from the order (e.g. an interrupted save) go at the end
  const listed = new Set(ordered.map(p => String(p._id)));
  ordered = ordered.concat(pages.filter(p => !listed.has(String(p._id))));
  if (!ordered.length) { const p = await newPage(board); ordered = [p]; board.pageOrder = [p._id]; await board.save(); }
  const [info] = await classLabel([board]);
  res.json({ ...info, pages: ordered.map(p => ({ _id: p._id, bg: p.bg, pattern: p.pattern, strokes: p.strokes, updatedAt: p.updatedAt })) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  const title = String(req.body.title || '').trim();
  if (title) board.title = title.slice(0, 160);
  await board.save();
  res.json({ title: board.title });
}));

// ── Pages ──
router.post('/:id/pages', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  if (board.pageOrder.length >= MAX_PAGES) return res.status(400).json({ message: `A board can have up to ${MAX_PAGES} pages. Start a new board.` });
  const page = await newPage(board, req.body);
  if (Array.isArray(req.body.strokes)) { page.strokes = req.body.strokes.slice(0, MAX_STROKES); await page.save(); }
  const at = board.pageOrder.findIndex(id => String(id) === String(req.body.after));
  if (at >= 0) board.pageOrder.splice(at + 1, 0, page._id); else board.pageOrder.push(page._id);
  board.markModified('pageOrder');
  await board.save();
  res.status(201).json({ _id: page._id, bg: page.bg, pattern: page.pattern, strokes: page.strokes });
}));

router.put('/:id/pages/:pageId', asyncHandler(async (req, res) => {
  if (!isId(req.params.pageId)) return res.status(404).json({ message: 'Page not found' });
  const page = await BoardPage.findOne({ _id: req.params.pageId, board: req.params.id });
  if (!page) return res.status(404).json({ message: 'Page not found' });
  const { strokes, bg, pattern } = req.body;
  if (strokes !== undefined) {
    if (!Array.isArray(strokes)) return res.status(400).json({ message: 'Bad page data' });
    if (strokes.length > MAX_STROKES) return res.status(400).json({ message: 'This page is full. Add a new page.' });
    page.strokes = strokes;
    page.markModified('strokes');
  }
  if (bg === 'dark' || bg === 'light') page.bg = bg;
  if (['plain', 'grid', 'lines', 'dots'].includes(pattern)) page.pattern = pattern;
  await page.save();
  await Board.updateOne({ _id: req.params.id }, { $set: { updatedAt: new Date() } }, { timestamps: false });
  res.json({ savedAt: page.updatedAt });
}));

router.delete('/:id/pages/:pageId', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  if (board.pageOrder.length <= 1) return res.status(400).json({ message: 'A board needs at least one page' });
  await BoardPage.deleteOne({ _id: req.params.pageId, board: board._id });
  board.pageOrder = board.pageOrder.filter(id => String(id) !== String(req.params.pageId));
  await board.save();
  res.json({ pages: board.pageOrder.length });
}));

router.put('/:id/order', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  const want = (req.body.pageOrder || []).map(String);
  const have = new Set(board.pageOrder.map(String));
  if (want.length !== have.size || !want.every(id => have.has(id))) return res.status(400).json({ message: 'Page list is out of date. Reload the board.' });
  board.pageOrder = want;
  await board.save();
  res.json({ ok: true });
}));

// ── Unpublish helper: take the notes off the class ──
const detach = async (board) => {
  if (!board.event) return;
  const event = await LiveEvent.findById(board.event);
  const session = event?.sessions.id(board.session);
  if (session) {
    session.notesUrl = '';
    await event.save();
    const ep = session.publishedEpisode ? await Episode.findById(session.publishedEpisode) : null;
    if (ep) {
      const keep = ep.files.filter(f => String(f.board) !== String(board._id));
      if (keep.length !== ep.files.length) { ep.files = keep; await ep.save(); }
    }
  }
};

// ── Publish notes: body is the PDF the board app made ──
router.post('/:id/notes', uploadBoardPdf.single('file'), asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  if (!req.file) return res.status(400).json({ message: 'No PDF received' });
  const old = board.notes?.publicId;
  board.notes = {
    url: req.file.path,
    publicId: req.file.filename,
    pages: Number(req.body.pages) || board.pageOrder.length,
    size: req.file.size ? `${(req.file.size / 1024 / 1024).toFixed(1)} MB` : '',
    publishedAt: new Date(),
  };
  await board.save();
  if (old && old !== board.notes.publicId) {
    try { await cloudinary.uploader.destroy(old, { resource_type: 'raw' }); } catch (e) { /* already gone */ }
  }
  let where = 'saved';
  if (board.event) {
    const event = await LiveEvent.findById(board.event);
    if (event) {
      if (await attachBoardNotes(event)) await event.save();
      const s = event.sessions.id(board.session);
      where = s?.publishedEpisode ? 'class+lesson' : 'class';
    }
  }
  res.json({ notes: board.notes, where });
}));

router.delete('/:id/notes', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  await detach(board);
  if (board.notes?.publicId) { try { await cloudinary.uploader.destroy(board.notes.publicId, { resource_type: 'raw' }); } catch (e) { /* ignore */ } }
  board.notes = { url: '', publicId: '', pages: 0, size: '', publishedAt: null };
  await board.save();
  res.json({ message: 'Notes removed from the class' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const board = await load(req, res); if (!board) return;
  await detach(board);
  if (board.notes?.publicId) { try { await cloudinary.uploader.destroy(board.notes.publicId, { resource_type: 'raw' }); } catch (e) { /* ignore */ } }
  await BoardPage.deleteMany({ board: board._id });
  await board.deleteOne();
  res.json({ message: 'Board deleted' });
}));

module.exports = router;
