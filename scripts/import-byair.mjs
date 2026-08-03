// Imports a byAir CSV export into the flights table.
//
//   node scripts/import-byair.mjs <export.csv> [--write]
//
// Dry run by default — prints exactly what it would do and changes nothing.
//
// Deliberate choices, each of which cost something to get wrong:
//
// * Past only. The export is a point-in-time snapshot with no notion of a
//   cancellation, so a future-dated row may already be void — one in the
//   8 Jul export was cancelled and rebooked before it was ever read.
//   Settled history is safe to import; forward bookings are not.
//
// * trip_id stays null for everything. Auto-grouping 947 flights across 17
//   years produced either 164 clusters with a 130-leg monster or 422 with
//   269 single-leg fragments, depending on the rule. Attaching by date
//   overlap with the existing trips looked safer and isn't: 148 rows fall
//   inside a curated trip's window but only ~78 belong to one. The Jan 2024
//   Germany/NY trip alone would have gained an EDI-LCY, a SEA-DFW and a
//   LHR-BCN, none of which anyone on that trip flew — byAir tracks other
//   people's flights too. Unassigned flights still draw on the globe, count
//   in the stats, and list under Flight history.
//
// * Ownership is not mapped to `traveler`. byAir marks a flight "mine"
//   even when it's a partner's flight being tracked, so it can't be
//   trusted to say who actually flew.
//
// * Departure/arrival times are local to their own airport, so they're
//   converted to UTC via each airport's timezone before storing — the DB
//   holds instants, and the UI renders them back to local per airport.
import { readFileSync } from 'node:fs'
import { AIRPORT_COORDS } from '../src/lib/airportCoords.js'
import { AIRPORT_TZ } from '../src/lib/airportTz.js'
import { AIRPORT_CITY } from '../src/lib/airportCities.js'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = process.env.SUPABASE_KEY || 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

const [, , file, ...flags] = process.argv
const WRITE = flags.includes('--write')
if (!file) {
  console.error('usage: node scripts/import-byair.mjs <export.csv> [--write]')
  process.exit(1)
}

