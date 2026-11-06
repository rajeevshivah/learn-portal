// When a class's Meet link may be handed to a student: from 15 minutes before
// it starts until 15 minutes after it ends. Outside that window the link stays
// on the server, so a student can't collect and forward links in advance.
const JOIN_EARLY_MS = 15 * 60000;
const JOIN_LATE_MS  = 15 * 60000;

const joinWindow = (s) => {
  const start = new Date(s.startsAt).getTime();
  const end = start + (s.durationMins || 60) * 60000;
  return { opens: start - JOIN_EARLY_MS, closes: end + JOIN_LATE_MS };
};
const isJoinOpen = (s, now = Date.now()) => {
  const w = joinWindow(s);
  return now >= w.opens && now < w.closes;
};

module.exports = { JOIN_EARLY_MS, joinWindow, isJoinOpen };
