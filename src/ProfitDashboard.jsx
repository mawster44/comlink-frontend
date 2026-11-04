import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from './auth.js';
import { todayKey, shiftDay, daysBetween, money, pct, tone, shortDay, timeAgo, readJson } from './profitFormat.js';
import PriceTest from './PriceTest.jsx';
import McfActuals from './McfActuals.jsx';
import Reconcile from './Reconcile.jsx';
import Snapshot from './Snapshot.jsx';
import './Profit.css';

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

export default function ProfitDashboard() {
  const [tab, setTab] = useState('overview');
  const [orderFilter, setOrderFilter] = useState('all'); // all | free | seller
  const [range, setRange] = useState(() => ({ from: shiftDay(todayKey(), -29), to: todayKey() }));
  const [summary, setSummary] = useState(null);
  const [costs, setCosts] = useState({});
  const [mcfFees, setMcfFees] = useState({});
  const [mcfActuals, setMcfActuals] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, c, m, a] = await Promise.all([
        readJson(await apiFetch(`/api/profit/summary?from=${range.from}&to=${range.to}`)),
        readJson(await apiFetch('/api/profit/costs')),
        readJson(await apiFetch('/api/profit/mcf-fees')),
        readJson(await apiFetch('/api/profit/mcf-actuals')),
      ]);
      setSummary(s);
      setCosts(c);
      setMcfFees(m);
      setMcfActuals(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function sync() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const days = Math.min(90, Math.max(30, daysBetween(range.from, todayKey()) + 1));
      const result = await readJson(await apiFetch('/api/profit/sync', { method: 'POST', body: JSON.stringify({ days }) }));
      const warnings = [
        ...(result.warnings || []).map(w => `${w.source} (${w.error})`),
        ...(result.ads?.error ? [`ad spend (${result.ads.error})`] : []),
      ];
      setSyncNote(warnings.length
        ? { bad: true, text: `Synced with warnings: ${warnings.join('; ')}` }
        : { text: `Synced ${result.counts?.orders ?? 0} orders${result.ads?.configured ? ` and ad spend for ${result.ads.days} days` : ''}` });
      await load();
    } catch (e) {
      setSyncNote({ bad: true, text: e.message });
    } finally {
      setSyncing(false);
    }
  }

  const activePreset = PRESETS.find(p => range.to === todayKey() && range.from === shiftDay(todayKey(), -(p.days - 1)));

  return (
    <div className="profit">
      <header className="profit-head">
        <div>
          <h1>Profit</h1>
          <p className="profit-sub">
            TikTok Shop payout − product cost − MCF fees − ad spend − account charges · days in Denver time
            {summary && <> · last synced {timeAgo(summary.lastSync?.at)}</>}
          </p>
          {summary && <AdsStatus ads={summary.adsSync} />}
        </div>
        <div className="profit-controls">
          <div className="seg">
            {PRESETS.map(p => (
              <button
                key={p.label}
                className={activePreset === p ? 'on' : ''}
                onClick={() => setRange({ from: shiftDay(todayKey(), -(p.days - 1)), to: todayKey() })}
              >{p.label}</button>
            ))}
          </div>
          <input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} />
          <span className="dash">→</span>
          <input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} />
          <button className="primary" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      </header>

      {syncNote && <div className={`note ${syncNote.bad ? 'bad' : 'good'}`}>{syncNote.text}</div>}
      {error && <div className="note bad">{error}</div>}

      <nav className="tabs">
        {[['overview', 'Overview'], ['orders', 'Orders'], ['pricing', 'Pricing'], ['reconcile', 'Reconcile'], ['costs', 'Costs']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {id === 'costs' && summary && (summary.dataQuality.ordersWithMissingCost > 0 || summary.dataQuality.sellerShippedMissingMcfFee > 0) && <span className="dot" title="Some SKUs have no cost or MCF fee" />}
          </button>
        ))}
      </nav>

      {loading && !summary && <p className="muted pad">Loading…</p>}

      {summary && tab === 'overview' && (
        <Overview
          summary={summary} onChanged={load} goCosts={() => setTab('costs')}
          onPickRange={(from, to) => { setRange({ from, to }); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}
          goFree={() => { setOrderFilter('free'); setTab('orders'); }}
          goSeller={() => { setOrderFilter('seller'); setTab('orders'); }}
        />
      )}
      {summary && tab === 'orders' && <Orders range={range} filter={orderFilter} setFilter={setOrderFilter} />}
      {summary && tab === 'pricing' && <PriceTest range={range} summary={summary} />}
      {summary && tab === 'reconcile' && <Reconcile range={range} />}
      {summary && tab === 'costs' && <Costs summary={summary} costs={costs} mcfFees={mcfFees} mcfActuals={mcfActuals} onChanged={load} />}
    </div>
  );
}