// Minimal CSV reader: byAir quotes fields containing commas (notes do).
function parseCSV(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const head = rows.shift().map((h) => h.replace(/^﻿/, '').trim())
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// Local wall-clock at an airport -> UTC instant. Formats a guess in the
// target zone and corrects by the observed offset, which handles DST
// without a tz library.
function toUTC(date, time, airport) {
  if (!date) return null
  const tz = AIRPORT_TZ[airport]
  const hhmm = /^\d{2}:\d{2}$/.test(time || '') ? time : '00:00'
  const naive = new Date(`${date}T${hhmm}:00Z`)
  if (!tz) return naive.toISOString()
  const shown = new Date(naive.toLocaleString('en-US', { timeZone: tz }))
  const utcRef = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(naive.getTime() - (shown.getTime() - utcRef.getTime())).toISOString()
}

const R = 6371
const toRad = (d) => (d * Math.PI) / 180
function distanceKm(a, b) {
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const t = await res.text()
  return t ? JSON.parse(t) : null
}

const TODAY = new Date().toISOString().slice(0, 10)
const rows = parseCSV(readFileSync(file, 'utf8')).filter((r) => r['Flight Date'])
const past = rows.filter((r) => r['Flight Date'] < TODAY)

// Two rows put an Etihad flight through ABU — Mopah, Indonesia — where the
// export plainly meant Abu Dhabi (AUH). Both are already logged correctly
// under AUH on the same date under the same flight number, so the ABU
// copies are pure corruption: importing them would fling a 10,000 km arc
// across the Pacific for a flight that never left the Gulf.
const BAD_AIRPORTS = new Set(['ABU'])

const insert = []
const skipped = { duplicate: 0, codeshare: 0, badAirport: 0, noCoords: 0, future: rows.length - past.length }
const missing = new Set()
const seen = new Set()
// The same physical flight is often logged twice under both carriers'
// numbers — BA8711/CJ8711, KL1607/KQ1607, DL5994/VS4. They share a date,
// route and departure time, which nothing genuinely distinct ever does.
// Keeping both would inflate the flight count and double the distance.
const byLeg = new Map()

for (const r of past) {
  const dep = r['Departure Airport Code'], arr = r['Arrival Airport Code']
  if (BAD_AIRPORTS.has(dep) || BAD_AIRPORTS.has(arr)) { skipped.badAirport++; continue }
  // The export also contains exact duplicates of the same flight number.
  const key = `${r['Flight Code']}|${dep}|${arr}|${r['Flight Date']}`
  if (seen.has(key)) { skipped.duplicate++; continue }
  const from = AIRPORT_COORDS[dep], to = AIRPORT_COORDS[arr]
  if (!from || !to) { skipped.noCoords++; missing.add(!from ? dep : arr); continue }
  seen.add(key)

  const leg = `${r['Flight Date']}|${dep}|${arr}|${r['Departure Time']}`
  const prior = byLeg.get(leg)
  if (prior != null) {
    skipped.codeshare++
    // Keep whichever copy carries more detail; a tie keeps the first seen.
    const richer = (r['Seat Class'] ? 1 : 0) + (r['Seat Number'] ? 1 : 0)
    const held = (insert[prior].cabin ? 1 : 0) + (insert[prior].seat ? 1 : 0)
    if (richer > held) {
      insert[prior].flight_number = r['Flight Code'] || null
      insert[prior].cabin = r['Seat Class'] || null
      insert[prior].seat = r['Seat Number'] || null
    }
    continue
  }
  byLeg.set(leg, insert.length)

  const depTime = toUTC(r['Flight Date'], r['Departure Time'], dep)
  // The export gives an arrival wall-clock but not an arrival date, so an
  // arrival that lands at or before its departure means the flight ran past
  // midnight — advance a day and look again. It can take two: QF4 JFK-AKL
  // leaves on the 30th and lands on the 1st, and BA15 LHR-SYD is nearly a
  // full day in the air on top of a ten-hour timezone jump.
  let arrTime = toUTC(r['Flight Date'], r['Arrival Time'], arr)
  for (let day = 1; arrTime && depTime && arrTime <= depTime && day <= 3; day++) {
    const next = new Date(r['Flight Date'] + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + day)
    arrTime = toUTC(next.toISOString().slice(0, 10), r['Arrival Time'], arr)
  }

  insert.push({
    flight_date: r['Flight Date'],
    flight_number: r['Flight Code'] || null,
    dep_airport: dep, arr_airport: arr,
    dep_lat: from[0], dep_lon: from[1],
    arr_lat: to[0], arr_lon: to[1],
    dep_time: depTime, arr_time: arrTime,
    cabin: r['Seat Class'] || null,
    seat: r['Seat Number'] || null,
    notes: r['Notes'] || null,
    distance_km: distanceKm(from, to),
    sort_order: 0,
  })
}

console.error(`${rows.length} rows · ${past.length} past · ${skipped.future} future skipped`)
console.error(`${skipped.duplicate} duplicates · ${skipped.codeshare} codeshare copies · ${skipped.badAirport} bad airport codes · ${skipped.noCoords} without coordinates${missing.size ? ` (${[...missing].join(', ')})` : ''}`)
console.error(`${insert.length} candidates · ${insert.reduce((s, f) => s + f.distance_km, 0).toLocaleString()} km`)

// Emit SQL rather than POSTing: dedupe against what's already stored, and
// matching each flight to a trip by date, are both things Postgres does
// better than this script — and it keeps the whole import a single
// reviewable, re-runnable statement.
// Compact on purpose — the statement has to be transmitted somewhere, and
// a 947-row VALUES list of quoted tuples is mostly punctuation. Instead:
// coordinates come from a small airports CTE rather than being repeated on
// every row; timestamps collapse to an HHMM plus a day offset from the
// flight date (a departure is UTC-shifted at most a day either way); and
// the Notes column is dropped entirely — it's airline baggage boilerplate
// ("1 handbag plus 1 cabin bag…"), identical across hundreds of rows and of
// no use once imported. Roughly halves the payload.
const dayOffset = (date, iso) =>
  iso ? Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(date)) / 86400000) : ''
