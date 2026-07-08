import { useEffect, useMemo, useState } from 'react'

// Static fallback rates: units per 1 AUD. Live fetch overrides silently.
const STATIC_RATES = { AUD: 1, KRW: 905, HKD: 5.15, JPY: 95, CNY: 4.7, USD: 0.66, GBP: 0.52 }
const CURRENCIES = ['AUD', 'KRW', 'HKD', 'JPY', 'CNY', 'USD', 'GBP']
const SYMBOL = { AUD: 'A$', KRW: '₩', HKD: 'HK$', JPY: '¥', CNY: 'CN¥', USD: 'US$', GBP: '£' }

const BENCHMARKS = [
  { city: 'Seoul', items: [['Americano', 'KRW', 5500], ['Subway ride', 'KRW', 1500], ['KBBQ for one', 'KRW', 18000], ['Taxi flagfall', 'KRW', 4800]] },
  { city: 'Hong Kong', items: [['Flat white', 'HKD', 45], ['MTR cross-harbour', 'HKD', 14], ['Dai pai dong plate', 'HKD', 60], ['Taxi flagfall', 'HKD', 29]] },
]

function fmt(n, c) {
  const digits = n >= 1000 ? 0 : n >= 10 ? 1 : 2
  return SYMBOL[c] + n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export default function CurrencyTab() {
  const [rates, setRates] = useState(STATIC_RATES)
  const [live, setLive] = useState(false)
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState('AUD')

  useEffect(() => {
    let alive = true
    fetch('https://open.er-api.com/v6/latest/AUD')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.rates) return
        const next = { AUD: 1 }
        for (const c of CURRENCIES) if (d.rates[c]) next[c] = d.rates[c]
        setRates(next)
        setLive(true)
      })
      .catch(() => {}) // fall back silently
    return () => {
      alive = false
    }
  }, [])

  const inAud = useMemo(() => {
    const a = parseFloat(amount)
    if (!isFinite(a)) return 0
    return a / (rates[from] || 1)
  }, [amount, from, rates])

  return (
    <div className="currency-tab">
      <div className="fx-card">
        <div className="fx-input-row">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fx-grid">
          {CURRENCIES.filter((c) => c !== from).map((c) => (
            <button key={c} className="fx-cell" onClick={() => setFrom(c)}>
              <span className="fx-code">{c}</span>
              <span className="fx-val">{fmt(inAud * rates[c], c)}</span>
            </button>
          ))}
        </div>
        <div className="fx-source">{live ? 'live rates · open.er-api.com' : 'static rates · offline'}</div>
      </div>

      <div className="flight-section-head" style={{ marginTop: 8 }}>
        <span className="fsh-title">Price benchmarks</span>
        <span className="fsh-meta">what things cost</span>
      </div>
      {BENCHMARKS.map((b) => (
        <div key={b.city} className="fx-card">
          <div className="fx-bench-city">{b.city}</div>
          {b.items.map(([label, cur, val]) => (
            <div key={label} className="fx-bench-row">
              <span>{label}</span>
              <span className="fx-bench-val">
                {fmt(val, cur)} <span className="fx-bench-aud">≈ {fmt(val / rates[cur], 'AUD')}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
