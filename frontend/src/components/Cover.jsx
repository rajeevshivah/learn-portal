// Course cover: the real thumbnail, or a typographic cover built from the title.
export default function Cover({ course }) {
  if (course.thumbnail) return <img className="db-cover" src={course.thumbnail} alt="" loading="lazy" />;
  const label = (course.title || '').split(/\s[—–-]\s|:|,/)[0].trim();
  const hue = [...(course.title || 'x')].reduce((n, c) => n + c.charCodeAt(0), 0) % 3;
  return (
    <div className={`db-cover db-cover-type db-cover-${hue}`} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}
