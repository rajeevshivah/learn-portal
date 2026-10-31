// Flags UTRs that appear on any other webinar registration or course payment
// (approved, pending or rejected). Reusing someone else's UTR is the most common payment trick.
const Registration = require('../models/Registration');
const Enrollment = require('../models/Enrollment');

async function markDuplicateUtrs(items) {
  const utrs = [...new Set(items.map(i => i.utr).filter(Boolean))];
  const seen = {};
  if (utrs.length) {
    const [regs, enrs] = await Promise.all([
      Registration.find({ utr: { $in: utrs } }).select('_id utr'),
      Enrollment.find({ utr: { $in: utrs } }).select('_id utr'),
    ]);
    [...regs, ...enrs].forEach(d => { (seen[d.utr] = seen[d.utr] || []).push(String(d._id)); });
  }
  return items.map(i => ({
    ...(i.toObject ? i.toObject() : i),
    dupUtr: Boolean(i.utr && (seen[i.utr] || []).some(id => id !== String(i._id))),
  }));
}

module.exports = { markDuplicateUtrs };
