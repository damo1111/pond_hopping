// Real brand colours, but an original abstract fin shape (not the actual
// airline logos/livery art) — same orientation every time, colour only varies.
const AIRLINE_COLORS = [
  [/qantas/i, '#E30513'],
  [/cathay/i, '#00565E'],
  [/british airways/i, '#075AAA'],
  [/virgin/i, '#DD1E3A'],
  [/all nippon|\bana\b/i, '#13448F'],
  [/airasia/i, '#FF0000'],
  [/china eastern/i, '#7B2029'],
  [/malaysia airlines/i, '#D2001C'],
  [/jetstar/i, '#FF6600'],
  [/srilankan|sri ?lankan/i, '#F5821F'],
  [/jetstar/i, '#FF6600'],
]

export function tailColor(airline) {
  if (!airline) return '#A8842C'
  const hit = AIRLINE_COLORS.find(([re]) => re.test(airline))
  return hit ? hit[1] : '#A8842C'
}
