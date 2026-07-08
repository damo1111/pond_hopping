// Airline tail liveries actually seen in this trip's flight data, matched by
// airline name. Each entry gives the tail's base colour and which emblem
// TailFin should draw on top — a hand-drawn nod to that airline's real
// tail art (kangaroo, brushwing, kite, etc), not a traced/embedded logo file.
const AIRLINES = [
  { test: /qantas/i, color: '#E30513', emblem: 'qantas' },
  { test: /cathay/i, color: '#F5F2EB', emblem: 'cathay' },
  { test: /malaysia airlines/i, color: '#FFFFFF', emblem: 'malaysia' },
  { test: /british airways/i, color: '#F5F2EB', emblem: 'british-airways' },
  { test: /srilankan|sri ?lankan/i, color: '#FFFFFF', emblem: 'srilankan' },
  { test: /airasia/i, color: '#FF0000', emblem: 'airasia' },
  { test: /all nippon|\bana\b/i, color: '#13448F', emblem: 'ana' },
  { test: /jetstar/i, color: '#FF6600', emblem: 'jetstar' },
  { test: /shanghai airlines/i, color: '#154889', emblem: 'shanghai' },
  { test: /virgin/i, color: '#DD1E3A', emblem: 'virgin' },
  { test: /china eastern/i, color: '#7B2029', emblem: 'china-eastern' },
]

export function tailLivery(airline) {
  if (!airline) return { color: '#A8842C', emblem: 'default' }
  const hit = AIRLINES.find((a) => a.test.test(airline))
  return hit ? { color: hit.color, emblem: hit.emblem } : { color: '#A8842C', emblem: 'default' }
}

// Kept for any callers that just want a colour swatch.
export function tailColor(airline) {
  return tailLivery(airline).color
}
