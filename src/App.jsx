import { useState, useEffect, useRef } from 'react';
import Settings from './Settings.jsx';
import BrandBrain from './BrandBrain.jsx';
import { AffiliateList, AffiliateThread } from './AffiliateInbox.jsx';
import { apiFetch, clearToken } from './auth.js';
import './App.css';

const MODELS = [
  { id: 'claude', label: 'Claude', color: '#c97e3a' },
  { id: 'gpt',    label: 'GPT-4o', color: '#10a37f' },
  { id: 'gemini', label: 'Gemini', color: '#4285f4' },
  { id: 'ollama', label: 'Ollama', color: '#888' },
];

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function Avatar({ name }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <div className="avatar">{initials}</div>;
}

export default function App({ user, onLogout }) {
  const [convos, setConvos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [model, setModel] = useState('claude');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(window.location.pathname === '/settings');
  const [showBrandBrain, setShowBrandBrain] = useState(false);
  const [view, setView] = useState('customers'); // 'customers' | 'affiliates'
  const [affiliateActiveId, setAffiliateActiveId] = useState(null);

  // Compose state
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const bottomRef = useRef(null);
  const draftRef = useRef(null);

  useEffect(() => {
    fetchConvos();
    const interval = setInterval(fetchConvos, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeId) { fetchActive(activeId); setDraft(''); setError(null); }
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages]);

  useEffect(() => {
    if (draft && draftRef.current) draftRef.current.focus();
  }, [draft]);

  async function fetchConvos() {
    try {
      const res = await apiFetch('/api/messages');
      if (res) setConvos(await res.json());
    } catch {}
  }

  async function fetchActive(id) {
    try {
      const res = await apiFetch(`/api/messages/${id}`);
      if (res) setActive(await res.json());
    } catch {}
  }

  async function generateDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reply/${activeId}/draft`, {
        method: 'POST',
        body: JSON.stringify({ model, systemPrompt }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { text } = await res.json();
      setDraft(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function sendDraft() {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reply/${activeId}/send`, {
        method: 'POST',
        body: JSON.stringify({ text: draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDraft('');
      await fetchActive(activeId);
      await fetchConvos();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);
  const selectedModel = MODELS.find(m => m.id === model);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">Comlink</span>
            {view === 'customers' && totalUnread > 0 && <span className="badge">{totalUnread}</span>}
          </div>
          {view === 'customers' && (
            <button className="icon-btn" onClick={() => setShowBrandBrain(true)} title="Brand Brain">◈</button>
          )}
          <button className="icon-btn" onClick={() => { setShowSettings(true); window.history.replaceState({}, '', '/settings'); }} title="Settings">⚙</button>
        </div>

        <div className="user-bar">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <span className="user-name">{user?.name}</span>
          </div>
          <button className="icon-btn" onClick={onLogout} title="Sign out">⎋</button>
        </div>

        <div className="view-toggle">
          <button
            className={`toggle-btn ${view === 'customers' ? 'active' : ''}`}
            onClick={() => setView('customers')}
          >
            Customer Support
          </button>
          <button
            className={`toggle-btn ${view === 'affiliates' ? 'active' : ''}`}
            onClick={() => setView('affiliates')}
          >
            Affiliates
          </button>
        </div>

        {view === 'customers' && (
          <div className="convo-list">
            {convos.length === 0 && <p className="empty">No messages yet</p>}
            {convos.map(c => (
              <button
                key={c.id}
                className={`convo-item ${c.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(c.id)}
              >
                <Avatar name={c.customer?.name} />
                <div className="convo-meta">
                  <div className="convo-row">
                    <span className="convo-name">{c.customer?.name || 'Customer'}</span>
                    <span className={`source-badge ${c.source === 'gmail' ? 'badge-gmail' : 'badge-tiktok'}`}>
                      {c.source === 'gmail' ? 'Gmail' : 'TikTok'}
                    </span>
                    <span className="convo-time">{timeAgo(c.updatedAt)}</span>
                  </div>
                  <div className="convo-row">
                    <span className="convo-preview">{c.messages.at(-1)?.text?.slice(0, 40)}…</span>
                    {c.unread > 0 && <span className="unread-dot">{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {view === 'affiliates' && (
          <AffiliateList
            activeId={affiliateActiveId}
            onSelect={c => setAffiliateActiveId(c.id)}
          />
        )}
      </aside>

      <main className="main">
        {view === 'affiliates' && (
          affiliateActiveId
            ? <AffiliateThread convId={affiliateActiveId} model={model} setModel={setModel} />
            : <div className="empty-state"><div className="empty-icon">◈</div><p>Select an affiliate conversation</p></div>
        )}
        {view === 'customers' && !active ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <p>Select a conversation</p>
          </div>
        ) : view === 'customers' ? (
          <>
            <div className="thread-header" key="customer-thread">
              <Avatar name={active.customer?.name} />
              <div>
                <span className="thread-name">{active.customer?.name}</span>
                {active.customer?.email && (
                  <span className="thread-email">{active.customer.email}</span>
                )}
              </div>
            </div>

            <div className="thread">
              {active.messages.map((m, i) => (
                <div key={i} className={`bubble-wrap ${m.role === 'shop' ? 'outbound' : 'inbound'}`}>
                  <div className="bubble">
                    <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
                    <span className="bubble-time">{timeAgo(m.ts)}</span>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="compose-bar">
              {error && <div className="error-banner">{error}</div>}

              <div className="compose-draft-area">
                <textarea
                  ref={draftRef}
                  className="compose-textarea"
                  placeholder="Write a reply, or use AI to draft one…"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendDraft(); }}
                  rows={3}
                />
              </div>

              <div className="compose-actions">
                <div className="model-tabs">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      className={`model-tab ${model === m.id ? 'selected' : ''}`}
                      style={model === m.id ? { borderColor: m.color, color: m.color } : {}}
                      onClick={() => setModel(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="compose-btns">
                  <button
                    className="draft-btn"
                    onClick={generateDraft}
                    disabled={drafting || sending}
                    style={{ borderColor: selectedModel.color, color: selectedModel.color }}
                  >
                    {drafting ? 'Drafting…' : `Draft with ${selectedModel.label}`}
                  </button>
                  <button
                    className="send-btn"
                    onClick={sendDraft}
                    disabled={!draft.trim() || sending}
                  >
                    {sending ? 'Sending…' : 'Send ↑'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {showBrandBrain && <BrandBrain onClose={() => setShowBrandBrain(false)} />}

      {showSettings && (
        <Settings
          model={model}
          setModel={setModel}
          systemPrompt={systemPrompt}
          setSystemPrompt={setSystemPrompt}
          onClose={() => { setShowSettings(false); window.history.replaceState({}, '', '/'); }}
          user={user}
        />
      )}
    </div>
  );
}