function AdsStatus({ ads }) {
  if (!ads?.configured) {
    return <p className="profit-sub ads-status">Ad spend is entered by hand. Connect TikTok Ads in Settings to pull it automatically.</p>;
  }
  if (ads.error) return <p className="profit-sub ads-status neg">Ad spend pull failed: {ads.error}</p>;
  return <p className="profit-sub ads-status">Ad spend is pulled automatically · last pulled {timeAgo(ads.at)}</p>;
}

/* ---------- Overview ---------- */

function Overview({ summary, onChanged, onPickRange, goCosts, goFree, goSeller }) {
  const { totals, daily, bySku, dataQuality: q, free, fulfillment, accountCharges, range } = summary;
  const adShare = totals.profitBeforeAds > 0 ? (totals.adSpend / totals.profitBeforeAds) * 100 : null;

  return (
    <>
      <Snapshot refresh={summary} onPick={onPickRange} />

      <section className="kpis">
        <Kpi label="Net profit" value={money(totals.netProfit)} cls={tone(totals.netProfit)} big
          sub={`${pct(totals.marginPct)} of payout`} />
        <Kpi label="Payout" value={money(totals.payout)} sub={`${money(totals.grossSales, { cents: false })} gross sales`} />
        <Kpi label="Product cost" value={money(-totals.cogs)}
          sub={`${totals.units.toLocaleString()} units${totals.mcfFees > 0 ? ` · plus ${money(totals.mcfFees, { cents: false })} MCF` : ''}`} />
        <Kpi label="Profit before ads" value={money(totals.profitBeforeAds)} cls={tone(totals.profitBeforeAds)} />
        <Kpi label="Ad spend" value={money(-totals.adSpend)}
          sub={adShare === null ? null : `${adShare.toFixed(0)}% of pre-ad profit`} />
        <Kpi label="TikTok account charges" value={money(-totals.otherCharges)}
          sub={accountCharges?.credits > 0 ? `${money(accountCharges.charges, { cents: false })} charges, ${money(accountCharges.credits, { cents: false })} credits` : 'FBT warehouse service fees'} />
        <Kpi label="Orders" value={totals.orders.toLocaleString()}
          sub={totals.orders ? `${money(totals.netProfit / totals.orders)} net each` : null} />
      </section>

      <Quality q={q} goCosts={goCosts} />

      <FreeOrders free={free} totals={totals} goFree={goFree} />

      <Fulfillment fulfillment={fulfillment} q={q} goSeller={goSeller} goCosts={goCosts} />

      <section className="card">
        <h2>Daily net profit <span className="legend"><i className="lg-bar" /> net profit <i className="lg-line" /> ad spend</span></h2>
        <DailyChart daily={daily} />
      </section>

      <TakeBreakdown daily={daily} />

      <AccountCharges data={accountCharges} from={range.from} />

      <section className="card">
        <h2>Daily P&amp;L <span className="hint">click an ad spend amount to edit it</span></h2>
        <DailyTable daily={daily} onChanged={onChanged} />
      </section>

      <section className="card">
        <h2>Products <span className="hint">before ad spend, which isn’t attributed to products</span></h2>
        <ProductTable rows={bySku} />
      </section>
    </>
  );
}

