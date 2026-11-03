import { useState } from 'react';
import { apiFetch } from './auth.js';
import { money, shortDay, readJson } from './profitFormat.js';

// Amazon's actual MCF charge for one product over a period, spread over that period's seller-shipped orders.
export default function McfActuals({ allocations, skus, range, onChanged }) {
  const [form, setForm] = useState({ sku: '', from: '', to: '', amount: '', note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const names = Object.fromEntries(skus.map(s => [s.sku, s.productName]));

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  async function save(e) {
    e.preventDefault();
    setError(null);
    const amount = Number(form.amount);
    if (!form.sku || !form.from || !form.to || form.amount === '' || !Number.isFinite(amount) || amount < 0) {
      setError('Choose a product, both dates and an amount of $0 or more.');
      return;
    }
    setBusy(true);
    try {
      await readJson(await apiFetch('/api/profit/mcf-actuals', {
        method: 'POST',
        body: JSON.stringify({ sku: form.sku, from: form.from, to: form.to, amount, note: form.note }),
      }));
      setForm({ sku: '', from: '', to: '', amount: '', note: '' });
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    if (!window.confirm(`Remove the ${money(entry.amount)} MCF entry for ${entry.sku}? Those orders go back to the per-unit estimate.`)) return;
    try {
      await readJson(await apiFetch(`/api/profit/mcf-actuals/${entry.id}`, { method: 'DELETE' }));
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Amazon MCF actuals <span className="hint">enter what Amazon really charged, so profit matches it</span></h2>
        <form className="cost-form" onSubmit={save}>
          <label>Product
            <select value={form.sku} onChange={e => set({ sku: e.target.value })}>
              <option value="">Choose…</option>
              {skus.map(s => <option key={s.sku} value={s.sku}>{s.productName || s.sku}</option>)}
            </select>
          </label>
          <label>From
            <input type="date" value={form.from} onChange={e => set({ from: e.target.value })} />
          </label>
          <label>To
            <input type="date" value={form.to} onChange={e => set({ to: e.target.value })} />
          </label>
          <label>Amazon charged
            <input type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={e => set({ amount: e.target.value })} />
          </label>
          <label>Note
            <input value={form.note} placeholder="e.g. from Sellerboard" onChange={e => set({ note: e.target.value })} />
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save actual'}</button>
        </form>
        <p className="muted">
          The total is split evenly per unit across that product’s seller-shipped orders in the period and replaces the per-unit
          estimate there, down to the cent. Sellerboard shows it under Amazon fees as “(MCF)”. Amazon posts MCF fees a day or
          two after shipping, so leave the latest days to the estimate until they’ve posted.{' '}
          <button type="button" className="link inline" onClick={() => set({ from: range.from, to: range.to })}>
            Fill in the dates above with the current date range
          </button>
        </p>
        {error && <div className="note bad">{error}</div>}
      </section>

      <section className="card">
        <h2>Entered actuals</h2>
        {!allocations.length && <p className="muted pad">None yet. Seller-shipped orders use the per-unit MCF fee above.</p>}
        {allocations.map(a => (
          <div key={a.id} className="sku-block">
            <div className="sku-head">
              <div>
                <div className="prod" title={names[a.sku]}>{names[a.sku] || a.sku}</div>
                <code>{a.sku}</code> · {shortDay(a.from)} – {shortDay(a.to)}{a.note ? ` · ${a.note}` : ''}
              </div>
              <div className="actual-side">
                <div className="sku-now">{money(a.amount)}<span>charged</span></div>
                <button className="x" title="Remove this entry" onClick={() => remove(a)}>×</button>
              </div>
            </div>
            {a.units > 0 ? (
              <p className="muted">
                Spread over {a.orders.toLocaleString()} orders ({a.units.toLocaleString()} units): <b>{money(a.perUnit)}</b> per unit.
                {a.pendingOrders > 0 && ` ${a.pendingOrders} more still awaiting payout will join once they settle.`}
              </p>
            ) : (
              <p className="note bad">No seller-shipped orders for this product with a payout in these dates, so nothing was applied.</p>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
