import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import Login from './Login.jsx';
import DocList from './DocList.jsx';
import DocumentPage from './DocumentPage.jsx';
import { navigate } from './router.js';
import './styles.css';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const match = hash.match(/^#\/doc\/(\d+)/);
  return match ? { page: 'doc', id: Number(match[1]) } : { page: 'list' };
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const route = useHashRoute();

  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); setUser(null); });
    if (!getToken()) return;
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) {
    return <Login onLogin={(token, u) => { setToken(token); setUser(u); }} />;
  }
  const logout = async () => {
    await api.logout().catch(() => {});
    setToken(null);
    setUser(null);
    navigate('/');
  };
  return route.page === 'doc'
    ? <DocumentPage key={route.id} id={route.id} user={user} />
    : <DocList user={user} onLogout={logout} />;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
