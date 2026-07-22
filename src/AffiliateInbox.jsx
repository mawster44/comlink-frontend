import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import AffiliateBrain from './AffiliateBrain.jsx';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function AvatarImg({ name, avatar }) {
  if (avatar) return <img src={avatar} alt={name} className="avatar" style={{ borderRadius: '50%', objectFit: 'cover', width: 36, height: 36 }} />;
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <div className="avatar">{initials}</div>;
}

// Sidebar list — renders in the <aside>, calls onSelect when a conversation is clicked
export function AffiliateList({ activeId, onSelect }) {
  const [convos, setConvos] = useState([]);
  const [connected, setConnected] = useState(null);
  const [showBrain, setShowBrain] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (connected) {
      fetchConvos();
      const interval = setInterval(fetchConvos, 15000);
      return () => clearInterval(interval);
    }
  }, [connected]);

  async function checkStatus() {
    try {
      const res = await apiFetch('/api/affiliate-messages/status');
      const data = await res.json();
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
  }

  async function fetchConvos() {
    try {
      const res = await apiFetch('/api/affiliate-messages');
      if (res.ok) setConvos(await res.json());
    } catch {}
  }

  const totalUnread = convos.reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <>
      <div className="sidebar-section-header">
        <span>Affiliates</span>
        {totalUnread > 0 && <span className="badge">{totalUnread}</span>}
        <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowBrain(true)} title="Affiliate Brain">◈</button>
      </div>

      <div className="convo-list">
        {connected === null && <p className="empty">Loading...</p>}
        {connected === false && (
          <p className="empty" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
            Connect TikTok in Settings to access affiliate messages.
          </p>
        )}
        {connected && convos.length === 0 && <p className="empty">No affiliate conversations</p>}
        {convos.map(c => (
          <button
            key={c.id}
            className={`convo-item ${c.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(c)}
          >
            <AvatarImg name={c.creatorName} avatar={c.avatar} />
            <div className="convo-meta">
              <div className="convo-row">
                <span className="convo-name">{c.creatorName}</span>
                <span className="source-badge badge-tiktok">TikTok</span>
                <span className="convo-time">{timeAgo(c.updatedAt)}</span>
              </div>
              <div className="convo-row">
                <span className="convo-preview">Affiliate creator</span>
                {c.unread > 0 && <span className="unread-dot">{c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {showBrain && <AffiliateBrain onClose={() => setShowBrain(false)} />}
    </>
  );
}

// Main panel thread view for an affiliate conversation
export function AffiliateThread({ convId, model, setModel }) {
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = { current: null };
  const draftRef = { current: null };

  const MODELS = [
    { id: 'claude', label: 'Claude', color: '#c97e3a' },
    { id: 'gpt',    label: 'GPT-4o', color: '#10a37f' },
    { id: 'gemini', label: 'Gemini', color: '#4285f4' },
    { id: 'ollama', label: 'Ollama', color: '#888' },
  ];

  useEffect(() => {
    if (convId) { fetchActive(convId); setDraft(''); setError(null); }
  }, [convId]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages]);

  useEffect(() => {
    if (draft && draftRef.current) draftRef.current.focus();
  }, [draft]);

  async function fetchActive(id) {
    try {
      const res = await apiFetch(`/api/affiliate-messages/${id}`);
      if (res.ok) setActive(await res.json());
    } catch {}
  }

  async function generateDraft() {
    if (!active?.messages?.length) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/affiliate-reply/${convId}/draft`, {
        method: 'POST',
        body: JSON.stringify({ model, messages: active.messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.text);
    } catch (e) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function sendMessage() {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/affiliate-reply/${convId}/send`, {
        method: 'POST',
        body: JSON.stringify({ text: draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDraft('');
      await fetchActive(convId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function timeAgoLocal(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  if (!active) return (
    <div className="empty-state">
      <div className="empty-icon">◈</div>
      <p>Loading...</p>
    </div>
  );

  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

  return (
    <>
      <div className="thread-header">
        {active.avatar
          ? <img src={active.avatar} alt={active.creatorName} className="avatar" style={{ borderRadius: '50%', objectFit: 'cover', width: 36, height: 36 }} />
          : <div className="avatar">{active.creatorName?.[0]?.toUpperCase() || '?'}</div>
        }
        <div>
          <span className="thread-name">{active.creatorName}</span>
          <span className="thread-email" style={{ marginLeft: 8, color: '#888', fontSize: '0.8rem' }}>TikTok Affiliate</span>
        </div>
      </div>

      <div className="thread">
        {active.messages.map((m, i) => (
          <div key={i} className={`bubble-wrap ${m.role === 'shop' ? 'outbound' : 'inbound'}`}>
            <div className="bubble">
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
              <span className="bubble-time">{timeAgoLocal(m.ts)}</span>
            </div>
          </div>
        ))}
        <div ref={el => { bottomRef.current = el; }} />
      </div>

      <div className="compose-bar">
        {error && <div className="error-banner">{error}</div>}
        <div className="compose-draft-area">
          <textarea
            ref={el => { draftRef.current = el; }}
            className="compose-textarea"
            placeholder="Write a reply to this affiliate..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage(); }}
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
              onClick={sendMessage}
              disabled={!draft.trim() || sending}
            >
              {sending ? 'Sending…' : 'Send ↑'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
