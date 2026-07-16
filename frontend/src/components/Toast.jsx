import { useEffect } from 'react';

export default function Toast({ message, onDone, duration = 2600 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, onDone, duration]);

  if (!message) return null;
  return <div className="toast">{message}</div>;
}
