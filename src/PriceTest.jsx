import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './auth.js';
import { money, tone, shortDay, shiftDay, readJson } from './profitFormat.js';

const DEFAULT_SKU = '30OZ8262025';

export default function PriceTest({ range, summary }) {
  const skus = useMemo(
    () => summary.bySku.filter(s => s.sku && s.sku !== '(no sku)'),
    [summary.bySku],
  );
  const [sku, setSku] = useState(() => (skus.some(s => s.sku === DEFAULT_SKU) ? DEFAULT_SKU : skus[0]?.sku || ''));
  const [split, setSplit] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [price, setPrice] = useState('19.95');
  const [method, setMethod] = useState('tiktok');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const splitOk = split && split > range.from && split <= range.to;

  useEffect(() => {
    if (!sku) return undefined;
    const params = new URLSearchParams({ from: range.from, to: range.to, sku });
    if (splitOk) { params.set('split', split); if (minPrice !== '') params.set('minPrice', minPrice); }
    if (Number(price) > 0) { params.set('price', price); params.set('method', method); }
    let stale = false;
    // Short delay so typing a price doesn't fire a request per keystroke.
    const timer = setTimeout(() => {
      apiFetch(`/api/profit/pricing?${params}`)
        .then(readJson)
        .then(b => { if (!stale) { setData(b); setError(null); } })
        .catch(e => { if (!stale) setError(e.message); });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [range.from, range.to, sku, split, splitOk, minPrice, price, method]);

  if (!skus.length) return <p className="muted pad">No sales with a product code in this date range.</p>;

  const adPerOrder = summary.totals.adSpend / Math.max(1, summary.totals.orders - (summary.free?.orders || 0));
  const name = skus.find(s => s.sku === sku)?.productName;

  return (
    <>
      <section className="card">
        <h2>Price test <span className="hint">compare how one product sold before and after a price change</span></h2>
        <form className="cost-form" onSubmit={e => e.preventDefault()}>
          <label>Product
            <select value={sku} onChange={e => setSku(e.target.value)}>
              {skus.map(s => <option key={s.sku} value={s.sku}>{s.productName || s.sku}</option>)}
            </select>
          </label>
          <label>New price started on
            <input type="date" min={shiftDay(range.from, 1)} max={range.to} value={split} onChange={e => setSplit(e.target.value)} />
          </label>
          <label>Ignore sales below
            <input type="number" min="0" step="0.5" value={minPrice} placeholder="$0" onChange={e => setMinPrice(e.target.value)} />
          </label>
        </form>
        <p className="muted">
          Looks at paid orders containing only {name || sku}. Use “ignore sales below” to leave out auctions and clearance,
          which would otherwise pull the before and after averages down. Uses the date range above.
        </p>
        {error && <div className="note bad">{error}</div>}
        {!splitOk && <p className="muted pad">Pick the day the price changed (inside the date range, after its first day) to compare.</p>}
        {splitOk && data?.test && <TestResult test={data.test} />}
      </section>

      <section className="card">
        <h2>What would a price earn? <span className="hint">estimated from what orders near that price actually paid out</span></h2>
        <form className="cost-form" onSubmit={e => e.preventDefault()}>
          <label>Price
            <input type="number" min="0" step="0.05" value={price} onChange={e => setPrice(e.target.value)} />
          </label>
          <div className="seg">
            <button type="button" className={method === 'tiktok' ? 'on' : ''} onClick={() => setMethod('tiktok')}>TikTok label</button>
            <button type="button" className={method === 'seller' ? 'on' : ''} onClick={() => setMethod('seller')}>Amazon MCF</button>
          </div>
        </form>
        {data?.whatIf && <WhatIf result={data.whatIf} adPerOrder={adPerOrder} />}
      </section>
    </>
  );
}

const ROWS = [
  ['Orders', t => t.orders.toLocaleString()],
  ['Units per day', t => (t.orders ? t.unitsPerDay.toFixed(2) : '—')],
  ['Average sale price', t => money(t.avgPrice)],
  ['Payout per unit', t => money(t.payoutPerUnit)],
  ['Cost per unit', t => money(t.costPerUnit !== null ? -t.costPerUnit : null)],
  ['Profit per unit', t => money(t.profitPerUnit), t => tone(t.profitPerUnit)],
  ['Profit per day, before ads', t => money(t.profitPerDay), t => tone(t.profitPerDay)],
  ['Ads per order (shop-wide)', t => money(t.adPerOrder ? -t.adPerOrder : 0)],
  ['Net per day, after ads', t => money(t.netPerDay), t => tone(t.netPerDay)],
];

function TestResult({ test }) {
  const { before, after, breakEven } = test;
  if (!before.orders || !after.orders) {
    return <p className="muted pad">No matching orders {before.orders ? 'after' : 'before'} that date. Widen the range or lower “ignore sales below”.</p>;
  }
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              <th className="r">Before · {shortDay(before.from)} – {shortDay(before.to)}</th>
              <th className="r">After · {shortDay(after.from)} – {shortDay(after.to)}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, value, cls]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className={`r ${cls ? cls(before) : ''}`}>{value(before)}</td>
                <td className={`r strong ${cls ? cls(after) : ''}`}>{value(after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Verdict before={before} after={after} breakEven={breakEven} />
    </>
  );
}

function Verdict({ before, after, breakEven }) {
  const lines = [];
  if (!breakEven) return null;
  if (after.profitPerUnit <= 0) {
    lines.push({ bad: true, text: `At the new price each unit earns ${money(after.profitPerUnit)} before ads, so selling more only loses more.` });
  } else {
    const need = breakEven.unitsPerDayBeforeAds;
    const ahead = after.unitsPerDay >= need;
    lines.push({
      bad: !ahead,
      text: `To match the old profit before ads, the new price needs ${need.toFixed(2)} units a day (${breakEven.multipleBeforeAds}× the old ${before.unitsPerDay.toFixed(2)}). It is selling ${after.unitsPerDay.toFixed(2)}: ${ahead ? 'ahead' : 'behind'}.`,
    });
    if (breakEven.unitsPerDayAfterAds !== null) {
      const aheadAds = after.unitsPerDay >= breakEven.unitsPerDayAfterAds;
      lines.push({
        bad: !aheadAds,
        text: `Counting ${money(after.adPerOrder)} of ads per order, it needs ${breakEven.unitsPerDayAfterAds.toFixed(2)} a day (${breakEven.multipleAfterAds}×): ${aheadAds ? 'ahead' : 'behind'}.`,
      });
    } else {
      lines.push({ bad: true, text: `After ${money(after.adPerOrder)} of ads per order, each unit at the new price earns nothing, so no amount of volume matches the old result.` });
    }
  }
  const thin = Math.min(before.orders, after.orders) < 10;
  return (
    <div className="verdict">
      {lines.map(l => <p key={l.text} className={l.bad ? 'neg' : 'pos'}>{l.text}</p>)}
      {thin && <p className="muted">Only {Math.min(before.orders, after.orders)} orders in the smaller period, so treat this as a rough read.</p>}
      {(before.pending > 0 || after.pending > 0) && <p className="muted">{before.pending + after.pending} orders are still awaiting payout and are estimated from the settled ones.</p>}
    </div>
  );
}

function WhatIf({ result, adPerOrder }) {
  if (!result.enough) {
    return <p className="muted pad">Only {result.orders} orders sold within $1.50 of {money(result.price)}, which is too few to estimate from. Try a price closer to where you have sold.</p>;
  }
  const afterAds = result.profitPerUnit - adPerOrder;
  return (
    <>
      <div className="free-grid">
        <div><span className="kpi-label">Payout</span><span className="kpi-value">{money(result.payout)}</span></div>
        <div><span className="kpi-label">Product cost{result.mcfFee ? ' + MCF' : ''}</span><span className="kpi-value">{money(-(result.unitCost + result.mcfFee))}</span></div>
        <div><span className="kpi-label">Profit per unit</span><span className={`kpi-value ${tone(result.profitPerUnit)}`}>{money(result.profitPerUnit)}</span></div>
        <div><span className="kpi-label">After {money(adPerOrder)} of ads</span><span className={`kpi-value ${tone(afterAds)}`}>{money(afterAds)}</span></div>
      </div>
      <p className="muted">
        Based on {result.orders} {result.source === 'observed' ? 'orders' : 'TikTok-label orders, adjusted for the shipping method,'} that
        sold near {money(result.avgPrice)}. Uses today’s product cost{result.mcfFee ? ' and MCF fee' : ''}. Ad cost is the shop-wide average per paid order.
      </p>
    </>
  );
}
