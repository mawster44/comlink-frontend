import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from './auth.js';
import { todayKey, shiftDay, money, tone, shortDay, timeAgo, readJson } from './profitFormat.js';
import './Profit.css';

const WINDOW_DAYS = 60; // how far back the page loads; the cards and the table are all cut from this

const periods = (today) => [
  { key: 'today', label: 'Today so far', from: today, to: today },
  { key: 'yesterday', label: 'Yesterday', from: shiftDay(today, -1), to: shiftDay(today, -1) },
  { key: 'last7', label: 'Last 7 days', from: shiftDay(today, -6), to: today },
  { key: 'mtd', label: 'Month to date', from: `${today.slice(0, 8)}01`, to: today },
  { key: 'last30', label: 'Last 30 days', from: shiftDay(today, -29), to: today },
];

// Adds up the channels over a period. A channel with no figure for some of the days is reported as incomplete, because
// the total for that period is then lower than the truth.
function aggregate(days, channels, { from, to }) {
  const rows = days.filter(d => d.date >= from && d.date <= to);
  const byChannel = {};
  const incomplete = new Set();
  let total = 0;
  let pending = 0;
  for (const d of rows) {
    total += d.total;
    pending += d.tiktokPendingOrders;
    for (const c of channels) {
      if (d.channels[c.id] === null) incomplete.add(c.id);
      else byChannel[c.id] = (byChannel[c.id] ?? 0) + d.channels[c.id];
    }
  }
  return { total, byChannel, incomplete: channels.filter(c => incomplete.has(c.id)), pending, days: rows.length };
}

