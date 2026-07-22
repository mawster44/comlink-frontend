import { useState } from 'react';
import { apiFetch } from './auth.js';

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: '#888' },
  { value: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { value: 'closed',      label: 'Closed',       color: '#10b981' },
];

export function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return (
    <span className="crm-status-badge" style={{ color: opt.color, borderColor: opt.color + '55', background: opt.color + '18' }}>
      {opt.label}
    </span>
  );
}

export function CrmListMeta({ crm }) {
  const status = crm?.status || 'open';
  const labels = crm?.labels || [];
  return (
    <div className="crm-list-meta">
      <StatusBadge status={status} />
      {labels.map(l => <span key={l} className="crm-label-chip">{l}</span>)}
    </div>
  );
}

export function CrmThreadPanel({ convId, crm, onUpdate }) {
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const status = crm?.status || 'open';
  const labels = crm?.labels || [];
  const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  async function updateStatus(newStatus) {
    const res = await apiFetch(`/api/crm/${convId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    if (res?.ok) onUpdate(await res.json());
  }

  async function addLabel() {
    const label = labelInput.trim().toLowerCase();
    if (!label || labels.includes(label)) { setLabelInput(''); setShowLabelInput(false); return; }
    const res = await apiFetch(`/api/crm/${convId}`, { method: 'PATCH', body: JSON.stringify({ labels: [...labels, label] }) });
    if (res?.ok) { onUpdate(await res.json()); setLabelInput(''); setShowLabelInput(false); }
  }

  async function removeLabel(label) {
    const res = await apiFetch(`/api/crm/${convId}`, { method: 'PATCH', body: JSON.stringify({ labels: labels.filter(l => l !== label) }) });
    if (res?.ok) onUpdate(await res.json());
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    const res = await apiFetch(`/api/crm/${convId}/notes`, { method: 'POST', body: JSON.stringify({ text: noteText }) });
    setSaving(false);
    if (res?.ok) { onUpdate(await res.json()); setNoteText(''); setAddingNote(false); }
  }

  return (
    <div className="crm-thread-panel">
      <div className="crm-controls">
        <select
          className="crm-status-select"
          value={status}
          style={{ color: opt.color, borderColor: opt.color + '66' }}
          onChange={e => updateStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <div className="crm-labels-row">
          {labels.map(l => (
            <span key={l} className="crm-label-chip removable">
              {l}<button className="crm-label-remove" onClick={() => removeLabel(l)}>×</button>
            </span>
          ))}
          {showLabelInput ? (
            <input
              className="crm-label-input"
              autoFocus
              placeholder="label..."
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addLabel();
                if (e.key === 'Escape') { setShowLabelInput(false); setLabelInput(''); }
              }}
              onBlur={addLabel}
            />
          ) : (
            <button className="crm-add-label" onClick={() => setShowLabelInput(true)}>+ label</button>
          )}
        </div>

        <button className="crm-note-btn" onClick={() => setAddingNote(!addingNote)}>
          {addingNote ? 'cancel' : '+ note'}
        </button>
      </div>

      {addingNote && (
        <div className="crm-note-compose">
          <textarea
            autoFocus
            className="crm-note-textarea"
            placeholder="Internal note — not sent to customer or creator..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote(); }}
            rows={2}
          />
          <button className="crm-note-save" onClick={submitNote} disabled={saving || !noteText.trim()}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      )}
    </div>
  );
}

export function NoteMessage({ note }) {
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }
  return (
    <div className="note-message">
      <div className="note-header">Internal note · {note.author} · {timeAgo(note.ts)}</div>
      <div className="note-text">{note.text}</div>
    </div>
  );
}
