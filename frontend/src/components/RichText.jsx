// Safe text for doubts and replies: ```code blocks```, `inline code` and
// https links. Everything is rendered as React text nodes, never as HTML.

const LINK = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function Inline({ text }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return parts.map((p, i) => {
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rt-code">{p.slice(1, -1)}</code>;
    return p.split(LINK).map((s, j) => (j % 2
      ? <a key={`${i}-${j}`} href={s} target="_blank" rel="noopener noreferrer nofollow ugc">{s}</a>
      : s));
  });
}

export default function RichText({ text = '', className = '' }) {
  const blocks = String(text).split(/```/);
  return (
    <div className={`rt ${className}`}>
      {blocks.map((b, i) => {
        if (i % 2 === 1) {
          // first line after ``` may be a language name: drop it
          const body = b.replace(/^[\w+-]*\n/, '').replace(/\n$/, '');
          return <pre key={i} className="rt-pre"><code>{body}</code></pre>;
        }
        const t = b.replace(/^\n+|\n+$/g, '');
        return t ? <p key={i} className="rt-p"><Inline text={t} /></p> : null;
      })}
    </div>
  );
}
