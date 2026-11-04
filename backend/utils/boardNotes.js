// Whiteboard notes → the class they belong to.
// 1. session.notesUrl: shown in the event schedule to confirmed students.
// 2. the class's recording lesson (if one exists): a "Whiteboard notes" file,
//    replaced in place each time the board is published again.
// Called after publishing, and again whenever a recording creates the lesson.
const Board = require('../models/Board');
const Episode = require('../models/Episode');

async function attachBoardNotes(event) {
  if (!event?._id) return false;
  const boards = await Board.find({ event: event._id, 'notes.url': { $ne: '' } });
  let touched = false;
  for (const b of boards) {
    const session = event.sessions.id(b.session);
    if (!session) continue;
    if (session.notesUrl !== b.notes.url) { session.notesUrl = b.notes.url; touched = true; }
    if (!session.publishedEpisode) continue;
    const ep = await Episode.findById(session.publishedEpisode);
    if (!ep) continue;
    const existing = ep.files.find(f => String(f.board) === String(b._id));
    const file = {
      label: 'Whiteboard notes',
      originalName: `${b.title}.pdf`,
      url: b.notes.url,
      publicId: b.notes.publicId || 'board',
      fileType: 'pdf',
      size: b.notes.size,
      board: b._id,
    };
    if (existing) {
      if (existing.url === file.url) continue;
      Object.assign(existing, file);
    } else {
      ep.files.unshift(file);
    }
    await ep.save();
  }
  return touched;
}

module.exports = { attachBoardNotes };
