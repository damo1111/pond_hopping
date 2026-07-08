import { tailLivery } from '../lib/airlineTails.js'

// Same tail silhouette, same orientation, every time — only the livery
// (base colour + emblem) changes per airline. Hand-drawn nods to each
// airline's real tail art (kangaroo, brushwing, kite, ribbon, peacock...),
// not traced/embedded logo files.
const TAIL_PATH = 'M4 31 L11 2 L17 2 L15 31 Z'

export default function TailFin({ airline, size = 18 }) {
  const { color, emblem } = tailLivery(airline)
  const clipId = `tailclip-${size}`
  // White/cream real-world liveries render as an outline only, so the fin
  // reads against dark thumbnails instead of showing a filled box.
  const isPaleLivery = color === '#FFFFFF' || color === '#F5F2EB'

  return (
    <svg width={size} height={(size * 32) / 22} viewBox="0 0 22 32" className="tail-fin" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={TAIL_PATH} />
        </clipPath>
      </defs>
      <path
        d={TAIL_PATH}
        fill={isPaleLivery ? 'none' : color}
        stroke={isPaleLivery ? 'rgba(245, 242, 235, 0.55)' : 'none'}
        strokeWidth="1"
      />
      <g clipPath={`url(#${clipId})`}>
        <Emblem emblem={emblem} />
      </g>
    </svg>
  )
}

function Emblem({ emblem }) {
  switch (emblem) {
    case 'qantas':
      // Leaping kangaroo silhouette
      return (
        <g fill="#fff">
          <circle cx="13.5" cy="8.5" r="1.7" />
          <path d="M14.5 6.8 L16 5 L15.3 7.6 Z" />
          <ellipse cx="12" cy="15" rx="3.3" ry="5.4" transform="rotate(-18 12 15)" />
          <path d="M9 19 Q6 21 4.5 26 Q7 24 9.5 21 Z" />
          <path d="M10.5 20 Q8.5 24 6 27.5 Q9 26 11.5 22 Z" />
          <path d="M14 11 Q17 12 18.5 16 Q16 15.5 13.5 13.5 Z" />
        </g>
      )
    case 'cathay':
      return (
        <g>
          <path d="M4 20 Q10 10 18 14 Q11 16 6 22 Z" fill="#00543C" />
          <path d="M5 15 Q10 8 17 11 Q11 13 7 17 Z" fill="#6FA88F" opacity="0.85" />
        </g>
      )
    case 'malaysia':
      return (
        <g>
          <path d="M11 6 Q17 11 11 16 Q7 11 11 6 Z" fill="#D2001C" />
          <path d="M11 16 Q17 21 11 27 Q7 21 11 16 Z" fill="#0F3B8C" />
        </g>
      )
    case 'british-airways':
      return (
        <g>
          <path d="M4 12 L8 10 L15 27 L11 29 Z" fill="#C8102E" />
          <path d="M8 9 L11 7.5 L18 24.5 L15 26 Z" fill="#075AAA" />
        </g>
      )
    case 'srilankan':
      return (
        <g transform="translate(11 17)">
          <ellipse cx="0" cy="0" rx="1.6" ry="5.2" transform="rotate(-24)" fill="#7B2029" />
          <ellipse cx="0" cy="0" rx="1.6" ry="5.6" fill="#F5821F" />
          <ellipse cx="0" cy="0" rx="1.6" ry="5.2" transform="rotate(24)" fill="#C9A227" />
        </g>
      )
    case 'airasia':
      return (
        <polygon
          fill="#fff"
          points="12,7 13.5,11.2 18,11.2 14.5,13.8 15.8,18.3 12,15.5 8.2,18.3 9.5,13.8 6,11.2 10.5,11.2"
        />
      )
    case 'jetstar':
      return (
        <polygon
          fill="#fff"
          points="12,9 13,12.3 16.5,12.3 13.7,14.3 14.7,17.6 12,15.6 9.3,17.6 10.3,14.3 7.5,12.3 11,12.3"
        />
      )
    case 'ana':
      return (
        <g>
          <circle cx="11.5" cy="16" r="5" fill="#fff" />
          <circle cx="14" cy="15" r="4.3" fill="#13448F" />
        </g>
      )
    case 'shanghai':
      return <path d="M4 15 Q11 10 11 15 Q11 10 18 15 Q11 19 4 15 Z" fill="#fff" />
    case 'virgin':
      return <path d="M5 24 Q7 12 12 8 Q10 15 17 10 Q13 18 6 27 Z" fill="#fff" opacity="0.9" />
    case 'china-eastern':
      return <path d="M4 16 Q11 9 18 16 Q13 15 11 20 Q9 15 4 16 Z" fill="#fff" />
    default:
      return <path d="M4 20 L9 2 L18 2 L13 20 Z" fill="#ffffff" opacity="0.16" />
  }
}
