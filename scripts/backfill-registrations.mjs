// Backfills aircraft registrations onto flights already in the database,
// from a byAir CSV export.
//
//   node scripts/backfill-registrations.mjs <export.csv>            # dry run
//   node scripts/backfill-registrations.mjs <export.csv> --write
//
// Why this exists as its own script rather than a flag on import-byair.mjs:
// that one inserts, this one only ever updates. It will not create a flight,
// will not touch a row that already has a registration, and will not change
// anything at all without --write. Keeping the two apart means a mistake here
// can't invent history.
//
// Why it matters: registration is the only key Planespotters accepts. Every
// aircraft photo in the app hangs off it, and 466 of 475 flights don't have
// one — so the Flights tab says "Add registration to load aircraft photo" for
// almost everything. Nothing else in the schema can be derived into it; a tail
// number has to come from a record of the actual airframe, and the byAir
// export is the one you already own.
//
// The export's column name for it is not known here, so the script looks for
// any of the plausible spellings and, failing that, prints the headers it did
// find rather than guessing or silently doing nothing.
import { readFileSync } from 'node:fs'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
// Reads are fine with the publishable key. Writes are not — flights are
// locked down to the service role, which is the point of that lockdown.
const READ_KEY = process.env.SUPABASE_KEY || 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const WRITE_KEY = process.env.SUPABASE_SERVICE_KEY

const [, , file, ...flags] = process.argv
const WRITE = flags.includes('--write')
if (!file) {
  console.error('usage: node scripts/backfill-registrations.mjs <export.csv> [--write]')
  process.exit(1)
}
if (WRITE && !WRITE_KEY) {
  console.error('--write needs SUPABASE_SERVICE_KEY in the environment.')
  console.error('The anon key can read flights but not update them, deliberately.')
  process.exit(1)
}

// byAir quotes fields containing commas. Same reader as the importer.
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
  const head = rows.shift().map((h) => h.trim())
  return { head, rows: rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))) }
}

// Whatever byAir calls it. Matched case-insensitively and punctuation-blind so
// "Aircraft Reg." and "aircraft_registration" both land.
const REG_HEADERS = [
  'registration', 'aircraftregistration', 'aircraftreg', 'reg', 'tail',
  'tailnumber', 'tailno', 'aircrafttailnumber',
]
const TYPE_HEADERS = ['aircrafttype', 'aircraft', 'equipment', 'aircraftmodel', 'type']
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '')

async function sb(path, opts = {}) {
  const key = opts.method && opts.method !== 'GET' ? WRITE_KEY : READ_KEY
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const t = await res.text()
  return t ? JSON.parse(t) : null
}

const { head, rows } = parseCSV(readFileSync(file, 'utf8'))
const regCol = head.find((h) => REG_HEADERS.includes(norm(h)))
const typeCol = head.find((h) => TYPE_HEADERS.includes(norm(h)))

if (!regCol) {
  console.error('No registration column in this export. Headers found:\n')
  console.error(head.map((h) => `  ${h}`).join('\n'))
  console.error('\nIf one of those is the tail number under a name I did not guess,')
  console.error('add it to REG_HEADERS at the top of this file and re-run.')
  console.error('If none of them is, byAir does not export it and the data has to')
  console.error('come from somewhere else — which is worth knowing before paying')
  console.error('for a flight-history API to find out.')
  process.exit(1)
}
console.error(`registration column: "${regCol}"${typeCol ? ` · aircraft type: "${typeCol}"` : ' · no aircraft type column'}`)

// One read of everything, then match in memory. 475 rows is nothing, and it
// avoids 900 round trips against a database to ask the same question.
const flights = await sb('flights?select=id,flight_number,dep_airport,arr_airport,dep_time,registration&limit=2000')
console.error(`${flights.length} flights in the database · ${flights.filter((f) => f.registration).length} already have a registration`)

// A flight is identified by number, route and day. The stored dep_time is a
// UTC instant and the export's date is local to the departure airport, so the
// two can legitimately disagree by a day in either direction — a 23:40
// departure from Sydney is the previous day in UTC. Hence the window rather
// than an equality test.
// Postgres renders a timestamptz as "2026-06-08 13:40:00+00", and a bare
// two-digit offset is not valid ISO 8601 — Date.parse returns NaN for it and
// the next toISOString throws. PostgREST normally hands back "+00:00" so this
// never bites in the app, but a script fed a psql dump or a hand-made CSV
// should not fall over on a formatting detail.
function parseTime(s) {
  if (!s) return NaN
  const iso = String(s).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return Date.parse(iso)
}

const key = (num, dep, arr, day) => `${(num || '').toUpperCase()}|${dep}|${arr}|${day}`
const index = new Map()
const undated = []
for (const f of flights) {
  const t = parseTime(f.dep_time)
  if (Number.isNaN(t)) { undated.push(f); continue }
  for (const d of [-1, 0, 1]) {
    const day = new Date(t + d * 86400000).toISOString().slice(0, 10)
    const k = key(f.flight_number, f.dep_airport, f.arr_airport, day)
    if (!index.has(k)) index.set(k, [])
    index.get(k).push(f)
  }
}
if (undated.length) console.error(`${undated.length} stored flights have an unreadable dep_time and can't be matched`)

const plan = []
const tally = { noReg: 0, unmatched: 0, ambiguous: 0, alreadySet: 0, conflict: 0 }
const unmatchedSample = []

for (const r of rows) {
  const reg = (r[regCol] || '').trim().toUpperCase()
  if (!reg) { tally.noReg++; continue }
  const k = key(r['Flight Code'], r['Departure Airport Code'], r['Arrival Airport Code'], r['Flight Date'])
  const hits = [...new Set(index.get(k) || [])]
  if (!hits.length) {
    tally.unmatched++
    if (unmatchedSample.length < 8) unmatchedSample.push(`${r['Flight Code']} ${r['Departure Airport Code']}-${r['Arrival Airport Code']} ${r['Flight Date']}`)
    continue
  }
  // Two different flights answering to one number, route and day is not
  // something to resolve by picking one.
  if (hits.length > 1) { tally.ambiguous++; continue }
  const f = hits[0]
  if (f.registration) {
    if (f.registration.toUpperCase() !== reg) tally.conflict++
    else tally.alreadySet++
    continue
  }
  plan.push({ id: f.id, registration: reg, label: `${r['Flight Code']} ${r['Departure Airport Code']}-${r['Arrival Airport Code']} ${r['Flight Date']} → ${reg}` })
}

console.error('')
console.error(`${plan.length} flights would gain a registration`)
console.error(`${tally.alreadySet} already correct · ${tally.conflict} disagree with what is stored (left alone) · ${tally.ambiguous} ambiguous (left alone)`)
console.error(`${tally.noReg} export rows carry no registration · ${tally.unmatched} could not be matched to a stored flight`)
if (unmatchedSample.length) console.error(`  e.g. ${unmatchedSample.join(', ')}`)
console.error('')
for (const p of plan.slice(0, 15)) console.error(`  ${p.label}`)
if (plan.length > 15) console.error(`  … and ${plan.length - 15} more`)

if (!WRITE) {
  console.error('\nDry run. Nothing was changed. Re-run with --write to apply.')
  process.exit(0)
}

let done = 0
for (const p of plan) {
  await sb(`flights?id=eq.${p.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ registration: p.registration }),
  })
  if (++done % 50 === 0) console.error(`  ${done}/${plan.length}`)
}
console.error(`\n${done} registrations written.`)
