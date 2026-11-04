import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import { money, tone, shortDay, readJson } from './profitFormat.js';

const STORAGE_KEY = 'profit.snapshot.cards';
const DEFAULT_CARDS = ['today', 'yesterday', 'last7', 'mtd', 'lastMonth'];

// The chosen cards are a per-browser convenience, so storage that is blocked or empty just falls back to the defaults.
function loadChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* use defaults */ }
  return DEFAULT_CARDS;
}
function saveChoice(keys) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); } catch { /* not saved */ }
}

const rangeText = (t) => (t.from === t.to ? shortDay(t.from) : `${shortDay(t.from)} – ${shortDay(t.to)}`);
const delta = (n) => (n === null || n === undefined ? null : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);

// At-a-glance cards for fixed periods, each against the period before it. `refresh` changes after a sync or an edit.
export default function Snapshot({ refresh, onPick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(loadChoice);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    apiFetch('/api/profit/snapshot').then(readJson).then(setData).catch(e => setError(e.message));
  }, [refresh]);

  if (error) return <div className="note bad">{error}</div>;
  if (!data) return null;

  const toggle = (key) => {
    const next = chosen.includes(key) ? chosen.filter(k => k !== key) : [...chosen, key];
    if (!next.length) return; // keep at least one card
    // Keep the order the cards come in, not the order they were ticked.
    const ordered = data.tiles.map(t => t.key).filter(k => next.includes(k));
    setChosen(ordered);
    saveChoice(ordered);
  };

  const shown = data.tiles.filter(t => chosen.includes(t.key));
  return (
    <section className="snapshot">
      <div className="snap-head">
        <span className="muted">Snapshot · changes compare with the period before</span>
        <button className="link-btn" onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit cards'}</button>
      </div>
      {editing && (
        <div className="snap-edit">
          {data.tiles.map(t => (
            <label key={t.key}>
              <input type="checkbox" checked={chosen.includes(t.key)} onChange={() => toggle(t.key)} /> {t.label}
            </label>
          ))}
        </div>
      )}
      <div className="snap-grid">
        {shown.map(t => <Card key={t.key} t={t} onPick={onPick} />)}
      </div>
    </section>
  );
}

function Card({ t, onPick }) {
  const salesDelta = t.change ? delta(t.change.sales) : null;
  const ordersDelta = t.change ? delta(t.change.orders) : null;
  return (
    <div className={`snap snap-${t.key}`}>
      <div className="snap-title">
        <strong>{t.label}</strong>
        <span>{rangeText(t)}</span>
      </div>
      <div className="snap-body">
        <div>
          <span className="kpi-label">Sales {salesDelta && <em className={t.change.sales >= 0 ? 'pos' : 'neg'}>{salesDelta}</em>}</span>
          <span className="snap-big">{money(t.sales)}</span>
        </div>
        <div className="snap-row">
          <div>
            <span className="kpi-label">Orders / units {ordersDelta && <em className={t.change.orders >= 0 ? 'pos' : 'neg'}>{ordersDelta}</em>}</span>
            <span>{t.orders.toLocaleString()} / {t.units.toLocaleString()}</span>
          </div>
          <div>
            <span className="kpi-label">Returns</span>
            <span>{t.returns}</span>
          </div>
        </div>
        <div className="snap-row">
          <div>
            <span className="kpi-label">Ad spend</span>
            <span>{money(-t.adSpend)}</span>
          </div>
          <div>
            <span className="kpi-label">Payout</span>
            <span>{money(t.payout)}</span>
          </div>
        </div>
        <div>
          <span className="kpi-label">
            Net profit {t.change && <em className={t.change.netProfit >= 0 ? 'pos' : 'neg'}>{t.change.netProfit >= 0 ? '+' : '-'}{money(Math.abs(t.change.netProfit), { cents: false })}</em>}
          </span>
          <span className={`snap-net ${tone(t.netProfit)}`}>{money(t.netProfit)}</span>
        </div>
        <ul className="snap-notes">
          {t.adsMissingDays > 0 && <li>Ad spend for {t.adsMissingDays === 1 ? 'this day isn’t' : `${t.adsMissingDays} days aren’t`} in yet, so profit is high</li>}
          {t.pendingOrders > 0 && <li>{t.pendingOrders} orders awaiting payout</li>}
          {t.partial && <li>Data only goes back to some days into this period</li>}
        </ul>
      </div>
      <button className="snap-more" onClick={() => onPick(t.from, t.to)}>More</button>
    </div>
  );
}
