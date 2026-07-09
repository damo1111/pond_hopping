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
export default function CountryFlags({ countries, size = 18 }) {
  const codes = (countries || []).map(emojiFlagToIso).filter(Boolean)
  if (!codes.length) return null
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
