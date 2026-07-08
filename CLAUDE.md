# POND HOPPING — Travel Logs

A travel log web app for David + husband — starting with the mini gap year (six trips, March–July 2026), built to hold all future travel. Dark and editorial in aesthetic, duck-branded (the beret duck logo, a nod to the China/Japan research trips), PWA-installable, shareable with friends. Think a private travel magazine with live data and maps — geek-grade on the flight data, clean and cool everywhere else.

## Tech stack

- React + Vite
- Supabase (Postgres): `https://qslksdgxoibzrisywvqk.supabase.co` (project `cvnvrd`, ap-southeast-2)
- Leaflet + react-leaflet (maps — dark CartoDB tiles, no API key)
- Planespotters.net API (aircraft photos — free, no key, by registration)
- Open Exchange Rates via `open.er-api.com` (currency — free, no key)
- vite-plugin-pwa (PWA install)

## Design system — use these exactly, no Tailwind

Defined in `src/styles/globals.css`:

```css
--bg:         #0A0A0A
--surface:    #141414
--surface-2:  #1A1A1A
--border:     #1E1E1E
--accent:     #C8A09A   /* dusty rose — primary brand colour */
--accent-dim: #8B6560
--accent-bg:  rgba(200,160,154,0.08)
--text:       #F5F5F5
--text-muted: #666666
--green:      #5EAA7A
--red:        #E05555
--font-display: 'Raleway', sans-serif
--font-mono:    'Space Mono', monospace
```

Typography: Raleway for headings and body (weight 300 for large text), Space Mono for all data, labels, codes, numbers, pills and metadata. Both imported from Google Fonts in `index.html`.

## Current state

- **Session 1 (app shell) is DONE**: boot screen (beret-duck mark), tab bar, `trip_meta` fetch, `selectedTrip` state in `TripContext`, design tokens, PWA manifest + duck icons.
- **Database is live and populated with REAL data**:
  - `supabase/schema.sql` applied as migration `cvnvrd_initial_schema` (+ `trip_meta_security_invoker`).
  - `supabase/seed.sql` — 6 trips, aircraft types, 33 KR/HK phrases, 9 China/Japan GPS runs (from asia_runs).
  - `supabase/seed_flights.sql` — **28 flights** (from ByAir MCP) across 5 trips with real flight numbers, airports, times, distances, and **6 aircraft registrations** (unlock Planespotters photos); **5 Korea/HK/Sydney GPS runs** (from Samsung Health GPX). Also sets real trip date ranges.
  - `supabase/seed_china_japan_diary.sql` — the **16-day China+Japan journal** (from the Notion trip diary — the CΛNΛRD sourcing story), the Google Photos album URL on `trips.photos_url`, and **9 hotel stays as `map_pins`**.
- Data by trip: sri-lanka-voyage 3 flights · china-japan 6 flights + 9 runs + 16 journal entries + 9 hotels + photos album · new-zealand 8 flights · bangkok 6 flights · south-korea 5 flights + 5 runs · singapore-malaysia empty (see below).
- **Brand note**: the fashion brand born on this trip is **CΛNΛRD** (canard = duck = the beret-duck logo). The China/Japan trip was its sourcing leg — that's the nod behind the whole app's duck branding.
- `src/lib/geo.js` has `greatCircle()` and `distanceKm()` — import wherever maps need flight paths.
- `src/lib/supabase.js` exports the shared client (baked-in publishable key + env override).
- Tabs other than Trips render a styled placeholder (`src/tabs/Placeholder.jsx`).

## Live data sources (MCP connectors)

- **ByAir** — flight history (917 flights on file). Tools `byair_list_trips`, `byair_get_flight_aircraft` (tail numbers), etc. The gap-year flights are already seeded; use it for future trips.
- **Strava** — runs with GPS streams. Alternative/cross-check to Samsung Health GPX. Names like "Tokyo Rift 🗼", "Wellington 🏃", "Seoul 🇰🇷".
- **Google Drive** — Samsung Health GPX exports + Google Timeline `.gz` (semantic day-by-day story, still to be parsed into `journal_entries`).

## The six trips (already in DB)

| Slug | Trip | Dates |
|------|------|-------|
| `sri-lanka-voyage` | The Voyage — Sri Lanka → Melbourne | Mar 2026 |
| `china-japan` | China + Japan — GZ → SHA → BJ → Tokyo | 21 May – 5 Jun 2026 |
| `new-zealand` | NZ Tier Run | 2026 TBC |
| `bangkok` | Bangkok | 2026 TBC |
| `singapore-malaysia` | Singapore + Malaysia | 2026 TBC |
| `south-korea` | HK + South Korea | Jun–Jul 2026 |

Flights are NOT seeded yet — they arrive as SQL inserts (FR24 export + registrations). Build UI first, data comes later.

## Remaining build order — each tab is a session

