export default function ProgressBar({ completed = 0, total = 0 }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span className="small muted">{completed} / {total} lessons</span>
        <span className="small" style={{ color: pct === 100 ? 'var(--success)' : 'var(--accent)', fontWeight: 600 }}>{pct}%</span>
      </div>
      <div className="progress">
        <div className={`progress-fill ${pct === 100 ? 'done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