function Kpi({ label, value, sub, cls = '', big }) {
  return (
    <div className={`kpi ${big ? 'big' : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${cls}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function Quality({ q, goCosts }) {
  const chips = [];
  if (q.ordersWithMissingCost > 0) chips.push({ bad: true, text: `${q.ordersWithMissingCost} orders have no product cost`, action: goCosts });
  if (q.sellerShippedMissingMcfFee > 0) chips.push({ bad: true, text: `${q.sellerShippedMissingMcfFee} seller-shipped orders have no MCF fee`, action: goCosts });
  if (q.pendingOrders > 0) chips.push({ warn: true, text: `${q.pendingOrders} orders awaiting payout (not in profit yet)` });
  if (q.estimatedOrders > 0) chips.push({ text: `${q.estimatedOrders} payouts are estimates until TikTok settles` });
  if (q.ordersWithReturns > 0) chips.push({ text: `${q.ordersWithReturns} orders with returns` });
  if (q.cancelledOrders > 0) chips.push({ text: `${q.cancelledOrders} cancelled excluded` });
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map(c => (
        <span key={c.text} className={`chip ${c.bad ? 'bad' : c.warn ? 'warn' : ''}`}>
          {c.text}
          {c.action && <button onClick={c.action}>Fix</button>}
        </span>
      ))}
    </div>
  );
}

// $0 orders (creator samples, giveaways): already inside every total above, called out so their cost is visible on its own.
function FreeOrders({ free, totals, goFree }) {
  if (!free || free.orders === 0) return null;
  // Free orders pay out nothing, so this is what TikTok charged for shipping and fees, plus any estimated MCF fee.
  const shippingAndFees = -free.payout + free.mcfFee;
  const paidOnly = totals.profitBeforeAds - free.netImpact;
  return (
    <section className="card free-card">
      <h2>
        Free orders
        <span className="tag free">{free.orders.toLocaleString()} orders · {free.units.toLocaleString()} units</span>
        <button className="link" onClick={goFree}>View them</button>
      </h2>
      <div className="free-grid">
        <div><span className="kpi-label">Net cost</span><span className="kpi-value neg">{money(free.netImpact)}</span></div>
        <div><span className="kpi-label">Product given away</span><span className="kpi-value">{money(-free.cogs)}</span></div>
        <div><span className="kpi-label">Shipping &amp; fees</span><span className="kpi-value">{money(-Math.max(0, shippingAndFees))}</span></div>
        <div><span className="kpi-label">Profit before ads, paid orders only</span><span className={`kpi-value ${tone(paidOnly)}`}>{money(paidOnly)}</span></div>
      </div>
      <p className="muted">
        Orders with a $0 total.{free.flaggedSample > 0 ? ` TikTok flags ${free.flaggedSample} of them as creator samples.` : ''}
        {free.pending > 0 ? ` ${free.pending} still awaiting payout aren’t in these figures.` : ''}
      </p>
    </section>
  );
}

// Orders the seller ships themselves (e.g. through Amazon MCF) carry no TikTok label cost; their carrier fee is billed on the Amazon account.
function Fulfillment({ fulfillment, q, goSeller, goCosts }) {
  if (!fulfillment) return null;
  const { seller, tiktok, unknown, combos } = fulfillment;
  const total = seller.orders + tiktok.orders + unknown.orders;
  if (total === 0) return null;
  const share = (seller.orders / total) * 100;
  const rows = Object.entries(combos).sort((a, b) => b[1].orders - a[1].orders);
  return (
    <section className="card seller-card">
      <h2>
        Shipping method
        <span className="tag seller">{seller.orders.toLocaleString()} seller-shipped · {share.toFixed(0)}%</span>
        {seller.orders > 0 && <button className="link" onClick={goSeller}>View them</button>}
      </h2>
      <div className="free-grid">
        <div><span className="kpi-label">Shipped by TikTok label</span><span className="kpi-value">{tiktok.orders.toLocaleString()}</span></div>
        <div><span className="kpi-label">Seller-shipped (MCF)</span><span className="kpi-value">{seller.orders.toLocaleString()}</span></div>
        <div>
          <span className="kpi-label">{seller.allocatedFees > 0 && seller.allocatedFees >= seller.mcfFees ? 'MCF fees (Amazon actual)' : 'Estimated MCF fees'}</span>
          <span className="kpi-value">{money(-seller.mcfFees)}</span>
          {seller.allocatedFees > 0 && seller.allocatedFees < seller.mcfFees && (
            <span className="kpi-sub">{money(seller.allocatedFees)} from Amazon actuals, rest estimated</span>
          )}
        </div>
        <div><span className="kpi-label">Not labelled yet</span><span className="kpi-value">{unknown.orders.toLocaleString()}</span></div>
      </div>
      <p className="muted">
        TikTok’s payout already includes the shipping label on orders it ships. Seller-shipped orders have no label cost there, so
        their fulfillment fee is an estimate from the per-unit MCF fee on the Costs tab, not Amazon’s actual charge.
        {unknown.orders > 0 && ' Orders marked “not labelled” were synced before this existed; Sync now refreshes them.'}
        {q.sellerShippedMissingMcfFee > 0 && <> {q.sellerShippedMissingMcfFee} seller-shipped orders have no fee set yet. <button className="link" onClick={goCosts}>Set MCF fees</button></>}
      </p>
      <details className="muted">
        <summary>How orders were classified</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>TikTok fulfillment / shipping type</th><th className="r">Orders</th><th className="r">Settled</th><th className="r">Settled with no TikTok shipping charge</th></tr></thead>
            <tbody>
              {rows.map(([name, c]) => (
                <tr key={name}><td><code>{name}</code></td><td className="r">{c.orders}</td><td className="r">{c.settled}</td><td className="r">{c.noTiktokShipping}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>“Seller-shipped” means TikTok reports <code>SELLER</code> as the shipping type. Paid orders with no TikTok shipping charge should line up with it.</p>
      </details>
    </section>
  );
}

function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  const W = 900, H = 240, padL = 52, padR = 12, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;

  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = daily.flatMap(d => [d.netProfit, d.adSpend, 0]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const step = niceStep((hi - lo) || 1, 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(v);
    return { yMin: lo, yMax: hi, ticks: t };
  }, [daily]);

  if (!daily.length) return <p className="muted pad">No days in range.</p>;

  const y = v => padT + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const slot = iw / daily.length;
  const barW = Math.max(2, slot * 0.62);
  const cx = i => padL + slot * i + slot / 2;
  const line = daily.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${y(d.adSpend)}`).join(' ');
  const labelEvery = Math.ceil(daily.length / 10);
  const h = hover !== null ? daily[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily net profit and ad spend">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} />
            <text x={padL - 8} y={y(t) + 4} className="axis" textAnchor="end">{money(t, { cents: false })}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const top = y(Math.max(d.netProfit, 0)), bottom = y(Math.min(d.netProfit, 0));
          return (
            <g key={d.date}>
              <rect x={cx(i) - barW / 2} y={top} width={barW} height={Math.max(1, bottom - top)} rx="2"
                className={d.netProfit >= 0 ? 'bar-pos' : 'bar-neg'} opacity={hover === null || hover === i ? 1 : 0.55} />
              {i % labelEvery === 0 && <text x={cx(i)} y={H - 8} className="axis" textAnchor="middle">{shortDay(d.date)}</text>}
            </g>
          );
        })}
        <path d={line} className="ad-line" fill="none" />
        {daily.map((d, i) => <circle key={d.date} cx={cx(i)} cy={y(d.adSpend)} r={hover === i ? 4 : 2.2} className="ad-dot" />)}
        {daily.map((d, i) => (
          <rect key={d.date} x={padL + slot * i} y={padT} width={slot} height={ih} fill="transparent"
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="tip" style={{ left: `${(cx(hover) / W) * 100}%` }}>
          <strong>{shortDay(h.date)}</strong>
          <span>Payout <b>{money(h.payout)}</b></span>
          <span>Cost <b>{money(-h.cogs)}</b></span>
          <span>Ads <b>{money(-h.adSpend)}</b></span>
          <span>Net <b className={tone(h.netProfit)}>{money(h.netProfit)}</b></span>
          <span className="muted">{h.orders} orders{h.pendingOrders ? ` · ${h.pendingOrders} pending` : ''}</span>
        </div>
      )}
    </div>
  );
}

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

