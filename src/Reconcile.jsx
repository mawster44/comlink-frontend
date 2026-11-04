import { useState, useEffect } from 'react';
import { apiFetch } from './auth.js';
import { money, tone, shortDay, readJson } from './profitFormat.js';

const label = (type) => type.replace(/_/g, ' ').toLowerCase();

// Profit is built from per-order payouts; this checks it against what TikTok's statements say it paid.
export default function Reconcile({ range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    apiFetch(`/api/profit/reconciliation?from=${range.from}&to=${range.to}`)
      .then(readJson)
      .then(setData)
      .catch(e => setError(e.message));
  }, [range.from, range.to]);

  if (error) return <div className="note bad">{error}</div>;
  if (!data) return <p className="muted pad">Loading…</p>;
  if (!data.ready) {
    return (
      <section className="card">
        <h2>Statement reconciliation</h2>
        <p className="muted pad">TikTok statement totals haven’t been recorded yet. Press Sync now once, then come back.</p>
      </section>
    );
  }

  const { components: c } = data;
  const accountLevel = c.accountLevel;
  const gap = data.unexplainedGap;
  const clean = Math.abs(accountLevel) < 0.005 && Math.abs(gap) < 0.005;
  const partial = range.from < data.coverageStarts;

  return (
    <>
      <section className="card">
        <h2>
          Statement reconciliation
          <span className="hint">what TikTok paid, by the date it paid, against what profit counts</span>
        </h2>
        {partial && (
          <div className="note bad">
            Statements before {shortDay(data.coverageStarts)} haven’t been synced, so the start of this range is incomplete.
          </div>
        )}
        {data.statementCount === 0 ? (
          <p className="muted pad">No statements were paid in this date range.</p>
        ) : (
          <>
            <div className="free-grid">
              <div>
                <span className="kpi-label">TikTok paid out · {data.statementCount} statements</span>
                <span className="kpi-value">{money(data.statementTotal)}</span>
              </div>
              <div>
                <span className="kpi-label">On orders in the dashboard</span>
                <span className="kpi-value">{money(c.trackedOrders)}</span>
              </div>
              <div>
                <span className="kpi-label">On orders from before the synced window</span>
                <span className="kpi-value">{money(c.olderOrders)}</span>
              </div>
              <div>
                <span className="kpi-label">Account-level, no order</span>
                <span className={`kpi-value ${tone(accountLevel)}`}>{money(accountLevel)}</span>
              </div>
            </div>
            {c.excludedOrders !== 0 && (
              <p className="muted">{money(c.excludedOrders)} is on cancelled or unpaid orders, which the dashboard leaves out.</p>
            )}
            <Verdict data={data} clean={clean} accountLevel={accountLevel} gap={gap} />
          </>
        )}
      </section>

      {data.statementCount > 0 && (
        <>
          <section className="card">
            <h2>Everything on the statements, by type</h2>
            <TypeTable rows={data.byType} />
          </section>

          {data.accountLevelByType.length > 0 && (
            <section className="card">
              <h2>Account-level rows <span className="hint">not tied to an order, so not in profit</span></h2>
              <TypeTable rows={data.accountLevelByType} />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {data.largestAccountLevel.map((r, i) => (
                      <tr key={i}>
                        <td>{shortDay(r.date)}</td>
                        <td>{label(r.type)}</td>
                        <td className={`r ${tone(r.settlement)}`}>{money(r.settlement)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">Largest {data.largestAccountLevel.length} rows by amount.</p>
            </section>
          )}

          <section className="card">
            <h2>Statements</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Paid</th><th>Status</th><th className="r">Statement total</th><th className="r">Rows received</th><th className="r">Account-level</th><th className="r">Gap</th></tr>
                </thead>
                <tbody>
                  {data.statements.map(s => (
                    <tr key={s.id}>
                      <td>{shortDay(s.date)}</td>
                      <td><span className="tag">{(s.paymentStatus || 'unknown').toLowerCase()}</span></td>
                      <td className="r">{money(s.settlement)}</td>
                      <td className="r">{money(s.rows)}</td>
                      <td className={`r ${tone(s.accountLevel)}`}>{money(s.accountLevel)}</td>
                      <td className="r">{Math.abs(s.gap) < 0.005 ? '—' : <span className="tag bad">{money(s.gap)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Verdict({ data, clean, accountLevel, gap }) {
  if (clean) {
    return (
      <div className="verdict">
        <p className="pos">Nothing is missing. Every dollar in these statements sits on an order the dashboard knows about or on an older order.</p>
      </div>
    );
  }
  return (
    <div className="verdict">
      {Math.abs(accountLevel) >= 0.005 && (
        <p className={accountLevel < 0 ? 'neg' : 'pos'}>
          The statements include {money(Math.abs(accountLevel))} of account-level {accountLevel < 0 ? 'charges' : 'credits'} with no order attached.
          Profit doesn’t include them, so over these statements it is {accountLevel < 0 ? 'overstated' : 'understated'} by {money(Math.abs(data.profitOverstatedBy))}.
        </p>
      )}
      {Math.abs(gap) >= 0.005 && (
        <p className="neg">
          TikTok’s statement totals are {money(Math.abs(gap))} {gap > 0 ? 'higher' : 'lower'} than the rows we received for them.
          Run Sync now; if the gap stays, a page of results may be missing.
        </p>
      )}
    </div>
  );
}

function TypeTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Type</th><th className="r">Rows</th><th className="r">Total</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.type}>
              <td>{label(r.type)}</td>
              <td className="r">{r.count.toLocaleString()}</td>
              <td className={`r ${tone(r.settlement)}`}>{money(r.settlement)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
