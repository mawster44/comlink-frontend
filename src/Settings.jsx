import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import './Settings.css';

const MODELS = [
  { id: 'claude', label: 'Claude (Anthropic)', desc: 'claude-sonnet-5', color: '#c97e3a' },
  { id: 'gpt',    label: 'GPT-4o (OpenAI)',   desc: 'gpt-4o',          color: '#10a37f' },
  { id: 'gemini', label: 'Gemini (Google)',    desc: 'gemini-1.5-flash', color: '#4285f4' },
  { id: 'ollama', label: 'Ollama (Local)',     desc: 'llama3 via localhost', color: '#888' },
];

export default function Settings({ model, setModel, systemPrompt, setSystemPrompt, onClose, user }) {
  const [tiktok, setTiktok] = useState({ connected: false });
  const [gmail, setGmail] = useState({ connected: false, email: null });
  const [slack, setSlack] = useState({ connected: false });
  const [slackUrl, setSlackUrl] = useState('');
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [affiliateSlack, setAffiliateSlack] = useState({ connected: false });
  const [affiliateSlackUrl, setAffiliateSlackUrl] = useState('');
  const [savingAffiliateSlack, setSavingAffiliateSlack] = useState(false);
  const [testingAffiliateSlack, setTestingAffiliateSlack] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Team management
  const [teamMembers, setTeamMembers] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchTiktokStatus();
    fetchGmailStatus();
    fetchSlackStatus();
    fetchAffiliateSlackStatus();
    if (user?.role === 'admin') fetchTeam();

    const params = new URLSearchParams(window.location.search);
    const tiktokResult = params.get('tiktok');
    const gmailResult = params.get('gmail');

    if (tiktokResult === 'success') { showToast('TikTok Shop connected successfully! ✓'); fetchTiktokStatus(); }
    if (tiktokResult === 'error')   { showToast('TikTok connection failed. Please try again.', true); }
    if (gmailResult  === 'success') { showToast('Gmail connected successfully! ✓'); fetchGmailStatus(); }
    if (gmailResult  === 'error')   { showToast('Gmail connection failed. Please try again.', true); }

    if (tiktokResult || gmailResult) window.history.replaceState({}, '', '/settings');
  }, []);

  async function fetchTiktokStatus() {
    try { setTiktok(await (await fetch(`${API_BASE}/auth/status`)).json()); } catch {}
  }

  async function fetchGmailStatus() {
    try { setGmail(await (await fetch(`${API_BASE}/auth/gmail/status`)).json()); } catch {}
  }

  async function fetchSlackStatus() {
    try { setSlack(await (await apiFetch('/api/slack/status')).json()); } catch {}
  }

  async function fetchAffiliateSlackStatus() {
    try { setAffiliateSlack(await (await apiFetch('/api/slack/affiliate-status')).json()); } catch {}
  }

  async function saveAffiliateSlackWebhook() {
    if (!affiliateSlackUrl.startsWith('https://hooks.slack.com/')) {
      showToast('That does not look like a valid Slack webhook URL.', true);
      return;
    }
    setSavingAffiliateSlack(true);
    const res = await apiFetch('/api/slack/affiliate-webhook', {
      method: 'POST',
      body: JSON.stringify({ url: affiliateSlackUrl }),
    });
    setSavingAffiliateSlack(false);
    if (res.ok) { showToast('Affiliate Slack webhook saved!'); setAffiliateSlackUrl(''); fetchAffiliateSlackStatus(); }
    else showToast('Failed to save webhook.', true);
  }

  async function testAffiliateSlack() {
    setTestingAffiliateSlack(true);
    const res = await apiFetch('/api/slack/affiliate-test', { method: 'POST' });
    setTestingAffiliateSlack(false);
    if (res.ok) showToast('Test message sent to affiliate Slack!');
    else showToast('Test failed. Check your webhook URL.', true);
  }

  async function saveSlackWebhook() {
    if (!slackUrl.startsWith('https://hooks.slack.com/')) {
      showToast('That does not look like a valid Slack webhook URL.', true);
      return;
    }
    setSavingSlack(true);
    const res = await apiFetch('/api/slack/webhook', {
      method: 'POST',
      body: JSON.stringify({ url: slackUrl }),
    });
    setSavingSlack(false);
    if (res.ok) { showToast('Slack webhook saved!'); setSlackUrl(''); fetchSlackStatus(); }
    else showToast('Failed to save webhook.', true);
  }

  async function testSlack() {
    setTestingSlack(true);
    const res = await apiFetch('/api/slack/test', { method: 'POST' });
    setTestingSlack(false);
    if (res.ok) showToast('Test message sent to Slack!');
    else showToast('Test failed. Check your webhook URL.', true);
  }

  async function disconnectTiktok() {
    await apiFetch('/auth/disconnect', { method: 'POST' });
    fetchTiktokStatus();
  }

  async function disconnectGmail() {
    await apiFetch('/auth/gmail/disconnect', { method: 'POST' });
    fetchGmailStatus();
  }

  async function fetchTeam() {
    try {
      const { getToken } = await import('./auth.js');
      const res = await fetch(`${API_BASE}/auth/users/users`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setTeamMembers(await res.json());
    } catch {}
  }

  async function addMember(e) {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) return;
    setAddingMember(true);
    try {
      const { getToken } = await import('./auth.js');
      const res = await fetch(`${API_BASE}/auth/users/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: 'agent' }),
      });
      if (res.ok) {
        showToast(`${newName} added to the team!`);
        setNewName(''); setNewEmail(''); setNewPassword('');
        fetchTeam();
      } else {
        const { error } = await res.json();
        showToast(error || 'Failed to add member.', true);
      }
    } catch { showToast('Failed to add member.', true); }
    finally { setAddingMember(false); }
  }

  async function removeMember(id, name) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    try {
      const { getToken } = await import('./auth.js');
      const res = await fetch(`${API_BASE}/auth/users/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { showToast(`${name} removed.`); fetchTeam(); }
      else showToast('Failed to remove member.', true);
    } catch { showToast('Failed to remove member.', true); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (newPasswordVal !== confirmPassword) { showToast('Passwords do not match.', true); return; }
    if (newPasswordVal.length < 8) { showToast('Password must be at least 8 characters.', true); return; }
    setChangingPassword(true);
    try {
      const { getToken } = await import('./auth.js');
      const res = await fetch(`${API_BASE}/auth/users/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ newPassword: newPasswordVal }),
      });
      if (res.ok) {
        showToast('Password updated!');
        setCurrentPassword(''); setNewPasswordVal(''); setConfirmPassword('');
      } else {
        const { error } = await res.json();
        showToast(error || 'Failed to update password.', true);
      }
    } catch { showToast('Failed to update password.', true); }
    finally { setChangingPassword(false); }
  }

  function showToast(msg, isError = false) {
    setToastMsg({ msg, isError });
    setTimeout(() => setToastMsg(null), 4000);
  }

  return (
    <div className="settings-overlay">
      {toastMsg && (
        <div className={`toast ${toastMsg.isError ? 'toast-error' : 'toast-success'}`}>
          {toastMsg.msg}
        </div>
      )}

      <div className="settings-modal">
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Integrations */}
        <section className="settings-section">
          <h3>Integrations</h3>

          {/* TikTok */}
          <div className="integration-card">
            <div className="integration-icon tiktok-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
              </svg>
            </div>
            <div className="integration-info">
              <div className="integration-name">TikTok Shop</div>
              <div className={`integration-status ${tiktok.connected ? 'connected' : 'disconnected'}`}>
                <span className="status-dot" />
                {tiktok.connected ? `Connected${tiktok.shopName ? ` · ${tiktok.shopName}` : ''}` : 'Not connected'}
              </div>
            </div>
            <div className="integration-action">
              {tiktok.connected
                ? <button className="btn-disconnect" onClick={disconnectTiktok}>Disconnect</button>
                : <a className="btn-connect" href={`${API_BASE}/auth/tiktok`}>Connect</a>}
            </div>
          </div>

          {/* Gmail */}
          <div className="integration-card" style={{ marginTop: 10 }}>
            <div className="integration-icon gmail-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="#EA4335" d="M6 18V8.4L3 6.2V18h3z"/>
                <path fill="#34A853" d="M18 18V8.4l3-2.2V18h-3z"/>
                <path fill="#4285F4" d="M6 8.4l6 4.4 6-4.4V6L12 10.4 6 6v2.4z"/>
                <path fill="#FBBC04" d="M3 6.2l3 2.2V6H3.6L3 6.2z"/>
                <path fill="#C5221F" d="M21 6.2l-3 2.2V6h2.4l.6.2z"/>
              </svg>
            </div>
            <div className="integration-info">
              <div className="integration-name">Gmail</div>
              <div className={`integration-status ${gmail.connected ? 'connected' : 'disconnected'}`}>
                <span className="status-dot" />
                {gmail.connected ? `Connected · ${gmail.email}` : 'Not connected'}
              </div>
            </div>
            <div className="integration-action">
              {gmail.connected
                ? <button className="btn-disconnect" onClick={disconnectGmail}>Disconnect</button>
                : <a className="btn-connect gmail-btn" href={`${API_BASE}/auth/gmail/connect`}>Connect</a>}
            </div>
          </div>
          {/* Slack */}
          <div className="integration-card" style={{ marginTop: 10 }}>
            <div className="integration-icon slack-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.27 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.833 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.833 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.833 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.833zm0 1.27a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.833a2.528 2.528 0 0 1 2.522-2.521h6.311zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.833a2.528 2.528 0 0 1-2.523 2.521h-2.522V8.833zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.311zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.523v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#E01E5A"/>
              </svg>
            </div>
            <div className="integration-info">
              <div className="integration-name">Slack</div>
              <div className={`integration-status ${slack.connected ? 'connected' : 'disconnected'}`}>
                <span className="status-dot" />
                {slack.connected ? 'Webhook connected' : 'Not connected'}
              </div>
            </div>
            <div className="integration-action">
              {slack.connected && (
                <button className="btn-disconnect" onClick={testSlack} disabled={testingSlack}>
                  {testingSlack ? 'Sending...' : 'Test'}
                </button>
              )}
            </div>
          </div>

          {!slack.connected && (
            <div className="slack-webhook-form">
              <input
                className="slack-webhook-input"
                placeholder="https://hooks.slack.com/services/..."
                value={slackUrl}
                onChange={e => setSlackUrl(e.target.value)}
              />
              <button className="btn-connect" onClick={saveSlackWebhook} disabled={savingSlack || !slackUrl}>
                {savingSlack ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {/* Affiliate Slack */}
          <div className="integration-card" style={{ marginTop: 10 }}>
            <div className="integration-icon slack-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M14.5 10a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1-1.5 1.5zm-5 1a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 0-3h-5A1.5 1.5 0 0 0 9.5 11zm-5 2.5a1.5 1.5 0 0 0 1.5 1.5h1.5v1.5a1.5 1.5 0 0 0 3 0V15h-1.5A1.5 1.5 0 0 0 7.5 13.5H6a1.5 1.5 0 0 0-1.5 1.5zm9.5 3a1.5 1.5 0 0 0 1.5-1.5v-1.5H14a1.5 1.5 0 0 0-1.5 1.5v1.5a1.5 1.5 0 0 0 1.5 1.5z" fill="currentColor"/>
              </svg>
            </div>
            <div className="integration-info">
              <div className="integration-name">Slack — Affiliate Inbox</div>
              <div className={`integration-status ${affiliateSlack.connected ? 'connected' : 'disconnected'}`}>
                <span className="status-dot" />
                {affiliateSlack.connected ? 'Webhook connected' : 'Not connected'}
              </div>
            </div>
            <div className="integration-action">
              {affiliateSlack.connected && (
                <button className="btn-disconnect" onClick={testAffiliateSlack} disabled={testingAffiliateSlack}>
                  {testingAffiliateSlack ? 'Sending...' : 'Test'}
                </button>
              )}
            </div>
          </div>

          {!affiliateSlack.connected && (
            <div className="slack-webhook-form">
              <input
                className="slack-webhook-input"
                placeholder="https://hooks.slack.com/services/..."
                value={affiliateSlackUrl}
                onChange={e => setAffiliateSlackUrl(e.target.value)}
              />
              <button className="btn-connect" onClick={saveAffiliateSlackWebhook} disabled={savingAffiliateSlack || !affiliateSlackUrl}>
                {savingAffiliateSlack ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

        </section>

        {/* AI Model */}
        <section className="settings-section">
          <h3>Default AI model</h3>
          <div className="model-list">
            {MODELS.map(m => (
              <button
                key={m.id}
                className={`model-option ${model === m.id ? 'selected' : ''}`}
                style={model === m.id ? { borderColor: m.color } : {}}
                onClick={() => setModel(m.id)}
              >
                <div className="model-dot" style={{ background: m.color }} />
                <div>
                  <div className="model-option-label">{m.label}</div>
                  <div className="model-option-desc">{m.desc}</div>
                </div>
                {model === m.id && <span className="checkmark" style={{ color: m.color }}>✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* System prompt */}
        <section className="settings-section">
          <h3>System prompt</h3>
          <p className="settings-hint">Customize how the AI represents your shop. Leave blank to use the default.</p>
          <textarea
            className="system-prompt-input"
            rows={5}
            placeholder="You are a helpful TikTok Shop customer service assistant. Be friendly, concise, and professional…"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
          />
        </section>

        {/* Team */}
        {user?.role === 'admin' && (
          <section className="settings-section">
            <h3>Team</h3>
            <div className="team-list">
              {teamMembers.map(m => (
                <div key={m.id} className="team-member">
                  <div className="team-avatar">{m.name?.[0]?.toUpperCase()}</div>
                  <div className="team-info">
                    <div className="team-name">{m.name}</div>
                    <div className="team-email">{m.email} · <span className="team-role">{m.role}</span></div>
                  </div>
                  {m.id !== user.id && (
                    <button className="btn-disconnect" onClick={() => removeMember(m.id, m.name)}>Remove</button>
                  )}
                </div>
              ))}
            </div>

            <form className="add-member-form" onSubmit={addMember}>
              <div className="add-member-title">Add team member</div>
              <input className="settings-input" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} required />
              <input className="settings-input" type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
              <input className="settings-input" type="password" placeholder="Temporary password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <button className="btn-save" type="submit" disabled={addingMember}>
                {addingMember ? 'Adding…' : 'Add member'}
              </button>
            </form>
          </section>
        )}

        {/* Change Password */}
        <section className="settings-section">
          <h3>Change Password</h3>
          <form className="add-member-form" onSubmit={changePassword}>
            <input className="settings-input" type="password" placeholder="New password" value={newPasswordVal} onChange={e => setNewPasswordVal(e.target.value)} required />
            <input className="settings-input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            <button className="btn-save" type="submit" disabled={changingPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>

        <div className="settings-footer">
          <button className="btn-save" onClick={onClose}>Save & close</button>
        </div>
      </div>
    </div>
  );
}
