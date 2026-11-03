import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toEmbed } from '../lib/youtube';

// Plays a class recording inside the platform, never on YouTube.
// If the class has a lesson (recordings course linked), go to the lesson page (notes, doubts, progress).
// Otherwise open an in-page player.
export function RecLink({ s, children, className, style, title }) {
  const [open, setOpen] = useState(false);
  if (s.publishedEpisode) {
    return <Link to={`/episodes/${s.publishedEpisode}`} className={className} style={style}>{children}</Link>;
  }
  const embed = toEmbed(s.recordingUrl);
  if (!embed) {   // not a YouTube link (e.g. Drive): nothing to embed, open it as is
    return <a href={s.recordingUrl} target="_blank" rel="noreferrer" className={className} style={style}>{children}</a>;
  }
  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>{children}</button>
      {open && <PlayerModal embed={embed} title={title || s.title} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlayerModal({ embed, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="player-backdrop" onClick={onClose}>
      <div className="player" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="player-head">
          <span className="player-title">{title}</span>
          <button type="button" className="player-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="video-frame">
          <iframe src={`${embed}&autoplay=1`} title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      </div>
    </div>
  );
}
