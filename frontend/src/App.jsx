import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { trackPageView } from './lib/analytics';
import Navbar, { PublicBar } from './components/Navbar';
import Home           from './pages/Home';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Courses        from './pages/Courses';
import CourseEpisodes from './pages/CourseEpisodes';
import EpisodeDetail  from './pages/EpisodeDetail';
import Payment        from './pages/Payment';
import Admin          from './pages/Admin';
import Analytics      from './pages/Analytics';
import Roadmap        from './pages/Roadmap';
import Roadmaps       from './pages/Roadmaps';
import Events         from './pages/Events';
import EventDetail    from './pages/EventDetail';
import LivePublic     from './pages/LivePublic';
import Discuss        from './pages/Discuss';
import Thread         from './pages/Thread';
import Boards         from './pages/Boards';
import Whiteboard     from './pages/Whiteboard';
import RefundPolicy   from './pages/RefundPolicy';

function Protected({ children, adminOnly = false, bare = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner-page">Loading…</div>;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (bare) return children;   // full-screen tools (whiteboard) skip the app shell
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

// Pages anyone can browse; signed-in students get the app shell, visitors a public bar.
function Open({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner-page">Loading…</div>;
  return <>{user ? <Navbar /> : <PublicBar />}{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  if (loading) return null;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Home />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* PUBLIC — shareable roadmap funnel links */}
      <Route path="/r/:slug" element={<Roadmap />} />
      <Route path="/roadmap/:slug" element={<Roadmap />} />

      {/* PUBLIC — shareable live-webinar funnel link (Instagram bio, WhatsApp, etc.) */}
      <Route path="/live/:slug" element={<LivePublic />} />
      <Route path="/refund-policy" element={<Open><RefundPolicy /></Open>} />
      <Route path="/cancellation-policy" element={<Navigate to="/refund-policy" replace />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/courses" element={<Open><Courses /></Open>} />
      <Route path="/courses/:slug" element={<Open><CourseEpisodes /></Open>} />
      <Route path="/courses/:slug/discuss" element={<Protected><Discuss /></Protected>} />
      <Route path="/discuss/:id" element={<Protected><Thread /></Protected>} />
      <Route path="/episodes/:id" element={<Protected><EpisodeDetail /></Protected>} />
      <Route path="/pay/:slug" element={<Protected><Payment /></Protected>} />
      <Route path="/events" element={<Protected><Events /></Protected>} />
      <Route path="/events/:slug" element={<Protected><EventDetail /></Protected>} />

      <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
      <Route path="/admin/analytics" element={<Protected adminOnly><Analytics /></Protected>} />
      <Route path="/admin/boards" element={<Protected adminOnly><Boards /></Protected>} />
      <Route path="/admin/board/:id" element={<Protected adminOnly bare><Whiteboard /></Protected>} />
      <Route path="/admin/roadmaps" element={<Protected adminOnly><Roadmaps /></Protected>} />

      <Route path="/episodes" element={<Navigate to="/courses" replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
