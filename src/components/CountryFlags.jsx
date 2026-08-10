import { emojiFlagToIso } from '../lib/flags.js'

// Renders a trip's country flags as real flag SVGs instead of raw emoji —
// emoji flags render inconsistently across devices (some Android builds
// show a broken glyph, especially for constituent-country flags like
// Scotland which have no standard emoji at all), and multiple flags side
// by side had no real alignment/sizing control. Two or more flags overlap
// slightly as a rounded badge stack instead of floating separately.
//
// SVGs are self-hosted in public/flags/ (copied from the flag-icons npm
// package's 1x1 set, just the handful of countries actually used here —
// importing the full flag-icons CSS pulled in background-image
// references for all ~250 countries, which vite-plugin-pwa's precache
// then swept up as real assets and ballooned the PWA bundle by ~400KB).
// Add a new country by copying its 1x1 SVG in as `<code>.svg`.
export default function CountryFlags({ countries, size = 18, unknown = false }) {
  const codes = (countries || []).map(emojiFlagToIso).filter(Boolean)
  // A trip started from a photograph, or from "I'm off now", has no
  // countries on it until somebody says where. Rendering nothing collapsed
  // the row, which pushed that card's title and dates a line higher than
  // its neighbours' — so `unknown` holds the space and says what it means,
  // with the same globe the Plan tab already shows for a trip that has no
  // cover and nowhere on it yet.
  if (!codes.length) {
    if (!unknown) return null
    return (
      <span className="country-flags" style={{ '--cf-size': `${size}px` }}>
        <span className="cf-flag cf-flag--unknown" role="img" aria-label="Somewhere — not said yet">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.4" />
            <ellipse cx="12" cy="12" rx="3.4" ry="8.4" />
            <path d="M3.6 12h16.8M5.2 7.4h13.6M5.2 16.6h13.6" />
          </svg>
        </span>
      </span>
    )
  }
  return (
    <span className="country-flags" style={{ '--cf-size': `${size}px` }}>
      {codes.map((code, i) => (
        <span
          key={`${code}-${i}`}
          className="cf-flag"
          style={{ backgroundImage: `url(/flags/${code}.svg)`, zIndex: codes.length - i }}
        />
      ))}
    </span>
  )
}
