import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const close = () => setOpen(false);
  const handleLogout = () => { close(); logout(); navigate('/login'); };

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/dashboard" className="nav-logo" onClick={close}>
          code<span>With</span>Shivah
        </Link>
        <button className="nav-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <NavLink to="/dashboard" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>Dashboard</NavLink>
          <NavLink to="/courses" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>Courses</NavLink>
          <NavLink to="/events" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>Live</NavLink>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>Admin</NavLink>
              <NavLink to="/admin/analytics" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>Analytics</NavLink>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ marginLeft: 6 }}>Logout</button>
          {user?.avatar && <img className="nav-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />}
        </div>
      </div>
    </nav>
  );
}
