import { useContext, useState } from 'react'
import { TripContext } from '../App.jsx'

const SECTIONS = [
  { id: 'journal', label: 'Diary', def: true },
  { id: 'flights', label: 'Itinerary', def: true },
  { id: 'map', label: 'Map', def: true },
  { id: 'costs', label: 'Costs', def: false }, // hidden by default per brief
]

export default function ShareTab() {
  const { tripMeta } = useContext(TripContext)
  const [trip, setTrip] = useState(tripMeta[0]?.slug || '')
  const [on, setOn] = useState(Object.fromEntries(SECTIONS.map((s) => [s.id, s.def])))
  const [copied, setCopied] = useState(false)

  const show = SECTIONS.filter((s) => on[s.id]).map((s) => s.id)
  const url = `${window.location.origin}/?share=${trip}&show=${show.join(',')}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="share-tab">
      <div className="fx-card">
        <div className="ios-sheet-title">Share a trip</div>
        <div className="ios-sheet-sub">
          A read-only page for friends — no login, no app needed. Pick the trip and what they get to
          see.
        </div>
        <select className="share-select" value={trip} onChange={(e) => setTrip(e.target.value)}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="share-sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`ph-flag${on[s.id] ? ' on' : ''}`}
              onClick={() => setOn((o) => ({ ...o, [s.id]: !o[s.id] }))}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="share-url">{url}</div>
        <div className="jf-actions" style={{ justifyContent: 'stretch' }}>
          <button className="jf-save" style={{ flex: 1 }} onClick={copy}>
            {copied ? 'copied ✓' : 'copy link'}
          </button>
          <a className="share-preview" href={url} target="_blank" rel="noreferrer">
            preview →
          </a>
        </div>
      </div>
    </div>
  )
}
