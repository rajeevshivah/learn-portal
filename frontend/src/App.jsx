import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { trackPageView } from './lib/analytics';
import Login          from './pages/Login';
import Courses        from './pages/Courses';
import CourseEpisodes from './pages/CourseEpisodes';
import EpisodeDetail  from './pages/EpisodeDetail';
import Admin          from './pages/Admin';
import Analytics      from './pages/Analytics';
import Roadmap        from './pages/Roadmap';
import Roadmaps       from './pages/Roadmaps';

// Wrapper — redirect to login if not authenticated
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#4A9EFF', textAlign: 'center', paddingTop: '100px', fontFamily: 'Arial' }}>Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
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
      <Route path="/login" element={user ? <Navigate to="/courses" replace /> : <Login />} />

      {/* PUBLIC — no login. Shareable roadmap funnel link. */}
      <Route path="/r/:slug" element={<Roadmap />} />
      <Route path="/roadmap/:slug" element={<Roadmap />} />

      {/* Courses */}
      <Route path="/courses" element={<Protected><Courses /></Protected>} />
      <Route path="/courses/:slug" element={<Protected><CourseEpisodes /></Protected>} />

      {/* Episode detail (unchanged) */}
      <Route path="/episodes/:id" element={<Protected><EpisodeDetail /></Protected>} />

      {/* Old /episodes list now redirects to /courses */}
      <Route path="/episodes" element={<Navigate to="/courses" replace />} />

      <Route path="/admin" element={<Protected><Admin /></Protected>} />
      <Route path="/admin/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/admin/roadmaps" element={<Protected><Roadmaps /></Protected>} />
      <Route path="*" element={<Navigate to={user ? '/courses' : '/login'} replace />} />
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
