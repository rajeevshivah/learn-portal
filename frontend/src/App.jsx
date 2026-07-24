import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { trackPageView } from './lib/analytics';
import Navbar         from './components/Navbar';
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

function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner-page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return (
    <>
      <Navbar />
      {children}
    </>
  );
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
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* PUBLIC — shareable roadmap funnel links */}
      <Route path="/r/:slug" element={<Roadmap />} />
      <Route path="/roadmap/:slug" element={<Roadmap />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/courses" element={<Protected><Courses /></Protected>} />
      <Route path="/courses/:slug" element={<Protected><CourseEpisodes /></Protected>} />
      <Route path="/episodes/:id" element={<Protected><EpisodeDetail /></Protected>} />
      <Route path="/pay/:slug" element={<Protected><Payment /></Protected>} />
      <Route path="/events" element={<Protected><Events /></Protected>} />
      <Route path="/events/:slug" element={<Protected><EventDetail /></Protected>} />

      <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
      <Route path="/admin/analytics" element={<Protected adminOnly><Analytics /></Protected>} />
      <Route path="/admin/roadmaps" element={<Protected adminOnly><Roadmaps /></Protected>} />

      <Route path="/episodes" element={<Navigate to="/courses" replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
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
