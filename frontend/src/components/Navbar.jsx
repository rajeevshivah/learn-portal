import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstall } from '../lib/pwa';

// App shell: a top bar everywhere, plus an app-style bottom tab bar on phones.
// Tabs: Home · Learn · Live · More (sheet with admin links, install, logout).

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>
  ),
  learn: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" /></svg>
  ),
  live: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3z" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
  ),
};

function Avatar({ user, size = 32 }) {
  if (user?.avatar) {
    return <img className="shell-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size }} />;
  }
  return <span className="shell-avatar shell-avatar-txt" style={{ width: size, height: size }}>{(user?.name || '?')[0]}</span>;
}

function MoreSheet({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const install = useInstall();
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (!open) { setIosHelp(false); return; }
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const go = (to) => { onClose(); navigate(to); };
  const doLogout = () => { onClose(); logout(); navigate('/login'); };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="More" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-user">
          <Avatar user={user} size={44} />
          <div>
            <div className="sheet-name">{user?.name}</div>
            <div className="small muted">{user?.email}</div>
          </div>
        </div>

        <div className="sheet-list">
          {user?.role === 'admin' && (
            <>
              <button className="sheet-item" onClick={() => go('/admin')}>Admin panel</button>
              <button className="sheet-item" onClick={() => go('/admin/boards')}>Whiteboards</button>
              <button className="sheet-item" onClick={() => go('/admin/analytics')}>Analytics</button>
            </>
          )}
          {install.canInstall && (
            <button className="sheet-item" onClick={async () => { await install.prompt(); onClose(); }}>
              Install the app
              <span className="sheet-hint">Opens like an app from your home screen</span>
            </button>
          )}
          {install.isIos && !install.installed && (
            <button className="sheet-item" onClick={() => setIosHelp(v => !v)}>
              Add to Home Screen
              <span className="sheet-hint">
                {iosHelp ? 'In Safari, tap the Share button, then "Add to Home Screen".' : 'Use it like an app on your iPhone'}
              </span>
            </button>
          )}
          <button className="sheet-item sheet-danger" onClick={doLogout}>Log out</button>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);

  useEffect(() => { setMore(false); }, [pathname]);

  const isAdmin = user?.role === 'admin';
  const tab = (to, label, icon, match) => (
    <NavLink to={to} className={() => `tb-item ${match(pathname) ? 'active' : ''}`} aria-label={label}>
      {icon}<span>{label}</span>
    </NavLink>
  );
  const top = (to, label) => (
    <NavLink to={to} end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>{label}</NavLink>
  );

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/dashboard" className="nav-logo">code<span>With</span>Shivah</Link>
          <nav className="nav-links" aria-label="Main">
            {top('/dashboard', 'Home')}
            {top('/courses', 'Courses')}
            {top('/events', 'Live')}
            {isAdmin && top('/admin', 'Admin')}
            {isAdmin && top('/admin/boards', 'Boards')}
            {isAdmin && top('/admin/analytics', 'Analytics')}
            <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
          </nav>
          <button className="nav-me" onClick={() => setMore(true)} aria-label="Account and more">
            <Avatar user={user} />
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="App">
        {tab('/dashboard', 'Home', Icon.home, p => p === '/dashboard')}
        {tab('/courses', 'Learn', Icon.learn, p => p.startsWith('/courses') || p.startsWith('/episodes') || p.startsWith('/discuss') || p.startsWith('/pay'))}
        {tab('/events', 'Live', Icon.live, p => p.startsWith('/events'))}
        <button className={`tb-item ${more || pathname.startsWith('/admin') ? 'active' : ''}`} onClick={() => setMore(true)} aria-label="More">
          {Icon.more}<span>More</span>
        </button>
      </nav>

      <MoreSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}

// Top bar for logged-out visitors (homepage, course catalog).
export function PublicBar() {
  const { pathname } = useLocation();
  const back = pathname === '/' ? '/dashboard' : pathname;
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="nav-logo">code<span>With</span>Shivah</Link>
        <nav className="pub-links" aria-label="Main">
          <NavLink to="/courses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Courses</NavLink>
          <Link to={`/login?redirect=${encodeURIComponent(back)}`} className="btn btn-primary btn-sm">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
