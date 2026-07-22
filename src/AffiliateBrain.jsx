import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import './BrandBrain.css';

export default function AffiliateBrain({ onClose }) {
  const [brain, setBrain] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState('prompt');
  const [newExample, setNewExample] = useState({ creatorMessage: '', shopReply: '', notes: '' });
  const [addingExample, setAddingExample] = useState(false);

  useEffect(() => { fetchBrain(); }, []);

  async function fetchBrain() {
    const res = await apiFetch('/api/affiliate-brain');
    setBrain(await res.json());
  }

  async function resetToDefault() {
    if (!confirm('Reset the system prompt to the built-in default? Your examples will be kept.')) return;
    setResetting(true);
    const res = await apiFetch('/api/affiliate-brain/reset', { method: 'POST' });
    setBrain(await res.json());
    setResetting(false);
  }

  async function save() {
    setSaving(true);
    await apiFetch('/api/affiliate-brain', {
      method: 'PUT',
      body: JSON.stringify(brain),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addExample() {
    if (!newExample.creatorMessage.trim() || !newExample.shopReply.trim()) return;
    setAddingExample(true);
    await apiFetch('/api/affiliate-brain/examples', {
      method: 'POST',
      body: JSON.stringify(newExample),
    });
    setNewExample({ creatorMessage: '', shopReply: '', notes: '' });
    setAddingExample(false);
    fetchBrain();
  }

  async function deleteExample(i) {
    await apiFetch(`/api/affiliate-brain/examples/${i}`, { method: 'DELETE' });
    fetchBrain();
  }

  if (!brain) return (
    <div className="bb-overlay">
      <div className="bb-modal"><p style={{ color: 'var(--muted)', padding: '2rem' }}>Loading...</p></div>
    </div>
  );

  return (
    <div className="bb-overlay">
      <div className="bb-modal">
        <div className="bb-header">
          <div className="bb-title">
            <span className="bb-icon">◈</span>
            Affiliate Brain
          </div>
          <div className="bb-header-actions">
            <button className="bb-save-btn" onClick={resetToDefault} disabled={resetting} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {resetting ? 'Resetting...' : 'Reset to default'}
            </button>
            <button className="bb-save-btn" onClick={save} disabled={saving}>
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save changes'}
            </button>
            <button className="bb-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="bb-tabs">
          <button className={`bb-tab ${tab === 'prompt' ? 'active' : ''}`} onClick={() => setTab('prompt')}>
            System Prompt
          </button>
          <button className={`bb-tab ${tab === 'examples' ? 'active' : ''}`} onClick={() => setTab('examples')}>
            Example Conversations
            {brain.examples?.length > 0 && <span className="bb-count">{brain.examples.length}</span>}
          </button>
        </div>

        <div className="bb-body">
          {tab === 'prompt' && (
            <div className="bb-section">
              <p className="bb-hint">
                This is the Affiliate Brain — the AI context used only when messaging TikTok creators and affiliates. Separate from the customer Brand Brain.
              </p>
              <textarea
                className="bb-prompt-editor"
                value={brain.systemPrompt}
                onChange={e => setBrain(b => ({ ...b, systemPrompt: e.target.value }))}
                spellCheck={false}
              />
            </div>
          )}

          {tab === 'examples' && (
            <div className="bb-section">
              <p className="bb-hint">
                Add real affiliate conversations as examples. The AI learns your preferred tone and approach from these.
              </p>

              <div className="bb-example-form">
                <label className="bb-label">Creator message</label>
                <textarea
                  className="bb-example-input"
                  rows={3}
                  placeholder="Paste the creator's message..."
                  value={newExample.creatorMessage}
                  onChange={e => setNewExample(n => ({ ...n, creatorMessage: e.target.value }))}
                />
                <label className="bb-label">Your reply (the ideal response)</label>
                <textarea
                  className="bb-example-input"
                  rows={4}
                  placeholder="Paste the ideal reply..."
                  value={newExample.shopReply}
                  onChange={e => setNewExample(n => ({ ...n, shopReply: e.target.value }))}
                />
                <label className="bb-label">Notes (optional)</label>
                <input
                  className="bb-example-notes"
                  placeholder="e.g. commission question, product sample request..."
                  value={newExample.notes}
                  onChange={e => setNewExample(n => ({ ...n, notes: e.target.value }))}
                />
                <button
                  className="bb-add-btn"
                  onClick={addExample}
                  disabled={addingExample || !newExample.creatorMessage.trim() || !newExample.shopReply.trim()}
                >
                  {addingExample ? 'Adding...' : 'Add example'}
                </button>
              </div>

              {brain.examples?.length === 0 && (
                <p className="bb-empty">No examples yet. Add your first one above.</p>
              )}
              {brain.examples?.map((ex, i) => (
                <div key={i} className="bb-example-card">
                  <div className="bb-example-header">
                    <span className="bb-example-num">Example {i + 1}</span>
                    {ex.notes && <span className="bb-example-tag">{ex.notes}</span>}
                    <button className="bb-delete-btn" onClick={() => deleteExample(i)}>Remove</button>
                  </div>
                  <div className="bb-example-row">
                    <span className="bb-role customer">Creator</span>
                    <p className="bb-example-text">{ex.creatorMessage}</p>
                  </div>
                  <div className="bb-example-row">
                    <span className="bb-role shop">Reply</span>
                    <p className="bb-example-text">{ex.shopReply}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
