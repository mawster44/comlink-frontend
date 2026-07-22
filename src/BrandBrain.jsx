import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import './BrandBrain.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function BrandBrain({ onClose }) {
  const [brain, setBrain] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState('prompt');
  const [newExample, setNewExample] = useState({ customerMessage: '', shopReply: '', notes: '' });
  const [addingExample, setAddingExample] = useState(false);

  useEffect(() => { fetchBrain(); }, []);

  async function fetchBrain() {
    const res = await apiFetch('/api/brand-brain');
    setBrain(await res.json());
  }

  async function resetToDefault() {
    if (!confirm('Reset the system prompt to the built-in default? Your examples will be kept.')) return;
    setResetting(true);
    const res = await apiFetch('/api/brand-brain/reset', { method: 'POST' });
    setBrain(await res.json());
    setResetting(false);
  }

  async function save() {
    setSaving(true);
    await apiFetch('/api/brand-brain', {
      method: 'PUT',
      body: JSON.stringify(brain),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addExample() {
    if (!newExample.customerMessage.trim() || !newExample.shopReply.trim()) return;
    setAddingExample(true);
    await apiFetch('/api/brand-brain/examples', {
      method: 'POST',
      body: JSON.stringify(newExample),
    });
    setNewExample({ customerMessage: '', shopReply: '', notes: '' });
    setAddingExample(false);
    fetchBrain();
  }

  async function deleteExample(i) {
    await apiFetch(`/api/brand-brain/examples/${i}`, { method: 'DELETE' });
    fetchBrain();
  }

  if (!brain) return <div className="bb-overlay"><div className="bb-modal"><p style={{color:'var(--muted)',padding:'2rem'}}>Loading...</p></div></div>;

  return (
    <div className="bb-overlay">
      <div className="bb-modal">
        <div className="bb-header">
          <div className="bb-title">
            <span className="bb-icon">◈</span>
            Brand Brain
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
                This is the full Brand Brain injected into every AI reply. Edit it here to update the AI's knowledge, tone, and behavior instantly.
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
                Add real customer conversations as examples. The AI learns your preferred tone and approach from these.
              </p>

              {/* Add new example */}
              <div className="bb-example-form">
                <label className="bb-label">Customer message</label>
                <textarea
                  className="bb-example-input"
                  rows={3}
                  placeholder="Paste the customer's message..."
                  value={newExample.customerMessage}
                  onChange={e => setNewExample(n => ({ ...n, customerMessage: e.target.value }))}
                />
                <label className="bb-label">Your reply (the good response)</label>
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
                  placeholder="e.g. melted tallow question, shipping issue..."
                  value={newExample.notes}
                  onChange={e => setNewExample(n => ({ ...n, notes: e.target.value }))}
                />
                <button
                  className="bb-add-btn"
                  onClick={addExample}
                  disabled={addingExample || !newExample.customerMessage.trim() || !newExample.shopReply.trim()}
                >
                  {addingExample ? 'Adding...' : 'Add example'}
                </button>
              </div>

              {/* Existing examples */}
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
                    <span className="bb-role customer">Customer</span>
                    <p className="bb-example-text">{ex.customerMessage}</p>
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
