// One line-icon set, drawn on the same 24px grid at the same 1.5 stroke, in
// currentColor.
//
// These replace emoji. Emoji were never an icon set — every platform ships
// its own artwork, so the silhouettes, weights and colours all disagreed
// with each other, and desaturating full-colour art with a CSS greyscale
// filter (which is what the nav did) makes it muddy rather than neutral.
// Nothing dates an interface faster.

const PATHS = {
  // A globe, not a planet: meridian and equator, so it reads at 20px.
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  // A paper plane rather than an airliner silhouette: fewer strokes, so it
  // survives being drawn at 22px next to a word.
  plane: (
    <>
      <path d="M21 3 2.5 10.2l7.2 2.6 2.6 7.2L21 3Z" />
      <path d="m9.7 12.8 5.1-5.1" />
    </>
  ),
  kit: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
      <path d="M5 17.5h14" />
      <path d="M9 7.5h6" />
    </>
  ),
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m3.5 17 4.5-4.5 3.5 3.5L15 12l5.5 5.5" />
    </>
  ),
  map: (
    <>
      <path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-2.5-1.3c-1.4 0-2.5.8-2.5 2s1.1 1.8 2.5 1.8 2.5.6 2.5 1.8-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.3" />
    </>
  ),
  exchange: (
    <>
      <path d="M4 8.5h13l-3-3M20 15.5H7l3 3" />
    </>
  ),
  speech: <path d="M20 5.5v8a2 2 0 0 1-2 2h-6.5L7 19.5V15.5H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17.5" cy="6" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="m8.3 10.8 6.9-3.6M8.3 13.2l6.9 3.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
}

export default function Icon({ name, size = 22, className = '' }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {d}
    </svg>
  )
}
