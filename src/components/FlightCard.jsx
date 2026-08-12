import { useEffect, useState } from 'react'
import { fetchAircraftPhoto } from '../lib/planespotters.js'
import { supabase } from '../lib/supabase.js'
import TailFin from './TailFin.jsx'
import FlapText from './FlapText.jsx'
import Icon from './Icon.jsx'
import RouteMap from './RouteMap.jsx'
import { localTime, localDate } from '../lib/airportTz.js'
import { nameFor, usePeopleNames } from '../lib/people.js'

function fmtDuration(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export default function FlightCard({ flight, aircraftType, onOpen }) {
  const names = usePeopleNames()
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(undefined) // undefined = not loaded, null = none
  const [overrides, setOverrides] = useState({})
  const [regDraft, setRegDraft] = useState('')
  const [regSaving, setRegSaving] = useState(false)

  const f = { ...flight, ...overrides }
  const hasRoute = f.dep_lat != null && f.dep_lon != null && f.arr_lat != null && f.arr_lon != null

  useEffect(() => {
    let alive = true
    if (!f.registration) {
      setPhoto(null)
      return
    }
    fetchAircraftPhoto(f.registration).then((p) => alive && setPhoto(p))
    return () => {
      alive = false
    }
  }, [f.registration])

  async function saveField(field, value) {
    if (!value.trim()) return
    const { error } = await supabase.from('flights').update({ [field]: value.trim() }).eq('id', flight.id)
    if (!error) setOverrides((o) => ({ ...o, [field]: value.trim() }))
  }

  async function saveRegistration() {
    if (!regDraft.trim()) return
    setRegSaving(true)
    await saveField('registration', regDraft)
    setRegSaving(false)
  }

  const from = [f.dep_lat, f.dep_lon]
  const to = [f.arr_lat, f.arr_lon]

  return (
    <div className={`flight-card${open ? ' open' : ''}`}>
      <button
        className="flight-head board"
        onClick={() =>
          setOpen((o) => {
            // Told to the strip above, which draws this leg on the line.
            // Reported on the way open only: closing a card does not mean
            // some other flight is now the one being looked at.
            if (!o) onOpen?.(flight.id)
            return !o
          })
        }
      >
        <span className="fh-thumb">
          <TailFin airline={f.airline || f.flight_number} size={22} />
        </span>
        <span className="fh-main">
          <span className="fh-row1">
            <FlapText className="fh-time" text={localTime(f.dep_time, f.dep_airport)} groupDelay={0} />
            <span className="fh-route">
              <FlapText text={f.dep_airport} groupDelay={200} />
              <span className="fh-arrow">→</span>
              <FlapText text={f.arr_airport} groupDelay={260} />
            </span>
            <FlapText className="fh-flightno" text={f.flight_number} groupDelay={420} />
          </span>
          <span className="fh-row2">
            {f.dep_city} — {f.arr_city}
            <span className="fh-dot">·</span>
            {localDate(f.dep_time, f.dep_airport)}
            {f.distance_km ? (
              <>
                <span className="fh-dot">·</span>
                {f.distance_km.toLocaleString()} km
              </>
            ) : null}
            {/* Only shown on legs someone flew alone — on a trip everyone
                took together, tagging every flight "both" is just noise. */}
            {f.travellers?.length ? (
              <span className="fh-who">{f.travellers.map((e) => nameFor(e, names)).join(' & ')}</span>
            ) : null}
          </span>
        </span>
      </button>

      {open && (
        <div className="flight-body">
          <div className="flight-photo">
            {photo === undefined && <div className="photo-skel">loading aircraft…</div>}
            {photo === null && f.registration && (
              <div className="photo-none">No spotter photo for {f.registration} yet</div>
            )}
            {photo === null && !f.registration && (
              <div className="photo-none photo-none-edit" onClick={(e) => e.stopPropagation()}>
                <span>Add registration to load aircraft photo</span>
                <div className="meta-edit-row">
                  <input
                    className="meta-edit-input"
                    placeholder="e.g. VH-EBQ"
                    value={regDraft}
                    onChange={(e) => setRegDraft(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && saveRegistration()}
                  />
                  <button
                    className="meta-edit-save"
                    disabled={regSaving || !regDraft.trim()}
                    onClick={saveRegistration}
                  >
                    {regSaving ? '…' : <Icon name="check" size={14} />}
                  </button>
                </div>
              </div>
            )}
            {photo && (
              <a href={photo.link} target="_blank" rel="noreferrer" className="photo-link">
                <img src={photo.thumb} alt={`${f.registration}`} loading="lazy" />
                <span className="photo-credit">
                  {f.registration} · © {photo.photographer} / Planespotters
                </span>
              </a>
            )}
          </div>

          {hasRoute && <RouteMap from={from} to={to} />}

          <div className="flight-meta">
            <Meta label="Airline" value={f.airline} onSave={(v) => saveField('airline', v)} />
            <Meta label="Aircraft" value={aircraftType?.name} />
            <Meta label="Reg" value={f.registration} mono onSave={(v) => saveField('registration', v.toUpperCase())} />
            <Meta label="Cabin" value={f.cabin} onSave={(v) => saveField('cabin', v)} />
            <Meta label="Seat" value={f.seat} mono onSave={(v) => saveField('seat', v)} />
            <Meta label="Depart" value={localTime(f.dep_time, f.dep_airport)} mono />
            <Meta label="Arrive" value={localTime(f.arr_time, f.arr_airport)} mono />
            <Meta label="Duration" value={fmtDuration(durationMin(f))} mono />
          </div>

          <a
            className="fr24-link"
            href={`https://www.flightradar24.com/data/flights/${(f.flight_number || '').toLowerCase()}`}
            target="_blank"
            rel="noreferrer"
          >
            View on FlightRadar24 →
          </a>
        </div>
      )}
    </div>
  )
}

function durationMin(flight) {
  if (!flight.dep_time || !flight.arr_time) return null
  const d = (new Date(flight.arr_time) - new Date(flight.dep_time)) / 60000
  return d > 0 ? Math.round(d) : null
}

function Meta({ label, value, mono, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  if (!value && !onSave) return null

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  if (!value && onSave) {
    return editing ? (
      <div className="meta-cell meta-cell-edit" onClick={(e) => e.stopPropagation()}>
        <div className="meta-label">{label}</div>
        <div className="meta-edit-row">
          <input
            className="meta-edit-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={label}
          />
          <button className="meta-edit-save" disabled={saving || !draft.trim()} onClick={save}>
            {saving ? '…' : <Icon name="check" size={14} />}
          </button>
        </div>
      </div>
    ) : (
      <button
        className="meta-cell meta-cell-add"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        <div className="meta-label">{label}</div>
        <div className="meta-value meta-add-cta">+ add</div>
      </button>
    )
  }

  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className={`meta-value${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  )
}
