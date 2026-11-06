import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API = import.meta.env.VITE_API_URL;

// Shown on the login page after we sign someone out (read once, then cleared).
export const SIGNED_OUT_KEY = 'signedOutReason';

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Signed in on another device ("one device at a time"): any request can find
  // out, so catch it once here, sign out, and explain on the login page.
  useEffect(() => {
    const id = axios.interceptors.response.use(undefined, (err) => {
      if (err.response?.status === 401 && err.response?.data?.code === 'SESSION_REPLACED' && localStorage.getItem('token')) {
        try { sessionStorage.setItem(SIGNED_OUT_KEY, err.response.data.message); } catch { /* private mode */ }
        logout();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
      }
      return Promise.reject(err);
    });
    return () => axios.interceptors.response.eject(id);
  }, []);

  // On app load — check if token exists and fetch user
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API}/auth/me`)
        .then(res => setUser(res.data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Called after Google login — credential = token from Google
  const loginWithGoogle = async (credential) => {
    const res = await axios.post(`${API}/auth/google`, { credential });
    const { token, ...userData } = res.data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
