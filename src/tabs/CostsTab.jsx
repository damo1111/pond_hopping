import { useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import CountryFlags from '../components/CountryFlags.jsx'

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Hotel', 'Activity', 'Flight', 'Other']
const CURRENCIES = ['AUD', 'KRW', 'HKD', 'JPY', 'CNY', 'USD', 'GBP']
// Units per 1 AUD — static conversion at entry time (per brief).
const RATES = { AUD: 1, KRW: 905, HKD: 5.15, JPY: 95, CNY: 4.7, USD: 0.66, GBP: 0.52 }
const CAT_ICON = { Food: '🍜', Transport: '🚄', Shopping: '🛍️', Hotel: '🏨', Activity: '🎟️', Flight: '✈️', Other: '📎' }

const fmtA = (n) => 'A$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

function AddCost({ tripMeta, selectedTrip, onSaved }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    trip: selectedTrip || tripMeta[0]?.slug || '',
    description: '',
    amount: '',
    currency: 'AUD',
    category: 'Food',
    city: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    const trip = tripMeta.find((t) => t.slug === form.trip)
    const amount = parseFloat(form.amount)
    if (!trip || !form.description || !isFinite(amount)) return
    setSaving(true)
    const { error } = await supabase.from('costs').insert({
      trip_id: trip.id,
      description: form.description,
      amount,
      currency: form.currency,
      amount_aud: +(amount / RATES[form.currency]).toFixed(2),
      category: form.category,
      city: form.city || null,
      spent_on: form.date,
    })
    setSaving(false)
    if (!error) {
      setShow(false)
      setForm((f) => ({ ...f, description: '', amount: '', city: '' }))
      onSaved()
    } else {
      alert(`Couldn't save: ${error.message}`)
    }
  }

  if (!show) {
    return (
      <button className="journal-add-btn" onClick={() => setShow(true)}>
        + add cost
      </button>
    )
  }
  return (
    <div className="journal-form">
      <div className="jf-row">
        <select value={form.trip} onChange={set('trip')}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <input type="date" value={form.date} onChange={set('date')} />
      </div>
      <input placeholder="Description" value={form.description} onChange={set('description')} />
      <div className="jf-row">
        <input placeholder="Amount" inputMode="decimal" value={form.amount} onChange={set('amount')} />
        <select value={form.currency} onChange={set('currency')}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="jf-row">
        <select value={form.category} onChange={set('category')}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input placeholder="City" value={form.city} onChange={set('city')} />
      </div>
      <div className="jf-actions">
        <button className="jf-cancel" onClick={() => setShow(false)}>
          cancel
        </button>
        <button className="jf-save" disabled={saving || !form.description || !form.amount} onClick={save}>
          {saving ? 'saving…' : 'save cost'}
        </button>
      </div>
    </div>
  )
}

export default function CostsTab() {
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const [costs, setCosts] = useState(null)
  const [reload, setReload] = useState(0)
  // Costs are dollar figures — hidden by default so the app is safe to
  // show off/share before real per-recipient permissions exist. Resets
  // every time you land back on this tab.
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    let alive = true
    supabase
      .from('costs')
      .select('*')
      .order('spent_on', { ascending: true })
      .then(({ data }) => alive && setCosts(data ?? []))
    return () => {
      alive = false
    }
  }, [reload])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  if (!costs) return <div className="tab-loading">loading costs…</div>

  // No reveal button — fully inaccessible from the UI until real
  // per-recipient access control is built. The data itself is untouched.
  if (!unlocked) {
    return (
      <div className="costs-tab">
        <div className="placeholder cost-lock">
          <div className="cost-lock-icon">🔒</div>
          <div className="placeholder-code">costs</div>
          <div className="placeholder-note">Private while access controls are being built.</div>
        </div>
      </div>
    )
  }

  const visible = costs.filter((c) => !selectedTrip || tripsById.get(c.trip_id)?.slug === selectedTrip)
  const total = visible.reduce((s, c) => s + Number(c.amount_aud || 0), 0)

  const byCat = CATEGORIES.map((cat) => ({
    cat,
    total: visible.filter((c) => c.category === cat).reduce((s, c) => s + Number(c.amount_aud || 0), 0),
  })).filter((x) => x.total > 0)
  const maxCat = Math.max(1, ...byCat.map((x) => x.total))

  // per-trip totals (unfiltered view only)
  const perTrip = tripMeta
    .map((t) => ({
      t,
      total: costs.filter((c) => c.trip_id === t.id).reduce((s, c) => s + Number(c.amount_aud || 0), 0),
    }))
    .filter((x) => x.total > 0)

  return (
    <div className="costs-tab">
      <AddCost tripMeta={tripMeta} selectedTrip={selectedTrip} onSaved={() => setReload((r) => r + 1)} />

      <div className="fx-card cost-total-card">
        <div className="cost-total-label">{selectedTrip ? 'trip total' : 'running total'}</div>
        <div className="cost-total">{fmtA(total)}</div>
      </div>

      {byCat.length > 0 && (
        <div className="fx-card">
          {byCat.map(({ cat, total: v }) => (
            <div key={cat} className="cost-bar-row">
              <span className="cost-bar-label">
                {CAT_ICON[cat]} {cat}
              </span>
              <div className="cost-bar-track">
                <div className="cost-bar" style={{ width: `${(v / maxCat) * 100}%` }} />
              </div>
              <span className="cost-bar-val">{fmtA(v)}</span>
            </div>
          ))}
        </div>
      )}

      {!selectedTrip && perTrip.length > 0 && (
        <>
          <div className="flight-section-head" style={{ marginTop: 4 }}>
            <span className="fsh-title">By trip</span>
          </div>
          {perTrip.map(({ t, total: v }) => (
            <div key={t.slug} className="cost-trip-row">
              <span className="trip-flags-inline">
                <CountryFlags countries={t.countries} size={15} /> {t.title}
              </span>
              <span className="cost-bar-val">{fmtA(v)}</span>
            </div>
          ))}
        </>
      )}

      {visible.length > 0 && (
        <>
          <div className="flight-section-head" style={{ marginTop: 4 }}>
            <span className="fsh-title">Items</span>
            <span className="fsh-meta">{visible.length}</span>
          </div>
          <div className="cost-items">
            {visible.map((c) => (
              <div key={c.id} className="cost-item">
                <span className="cost-item-icon">{CAT_ICON[c.category] || '📎'}</span>
                <span className="cost-item-desc">
                  {c.description}
                  <span className="cost-item-sub">
                    {[c.city, c.spent_on].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="cost-item-amt">
                  {fmtA(c.amount_aud)}
                  {c.currency !== 'AUD' && (
                    <span className="cost-item-orig">
                      {Number(c.amount).toLocaleString()} {c.currency}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!visible.length && (
        <div className="placeholder" style={{ minHeight: '30vh' }}>
          <div className="placeholder-code">costs</div>
          <div className="placeholder-note">No costs logged{selectedTrip ? ' for this trip' : ''} yet.</div>
        </div>
      )}
    </div>
  )
}
