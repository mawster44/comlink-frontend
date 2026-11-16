import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './auth.js';
import { todayKey, money, shortDay, timeAgo, readJson } from './profitFormat.js';
import './Profit.css';
import './Supply.css';

const STATUS = {
  'out': { label: 'Out', cls: 'bad' },
  'order-now': { label: 'Order now', cls: 'bad' },
  'short': { label: 'Short — chase order', cls: 'bad' },
  'order-soon': { label: 'Order soon', cls: 'warn' },
  'ok': { label: 'OK', cls: 'settled' },
  'no-count': { label: 'Needs count', cls: 'pending' },
  'no-demand': { label: 'Set demand', cls: 'pending' },
  'per-fill': { label: 'Bought per fill', cls: 'estimated' },
};

const n0 = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'));
const day = (d) => (d ? shortDay(d) : '—');

async function call(path, method, body) {
  return readJson(await apiFetch(`/api/supply${path}`, { method, body: body ? JSON.stringify(body) : undefined }));
}

export default function SupplyChain() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('board');
  const [counting, setCounting] = useState(null); // item id being counted
  const [countQty, setCountQty] = useState('');
  const [orderDraft, setOrderDraft] = useState(null);
  const [run, setRun] = useState({ date: todayKey(), buckets: '', note: '' });

  const load = useCallback(async () => {
    setError(null);
    try { setData(await call('', 'GET')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(path, method, body, after) {
    setBusy(true);
    setError(null);
    try {
      setData(await call(path, method, body));
      after?.();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <div className="profit"><h1>Supply chain</h1>{error ? <div className="note bad">{error}</div> : <p className="muted">Loading…</p>}</div>;
  }

  const items = Object.fromEntries(data.items.map(i => [i.id, i]));
  const suppliers = Object.fromEntries(data.suppliers.map(s => [s.id, s]));
  const rows = data.board.rows;
  const urgent = rows.filter(r => ['out', 'short', 'order-now'].includes(r.status));
  const soon = rows.filter(r => r.status === 'order-soon');
  const openOrders = data.orders.filter(o => o.status === 'open');
  const { possible } = data.board;
  const s = data.settings;

  function startOrder(itemId, qty) {
    const item = items[itemId];
    setOrderDraft({ itemId, qty: qty ?? '', unitCost: item?.unitCost ?? '', orderedOn: todayKey(), expectedOn: '', ref: '', note: '' });
    setTab('orders');
  }

  const saveSetting = (k, v) => { if (String(s[k] ?? '') !== v) act('/settings', 'PATCH', { [k]: v }); };

  return (
    <div className="profit supply">
      <div className="profit-head">
        <div>
          <h1>Supply chain</h1>
          <div className="profit-sub">Pails, boxes, labels and tallow at Centrillium, and when to reorder each before a fill run stalls.</div>
        </div>
        <div className="profit-controls">
          <button className="primary" onClick={load} disabled={busy}>Refresh</button>
        </div>
      </div>

      {error && <div className="note bad">{error}</div>}

      <div className="supply-kpis">
        <div className="kpi big">
          <span className="kpi-label">Can fill now</span>
          <span className="kpi-value">{possible.buckets === null ? '—' : `${n0(possible.buckets)} buckets`}</span>
          <span className="kpi-sub">
            {possible.buckets === null ? 'Count the inputs to see this'
              : `${(possible.buckets / 180).toFixed(1)} pallets · limited by ${items[possible.limitedBy]?.name.toLowerCase()}`}
          </span>
        </div>
        <div className={`kpi ${urgent.length ? 'alert' : ''}`}>
          <span className="kpi-label">Order now</span>
          <span className={`kpi-value ${urgent.length ? 'neg' : ''}`}>{urgent.length}</span>
          <span className="kpi-sub">{urgent.map(r => items[r.itemId].name).join(', ') || 'Nothing overdue'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Order soon</span>
          <span className="kpi-value">{soon.length}</span>
          <span className="kpi-sub">{soon.map(r => items[r.itemId].name).join(', ') || `Nothing in the next ${s.alertDays ?? 14} days`}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Open orders</span>
          <span className="kpi-value">{openOrders.length}</span>
          <span className="kpi-sub">{openOrders.length ? `${money(openOrders.reduce((a, o) => a + (o.total ?? (o.qty * (o.unitCost || 0))), 0), { cents: false })} on the way` : 'None on the way'}</span>
        </div>
      </div>

      <DemandPanel demand={data.demand} settings={s} busy={busy} onSave={patch => act('/settings', 'PATCH', patch)} />

      <div className="card demand">
        <label>
          <span>Safety stock (days)</span>
          <input type="number" min="0" defaultValue={s.safetyDays ?? 14} onBlur={e => saveSetting('safetyDays', e.target.value)} />
        </label>
        <label>
          <span>Each order covers (days)</span>
          <input type="number" min="0" defaultValue={s.orderCoverDays ?? 60} onBlur={e => saveSetting('orderCoverDays', e.target.value)} />
        </label>
        <p className="hint">Reorder date = run-out date, minus the supplier's lead time, minus safety stock.</p>
      </div>

      <div className="tabs">
        {[['board', 'Reorder board'], ['orders', `Orders${openOrders.length ? ` (${openOrders.length})` : ''}`], ['runs', 'Fill runs'], ['cost', 'Cost per bucket'], ['inputs', 'Inputs'], ['suppliers', 'Suppliers']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Input</th><th>Supplier</th><th className="r">On hand</th><th className="r">On order</th>
                <th className="r">Days left</th><th>Runs out</th><th>Order by</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const item = items[r.itemId];
                const st = STATUS[r.status];
                return (
                  <tr key={r.itemId}>
                    <td className="strong">{item.name}</td>
                    <td className="muted">{suppliers[item.supplierId]?.name}</td>
                    <td className="r">
                      {r.status === 'per-fill' ? (
                        <span className="muted" title="Not held as stock: bought as buckets are filled">
                          {r.perDay ? `${n0(r.perDay * 7)} ${item.unit}/wk used` : 'not stocked'}
                        </span>
                      ) : counting === r.itemId ? (
                        <form className="inline" onSubmit={e => { e.preventDefault(); act(`/items/${r.itemId}/count`, 'POST', { qty: countQty }, () => setCounting(null)); }}>
                          <input type="number" min="0" autoFocus value={countQty} onChange={e => setCountQty(e.target.value)} placeholder={item.unit} />
                          <button className="primary small" disabled={busy}>Save</button>
                          <button type="button" className="link" onClick={() => setCounting(null)}>Cancel</button>
                        </form>
                      ) : (
                        <>
                          <span className={r.stock !== null && r.stock < 0 ? 'neg' : ''}>{n0(r.stock)}</span>
                          {item.count && <div className="sub" title={`Counted by ${item.count.by}`}>counted {timeAgo(item.count.at)}</div>}
                        </>
                      )}
                    </td>
                    <td className="r">{r.onOrder ? n0(r.onOrder) : '—'}</td>
                    <td className="r">{r.daysCover ?? '—'}</td>
                    <td>{day(r.runOut)}{r.gap && <div className="sub neg">order lands {r.gap.days}d late</div>}</td>
                    <td className="strong">{day(r.orderBy)}</td>
                    <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                    <td className="actions">
                      {r.status !== 'per-fill' && <>
                        <button className="link" onClick={() => { setCounting(r.itemId); setCountQty(''); }}>Count</button>
                        <button className="link" onClick={() => startOrder(r.itemId, r.suggestedQty)}>Order{r.suggestedQty ? ` ${n0(r.suggestedQty)}` : ''}</button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint pad">
            On hand = last count + orders received since − buckets filled since × what each bucket uses. Count what's physically at
            Centrillium whenever Lupe can, and the board corrects itself.
          </p>
        </div>
      )}

      {tab === 'orders' && (
        <>
          <div className="card">
            <h2>{orderDraft ? 'New order' : 'Orders'}{!orderDraft && <button className="primary small" onClick={() => startOrder(data.items[0].id)}>New order</button>}</h2>
            {orderDraft && (
              <form className="supply-form" onSubmit={e => { e.preventDefault(); act('/orders', 'POST', orderDraft, () => setOrderDraft(null)); }}>
                <label><span>Item</span>
                  <select value={orderDraft.itemId} onChange={e => setOrderDraft({ ...orderDraft, itemId: e.target.value, unitCost: items[e.target.value]?.unitCost ?? '' })}>
                    {data.items.map(i => <option key={i.id} value={i.id}>{i.name} — {suppliers[i.supplierId]?.name}</option>)}
                  </select>
                </label>
                <label><span>Quantity ({items[orderDraft.itemId]?.unit})</span><input type="number" min="1" required value={orderDraft.qty} onChange={e => setOrderDraft({ ...orderDraft, qty: e.target.value })} /></label>
                <label><span>Unit cost</span><input type="number" min="0" step="0.0001" value={orderDraft.unitCost ?? ''} onChange={e => setOrderDraft({ ...orderDraft, unitCost: e.target.value })} /></label>
                <label><span>Ordered</span><input type="date" value={orderDraft.orderedOn} onChange={e => setOrderDraft({ ...orderDraft, orderedOn: e.target.value })} /></label>
                <label><span>Expected at Centrillium</span><input type="date" value={orderDraft.expectedOn} onChange={e => setOrderDraft({ ...orderDraft, expectedOn: e.target.value })} /></label>
                <label><span>PO / invoice #</span><input value={orderDraft.ref} onChange={e => setOrderDraft({ ...orderDraft, ref: e.target.value })} /></label>
                <label className="wide"><span>Note</span><input value={orderDraft.note} onChange={e => setOrderDraft({ ...orderDraft, note: e.target.value })} /></label>
                <div className="wide form-actions">
                  <button className="primary" disabled={busy}>Save order</button>
                  <button type="button" className="link" onClick={() => setOrderDraft(null)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
          <div className="card table-wrap">
            {data.orders.length === 0 ? <p className="muted">No orders logged yet. Log each PO here so its quantity counts toward stock once it arrives.</p> : (
              <table>
                <thead><tr><th>Item</th><th>Supplier</th><th className="r">Qty</th><th className="r">Cost</th><th>Ordered</th><th>Expected</th><th>Ref</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {[...data.orders].sort((a, b) => (a.status === 'open') === (b.status === 'open') ? (b.orderedOn || '').localeCompare(a.orderedOn || '') : a.status === 'open' ? -1 : 1).map(o => {
                    const late = o.status === 'open' && o.expectedOn && o.expectedOn < data.today;
                    const cost = o.total ?? (o.unitCost ? o.qty * o.unitCost : null);
                    return (
                      <tr key={o.id} className={o.status === 'cancelled' ? 'dim' : ''}>
                        <td className="strong">{items[o.itemId]?.name || o.itemId}{o.note && <div className="sub">{o.note}</div>}</td>
                        <td className="muted">{suppliers[o.supplierId]?.name}</td>
                        <td className="r">{n0(o.qty)}</td>
                        <td className="r">{cost === null ? '—' : money(cost, { cents: false })}</td>
                        <td>{day(o.orderedOn)}</td>
                        <td className={late ? 'neg' : ''}>{day(o.expectedOn)}{late && <div className="sub">overdue</div>}</td>
                        <td className="muted">{o.ref || '—'}</td>
                        <td><span className={`tag ${o.status === 'received' ? 'settled' : o.status === 'open' ? 'pending' : ''}`}>{o.status}</span>
                          {o.receivedAt && <div className="sub">{timeAgo(o.receivedAt)}</div>}</td>
                        <td className="actions">
                          {o.status === 'open' && <button className="link" onClick={() => act(`/orders/${o.id}`, 'PATCH', { status: 'received' })}>Received</button>}
                          {o.status === 'open' && <button className="link" onClick={() => act(`/orders/${o.id}`, 'PATCH', { status: 'cancelled' })}>Cancel</button>}
                          {o.status !== 'open' && <button className="link" onClick={() => act(`/orders/${o.id}`, 'PATCH', { status: 'open' })}>Reopen</button>}
                          <button className="link danger" onClick={() => confirm('Delete this order?') && act(`/orders/${o.id}`, 'DELETE')}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'runs' && (
        <>
          <div className="card">
            <h2>Log a fill run <span className="hint">Every bucket Centrillium fills uses one of each input (and 7 lb of tallow).</span></h2>
            <form className="supply-form" onSubmit={e => { e.preventDefault(); act('/runs', 'POST', run, () => setRun({ date: todayKey(), buckets: '', note: '' })); }}>
              <label><span>Date</span><input type="date" value={run.date} onChange={e => setRun({ ...run, date: e.target.value })} /></label>
              <label><span>Buckets filled</span><input type="number" min="1" step="1" required value={run.buckets} onChange={e => setRun({ ...run, buckets: e.target.value })} placeholder="180 per pallet" /></label>
              <label className="wide"><span>Note</span><input value={run.note} onChange={e => setRun({ ...run, note: e.target.value })} placeholder="e.g. FBA19W480Z1P, proforma 2215" /></label>
              <div className="wide form-actions"><button className="primary" disabled={busy}>Log run</button></div>
            </form>
          </div>
          <div className="card table-wrap">
            {data.runs.length === 0 ? <p className="muted">No fill runs logged yet.</p> : (
              <table>
                <thead><tr><th>Date</th><th className="r">Buckets</th><th className="r">Pallets</th><th>Note</th><th>Logged by</th><th></th></tr></thead>
                <tbody>
                  {[...data.runs].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                    <tr key={r.id}>
                      <td>{day(r.date)}</td><td className="r">{n0(r.buckets)}</td><td className="r">{(r.buckets / 180).toFixed(1)}</td>
                      <td className="muted">{r.note || '—'}</td><td className="muted">{r.by}</td>
                      <td className="actions"><button className="link danger" onClick={() => confirm('Delete this run? Its buckets go back into stock.') && act(`/runs/${r.id}`, 'DELETE')}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'cost' && data.cost && <CostCard cost={data.cost} settings={s} busy={busy} onSave={patch => act('/settings', 'PATCH', patch)} />}

      {tab === 'inputs' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Input</th><th>Supplier</th><th className="r">Per bucket</th><th className="r">Lead time (days)</th><th className="r">Min order</th><th className="r">Unit cost</th></tr></thead>
            <tbody>
              {data.items.map(i => (
                <tr key={i.id}>
                  <td className="strong">{i.name} <span className="muted">({i.unit})</span></td>
                  <td className="muted">{suppliers[i.supplierId]?.name}</td>
                  {['perBucket', 'leadDays', 'minOrder', 'unitCost'].map(k => (
                    <td key={k} className="r">
                      <input className="cell" type="number" min="0" step={k === 'unitCost' ? '0.0001' : '1'} defaultValue={i[k] ?? ''} placeholder="—"
                        onBlur={e => { if (String(i[k] ?? '') !== e.target.value) act(`/items/${i.id}`, 'PUT', { [k]: e.target.value }); }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint pad">Lead time = from placing the order until it's on Centrillium's floor, freight included. Seeded with guesses from past emails; correct them as you learn.</p>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="supplier-grid">
          {data.suppliers.map(sup => <SupplierCard key={sup.id} sup={sup} items={data.items.filter(i => i.supplierId === sup.id)} busy={busy}
            onSave={patch => act(`/suppliers/${sup.id}`, 'PUT', patch)} />)}
        </div>
      )}
    </div>
  );
}

// Weekly bucket demand: measured from TikTok orders and Amazon (Sellerboard report, or a figure typed in until that is linked),
// with a switch to a typed-in total instead.
function DemandPanel({ demand, settings: s, busy, onSave }) {
  const auto = demand.used === 'auto';
  const amazon = demand.channels.find(c => c.id === 'amazon');
  const amazonTyped = !demand.amazonReportLinked || demand.amazonError;
  return (
    <div className="card demand-panel">
      <div className="demand-top">
        <div>
          <span className="kpi-label">Selling per week</span>
          <div className="kpi-value">{auto ? `${n0(demand.perWeek)} buckets` : `${n0(s.bucketsPerWeek)} buckets`}</div>
          <div className="kpi-sub">
            {auto
              ? <>Measured over {shortDay(demand.from)} – {shortDay(demand.to)}{demand.missing.length ? <span className="neg"> · missing {demand.missing.join(', ')}</span> : null}</>
              : 'Typed-in figure (measured demand is switched off)'}
          </div>
        </div>
        <div className="seg">
          <button className={auto ? 'on' : ''} disabled={busy || demand.perWeek <= 0} onClick={() => onSave({ demandAuto: true })}>From sales</button>
          <button className={!auto ? 'on' : ''} disabled={busy} onClick={() => onSave({ demandAuto: false })}>Typed in</button>
        </div>
      </div>

      {auto ? (
        <div className="demand-channels">
          <div className="networks">
            {(demand.networks || []).map(n => (
              <div key={n.id} className="network">
                <div className="network-head">
                  <span className="strong">{n.label}</span>
                  <span className="network-value">{n0(n.perWeek)}/wk</span>
                </div>
                <div className="hint">{n.note}</div>
                <div className="network-parts">
                  {demand.channels.filter(c => c.network === n.id).map(c => (
                    <span key={c.id} className="chip" title={c.source + (c.detail ? `, ${c.detail}` : '')}>
                      {c.label} <span className="strong">{n0(c.perWeek)}</span>
                      {c.enteredAt && <span className="muted"> · typed {timeAgo(c.enteredAt)}</span>}
                    </span>
                  ))}
                  {n.id === 'fba' && !demand.shopifyLinked && <span className="chip warn">Shopify not connected</span>}
                  {n.id === 'fba' && demand.shopifyError && <span className="chip bad" title={demand.shopifyError}>Shopify pull failed</span>}
                </div>
              </div>
            ))}
          </div>
          {demand.channels.find(c => c.id === 'shopify')?.otherSkus?.length > 0 && (
            <p className="hint">Shopify SKUs not counted as buckets: {demand.channels.find(c => c.id === 'shopify').otherSkus.join(', ')}. Tell Claude if any of these is a bucket.</p>
          )}
          {amazonTyped && (
            <label className="inline-label">
              <span>Amazon buckets / week{demand.amazonError ? ' (report failed: ' + demand.amazonError + ')' : ''}</span>
              <input type="number" min="0" defaultValue={s.amazonPerWeek ?? ''} placeholder={amazon ? '' : 'e.g. 190'}
                onBlur={e => { if (String(s.amazonPerWeek ?? '') !== e.target.value) onSave({ amazonPerWeek: e.target.value }); }} />
            </label>
          )}
          {!demand.amazonReportLinked && (
            <p className="hint">Amazon is typed in until a Sellerboard "by product" report link is added to the server (SELLERBOARD_PRODUCT_REPORT_URL); then it fills itself in.</p>
          )}
        </div>
      ) : (
        <label className="inline-label">
          <span>Buckets sold per week, all channels</span>
          <input type="number" min="0" defaultValue={s.bucketsPerWeek ?? ''} placeholder="e.g. 350"
            onBlur={e => { if (String(s.bucketsPerWeek ?? '') !== e.target.value) onSave({ bucketsPerWeek: e.target.value }); }} />
        </label>
      )}
    </div>
  );
}

// Landed cost of one bucket, from each input's unit cost (Inputs tab) and the per-bucket freight below.
const dollars = (n, digits = 2) => (n === null || n === undefined ? '—' : `$${n.toFixed(digits)}`);

function CostCard({ cost, settings: s, busy, onSave }) {
  const freight = (k, label, hint) => (
    <tr>
      <td className="strong">{label}<div className="sub">{hint}</div></td>
      <td className="r muted">per bucket</td>
      <td className="r">
        <input className="cell" type="number" min="0" step="0.01" defaultValue={s[k] ?? ''} placeholder="—" disabled={busy}
          onBlur={e => { if (String(s[k] ?? '') !== e.target.value) onSave({ [k]: e.target.value }); }} />
      </td>
      <td className="r">{dollars(s[k])}</td>
    </tr>
  );
  return (
    <div className="card table-wrap">
      <table>
        <thead><tr><th>Cost</th><th className="r">Per bucket</th><th className="r">Unit cost</th><th className="r">Per bucket $</th></tr></thead>
        <tbody>
          {cost.lines.map(l => (
            <tr key={l.itemId} className={l.cost === null ? 'dim' : ''}>
              <td className="strong">{l.name}</td>
              <td className="r muted">{l.perBucket} {l.unit}</td>
              <td className="r">{l.unitCost === null ? 'not set' : dollars(l.unitCost, 4)}</td>
              <td className="r">{dollars(l.cost)}</td>
            </tr>
          ))}
          {freight('freightInPerBucket', 'Freight in', 'Supplies to Centrillium (e.g. $1,559 ÷ 4,140 pails)')}
          <tr className="subtotal"><td className="strong">At Centrillium</td><td></td><td></td><td className="r strong">{dollars(cost.atCoPacker)}</td></tr>
          {freight('freightOutPerBucket', 'Ship to Amazon', 'Filled buckets, Centrillium to FBA')}
          <tr className="total"><td className="strong">Landed at Amazon</td><td></td><td></td><td className="r strong">{dollars(cost.total)}</td></tr>
        </tbody>
      </table>
      <p className="hint pad">
        Unit costs come from the Inputs tab; change them there when a new invoice changes a price.
        {cost.missing.length > 0 && <span className="neg"> Not costed yet: {cost.missing.join(', ')}.</span>}
      </p>
    </div>
  );
}

function SupplierCard({ sup, items, busy, onSave }) {
  const [edit, setEdit] = useState(null);
  const fields = [['terms', 'Terms'], ['ordering', 'How to order'], ['notes', 'Notes']];
  return (
    <div className="card supplier">
      <h2>
        {sup.name}
        <span className="hint">{sup.makes}</span>
        {!edit && <button className="link right" onClick={() => setEdit(Object.fromEntries(fields.map(([k]) => [k, sup[k] || ''])))}>Edit</button>}
      </h2>
      <div className="muted small">{[sup.location, sup.website].filter(Boolean).join(' · ')}</div>
      <div className="chips">{items.map(i => <span key={i.id} className="chip">{i.name}</span>)}</div>
      {edit ? (
        <form onSubmit={async e => { e.preventDefault(); if (await onSave(edit)) setEdit(null); }}>
          {fields.map(([k, label]) => (
            <label key={k} className="block"><span>{label}</span><textarea rows={3} value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></label>
          ))}
          <div className="form-actions"><button className="primary small" disabled={busy}>Save</button><button type="button" className="link" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      ) : (
        fields.filter(([k]) => sup[k]).map(([k, label]) => <p key={k} className="field"><span>{label}</span>{sup[k]}</p>)
      )}
      <div className="contacts">
        {sup.contacts.map(c => (
          <div key={c.email || c.name} className="contact">
            <span className="strong">{c.name}</span> <span className="muted">{c.role}</span>
            <div>
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.phone && <> · <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
