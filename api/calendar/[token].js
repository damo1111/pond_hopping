// Live ICS calendar feed, one per person. Subscribe once with a webcal://
// link and every trip — flights, stays, bookings — appears in Apple/Google/
// Outlook Calendar and stays current as the trip changes. Deliberately a
// *subscription* rather than pushing events into someone's calendar: no
// OAuth, no write scopes, no sync state to get wrong, and it works
// identically on every platform. Same trick TripIt uses.
//
// Auth is the opaque token in the URL. RLS can't see a calendar app (no
// JWT), so api_calendar_feed() resolves the token to a person and returns
// only their trips, all inside the database.
const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

// RFC 5545 wants CRLF, escaped commas/semicolons/backslashes, and lines
// folded at 75 octets. Calendar apps are unforgiving about all three.
function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function fold(line) {
  if (line.length <= 75) return line
  const out = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) out.push(' ' + rest)
  return out.join('\r\n')
}

const stampUTC = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dateOnly = (d) => String(d).slice(0, 10).replace(/-/g, '')

// All-day events are exclusive of DTEND, so a one-day event needs DTEND of
// the following day or calendars render it as zero-length and hide it.
function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function vevent({ uid, summary, description, location, start, end, allDay }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stampUTC(Date.now())}`,
    allDay
      ? `DTSTART;VALUE=DATE:${dateOnly(start)}`
      : `DTSTART:${stampUTC(start)}`,
    allDay
      ? `DTEND;VALUE=DATE:${end ? nextDay(end) : nextDay(start)}`
      : `DTEND:${stampUTC(end || start)}`,
    `SUMMARY:${esc(summary)}`,
  ]
  if (location) lines.push(`LOCATION:${esc(location)}`)
  if (description) lines.push(`DESCRIPTION:${esc(description)}`)
  lines.push('END:VEVENT')
  return lines.map(fold).join('\r\n')
}

export default async function handler(req, res) {
  // Vercel gives us the path segment including the .ics people will have
  // typed or tapped, so tolerate it either way.
  const raw = String(req.query.token || '')
  const token = raw.replace(/\.ics$/i, '')
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    res.status(404).send('Not found')
    return
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/api_calendar_feed`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ t: token }),
    })
    if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
    const trips = await r.json()

    // Null means the token didn't resolve. 404 rather than 401 so probing
    // for valid tokens looks identical to a typo.
    if (!trips) {
      res.status(404).send('Not found')
      return
    }

    const out = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pond Hopping//Trips//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Pond Hopping',
      'X-WR-CALDESC:Your trips — flights, stays and bookings',
      // Hint to clients how often to re-poll. Most ignore it, but the ones
      // that honour it stop hammering the endpoint every few minutes.
      'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
      'X-PUBLISHED-TTL:PT6H',
    ]

    for (const trip of trips) {
      // The trip itself as an all-day banner, so it reads as a block in
      // month view even before anything is booked into it.
      if (trip.start_date) {
        out.push(
          vevent({
            uid: `trip-${trip.slug}@pond.eend.app`,
            summary: `✈️ ${trip.title}`,
            start: trip.start_date,
            end: trip.end_date || trip.start_date,
            allDay: true,
          })
        )
      }

      for (const [i, f] of (trip.flights || []).entries()) {
        if (!f.dep_time) continue
        const who = f.traveler ? ` (${f.traveler})` : ''
        out.push(
          vevent({
            uid: `flight-${trip.slug}-${i}@pond.eend.app`,
            summary: `${f.flight_number || f.airline || 'Flight'} ${f.dep_airport} → ${f.arr_airport}${who}`,
            location: `${f.dep_city || f.dep_airport || ''}`,
            description: [f.airline, f.seat ? `Seat ${f.seat}` : null].filter(Boolean).join(' · '),
            start: f.dep_time,
            end: f.arr_time || f.dep_time,
          })
        )
      }

      for (const [i, e] of (trip.events || []).entries()) {
        if (!e.event_date) continue
        // Timed if we know the time, all-day otherwise — a hotel stay with
        // no check-in time shouldn't land at midnight.
        const timed = !!e.start_time
        out.push(
          vevent({
            uid: `event-${trip.slug}-${i}@pond.eend.app`,
            summary: e.title,
            location: e.city || '',
            description: e.note || '',
            start: timed ? `${e.event_date}T${e.start_time}:00Z` : e.event_date,
            end: timed ? `${e.event_date}T${e.start_time}:00Z` : e.end_date || e.event_date,
            allDay: !timed,
          })
        )
      }
    }

    out.push('END:VCALENDAR')

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=1800')
    res.status(200).send(out.join('\r\n') + '\r\n')
  } catch (err) {
    console.error(err)
    res.status(500).send('Calendar unavailable')
  }
}
