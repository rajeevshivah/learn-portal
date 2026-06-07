import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login        from './pages/Login';
import Episodes     from './pages/Episodes';
import EpisodeDetail from './pages/EpisodeDetail';
import Admin        from './pages/Admin';

// Wrapper — redirect to login if not authenticated
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#4A9EFF', textAlign: 'center', paddingTop: '100px', fontFamily: 'Arial' }}>Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/episodes" replace /> : <Login />} />
      <Route path="/episodes" element={<Protected><Episodes /></Protected>} />
      <Route path="/episodes/:id" element={<Protected><EpisodeDetail /></Protected>} />
      <Route path="/admin" element={<Protected><Admin /></Protected>} />
      <Route path="*" element={<Navigate to={user ? '/episodes' : '/login'} replace />} />
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
