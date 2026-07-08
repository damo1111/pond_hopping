import { tailColor } from '../lib/airlineTails.js'

// A stylised, consistently-oriented tail fin — same shape every time,
// just tinted by the airline's brand colour. Never the real logo/livery art.
export default function TailFin({ airline, size = 18 }) {
  const color = tailColor(airline)
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" className="tail-fin" aria-hidden="true">
      <path d="M4 20 L9 2 L18 2 L13 20 Z" fill={color} />
      <path d="M4 20 L9 2 L12 2 L7 20 Z" fill="#ffffff" opacity="0.22" />
    </svg>
  )
}
