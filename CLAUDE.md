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

- **Session 1 (app shell) is DONE**: boot screen, tab bar, `trip_meta` fetch, `selectedTrip` state in `TripContext`, design tokens, PWA manifest + icons.
- **Database is live**: `supabase/schema.sql` applied as migration `cvnvrd_initial_schema`; `supabase/seed.sql` applied (6 trips, 11 aircraft types, 33 KR/HK phrases, 9 GPS runs from the old asia_runs app).
- `src/lib/geo.js` has `greatCircle()` and `distanceKm()` — import wherever maps need flight paths.
- `src/lib/supabase.js` exports the shared client (env vars in `.env`).
- Tabs other than Trips render a styled placeholder (`src/tabs/Placeholder.jsx`).

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

### 2. Flights tab (hero feature)
Fetch all flights joined with `aircraft_types`. Group by trip (trip title as section header). Build a `FlightCard` component: aircraft photo fetched lazily on expand from `https://api.planespotters.net/pub/photos/reg/{REGISTRATION}`, animated great-circle path on a Leaflet map, cabin/seat/config details, FR24 link. If no registration: "Add registration to load aircraft photo."

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

- **No Tailwind.** CSS variables only, in `src/styles/globals.css`.
- **No file uploads.** Photos are URLs. No S3, no Supabase storage.
- **Leaflet not Mapbox.** Dark CartoDB tiles, no API key.
- **FlightCard fetches its own photo**, lazily on expand. Don't centralise the Planespotters fetch.
- **Great circle paths computed client-side** — `src/lib/geo.js`.
- **Supabase is the only backend.** No Express, no serverless functions. All reads/writes direct from the client using the anon key (RLS is permissive by design — single-user personal app).
- **PWA out of the box.** `vite-plugin-pwa` generates manifest + service worker — don't write them manually.

## Data still needed (paste as SQL inserts into Supabase — no code changes)

- All flights (FR24 export CSV → inserts), with aircraft registrations
- Sri Lanka voyage details
- NZ, Bangkok, SG/Malaysia trip dates and key data
- Seoul trip flights/hotels
- `trips.cover_photo_url` and `trips.photos_url` values

## Running the app

```bash
npm install
cp .env.example .env
npm run dev
```
