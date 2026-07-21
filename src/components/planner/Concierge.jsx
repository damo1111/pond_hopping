import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { computeCoverage, fmtGapRange } from '../../lib/tripGaps.js'
import { CITY_COORDS } from '../../lib/cityCoords.js'
import { API_BASE } from '../../lib/apiBase.js'

// The Concierge: reads the itinerary like a human assistant would.
// It knows where every night of the trip is spent — booked stay, overnight
// flight, or nothing at all — and for the "nothing at all" nights it works
// out from that day's plans WHERE the missing hotel should be ("you're
// having dinner in Harpenden that evening"), then finds points-earning
// options via the loyalty programmes in traveler_preferences, or hands the
// whole gap to the AI planner with full context already attached.

const PROGRAM_COLORS = {
  Accor: '#B5602E',
  Hilton: '#3B7EA1',
  Marriott: '#7D3C55',
  IHG: '#3E7D54',
}

function fmtNight(n) {
  return `${n} night${n === 1 ? '' : 's'}`
}

function evidenceLine(gap) {
  if (!gap.evidence.length) return null
  const bits = gap.evidence.slice(0, 3).map((e) => {
    const day = new Date(e.event_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    return `${e.title}${e.city ? ` (${e.city})` : ''} · ${day}`
  })
  return bits.join('  ·  ')
}

function GapCard({ gap, trip, onAskAI, onAdded }) {
  const [hotels, setHotels] = useState(null) // null = untouched, undefined = loading
  const [error, setError] = useState(false)
  const [addedId, setAddedId] = useState(null)

  const where = gap.cities[0] || null
  const searchNear = where ? `${where}, UK` : null
  // Known coordinates beat a town-name search: a 15km-radius search
  // around Harpenden finds the chain hotels in Luton/St Albans next door,
  // where near="Harpenden" alone finds nothing at all.
  const ll = where && CITY_COORDS[where] ? CITY_COORDS[where].join(',') : null

  async function findHotels() {
    setHotels(undefined)
    setError(false)
    try {
      const q = ll ? `ll=${encodeURIComponent(ll)}` : `near=${encodeURIComponent(searchNear)}`
      const r = await fetch(`${API_BASE}/api/hotel-search?${q}`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setHotels(d.hotels || [])
    } catch {
      setHotels(null)
      setError(true)
    }
  }

  async function addPlaceholder(h) {
    setAddedId(h.id)
    await supabase.from('planned_events').insert({
      trip_id: trip.id,
      event_date: gap.start,
      end_date: gap.end,
      start_time: '15:00',
      title: h.name,
      city: where,
      kind: 'hotel',
      note: `Suggested by Concierge · ${h.program} · not booked yet`,
      detail: { suggested: true, program: h.program, website: h.website },
      done: false,
    })
    onAdded?.()
  }

  function askAI() {
    const evidence = gap.evidence.map((e) => `${e.title} in ${e.city || '?'} on ${e.event_date}`).join('; ')
    onAskAI(
      `I still need accommodation for ${fmtGapRange(gap)} (${fmtNight(gap.nights)}). That stretch includes: ${evidence || 'no fixed plans yet'}. ` +
        `I have loyalty status with Accor, Hilton, Marriott and IHG — recommend specific hotels (with locations) that fit around those plans, and add your best pick to the trip as a suggestion.`
    )
  }

  return (
    <div className="cg-gap">
      <div className="cg-gap-head">
        <span className="cg-gap-dates">{fmtGapRange(gap)}</span>
        <span className="cg-gap-n">
          {fmtNight(gap.nights)}
          {where ? ` · likely ${where}` : ''}
        </span>
      </div>
      {evidenceLine(gap) && <div className="cg-gap-evidence">{evidenceLine(gap)}</div>}

      <div className="cg-gap-actions">
        {searchNear && (
          <button className="cg-btn" onClick={findHotels} disabled={hotels === undefined}>
            {hotels === undefined ? 'searching…' : '🏨 find loyalty hotels'}
          </button>
        )}
        <button className="cg-btn" onClick={askAI}>
          ✨ ask the planner
        </button>
      </div>
      {error && <div className="cg-gap-evidence">Couldn't reach the hotel search just now — try again shortly.</div>}

      {Array.isArray(hotels) && (
        <div className="cg-hotels">
          {hotels.length === 0 && (
            <div className="cg-gap-evidence">No loyalty-chain hotels found near {where} — worth asking the planner instead.</div>
          )}
          {hotels.slice(0, 6).map((h) => (
            <div key={h.id} className="cg-hotel">
              <span className="cg-hotel-tag" style={{ background: PROGRAM_COLORS[h.program] || '#8B8375' }}>
                {h.program}
              </span>
              <span className="cg-hotel-body">
                <span className="cg-hotel-name">{h.name}</span>
                {h.address && <span className="cg-hotel-addr">{h.address}</span>}
              </span>
              <button className="cg-hotel-add" disabled={addedId === h.id} onClick={() => addPlaceholder(h)}>
                {addedId === h.id ? '✓' : '+ hold'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Concierge({ trip, events, onAskAI, onAdded }) {
  const cov = computeCoverage(trip, events)
  if (!cov) return null

  const sortedNights = cov.stayNights + cov.transitNights
  const allSorted = cov.gapNights === 0

  return (
    <div className="cg">
      <div className="cg-head">
        <span className="cg-title">Concierge</span>
        <span className={`cg-score${allSorted ? ' done' : ''}`}>
          {allSorted ? 'every night sorted ✓' : `${sortedNights} of ${cov.totalNights} nights sorted`}
        </span>
      </div>
      <div className="cg-meter">
        <span className="cg-meter-fill" style={{ width: `${Math.round((sortedNights / cov.totalNights) * 100)}%` }} />
      </div>
      <div className="cg-legend">
        {cov.stayNights > 0 && <span>🏨 {fmtNight(cov.stayNights)} booked</span>}
        {cov.transitNights > 0 && <span>✈️ {fmtNight(cov.transitNights)} in transit</span>}
        {cov.gapNights > 0 && <span className="cg-legend-gap">◌ {fmtNight(cov.gapNights)} to sort</span>}
      </div>

      {cov.gaps.map((g) => (
        <GapCard key={g.start} gap={g} trip={trip} onAskAI={onAskAI} onAdded={onAdded} />
      ))}
    </div>
  )
}
