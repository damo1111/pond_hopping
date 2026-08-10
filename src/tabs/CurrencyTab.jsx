import { useContext, useEffect, useMemo, useState } from 'react'
import { TripContext } from '../App.jsx'
import { relevantCodes, sortByRelevance } from '../lib/relevance.js'

// Static fallback rates: units per 1 AUD. Live fetch overrides silently.
const STATIC_RATES = { AUD: 1, EUR: 0.57, GBP: 0.52, USD: 0.66, JPY: 95, CNY: 4.7, HKD: 5.15, KRW: 905, SGD: 0.85, THB: 21.5, MYR: 2.8, NZD: 1.09, LKR: 197 }
const CURRENCIES = ['AUD', 'EUR', 'GBP', 'USD', 'JPY', 'CNY', 'HKD', 'KRW', 'SGD', 'THB', 'MYR', 'NZD', 'LKR']
// Which country spends what. Only the currencies this app offers, because
// this is for ordering a list of thirteen — not for being a reference.
const CURRENCY_OF = {
  AU: 'AUD', NZ: 'NZD', GB: 'GBP', US: 'USD', JP: 'JPY', CN: 'CNY', HK: 'HKD',
  KR: 'KRW', SG: 'SGD', TH: 'THB', MY: 'MYR', LK: 'LKR',
  // The euro is one currency and twenty countries, which is exactly why a
  // flag-to-currency table beats guessing from the currency's own name.
  PT: 'EUR', ES: 'EUR', FR: 'EUR', IT: 'EUR', DE: 'EUR', NL: 'EUR', IE: 'EUR',
  GR: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', HR: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', LU: 'EUR', MT: 'EUR', SK: 'EUR', SI: 'EUR', CY: 'EUR',
}

const SYMBOL = { AUD: 'A$', EUR: '€', GBP: '£', USD: 'US$', JPY: '¥', CNY: 'CN¥', HKD: 'HK$', KRW: '₩', SGD: 'S$', THB: '฿', MYR: 'RM', NZD: 'NZ$', LKR: 'Rs' }

const BENCHMARKS = [
  { city: 'Seoul', items: [['Americano', 'KRW', 5500], ['Subway ride', 'KRW', 1500], ['KBBQ for one', 'KRW', 18000], ['Taxi flagfall', 'KRW', 4800]] },
  { city: 'Hong Kong', items: [['Flat white', 'HKD', 45], ['MTR cross-harbour', 'HKD', 14], ['Dai pai dong plate', 'HKD', 60], ['Taxi flagfall', 'HKD', 29]] },
]

function fmt(n, c) {
  const digits = n >= 1000 ? 0 : n >= 10 ? 1 : 2
  return SYMBOL[c] + n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export default function CurrencyTab() {
  const { tripMeta } = useContext(TripContext)
  // Sorted, not filtered. Somebody checking the yen the week before they
  // have booked anything is exactly who this is for, and hiding it until a
  // trip exists would be the wrong way round.
  // Ordered by currency rather than by country, because the euro is one
  // currency and twenty countries — matching the other way round would pick
  // whichever of them happened to be first in the table and miss a trip to
  // any of the other nineteen.
  const currencies = useMemo(() => {
    const wanted = []
    for (const code of relevantCodes(tripMeta)) {
      const currency = CURRENCY_OF[code]
      if (currency && !wanted.includes(currency)) wanted.push(currency)
    }
    return sortByRelevance(CURRENCIES, (c) => c, wanted)
  }, [tripMeta])
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
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fx-grid">
          {currencies.filter((c) => c !== from).map((c) => (
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
