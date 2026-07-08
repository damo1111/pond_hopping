// Airline tail liveries, matched by airline name. Where a real tail image
// exists (public/tails/), TailFin renders that. Otherwise it falls back to
// a hand-drawn emblem in the airline's brand colour.
const AIRLINES = [
  { test: /qantas/i, color: '#E30513', emblem: 'qantas', image: '/tails/qantas.png' },
  { test: /cathay/i, color: '#F5F2EB', emblem: 'cathay', image: '/tails/cathay-pacific.png' },
  { test: /malaysia airlines/i, color: '#FFFFFF', emblem: 'malaysia', image: '/tails/malaysia-airlines.webp' },
  { test: /british airways/i, color: '#F5F2EB', emblem: 'british-airways', image: '/tails/british-airways.webp' },
  { test: /srilankan|sri ?lankan/i, color: '#FFFFFF', emblem: 'srilankan' },
  { test: /airasia/i, color: '#FF0000', emblem: 'airasia', image: '/tails/airasia.png' },
  { test: /all nippon|\bana\b/i, color: '#13448F', emblem: 'ana', image: '/tails/ana.png' },
  { test: /jetstar/i, color: '#FF6600', emblem: 'jetstar', image: '/tails/jetstar.webp' },
  { test: /^thai airways/i, color: '#5D3A8B', emblem: 'default', image: '/tails/thai-airways.webp' },
  { test: /shanghai airlines/i, color: '#154889', emblem: 'shanghai' },
  { test: /virgin/i, color: '#DD1E3A', emblem: 'virgin', image: '/tails/virgin.webp' },
  { test: /china eastern/i, color: '#7B2029', emblem: 'china-eastern' },
]

export function tailLivery(airline) {
  if (!airline) return { color: '#A8842C', emblem: 'default' }
  const hit = AIRLINES.find((a) => a.test.test(airline))
  return hit ? { color: hit.color, emblem: hit.emblem, image: hit.image } : { color: '#A8842C', emblem: 'default' }
}

// Kept for any callers that just want a colour swatch.
export function tailColor(airline) {
  return tailLivery(airline).color
}
