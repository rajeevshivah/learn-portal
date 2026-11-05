import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { LESSON_ACCEPT, LESSON_FILE_TYPES, fileKind, LINK_KIND } from '../lib/fileTypes';

const API = import.meta.env.VITE_API_URL;

// Admin: everything attached to one lesson. Upload files (notes, code,
// notebooks, datasets), add links (Colab, GitHub, Drive), remove either.
// Used for class recordings (Live & Workshops) and course lessons (Episodes).
export default function LessonResources({ episodeId, onChange, setToast }) {
  const [ep, setEp] = useState(null);
  const [busy, setBusy] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(() => axios.get(`${API}/episodes/${episodeId}`)
    .then(({ data }) => setEp(data)).catch(() => setToast?.('Could not load this lesson')), [episodeId, setToast]);
  useEffect(() => { load(); }, [load]);

  const done = async (msg) => { setToast?.(msg); await load(); onChange?.(); };

  const upload = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    const bad = list.find(f => !LESSON_FILE_TYPES.includes(f.name.split('.').pop().toLowerCase()));
    if (bad) { setToast?.(`${bad.name}: this file type can’t be uploaded. Zip it, or share a Drive link.`); return; }
    const big = list.find(f => f.size > 20 * 1024 * 1024);
    if (big) { setToast?.(`${big.name} is over 20 MB. Zip it, or share a Drive link.`); return; }
    let ok = 0;
    for (const [i, f] of list.entries()) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`);
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('label', f.name.replace(/\.[^.]+$/, ''));
        await axios.post(`${API}/episodes/${episodeId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        ok++;
      } catch (err) { setToast?.(err.response?.data?.message || `Could not upload ${f.name}`); }
    }
    setBusy('');
    if (ok) await done(ok === 1 ? 'File uploaded' : `${ok} files uploaded`);
  };

  const addLink = async () => {
    if (!/^https:\/\//.test(url.trim())) { setToast?.('Paste the full link, starting with https://'); return; }
    setBusy('link');
    try {
      await axios.post(`${API}/episodes/${episodeId}/links`, { url: url.trim(), label: label.trim() });
      setUrl(''); setLabel('');
      await done('Link added');
    } catch (err) { setToast?.(err.response?.data?.message || 'Could not add the link'); }
    finally { setBusy(''); }
  };

  const remove = async (what, item) => {
    if (!window.confirm(`Remove "${item.label}" from this lesson?`)) return;
    try {
      await axios.delete(`${API}/episodes/${episodeId}/${what}/${item._id}`);
      await done('Removed');
    } catch (err) { setToast?.(err.response?.data?.message || 'Could not remove'); }
  };

  if (!ep) return <div className="lr small muted">Loading…</div>;
  const files = ep.files || [], links = ep.links || [];

  return (
    <div className="lr">
      {(files.length > 0 || links.length > 0) ? (
        <ul className="lr-list">
          {links.map(l => (
            <li key={l._id}>
              <span className="lr-kind lr-kind-link">{LINK_KIND[l.kind] || 'Link'}</span>
              <a href={l.url} target="_blank" rel="noreferrer" className="lr-name">{l.label}</a>
              <button type="button" className="lr-x" onClick={() => remove('links', l)} aria-label={`Remove ${l.label}`}>Remove</button>
            </li>
          ))}
          {files.map(f => (
            <li key={f._id}>
              <span className="lr-kind">{fileKind(f)}</span>
              <span className="lr-name">{f.label}{f.originalName ? <span className="lr-file"> {f.originalName}</span> : null}</span>
              <span className="lr-size">{f.size}</span>
              <button type="button" className="lr-x" onClick={() => remove('files', f)} aria-label={`Remove ${f.label}`}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="small muted lr-empty">Nothing attached yet.</p>}

      <div className="lr-add">
        <label className="btn btn-ghost btn-sm lr-upload">
          {busy && busy !== 'link' ? busy : 'Upload files'}
          <input type="file" hidden multiple accept={LESSON_ACCEPT} disabled={Boolean(busy)}
            onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        </label>
        <span className="small muted">PDF, slides, notebooks (.ipynb), Python, CSV, Excel, ZIP and more. Up to 20 MB each.</span>
      </div>
      <div className="lr-add lr-link-form">
        <input className="input" placeholder="https://colab.research.google.com/drive/… or a GitHub / Drive link"
          value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} aria-label="Link" />
        <input className="input lr-label" placeholder="Name (optional)" value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLink()} aria-label="Link name" />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'link' || !url.trim()} onClick={addLink}>
          {busy === 'link' ? 'Adding…' : 'Add link'}
        </button>
      </div>
      <p className="small muted lr-tip">
        For a Colab notebook: in Colab click Share, set “Anyone with the link” to Viewer, copy the link and paste it here.
        Students open it and use File → Save a copy in Drive to run their own.
      </p>
    </div>
  );
}
