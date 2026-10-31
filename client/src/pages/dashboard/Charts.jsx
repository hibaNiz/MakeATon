import { useId, useState } from 'react';
import { money, moneyShort, methodLabel } from '../../lib/format';

export const monthLabel = (value, short = false) => new Date(value + 'T00:00:00Z').toLocaleDateString('en-IN', {
  month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC',
});

export function CashflowChart({ data }) {
  const gradient = useId();
  const [selected, setSelected] = useState(data.length - 1);
  const current = data[selected];
  const maximum = Math.max(1, ...data.flatMap(row => [row.billed, row.collected]));
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const ceiling = Math.ceil(maximum / magnitude) * magnitude;
  const width = 760, height = 240, left = 12, right = 12, top = 16, bottom = 18;
  const x = index => left + index * (width - left - right) / (data.length - 1);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  const points = key => data.map((row, index) => `${x(index)},${y(row[key])}`).join(' ');
  const hasActivity = data.some(row => row.billed || row.collected);
  return (
    <div className="finance-cashflow">
      <div className="finance-legend"><span><i className="finance-line collected" />Collected</span><span><i className="finance-line billed" />Billed</span></div>
      <div className="finance-plot">
        <div className="finance-y-axis" aria-hidden="true">{[4, 3, 2, 1, 0].map(tick => <span key={tick}>{moneyShort(ceiling * tick / 4)}</span>)}</div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0.015" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(tick => {
            const value = ceiling * tick / 4;
            return <line key={tick} x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="finance-gridline" />;
          })}
          <polygon points={`${left},${y(0)} ${points('collected')} ${x(data.length - 1)},${y(0)}`} fill={`url(#${gradient})`} />
          <polyline points={points('billed')} className="finance-series billed" />
          <polyline points={points('collected')} className="finance-series collected" />
          <line x1={x(selected)} x2={x(selected)} y1={top} y2={y(0)} className="finance-crosshair" />
          {['billed', 'collected'].map(key => <circle key={key} cx={x(selected)} cy={y(current[key])} r="5" className={`finance-point ${key}`} />)}
        </svg>
      </div>
      <div className="finance-months" role="group" aria-label="Inspect a month">
        {data.map((row, index) => <button key={row.month} type="button" aria-pressed={selected === index}
          aria-label={`${monthLabel(row.month)}: collected ${money(row.collected)}, billed ${money(row.billed)}`}
          onClick={() => setSelected(index)} onFocus={() => setSelected(index)}>
          {monthLabel(row.month, true)}<small>{row.month.slice(0, 4)}</small>
        </button>)}
      </div>
      <div className="finance-inspection" aria-live="polite" aria-atomic="true">
        <strong>{monthLabel(current.month)}{selected === data.length - 1 && <small>Month to date</small>}</strong>
        <span>Collected <b>{money(current.collected)}</b></span><span>Billed <b>{money(current.billed)}</b></span>
      </div>
      {!hasActivity && <p className="finance-note">No confirmed invoices or payments in this period. Activity will appear here as you bill and collect.</p>}
      <details className="finance-data"><summary>View chart data</summary><div className="table-wrap" tabIndex={0} role="region" aria-label="Monthly billed and collected data">
        <table><caption className="sr-only">Monthly billed and collected amounts in INR</caption><thead><tr><th scope="col">Month</th><th scope="col">Billed</th><th scope="col">Collected</th></tr></thead>
          <tbody>{data.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td>{money(row.billed)}</td><td>{money(row.collected)}</td></tr>)}</tbody></table>
      </div></details>
    </div>
  );
}

export function PaymentChart({ data, total, count }) {
  let offset = 0;
  return <div className="finance-payments-chart">
    <div className="finance-donut">
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <circle cx="100" cy="100" r="78" className="finance-donut-track" />
        {data.map(row => {
          const percent = total > 0 ? row.amount / total * 100 : 0;
          const start = offset; offset += percent;
          return <circle key={row.method} cx="100" cy="100" r="78" pathLength="100"
            className={`finance-donut-segment method-${row.method}`} strokeDasharray={`${percent} ${100 - percent}`} strokeDashoffset={-start} />;
        })}
      </svg>
      <div className="finance-donut-label"><strong>{count.toLocaleString('en-IN')}</strong><span>{count === 1 ? 'payment' : 'payments'}</span></div>
    </div>
    {data.length ? <ul className="finance-methods">{data.map(row => <li key={row.method}>
      <span className={`finance-dot method-${row.method}`} aria-hidden="true" /><div><span>{methodLabel(row.method)}</span><small>{row.count} {row.count === 1 ? 'payment' : 'payments'} · {(row.amount / total * 100).toFixed(1)}%</small></div><strong>{money(row.amount)}</strong>
    </li>)}</ul> : <p className="finance-note">No payments in this period. Record a payment on a confirmed invoice to get started.</p>}
  </div>;
}

export function AgingChart({ data, total }) {
  const max = Math.max(1, ...data.map(row => row.amount));
  return <div className="finance-aging-chart">
    {data.map(row => <div className={`finance-aging-row aging-${row.position}`} key={row.position}>
      <div className="finance-aging-label"><span>{row.label}<small>{row.count} {row.count === 1 ? 'invoice' : 'invoices'}</small></span><strong>{money(row.amount)}</strong></div>
      <div className="finance-bar-track" aria-hidden="true"><div style={{ width: `${row.amount / max * 100}%` }} /></div>
    </div>)}
    <p className="finance-note">{total ? 'Remaining balances, grouped by days past the due date. Invoices due today are not overdue.' : 'No outstanding balances. Confirmed invoices with a remaining balance will appear here.'}</p>
  </div>;
}