### 2. Flights tab (hero feature) — ✅ DONE
`src/tabs/FlightsTab.jsx` + `src/components/FlightCard.jsx`. Fetches flights joined with `aircraft_types`, groups by trip (ordered via `tripMeta`, filtered by `selectedTrip`). FlightCard: collapsed route summary; on expand lazily fetches the Planespotters photo (`src/lib/planespotters.js`, cached), draws the animated great-circle arc on a dark Leaflet mini-map, and shows the cabin/seat/config/times/duration grid + FR24 link. Graceful states for missing registration / no photo. Leaflet CSS imported in `main.jsx`; `MapContainer` needs an initial `center`+`zoom` (learned the hard way — omitting it throws a Leaflet projection error).

### 3. World tab (the wow screen)
Full-bleed dark Leaflet map. Animate all great-circle flight routes in sequence — draw each route one after another with a short pause. Rose dashed lines, circle markers at airports. Tap route/marker → popup with flight number, route, date. Opening screen — make it feel like a mission briefing.

### 4. Trips tab
Card grid, one card per trip: title, dates, countries (flag emojis), cover photo if set, flight count, total spend AUD. Tapping a trip sets `selectedTrip` (already in TripContext) — Journal, Map and Costs filter to it.

### 5. Journal tab
Entries grouped by trip (flat if filtered). Each: day number, city, title, mood emoji, note preview; tap to expand. Add-entry form at top — date, city, title, note, mood picker, tags. Store to Supabase.

### 6. Map tab
Dark Leaflet map. `map_pins` for selected trip (or all). Toggle: all pins · hotels · runs · highlights. `runs` table has full GPS polylines (draw with their stored `color`, green markers). Journey polyline connecting journal entry coordinates in date order.

### 7. Costs tab
Total spend per trip by category (Food / Transport / Shopping / Hotel / Activity / Flight / Other). Running total in AUD. Add-cost form: description, amount, currency (AUD/KRW/HKD/JPY/CNY/USD/GBP), category, city. Auto-convert to AUD using static FX rates (live fetch is a bonus). CSS bar chart per category — no chart library.

### 8. Photos tab
Photos are URLs in the `photos` table. Grid — 3 cols desktop, 2 mobile. Thumbnail, caption, city, date; tap for lightbox. Filter by trip. Add-photo form: URL, caption, city, date, is_reel / is_highlight toggles. Google Photos: `trips.photos_url` renders an "Open album →" link — never embed.

### 9. Currency tab
AUD, KRW, HKD, JPY, CNY, USD, GBP. Try live fetch from `open.er-api.com/v6/latest/AUD` — fall back to static rates silently. Quick reference card with Seoul and HK price benchmarks.

### 10. Phrases tab
Korean and Cantonese pre-loaded from Supabase (`phrases` table, seeded). Tap phrase → copy local script to clipboard. Search + category filter + country toggle.

### 11. Share tab
Generate `?share=<slug>` URL. Public read-only view when param present — no auth; trip diary, itinerary, map. Toggle visible sections. Costs hidden by default.

## Key decisions — don't second-guess these

- **Navigation is the app-family bottom nav** (blueprint §3): fixed bottom bar, emoji icons greyscale→colour on active, restyled dark + rose. This supersedes the brief's original top tab-bar idea (David's call). Tabs + emojis are defined in `src/App.jsx` `TABS`.
- **Logo is the real CΛNΛRD artwork** — `public/duck.png` (gold glitter beret, transparent, auto-cropped from David's file). PWA icons (`icon-192/512.png`) are the duck on a beige rounded badge. No more placeholder vector.
- **PWA hardened per blueprint** — iOS standalone meta tags, manifest `start_url=/?source=pwa`, `vercel.json` headers. `InstallChip` component (`src/components/`) gives the install prompt + iOS add-to-home-screen sheet.
- **Push notifications: skipped** (David's call) — keeps the Supabase-only/no-serverless rule intact. The install chip is the useful PWA bit; push can be added later via a Supabase Edge Function if wanted.
- **No Tailwind.** CSS variables only, in `src/styles/globals.css`.
- **No file uploads.** Photos are URLs. No S3, no Supabase storage.
- **Leaflet not Mapbox.** Dark CartoDB tiles, no API key.
- **FlightCard fetches its own photo**, lazily on expand. Don't centralise the Planespotters fetch.
- **Great circle paths computed client-side** — `src/lib/geo.js`.
- **Supabase is the only backend.** No Express, no serverless functions. All reads/writes direct from the client using the anon key (RLS is permissive by design — single-user personal app).
- **PWA out of the box.** `vite-plugin-pwa` generates manifest + service worker — don't write them manually.

## Data still needed

- **Journal entries** — parse the three Google Timeline `.gz` exports (in Drive folder "China · Japan · Australia Trip 2026 — Google Timeline") into `journal_entries` for the day-by-day story, enriched against runs.
- **Singapore/Malaysia trip** — ByAir shows overlapping/duplicate April records (SIN/KUL hops plus stray long-hauls); ambiguous, needs David to confirm which segments belong before seeding.
- **More aircraft registrations** — only 6 of 28 flights have tail numbers so far (the marquee long-hauls). `byair_get_flight_aircraft` per flight id fills the rest.
- **Photos** — `photos` rows and `trips.cover_photo_url` / `trips.photos_url` (Google Photos album links).

## Running the app

```bash
npm install
cp .env.example .env
npm run dev
```
