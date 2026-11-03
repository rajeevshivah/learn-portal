// Turns any YouTube link into a privacy-friendly embed URL.
// Handles watch?v=, youtu.be/, shorts/, live/ and embed/ links. Returns '' for non-YouTube links.
export const toEmbed = (url) => {
  if (!url) return '';
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1` : '';
};