const hhmm = (iso) => (iso ? iso.slice(11, 13) + iso.slice(14, 16) : '')
const used = [...new Set(insert.flatMap((f) => [f.dep_airport, f.arr_airport]))].sort()
const airports = used
  .map((c) => `('${c}',${AIRPORT_COORDS[c][0]},${AIRPORT_COORDS[c][1]},'${(AIRPORT_CITY[c] || c).replace(/'/g, "''")}')`)
  .join(',')
const values = insert
  .map((f) =>
    [
      f.flight_date, f.flight_number || '', f.dep_airport, f.arr_airport,
      dayOffset(f.flight_date, f.dep_time), hhmm(f.dep_time),
      dayOffset(f.flight_date, f.arr_time), hhmm(f.arr_time),
      f.cabin || '', f.seat || '', f.distance_km,
    ].join('|')
  )
  .join('\n')

// A pipe-delimited blob split back out by Postgres. Nothing in the data can
// contain a pipe or a newline (airport codes, flight numbers, cabin and seat
// are all short alphanumerics), so the split is unambiguous.
const field = (n) => `split_part(l,'|',${n})`
const stamp = (off, time) =>
  `case when ${field(time)} = '' then null else ` +
  `((${field(1)}::date + ${field(off)}::int) + ` +
  `(substr(${field(time)},1,2) || ':' || substr(${field(time)},3,2))::time) ` +
  `at time zone 'UTC' end`

process.stdout.write(`-- byAir import: ${insert.length} flights
with apt (code, lat, lon, city) as (values ${airports}),
raw as (select l from unnest(string_to_array($import$
${values}
$import$, E'\\n')) as l where l <> ''),
incoming as (
  select ${field(1)}::date          as flight_date,
         nullif(${field(2)},'')     as flight_number,
         ${field(3)}                as dep_airport,
         ${field(4)}                as arr_airport,
         ${stamp(5, 6)}             as dep_time,
         ${stamp(7, 8)}             as arr_time,
         nullif(${field(9)},'')     as cabin,
         nullif(${field(10)},'')    as seat,
         ${field(11)}::int          as distance_km
  from raw
)
insert into public.flights (trip_id, flight_number, dep_airport, arr_airport,
                            dep_lat, dep_lon, arr_lat, arr_lon, dep_city, arr_city,
                            dep_time, arr_time, cabin, seat, distance_km, sort_order)
select null, i.flight_number, i.dep_airport, i.arr_airport,
       d.lat, d.lon, a.lat, a.lon, d.city, a.city,
       i.dep_time, i.arr_time, i.cabin, i.seat, i.distance_km, 0
from incoming i
join apt d on d.code = i.dep_airport
join apt a on a.code = i.arr_airport
-- Skip anything already stored. Matching on the departure *instant* rather
-- than the date: the export records local scheduled times while the stored
-- rows hold actual off-blocks times, so the two disagree by a few minutes
-- and, either side of midnight, by a whole calendar day (AS708 LAX-LAS is
-- filed on the 5th and departs 00:30Z on the 6th). Two hours is loose
-- enough to absorb that and far tighter than the 24h that would be needed
-- to confuse two genuinely different flights — the same number on the same
-- route on consecutive days happens often in this data.
where not exists (
  select 1 from flights f
  where f.dep_airport = i.dep_airport and f.arr_airport = i.arr_airport
    and (
      -- Same flight number: a couple of hours of slack.
      (coalesce(f.flight_number,'') = coalesce(i.flight_number,'')
         and abs(extract(epoch from (f.dep_time - i.dep_time))) < 7200)
      -- Different number, same departure minute: the stored row carries the
      -- marketing carrier and the export the operator (QF282/NJS282,
      -- AS2310/QX2310). Ten minutes, because two genuinely different
      -- red-eyes on the same route can push back fifteen apart.
      or abs(extract(epoch from (f.dep_time - i.dep_time))) < 600
    )
);
`)
