// Everything known about one day, as the writer needs to see it.
//
// Deliberately not prose. Three attempts at templating prose out of this
// produced a database describing itself; the writing is done by something
// that can write, and this is what it is given.
//
// Nothing here is inferred or embellished. Every field is a row from the
// database or arithmetic over one, so the writer's instruction — use only
// these facts — is a rule about a real, finite list.

import { clockIn } from './localTime.js'
import { words } from './sport.js'

const HOUR = 60

const said = (t, zone) => (t ? clockIn(t, zone) : null)

export function factsFor(day = {}, names = {}, zone = null, extra = {}) {
  const segments = (day.segments ?? []).map((s, i) => ({
    place: names[i] ?? null,
    from: said(s.from, zone),
    to: said(s.to, zone),
    minutes: s.minutes,
    stayed: !!s.stayed,
    photos: s.photos?.length ?? 0,
  }))

  return {
    date: day.date,
    day_number: day.day_number,
    // The two facts a day is hung on, when they exist.
    flights: (day.known?.flights ?? []).map((f) => ({
      number: f.flight_number,
      from: f.dep_airport,
      to: f.arr_airport,
      departed: said(f.dep_time, zone),
      arrived: said(f.arr_time, zone),
    })),
    activities: (day.known?.runs ?? []).map((r) => ({
      kind: words(r.sport).one,
      km: Number(r.distance_km) || null,
      pace: r.pace ?? null,
      climb_m: Number(r.elevation_m) || null,
    })),
    // Where they stopped, in order. Places with no name are still stops —
    // the writer is told they happened and told nothing is known about
    // them, which is more honest than dropping them silently.
    stops: segments.filter((s) => s.stayed),
    passing: segments.filter((s) => !s.stayed).length,
    first_photo: said(day.from, zone),
    last_photo: said(day.to, zone),
    photos: day.photos?.length ?? 0,
    ...extra,
  }
}

/** Their own earlier entries, as a voice to write in. Longest first: a
 *  one-line entry teaches nothing about how somebody writes. */
export function voiceFrom(entries = [], not = null, howMany = 6) {
  return entries
    .filter((e) => e?.note && e.entry_date !== not)
    // Anything they wrote themselves. A reconstruction is this system's
    // own voice, and feeding it back in would teach it to imitate itself.
    .filter((e) => !e.built_from)
    .map((e) => String(e.note).trim())
    .filter((n) => n.length > 40)
    .sort((a, b) => b.length - a.length)
    .slice(0, howMany)
}

export const hours = (m) => (Number.isFinite(m) ? Math.round((m / HOUR) * 10) / 10 : null)
