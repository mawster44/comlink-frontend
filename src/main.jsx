import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Login from './Login.jsx';
import { getToken, clearToken } from './auth.js';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    fetch(`${API_BASE}/auth/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  if (checking) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f0f0f', color:'#888', fontSize:14 }}>
      Loading...
    </div>
  );

  if (!user) return <Login onLogin={u => setUser(u)} />;

  return <App user={user} onLogout={() => { clearToken(); setUser(null); }} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
