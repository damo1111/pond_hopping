import { useEffect, useState } from 'react'
import { fetchAircraftPhoto } from '../lib/planespotters.js'
import { supabase } from '../lib/supabase.js'
import TailFin from './TailFin.jsx'
import FlapText from './FlapText.jsx'
import Icon from './Icon.jsx'
import RouteMap from './RouteMap.jsx'
import { localTime, localDate } from '../lib/airportTz.js'
import { nameFor, usePeopleNames } from '../lib/people.js'
import { dayShift, howItWent, saidAs, spanMinutes } from '../lib/flightSpan.js'
import { photosOnLeg } from '../lib/photosOnLeg.js'

export default function FlightCard({ flight, aircraftType, photos = [], onOpen }) {
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

  const mins = spanMinutes(f.dep_time, f.arr_time)
  const shift = dayShift(localDate(f.dep_time, f.dep_airport), localDate(f.arr_time, f.arr_airport))
  const went = howItWent(f)
  // Terminal and gate have been stored by the enrichment and shown nowhere.
  // They are the two things somebody standing in a concourse actually wants.
  // Everything taken between wheels-up and wheels-down was taken on this
  // leg. A tracker knows the flight happened; this app also holds the
  // photographs, and nobody else can put the two side by side.
  const onboard = photosOnLeg(
    photos.filter((p) => p.trip_id === f.trip_id),
    f
  )

  const at = (t, g) => [t && `T${String(t).replace(/^T/i, '')}`, g && `Gate ${g}`].filter(Boolean).join(' · ')
  const depAt = at(f.terminal_dep, f.gate_dep)
  const arrAt = at(f.terminal_arr, f.gate_arr)

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
          {/* Two ends and the time between them.
              This showed the departure time and nothing else — no arrival,
              no duration, no sense that the thing takes eleven hours, which
              is the one fact a flight card exists to carry. Both numbers
              were already in the row; nothing new is asked of anybody. */}
          <span className="fh-span">
            <span className="fh-end">
              <FlapText className="fh-time" text={localTime(f.dep_time, f.dep_airport)} groupDelay={0} />
              <FlapText className="fh-code" text={f.dep_airport} groupDelay={200} />
              <span className="fh-place">{f.dep_city}</span>
              {depAt && <span className="fh-gate">{depAt}</span>}
            </span>

            <span className="fh-mid">
              {mins ? <span className="fh-dur">{saidAs(mins)}</span> : null}
              <span className="fh-line" aria-hidden="true">
                <i className="fh-line-plane" />
              </span>
              <FlapText className="fh-flightno" text={f.flight_number} groupDelay={420} />
            </span>

            <span className="fh-end fh-end--to">
              <span className="fh-time-wrap">
                <FlapText className="fh-time" text={localTime(f.arr_time, f.arr_airport)} groupDelay={320} />
                {/* Leaving at 23:55 and landing at 06:10 reads as arriving
                    before you left without this. */}
                {shift !== 0 && (
                  <sup className="fh-next">
                    {shift > 0 ? '+' : '−'}
                    {Math.abs(shift)}
                  </sup>
                )}
              </span>
              <FlapText className="fh-code" text={f.arr_airport} groupDelay={260} />
              <span className="fh-place">{f.arr_city}</span>
              {arrAt && <span className="fh-gate">{arrAt}</span>}
            </span>
          </span>

          {/* How it actually went, against how it was meant to go.
              actual_arr_time has been stored for months and shown nowhere,
              and "landed twelve minutes early" is the single line people
              open a flight tracker for. */}
          {went && (
            <span className={`fh-went${went.late ? ' late' : ''}`}>
              {went.minutes
                ? `${went.when} ${went.minutes} min ${went.word}`
                : `${went.when} on time`}
            </span>
          )}

          {onboard.length > 0 && (
            <span className="fh-onboard">
              <span className="fh-onboard-strip" aria-hidden="true">
                {onboard.slice(0, 5).map((p) => (
                  <img key={p.id} src={p.thumb_url || p.url} alt="" loading="lazy" />
                ))}
              </span>
              <span className="fh-onboard-said">
                {onboard.length} from this flight
              </span>
            </span>
          )}

          <span className="fh-row2">
            {localDate(f.dep_time, f.dep_airport)}
            {f.aircraft_model ? (
              <>
                <span className="fh-dot">·</span>
                {f.aircraft_model}
              </>
            ) : null}
            {f.seat ? (
              <>
                <span className="fh-dot">·</span>
                {f.cabin ? `${f.cabin} ${f.seat}` : f.seat}
              </>
            ) : null}
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
            <Meta label="Duration" value={saidAs(mins)} mono />
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