export default function BusinessDashboard() {
  const today = todayKey();
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = shiftDay(todayKey(), -(WINDOW_DAYS - 1));
      const [business, list] = await Promise.all([
        readJson(await apiFetch(`/api/profit/business?from=${from}&to=${todayKey()}`)),
        readJson(await apiFetch('/api/profit/business-entries')),
      ]);
      setData(business);
      setEntries(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cards = useMemo(() => (data ? periods(today).map(p => ({ ...p, ...aggregate(data.days, data.channels, p) })) : []), [data, today]);

  return (
    <div className="profit">
      <div className="profit-head">
        <div>
          <h1>Business profit</h1>
          <div className="profit-sub">
            What we keep after product cost, fees, shipping and ad spend, before overhead. An estimate for checking in, not the books.
            {data?.lastSync && <> TikTok last synced {timeAgo(data.lastSync)}.</>}
          </div>
        </div>
        <div className="profit-controls">
          <button className="primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="note bad">{error}</div>}

      {data && (
        <>
          <div className="biz-cards">
            {cards.map(c => <PeriodCard key={c.key} card={c} channels={data.channels} />)}
          </div>
          <DailyTable days={data.days} channels={data.channels} today={today} />
        </>
      )}

      <Entries entries={entries} onChange={load} />
    </div>
  );
}

function PeriodCard({ card, channels }) {
  const range = card.from === card.to ? shortDay(card.from) : `${shortDay(card.from)} – ${shortDay(card.to)}`;
  const perDay = card.days > 1 ? card.total / card.days : null;
  return (
    <div className="kpi biz-card">
      <span className="kpi-label">{card.label}</span>
      <span className={`biz-big ${tone(card.total)}`}>{money(card.total)}</span>
      <span className="kpi-sub">{range}{perDay !== null && <> · {money(perDay, { cents: false })}/day</>}</span>
      <ul className="biz-channels">
        {channels.map(ch => {
          const v = card.byChannel[ch.id];
          return (
            <li key={ch.id}>
              <span>{ch.label}</span>
              <span className={v === undefined ? 'muted' : tone(v)}>{v === undefined ? 'no data' : money(v, { cents: false })}</span>
            </li>
          );
        })}
      </ul>
      {card.incomplete.length > 0 && (
        <span className="biz-flag">Missing {card.incomplete.map(c => c.label).join(', ')}, so this is low</span>
      )}
      {card.pending > 0 && <span className="kpi-sub">{card.pending} TikTok orders still awaiting payout</span>}
    </div>
  );
}

function DailyTable({ days, channels, today }) {
  const rows = days.filter(d => d.date >= shiftDay(today, -29)).slice().reverse();
  return (
    <div className="card">
      <h2>By day <span className="hint">last 30 days, newest first</span></h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              {channels.map(c => <th key={c.id} className="r">{c.label}</th>)}
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.date} className={d.missing.length === channels.length ? 'dim' : ''}>
                <td>{shortDay(d.date)}{d.date === today && <span className="muted"> · today</span>}</td>
                {channels.map(c => (
                  <td key={c.id} className={`r ${d.channels[c.id] === null ? 'muted' : tone(d.channels[c.id])}`}>
                    {d.channels[c.id] === null ? '—' : money(d.channels[c.id])}
                  </td>
                ))}
                <td className={`r strong ${tone(d.total)}`}>{money(d.total)}{d.missing.length > 0 && d.missing.length < channels.length && <span className="muted" title={`No figure for ${d.missing.join(', ')}`}> *</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted pad">— means no figure for that channel and day (it is left out of the total, not counted as $0). * marks a total with a channel missing.</p>
    </div>
  );
}

const MANUAL = [
  { id: 'amazon', label: 'Amazon' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'walmart', label: 'Walmart' },
];

function Entries({ entries, onChange }) {
  const today = todayKey();
  const [form, setForm] = useState({ channel: 'amazon', from: shiftDay(today, -1), to: shiftDay(today, -1), amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await readJson(await apiFetch('/api/profit/business-entries', { method: 'POST', body: JSON.stringify({ ...form, amount: form.amount }) }));
      setForm(f => ({ ...f, amount: '', note: '' }));
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    setError(null);
    try {
      await readJson(await apiFetch(`/api/profit/business-entries/${id}`, { method: 'DELETE' }));
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <h2>Channels entered by hand <span className="hint">until each one has a live feed</span></h2>
      <p className="muted pad">
        Enter what a channel made over a period, after product cost, fees, shipping and ad spend. It is spread evenly over the days, so a month
        of Walmart is one entry. Use one day for a single day.
      </p>
      <form className="biz-form" onSubmit={submit}>
        <select value={form.channel} onChange={set('channel')}>
          {MANUAL.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input type="date" value={form.from} onChange={set('from')} required />
        <span className="dash">to</span>
        <input type="date" value={form.to} onChange={set('to')} required />
        <input type="number" step="0.01" placeholder="Profit $" value={form.amount} onChange={set('amount')} required />
        <input className="search" placeholder="Note (optional)" value={form.note} onChange={set('note')} maxLength={200} />
        <button className="primary small" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
      </form>
      {error && <div className="note bad" style={{ marginTop: 10 }}>{error}</div>}

      {entries.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th>Channel</th><th>Period</th><th className="r">Profit</th><th className="r">Per day</th><th>Note</th><th /></tr>
            </thead>
            <tbody>
              {[...entries].reverse().map(e => {
                const days = Math.round((new Date(`${e.to}T00:00:00Z`) - new Date(`${e.from}T00:00:00Z`)) / 86400000) + 1;
                return (
                  <tr key={e.id}>
                    <td>{MANUAL.find(c => c.id === e.channel)?.label ?? e.channel}</td>
                    <td>{e.from === e.to ? shortDay(e.from) : `${shortDay(e.from)} – ${shortDay(e.to)}`}</td>
                    <td className={`r ${tone(e.amount)}`}>{money(e.amount)}</td>
                    <td className="r muted">{money(e.amount / days)}</td>
                    <td className="muted">{e.note}</td>
                    <td className="r"><button className="link inline" onClick={() => remove(e.id)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
