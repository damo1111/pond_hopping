import { useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'

const COUNTRIES = [
  { id: 'KR', label: '🇰🇷 Korean' },
  { id: 'HK', label: '🇭🇰 Cantonese' },
  { id: 'CN', label: '🇨🇳 Mandarin' },
  { id: 'JP', label: '🇯🇵 Japanese' },
  { id: 'TH', label: '🇹🇭 Thai' },
  { id: 'MY', label: '🇲🇾 Malay' },
  { id: 'LK', label: '🇱🇰 Sinhala' },
  { id: 'NZ', label: '🇳🇿 Māori' },
]

// Which language toggles are relevant to each trip.
const TRIP_LANGS = {
  'south-korea': ['KR', 'HK'],
  'china-japan': ['CN', 'JP'],
  bangkok: ['TH'],
  'singapore-malaysia': ['MY'],
  'sri-lanka-voyage': ['LK'],
  'new-zealand': ['NZ'],
}

export default function PhrasesTab() {
  const { selectedTrip } = useContext(TripContext)
  const [phrases, setPhrases] = useState(null)
  const [country, setCountry] = useState('KR')
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('phrases')
      .select('*')
      .order('sort_order')
      .then(({ data }) => alive && setPhrases(data ?? []))
    return () => {
      alive = false
    }
  }, [])

  const tripLangs = selectedTrip ? TRIP_LANGS[selectedTrip] : null

  // Follow the trip filter: jump to its language(s) whenever the selection changes.
  useEffect(() => {
    if (tripLangs && !tripLangs.includes(country)) {
      setCountry(tripLangs[0])
      setCat('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip])

  const visibleCountries = tripLangs ? COUNTRIES.filter((c) => tripLangs.includes(c.id)) : COUNTRIES

  const cats = useMemo(() => {
    const set = new Set((phrases ?? []).filter((p) => p.country === country).map((p) => p.category))
    return ['all', ...set]
  }, [phrases, country])

  if (!phrases) return <div className="tab-loading">loading phrases…</div>

  const visible = phrases.filter(
    (p) =>
      p.country === country &&
      (cat === 'all' || p.category === cat) &&
      (!q ||
        p.english.toLowerCase().includes(q.toLowerCase()) ||
        (p.romanized || '').toLowerCase().includes(q.toLowerCase()))
  )

  async function copy(p) {
    try {
      await navigator.clipboard.writeText(p.local)
      setCopied(p.id)
      setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="phrases-tab">
      <div className="ph-toggles">
        {visibleCountries.map((c) => (
          <button
            key={c.id}
            className={`map-chip${country === c.id ? ' active' : ''}`}
            onClick={() => {
              setCountry(c.id)
              setCat('all')
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        className="ph-search"
        placeholder="Search phrases…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ph-cats">
        {cats.map((c) => (
          <button key={c} className={`ph-cat${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="ph-list">
        {visible.map((p) => (
          <button key={p.id} className="ph-row" onClick={() => copy(p)}>
            <div className="ph-en">{p.english}</div>
            <div className="ph-local">{p.local}</div>
            {p.romanized && <div className="ph-rom">{p.romanized}</div>}
            <div className={`ph-copied${copied === p.id ? ' show' : ''}`}>copied ✓</div>
          </button>
        ))}
        {!visible.length && <div className="tab-loading">no matches</div>}
      </div>
    </div>
  )
}