const CHARGE_LABELS = {
  GMV_DEDUCTION_FOR_FBT_WAREHOUSE_SERVICE_FEE: 'FBT warehouse service fee',
  GMV_PAYMENT_FOR_TIKTOK_ADS: 'TikTok ads paid from the sales balance',
  ADJUSTMENT_WITHOUT_ORDER: 'Adjustments TikTok didn’t describe',
};
const chargeLabel = (kind) => CHARGE_LABELS[kind] || kind.replace(/_/g, ' ').toLowerCase();
const EXCLUDED_WHY = {
  transfer: 'moves money, not profit',
  ads: 'already counted in ad spend',
};

// Charges and credits on TikTok statements that belong to no order. They are in net profit, dated by the statement.
function AccountCharges({ data, from }) {
  if (!data || (!data.kinds.length && !data.transfersExcluded.length)) return null;
  const partial = data.coverageStarts && from < data.coverageStarts;
  return (
    <section className="card">
      <h2>TikTok account charges <span className="hint">not on any order · in net profit, dated by the statement</span></h2>
      {partial && (
        <div className="note bad">
          Statements before {shortDay(data.coverageStarts)} haven’t been synced, so charges before then are missing from this range.
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>What</th><th className="r">Statements</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {data.kinds.map(k => (
              <tr key={k.kind}>
                <td>{chargeLabel(k.kind)}</td>
                <td className="r">{k.count}</td>
                <td className={`r ${tone(k.amount)}`}>{money(k.amount)}</td>
              </tr>
            ))}
            {data.transfersExcluded.map(k => (
              <tr key={k.kind} className="muted">
                <td>{chargeLabel(k.kind)} <span className="tag" title={EXCLUDED_WHY[k.reason]}>not counted · {EXCLUDED_WHY[k.reason] || 'excluded'}</span></td>
                <td className="r">{k.count}</td>
                <td className="r">{money(k.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Bill payments toward a negative balance move money rather than earn it, and ad top-ups from the sales balance fund spend that is already in ad spend, so both are left out. Charges affect daily net profit, not any product’s margin.</p>
    </section>
  );
}

const sumOf = (daily, key) => daily.reduce((n, d) => n + (d[key] || 0), 0);

// Sale price → payout. TikTok has already taken these out of the payout, so they explain it rather than reduce profit again.
function TakeBreakdown({ daily }) {
  const sales = sumOf(daily, 'breakdownSales');
  const fees = sumOf(daily, 'platformFees');
  const commission = sumOf(daily, 'creatorCommission');
  const label = sumOf(daily, 'labelShipping');
  const other = sumOf(daily, 'otherAdjustments');
  const payout = sumOf(daily, 'breakdownPayout');
  if (!sales && !payout) return null;
  const share = (n) => (sales > 0 ? ` · ${((n / sales) * 100).toFixed(1)}%` : '');
  return (
    <section className="card">
      <h2>Where the sale price went <span className="hint">settled orders · already taken out of the payout, not subtracted again</span></h2>
      <div className="free-grid six">
        <div><span className="kpi-label">Sales</span><span className="kpi-value">{money(sales)}</span></div>
        <div><span className="kpi-label">TikTok fees{share(fees)}</span><span className="kpi-value">{money(-fees)}</span></div>
        <div><span className="kpi-label">Creator commission{share(commission)}</span><span className="kpi-value">{money(-commission)}</span></div>
        <div><span className="kpi-label">Shipping labels{share(label)}</span><span className="kpi-value">{money(-label)}</span></div>
        <div><span className="kpi-label">Refunds &amp; other</span><span className={`kpi-value ${tone(other)}`}>{money(other)}</span></div>
        <div><span className="kpi-label">Paid out</span><span className="kpi-value">{money(payout)}</span></div>
      </div>
    </section>
  );
}

function DailyTable({ daily, onChanged }) {
  const rows = [...daily].reverse();
  const [showTake, setShowTake] = useState(true);
  const takeTitle = 'Settled orders only. Already taken out of the payout.';
  return (
    <div className="table-wrap">
      <label className="muted take-toggle">
        <input type="checkbox" checked={showTake} onChange={e => setShowTake(e.target.checked)} /> Show what TikTok took (fees, commission, labels)
      </label>
      <table>
        <thead>
          <tr>
            <th>Date</th><th className="r">Orders</th><th className="r">Units</th>
            {showTake && (
              <>
                <th className="r" title={takeTitle}>Sales</th><th className="r" title={takeTitle}>TikTok fees</th>
                <th className="r" title={takeTitle}>Creator comm.</th><th className="r" title={takeTitle}>Labels</th>
                <th className="r" title="Refunds, shipping subsidies and other adjustments that move the payout">Other</th>
              </>
            )}
            <th className="r">Payout</th>
            <th className="r">Cost</th><th className="r">Before ads</th><th className="r">Ad spend</th>
            <th className="r" title="FBT warehouse fees and other TikTok charges tied to no order">TikTok charges</th>
            <th className="r">Net profit</th><th className="r">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.date}>
              <td>{shortDay(d.date)}{d.pendingOrders > 0 && <span className="tag warn" title={`${d.pendingOrders} orders awaiting payout`}>{d.pendingOrders} pending</span>}</td>
              <td className="r">{d.orders}</td>
              <td className="r">{d.units}</td>
              {showTake && (
                <>
                  <td className="r">{money(d.breakdownSales)}</td>
                  <td className="r">{money(-d.platformFees)}</td>
                  <td className="r">{money(-d.creatorCommission)}</td>
                  <td className="r">{money(-d.labelShipping)}</td>
                  <td className={`r ${tone(d.otherAdjustments)}`}>{money(d.otherAdjustments)}</td>
                </>
              )}
              <td className="r">{money(d.payout)}</td>
              <td className="r" title={d.mcfFees > 0 ? `${money(d.cogs)} product + ${money(d.mcfFees)} MCF` : undefined}>{money(-(d.cogs + d.mcfFees))}</td>
              <td className={`r ${tone(d.profitBeforeAds)}`}>{money(d.profitBeforeAds)}</td>
              <td className="r"><AdCell date={d.date} amount={d.adSpend} onSaved={onChanged} /></td>
              <td className="r">{money(-d.otherCharges)}</td>
              <td className={`r strong ${tone(d.netProfit)}`}>{money(d.netProfit)}</td>
              <td className="r">{pct(d.marginPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdCell({ date, amount, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [err, setErr] = useState(null);

  async function save() {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) { setEditing(false); return; }
    if (n === amount) { setEditing(false); return; }
    try {
      await readJson(await apiFetch(`/api/profit/ad-spend/${date}`, { method: 'PUT', body: JSON.stringify({ amount: n, note: 'Entered in dashboard' }) }));
      setErr(null);
      setEditing(false);
      await onSaved();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (editing) {
    return (
      <input
        className="cell-input" autoFocus type="number" min="0" step="0.01" value={value}
        onFocus={e => e.target.select()}
        onChange={e => setValue(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <button className={`cell-btn ${err ? 'neg' : ''}`} title={err || 'Edit ad spend'} onClick={() => { setValue(amount ? String(amount) : ''); setEditing(true); }}>
      {amount ? money(-amount) : <span className="muted">add</span>}
    </button>
  );
}

function ProductTable({ rows }) {
  if (!rows.length) return <p className="muted pad">No settled orders in this range.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Product</th><th className="r">Units</th><th className="r">Payout</th><th className="r">Cost</th><th className="r">Profit</th><th className="r">Per unit</th><th className="r">Margin</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.sku}>
              <td>
                <div className="prod" title={r.productName}>{r.productName}</div>
                <code>{r.sku}</code>
              </td>
              <td className="r">{r.units}</td>
              <td className="r">{money(r.payout)}</td>
              <td className="r" title={r.mcfFees > 0 ? `${money(r.cogs)} product + ${money(r.mcfFees)} MCF` : undefined}>{money(-(r.cogs + r.mcfFees))}</td>
              <td className={`r strong ${tone(r.profit)}`}>{money(r.profit)}</td>
              <td className={`r ${tone(r.profit)}`}>{r.units ? money(r.profit / r.units) : '—'}</td>
              <td className="r">{r.payout > 0 ? pct((r.profit / r.payout) * 100) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Orders ---------- */

const ORDER_LIMIT = 200;

const ORDER_FILTERS = [
  ['all', 'All', () => true],
  ['free', 'Free only', o => o.free],
  ['seller', 'Seller-shipped', o => o.fulfillment === 'seller'],
];

function Orders({ range, filter, setFilter }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setOrders(null);
    apiFetch(`/api/profit/orders?from=${range.from}&to=${range.to}`)
      .then(readJson)
      .then(b => setOrders(b.orders))
      .catch(e => setError(e.message));
  }, [range.from, range.to]);

  if (error) return <div className="note bad">{error}</div>;
  if (!orders) return <p className="muted pad">Loading…</p>;

  const q = query.trim();
  const keep = ORDER_FILTERS.find(([id]) => id === filter)[2];
  const filtered = orders.filter(o => keep(o) && (!q || o.id.includes(q)));

  return (
    <section className="card">
      <h2>
        Orders <span className="hint">{filtered.length.toLocaleString()} shown · profit = payout − cost</span>
        <span className="seg">
          {ORDER_FILTERS.map(([id, label]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </span>
        <input className="search" placeholder="Find an order ID" value={query} onChange={e => setQuery(e.target.value)} />
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Day</th><th>Order</th><th>Status</th><th className="r">Units</th><th className="r">Gross</th><th className="r">Payout</th><th className="r">Cost</th><th className="r">Profit</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, ORDER_LIMIT).map(o => (
              <tr key={o.id} className={o.excluded ? 'dim' : ''}>
                <td>{shortDay(o.day)}</td>
                <td><code>{o.id}</code>{o.hasReturn && <span className="tag warn">return</span>}</td>
                <td>
                  {o.excluded ? <span className="tag">{o.status.toLowerCase()}</span> : <span className={`tag ${o.payoutState}`}>{o.payoutState}</span>}
                  {o.free && <span className="tag free" title={o.sample ? 'TikTok flags this as a creator sample' : '$0 order'}>{o.sample ? 'sample' : 'free'}</span>}
                  {o.fulfillment === 'seller' && (
                    <span className="tag seller" title={`Shipped by the seller (${o.fulfillmentType} / ${o.shippingType}); no TikTok label cost`}>seller-shipped</span>
                  )}
                </td>
                <td className="r">{o.units}</td>
                <td className="r">{money(o.grossSales)}</td>
                <td className="r">{o.excluded ? '—' : money(o.payout)}</td>
                <td className="r" title={o.mcfFee > 0 ? `${money(o.cogs)} product + ${money(o.mcfFee)} MCF` : undefined}>
                  {o.excluded ? '—' : o.cogsComplete ? money(-(o.cogs + o.mcfFee)) : <span className="tag bad">no cost</span>}
                  {!o.excluded && o.mcfFeeMissing && <span className="tag bad" title="Seller-shipped, but no MCF fee is set for this SKU">no MCF fee</span>}
                </td>
                <td className={`r strong ${tone(o.profit)}`}>{o.excluded ? '—' : money(o.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > ORDER_LIMIT && <p className="muted pad">Showing the newest {ORDER_LIMIT}. Search by order ID to find others.</p>}
    </section>
  );
}

/* ---------- Costs ---------- */

function currentCost(history, day) {
  let hit = null;
  for (const e of history) if (e.from <= day) hit = e;
  return hit;
}

// Product cost and MCF fee are both dated per-SKU histories, so they share the form and the history list.
const KINDS = {
  costs: {
    path: 'costs',
    title: 'Add or change a cost',
    hint: 'each order is priced at the cost in effect on its order date',
    label: 'Unit cost (incl. shipping)',
    button: 'Save cost',
    historyTitle: 'Cost history',
    empty: 'No costs entered yet.',
    removeNoun: 'cost',
    base: 'Leave the date empty to use this cost for every order that doesn’t have an earlier dated entry (the base cost).',
  },
  mcf: {
    path: 'mcf-fees',
    title: 'Amazon MCF fee per unit',
    hint: 'estimate charged on seller-shipped orders; Amazon bills the real fee separately',
    label: 'MCF fee per unit',
    button: 'Save MCF fee',
    historyTitle: 'MCF fee history',
    empty: 'No MCF fees entered yet. Seller-shipped orders are counted with no fulfillment fee until you add one.',
    removeNoun: 'MCF fee',
    base: 'Leave the date empty to use this fee for every seller-shipped order that doesn’t have an earlier dated entry.',
  },
};

const BLANK_FORM = { sku: '', cost: '', from: '' };

function Costs({ summary, costs, mcfFees, mcfActuals, onChanged }) {
  const unmatched = Object.entries(summary.dataQuality.unmatchedSkus);
  const names = useMemo(() => Object.fromEntries(summary.bySku.map(s => [s.sku, s.productName])), [summary.bySku]);
  const [forms, setForms] = useState({ costs: BLANK_FORM, mcf: BLANK_FORM });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);
  const data = { costs, mcf: mcfFees };
  const knownSkus = [...new Set([...Object.keys(costs), ...Object.keys(mcfFees), ...summary.bySku.map(s => s.sku), ...unmatched.map(([s]) => s)])];

  const setForm = (kind, patch) => setForms(f => ({ ...f, [kind]: { ...f[kind], ...patch } }));
  const setError = (kind, message) => setErrors(e => ({ ...e, [kind]: message }));

  async function save(kind, e) {
    e.preventDefault();
    setError(kind, null);
    const form = forms[kind];
    const cost = Number(form.cost);
    if (!form.sku.trim() || form.cost === '' || !Number.isFinite(cost) || cost < 0) { setError(kind, 'Enter a SKU and an amount of $0 or more.'); return; }
    setBusy(kind);
    try {
      await readJson(await apiFetch(`/api/profit/${KINDS[kind].path}/${encodeURIComponent(form.sku.trim())}`, {
        method: 'PUT',
        body: JSON.stringify({ cost, ...(form.from ? { from: form.from } : {}) }),
      }));
      setForms(f => ({ ...f, [kind]: BLANK_FORM }));
      await onChanged();
    } catch (err) {
      setError(kind, err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind, sku, from) {
    if (!window.confirm(`Remove the ${from === '2000-01-01' ? 'base' : from} ${KINDS[kind].removeNoun} entry for ${sku}?`)) return;
    try {
      await readJson(await apiFetch(`/api/profit/${KINDS[kind].path}/${encodeURIComponent(sku)}?from=${from}`, { method: 'DELETE' }));
      await onChanged();
    } catch (err) {
      setError(kind, err.message);
    }
  }

  return (
    <>
      {unmatched.length > 0 && (
        <section className="card alert">
          <h2>Needs a cost</h2>
          <p className="muted">Orders with these SKUs are being counted at $0 cost, which overstates profit.</p>
          <ul className="plain">
            {unmatched.map(([sku, name]) => (
              <li key={sku}>
                <div><div className="prod" title={name}>{name}</div><code>{sku}</code></div>
                <button className="primary small" onClick={() => setForm('costs', { sku })}>Set cost</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.keys(KINDS).map(kind => (
        <CostSection
          key={kind} kind={kind} spec={KINDS[kind]} entries={data[kind]} names={names} skus={knownSkus}
          form={forms[kind]} setForm={patch => setForm(kind, patch)} error={errors[kind]}
          busy={busy === kind} onSave={e => save(kind, e)} onRemove={(sku, from) => remove(kind, sku, from)}
        />
      ))}

      <McfActuals
        allocations={mcfActuals}
        skus={summary.bySku.filter(s => s.sku && s.sku !== '(no sku)').map(s => ({ sku: s.sku, productName: s.productName }))}
        range={summary.range}
        onChanged={onChanged}
      />
    </>
  );
}

function CostSection({ kind, spec, entries, names, skus, form, setForm, error, busy, onSave, onRemove }) {
  const today = todayKey();
  const history = Object.keys(entries);
  return (
    <>
      <section className="card">
        <h2>{spec.title} <span className="hint">{spec.hint}</span></h2>
        <form className="cost-form" onSubmit={onSave}>
          <label>SKU
            <input list={`skus-${kind}`} value={form.sku} onChange={e => setForm({ sku: e.target.value })} placeholder="e.g. 30OZ8262025" />
            <datalist id={`skus-${kind}`}>{skus.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label>{spec.label}
            <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ cost: e.target.value })} placeholder="0.00" />
          </label>
          <label>Effective from
            <input type="date" value={form.from} onChange={e => setForm({ from: e.target.value })} />
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : spec.button}</button>
        </form>
        <p className="muted">
          {form.from
            ? `Orders from ${form.from} onward use this ${spec.removeNoun}. Earlier orders keep their previous one.`
            : spec.base}
        </p>
        {error && <div className="note bad">{error}</div>}
      </section>

      <section className="card">
        <h2>{spec.historyTitle}</h2>
        {!history.length && <p className="muted pad">{spec.empty}</p>}
        {history.map(sku => {
          const list = entries[sku];
          const now = currentCost(list, today);
          return (
            <div key={sku} className="sku-block">
              <div className="sku-head">
                <div><div className="prod" title={names[sku]}>{names[sku] || 'Not sold in this date range'}</div><code>{sku}</code></div>
                <div className="sku-now">{now ? money(now.cost) : '—'}<span>now</span></div>
              </div>
              <ul className="history">
                {list.map(e => (
                  <li key={e.from} className={now === e ? 'current' : ''}>
                    <span>{e.from === '2000-01-01' ? `Base ${spec.removeNoun}` : `From ${e.from}`}</span>
                    <b>{money(e.cost)}</b>
                    {e.from > today && <span className="tag">scheduled</span>}
                    <button className="x" title="Remove this entry" onClick={() => onRemove(sku, e.from)}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}
