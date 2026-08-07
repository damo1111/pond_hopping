// Airline tail liveries, matched by airline name. Where a real tail image
// exists (public/tails/), TailFin renders that. Otherwise it falls back to
// a hand-drawn emblem in the airline's brand colour.
const AIRLINES = [
  { iata: 'QF', test: /qantas/i, color: '#E30513', emblem: 'qantas', image: '/tails/qantas.png' },
  { iata: 'CX', test: /cathay/i, color: '#F5F2EB', emblem: 'cathay', image: '/tails/cathay-pacific.png' },
  { iata: 'MH', test: /malaysia airlines/i, color: '#FFFFFF', emblem: 'malaysia', image: '/tails/malaysia-airlines.webp' },
  { iata: 'BA', test: /british airways/i, color: '#F5F2EB', emblem: 'british-airways', image: '/tails/british-airways.webp' },
  { iata: 'UL', test: /srilankan|sri ?lankan/i, color: '#FFFFFF', emblem: 'srilankan', image: '/tails/srilankan.png' },
  { iata: 'AK', test: /airasia/i, color: '#FF0000', emblem: 'airasia', image: '/tails/airasia.png' },
  { iata: 'NH', test: /all nippon|\bana\b/i, color: '#13448F', emblem: 'ana', image: '/tails/ana.png' },
  { iata: 'JQ', test: /jetstar/i, color: '#FF6600', emblem: 'jetstar', image: '/tails/jetstar.webp' },
  { iata: 'TG', test: /^thai airways/i, color: '#5D3A8B', emblem: 'default', image: '/tails/thai-airways.webp' },
  { iata: 'FM', test: /shanghai airlines/i, color: '#154889', emblem: 'shanghai', image: '/tails/shanghai-airlines.png' },
  { iata: 'VA', test: /virgin/i, color: '#DD1E3A', emblem: 'virgin', image: '/tails/virgin.webp' },
  { iata: 'MU', test: /china eastern/i, color: '#7B2029', emblem: 'china-eastern' },
  { iata: 'DL', test: /delta/i, color: '#003268', emblem: 'delta' },

  // No tail photograph for these yet, so they render as a fin in the
  // airline's own colour — which is still an answer, where the gold default
  // is an admission that we did not recognise the airline at all. Drop a
  // file into public/tails/ and add `image:` here to upgrade any of them.
  { iata: 'TP', test: /tap air portugal|^tap\b/i, color: '#00A54F', emblem: 'default' },
  { iata: 'EK', test: /emirates/i, color: '#D71921', emblem: 'default' },
  { iata: 'SQ', test: /singapore airlines/i, color: '#F9A11B', emblem: 'default' },
  { iata: 'QR', test: /qatar/i, color: '#5C0632', emblem: 'default' },
  { iata: 'EY', test: /etihad/i, color: '#BD8B13', emblem: 'default' },
  { iata: 'LH', test: /lufthansa/i, color: '#05164D', emblem: 'default' },
  { iata: 'AF', test: /air france/i, color: '#002157', emblem: 'default' },
  { iata: 'KL', test: /\bklm\b/i, color: '#00A1DE', emblem: 'default' },
  { iata: 'LX', test: /swiss\b/i, color: '#E30613', emblem: 'default' },
  { iata: 'TK', test: /turkish/i, color: '#C70A0C', emblem: 'default' },
  { iata: 'IB', test: /iberia/i, color: '#D7192D', emblem: 'default' },
  { iata: 'EI', test: /aer lingus/i, color: '#006272', emblem: 'default' },
  { iata: 'AY', test: /finnair/i, color: '#0B1560', emblem: 'default' },
  { iata: 'FR', test: /ryanair/i, color: '#073590', emblem: 'default' },
  { iata: 'U2', test: /easyjet/i, color: '#FF6600', emblem: 'default' },
  { iata: 'NZ', test: /air new zealand/i, color: '#1B1B1B', emblem: 'default' },
  { iata: 'JL', test: /japan airlines/i, color: '#C8102E', emblem: 'default' },
  { iata: 'KE', test: /korean air/i, color: '#2B5DA8', emblem: 'default' },
  { iata: 'OZ', test: /asiana/i, color: '#8C1D40', emblem: 'default' },
  { iata: 'VN', test: /vietnam airlines/i, color: '#00693E', emblem: 'default' },
  { iata: 'BR', test: /eva air/i, color: '#115740', emblem: 'default' },
  { iata: 'CI', test: /china airlines/i, color: '#D4002A', emblem: 'default' },
  { iata: 'AC', test: /air canada/i, color: '#D22630', emblem: 'default' },
  { iata: 'UA', test: /united/i, color: '#002244', emblem: 'default' },
  { iata: 'AA', test: /american airlines/i, color: '#0078D2', emblem: 'default' },
  { iata: 'AI', test: /air india/i, color: '#C8102E', emblem: 'default' },
  { iata: 'TR', test: /scoot/i, color: '#FBB040', emblem: 'default' },
  { iata: 'GA', test: /garuda/i, color: '#005DAA', emblem: 'default' },
]

const DEFAULT = { color: '#A8842C', emblem: 'default' }

/**
 * The airline code at the front of a flight number.
 *
 * Planned flights routinely carry a number and no airline name — the number
 * is what you copy off a booking — so BA504 was falling through to the
 * default gold fin despite British Airways having had a tail photo in the
 * bundle all along. Handles the two-character codes that mix letters and
 * digits, which is most of the low-cost carriers.
 */
export function airlineCode(text) {
  const m = String(text ?? '')
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*-?\s*\d{1,4}[A-Z]?$/)
  return m ? m[1] : null
}

/**
 * @param {string} airline  A name ("British Airways"), or a flight number
 *                          ("BA504") when the name isn't known.
 */
export function tailLivery(airline) {
  if (!airline) return DEFAULT
  const byName = AIRLINES.find((a) => a.test.test(airline))
  if (byName) return { color: byName.color, emblem: byName.emblem, image: byName.image }

  const code = airlineCode(airline)
  const byCode = code && AIRLINES.find((a) => a.iata === code)
  return byCode
    ? { color: byCode.color, emblem: byCode.emblem, image: byCode.image }
    : DEFAULT
}

// Kept for any callers that just want a colour swatch.
export function tailColor(airline) {
  return tailLivery(airline).color
}
