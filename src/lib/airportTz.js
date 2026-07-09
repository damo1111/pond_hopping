// IATA airport code -> IANA timezone. Used to render each flight's times
// in *local* time at the relevant airport (dep_time local to dep_airport,
// arr_time local to arr_airport) — the DB stores everything as UTC.
export const AIRPORT_TZ = {
  ATL: 'America/New_York',
  BER: 'Europe/Berlin',
  BKK: 'Asia/Bangkok',
  BNE: 'Australia/Brisbane',
  CAN: 'Asia/Shanghai',
  CMB: 'Asia/Colombo',
  DMK: 'Asia/Bangkok',
  EDI: 'Europe/London',
  HKG: 'Asia/Hong_Kong',
  HND: 'Asia/Tokyo',
  ICN: 'Asia/Seoul',
  KBV: 'Asia/Bangkok',
  KUL: 'Asia/Kuala_Lumpur',
  LHR: 'Europe/London',
  MEL: 'Australia/Melbourne',
  MSY: 'America/Chicago',
  PEK: 'Asia/Shanghai',
  SHA: 'Asia/Shanghai',
  SIN: 'Asia/Singapore',
  SYD: 'Australia/Sydney',
  WLG: 'Pacific/Auckland',
}

export function localTime(iso, airportCode) {
  if (!iso) return ''
  const tz = AIRPORT_TZ[airportCode]
  if (!tz) return iso.slice(11, 16) // unknown airport: fall back to the raw stored value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function localDate(iso, airportCode) {
  if (!iso) return ''
  const tz = AIRPORT_TZ[airportCode]
  const opts = { day: 'numeric', month: 'short', year: 'numeric' }
  if (tz) opts.timeZone = tz
  return new Intl.DateTimeFormat('en-GB', opts).format(new Date(iso))
}
