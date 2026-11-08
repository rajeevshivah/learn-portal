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

  // Store the token from any sign-in response and make the user current
  const applyAuth = (data) => {
    const { token, ...userData } = data;
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    return userData;
  };

  // Called after Google login — credential = token from Google
  const loginWithGoogle = async (credential) => applyAuth((await axios.post(`${API}/auth/google`, { credential })).data);
  // Email or mobile + password
  const loginWithPassword = async (id, password) => applyAuth((await axios.post(`${API}/auth/login`, { id, password })).data);
  // Name + mobile + email + password → account made. Not signed in yet: the login
  // page shows the details to save first, then calls finishSignIn().
  const register = async (form) => (await axios.post(`${API}/auth/register`, form)).data;
  const finishSignIn = (data) => applyAuth(data);
  // After a password reset the server signs them in too
  const resetPassword = async (id, code, password) => applyAuth((await axios.post(`${API}/auth/reset`, { id, code, password })).data);

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginWithPassword, register, finishSignIn, resetPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
