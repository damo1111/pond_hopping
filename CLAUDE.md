# POND HOPPING — Travel Logs

A travel log web app for David + husband — starting with the mini gap year (six trips, March–July 2026), built to hold all future travel. Warm-paper editorial in aesthetic (the tones of the CΛNΛRD duck artwork — David explicitly rejected the earlier dark look), duck-branded, PWA-installable, shareable with friends. Think a private travel magazine with live data and maps — geek-grade on the flight data, clean and cool everywhere else.

## Tech stack

- React + Vite
- Supabase (Postgres): `https://qslksdgxoibzrisywvqk.supabase.co` (project `cvnvrd`, ap-southeast-2)
- Leaflet + react-leaflet (maps — Carto voyager light tiles, no API key)
- Planespotters.net API (aircraft photos — free, no key, by registration)
- Open Exchange Rates via `open.er-api.com` (currency — free, no key)
- vite-plugin-pwa (PWA install)

## Design system — use these exactly, no Tailwind

Defined in `src/styles/globals.css`:

```css
--bg:         #F5F2EB   /* warm paper — the tone the duck was drawn on */
--surface:    #FFFFFF
--surface-2:  #EDE9DF
--border:     #E4DED1
--accent:     #A8842C   /* CΛNΛRD gold — primary brand colour */
--accent-dim: #D3BC77
--accent-bg:  rgba(168,132,44,0.10)
--text:       #1A1611
--text-muted: #8B8375
--green:      #3E7D54
--red:        #C0392B
--shadow:     0 1px 2px rgba(26,22,17,.03), 0 12px 28px -18px rgba(26,22,17,.18)
--font-display: 'Raleway', sans-serif
--font-mono:    'Space Mono', monospace
```

**LIGHT theme is a hard decision** — David hated the dark look. Maps use Carto **voyager** tiles (light), route arcs in CΛNΛRD gold.

Typography: Raleway for headings and body (weight 300 for large text), Space Mono for all data, labels, codes, numbers, pills and metadata. Both imported from Google Fonts in `index.html`.

## Current state

- **Session 1 (app shell) is DONE**: boot screen (beret-duck mark), tab bar, `trip_meta` fetch, `selectedTrip` state in `TripContext`, design tokens, PWA manifest + duck icons.
- **Database is live and populated with REAL data**:
  - `supabase/schema.sql` applied as migration `cvnvrd_initial_schema` (+ `trip_meta_security_invoker`).
  - `supabase/seed.sql` — 6 trips, aircraft types, 33 KR/HK phrases, 9 China/Japan GPS runs (from asia_runs).
  - `supabase/seed_flights.sql` — **28 flights** (from ByAir MCP) across 5 trips with real flight numbers, airports, times, distances, and **6 aircraft registrations** (unlock Planespotters photos); **5 Korea/HK/Sydney GPS runs** (from Samsung Health GPX). Also sets real trip date ranges.
  - `supabase/seed_china_japan_diary.sql` — the **16-day China+Japan journal** (from the Notion trip diary — the CΛNΛRD sourcing story), the Google Photos album URL on `trips.photos_url`, and **9 hotel stays as `map_pins`**.
  - `supabase/seed_timeline_journals.sql` — **Sri Lanka (3 days) + Bangkok (8 days) journals**, reconstructed from the first Timeline export (5 Mar–6 Jun; +11:00 display offset).
  - `supabase/seed_nz_korea_journals.sql` — **NZ (6 days) + Korea/HK (9 days) journals** from the FULL on-device Timeline export (Timeline.json, 5 Mar–8 Jul 2026, 3,646 segments; +10:00 display offset → convert to destination local). On-device Timeline starts 5 Mar 2026 — no pre-gap-year history exists in Google's data (older trips would come from ByAir's 917-flight archive instead).
- Data by trip: sri-lanka-voyage 3 flights + 3 journal days · china-japan 6 flights + 9 runs + 16 journal days + 9 hotels + photos album + 15 costs · new-zealand 8 flights + 6 journal days · bangkok 6 flights + 8 journal days · south-korea 5 flights + 5 runs + 9 journal days · singapore-malaysia 6 flights + 7 journal days. **ALL SIX TRIPS COMPLETE — 34 flights, 49 journal days.**
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
| `sri-lanka-voyage` | The Voyage — Sri Lanka → Melbourne | 21–23 Mar 2026 |
| `china-japan` | China + Japan — GZ → SHA → BJ → Tokyo | 21 May – 5 Jun 2026 |
| `new-zealand` | NZ Tier Run | Two status runs a week apart: 15–17 + 22–24 Jun 2026, identical MEL→SYD→WLG routing (8 flights total, confirmed by David) |
| `bangkok` | Bangkok | 3–10 Apr 2026 (incl. Krabi) |
| `singapore-malaysia` | Singapore + Malaysia | 22–28 Apr 2026 · BA16/BA15 via SYD + MH to KL (GPS-resolved; the 15 Apr ByAir records were the original booking, moved a week) |
| `south-korea` | HK + South Korea | 30 Jun – 8 Jul 2026 |

**All six trips complete**: 34 flights, 49 journal days, 14 runs, 9 hotels, 15 costs. `supabase/seed_singapore_malaysia.sql` holds the final trip's flights.

## Later additions (post-v1)

- **Landing = World map + trip selector overlay** (David, 8 Jul): the Trips tab is GONE from the bottom nav (9 tabs). Trip selection lives on the World landing as a horizontal strip of floating cards over the map (`.world-trips` / `.wt-card` in WorldTab). Selecting remounts the map → refits + replays the route animation for that trip. The global filter-bar still shows the active selection on every tab.
- **Day-detail maps in the Journal** (David, 8 Jul — "tap into a story and see it on a map"): new `day_tracks` table (trip_id, track_date, path jsonb, visits jsonb) holding per-day GPS traces + timed stops ETL'd from the on-device Timeline export (49 days, all six trips; times destination-local). `src/components/DayMap.jsx` renders inside an expanded journal entry: ink day-trace polyline, gold visit dots (popup: time window + duration), that day's runs overlaid in their colours, and a stops strip. ETL script pattern lives in repo history; re-run against future Timeline exports for new trips.
- **Stop-by-stop journal text** (David, 8 Jul): every one of the 49 `journal_entries.note` fields now ends with a literal "Stop by stop — HH:MM Place (duration) → …" line built from that day's `day_tracks.visits`, with place names hand-mapped from lat/lon per trip (no reverse-geocoding — mapped from context in the existing narrative). Plain-text append, one blank line before it; `.je-note` already has `white-space: pre-wrap` so it renders as a second paragraph. Regeneration script (lat/lon → place dict, per trip) lives in chat/session history, not committed to the repo.
- **Real Google Photos cover images, in-app** (David, 8 Jul): all six trips now have a `trips.photos_url` (share link, one per trip — see chat history). A new Supabase Edge Function `scrape-album` (deployed, not in repo source tree — pull via `supabase functions download scrape-album` if editing) fetches a share URL server-side and regexes the page HTML for `lh3.googleusercontent.com/pw/...` image IDs, upserting into a new `photo_cache` table (`trip_id` PK, `urls` jsonb, `status`, `error`, `updated_at`). **Important limitation**: Google's share page only server-renders ONE image (the album's cover/og:image) — the rest of the gallery loads client-side via an internal API a plain fetch can't reach, so `urls` is reliably length-1, not a full gallery. `WorldTab`'s `.wt-card` and `PhotosTab`'s `.album-card` both read `photo_cache` and render that cover image (`${url}=w###-h###-c` Google dynamic-resize suffix) instead of a bare text link. Re-run the function (POST `{trip_id, share_url}` to `.../functions/v1/scrape-album`) if a share link changes or the regex needs adjusting. A true full-gallery embed would need a headless-browser scrape (heavier, fragile) — not attempted. **David reported the cover not rendering in production (9 Jul)** — data/deploy both verified fine (photo_cache all status 'ok', trip_meta.id matches trips.id, latest commit is live); root cause not yet confirmed, suspect the raw `lh3.googleusercontent.com/pw/...` hotlink may need verification in a real browser (devtools Network tab) since the sandbox can't reach that domain to test directly. Follow up if it's still broken.
- **Pending idea, not yet built**: individual-photo share links (one per photo, not per album) instead of one album link — if Google statically renders a single photo's share page the same way it renders the album cover, this would let a batch of links populate the existing `photos` table (already built for this — one row per photo, real grid in PhotosTab) via an extended version of `scrape-album` that resolves many URLs concurrently. Unverified until David sends 5-10 individual photo links to test the assumption.
- **Nav restructure v2** (David, 9 Jul): bottom nav cut from 9 to 6 tabs — Home (renamed from World, same 🌏/component), Flights, Journal, Map, Photos, Useful. "Useful" (🧰) opens a secondary pill sub-nav (`.subnav`/`.subnavitem` in App.jsx/globals.css) for Costs/Currency/Phrases/Share, state `usefulTab` in App.jsx. Trip order is now reverse-chronological (most recent first): Korea, NZ, China+Japan, Singapore+Malaysia, Thailand (renamed from Bangkok — the trip included Krabi too), Voyage — driven by `trips.sort_order` (1-6). Header padding tightened (`.app-header`, `.header-duck`, `.install-chip`) per David's screenshot feedback — the duck badge and install chip felt oversized/loosely padded.
- **Costs backfilled from Pocketsmith** (9 Jul): all six trips now have real cost data pulled from David's Pocketsmith labels (one label per trip — see his message history for the mapping). Note the Bangkok/Thailand data: transactions carrying a "DS -" prefixed category are David's husband's half of a shared/split expense, NOT duplicates — both sides are summed into the real total. The NZ trip had 6 unrelated Qantas charges from Sept 2025 under the same label (wrong year, excluded). Pocketsmith→AUD conversion used a flat 1.9233 GBP→AUD rate matching the existing China-Japan cost rows.
- **Private notes — approved, building next** (David, 9 Jul): separate `private_notes` table (not a column on `journal_entries`), keyed by trip/date, that `ShareView` never queries — structurally can't leak into a share link. Textarea in JournalTab (typed or phone-dictated). AI summarization via a small Edge Function calling an LLM API — needs an API key stored as a Supabase secret.
- **Flights: board-style row + inline gap-filling** (David, 9 Jul, from a departures-board photo reference): `FlightCard`'s collapsed row is now a dark charcoal "board" strip (`.flight-head.board`) with a small aircraft thumbnail, amber tabular-nums time, route, flight number — a scoped nod to the reference image, not a theme-wide reversion to dark (rest of the app stays light paper). Aircraft photo now fetches on mount (not gated by expand) so the thumbnail shows immediately. Any blank flight field (registration, airline, cabin, seat, config) is now inline-editable — click "+ add", type, saves straight to `flights` via Supabase from the FE, no more needing an SQL edit for a gap. Same pattern for the "Add registration to load aircraft photo" placeholder — it's now a real input.
- **Known bug, not yet fixed**: `fmtDate()` in FlightCard/ShareView converts the flight's ISO timestamp through `new Date().toLocaleDateString()`, which reinterprets in the *viewer's* browser timezone rather than the flight's own — can show the wrong calendar date if viewer and flight timezones disagree (spotted during testing, pre-existing, not caused by the 9 Jul changes).
- **Phrases tab fixed** (9 Jul): both reported issues resolved. (a) Coverage — added Mandarin, Japanese, Thai, Malay, Sinhala, and a small Māori set (widened the `phrases_country_check` constraint to allow the new codes: TH/CN/JP/MY/LK/NZ). (b) Trip-awareness — `PhrasesTab` now reads `TripContext.selectedTrip`, maps it through a `TRIP_LANGS` table (e.g. `south-korea → [KR, HK]`, `china-japan → [CN, JP]`), auto-jumps to that trip's language(s), and hides irrelevant toggles while a trip is filtered. Previously this tab ignored `selectedTrip` entirely.

## UX debt — RESOLVED

- ~~Cross-tab trip filter doesn't flow right~~ → fixed: a global `.filter-bar` pill renders under the header on EVERY tab whenever `selectedTrip` is set — "{flags} {title} · FILTERING ALL TABS · ✕" — one tap clears. Trip cards also show their own gold-border + note state.

## Remaining build order — each tab is a session

### 2. Flights tab (hero feature) — ✅ DONE
`src/tabs/FlightsTab.jsx` + `src/components/FlightCard.jsx`. Fetches flights joined with `aircraft_types`, groups by trip (ordered via `tripMeta`, filtered by `selectedTrip`). FlightCard: collapsed route summary; on expand lazily fetches the Planespotters photo (`src/lib/planespotters.js`, cached), draws the animated gold great-circle arc on a light (voyager) Leaflet mini-map, and shows the cabin/seat/config/times/duration grid + FR24 link. Graceful states for missing registration / no photo. Leaflet CSS imported in `main.jsx`; `MapContainer` needs an initial `center`+`zoom` (learned the hard way — omitting it throws a Leaflet projection error).

### 3. World tab (the wow screen) — ✅ DONE
`src/tabs/WorldTab.jsx`. Full-bleed light (voyager) Leaflet map (`.tab-panel.full` removes panel padding). Routes deduped by dep-arr segment (repeat sectors like MEL-SYD share one line whose popup lists every flight on it), animated in departure order via a rAF sequence hook (~420ms draw + 110ms pause each). Gold dashed great circles, white airport dots with city popups, floating "mission briefing" stats card (flights · km · airports). Respects `selectedTrip`.

### 4. Trips tab — ✅ DONE
`src/tabs/TripsTab.jsx` (replaced the Session-1 TripsShell stub). Card grid (2-col ≥640px): flags, title, subtitle, date range, stat pills (✈ flights · 🏃 runs · 📔 journal days · A$ spend when >0), optional cover photo. Tap toggles `selectedTrip`; active card shows a gold border + "filtering other tabs · tap to clear" note (first stab at the filter-visibility UX debt).

### 5. Journal tab — ✅ DONE
`src/tabs/JournalTab.jsx`. Entries grouped by trip (flat when filtered), each row: mood emoji, DAY n, date, city, title, 2-line clamped note → tap to expand full note + tags. "+ new entry" opens the add form (trip select, date, city, title, note, 12-emoji mood picker, comma tags); day_number auto-computed from the trip start date; inserts to Supabase and reloads.

### 6. Map tab — ✅ DONE
`src/tabs/MapTab.jsx`. Full-bleed voyager map (shares `.world-wrap`/`.tab-panel.full`). Filter chips: All · Hotels · Runs · Highlights. GPS run polylines in their stored colours with green start dots + distance/pace popups; pins coloured by kind (hotel gold, run green, highlight red, place muted); faint dashed ink journey line through journal entries in date order (All view). Map remounts on filter/trip change to refit bounds (react-leaflet only applies `bounds` at mount).

### 7. Costs tab — ✅ DONE
`src/tabs/CostsTab.jsx`. Running AUD total card, CSS category bar chart, per-trip totals, itemised list showing AUD + original currency. Add-cost form (trip, date, description, amount, currency, category, city) converts to AUD at static rates on entry. `supabase/seed_costs.sql` seeds the 15 documented China+Japan items from the Notion cost tracker (A$4,852 — inside the A$3.5–5k estimate).

### 8. Photos tab — ✅ DONE
`src/tabs/PhotosTab.jsx`. Per-trip "Open album →" cards from `trips.photos_url` (china-japan has one), photo-URL grid (2-col mobile / 3-col ≥640px) with ⭐ highlight badge and fullscreen lightbox (caption/city/date), add-photo form (trip, date, URL, caption, city, reel/highlight toggles). Respects `selectedTrip`.

### 9. Currency tab — ✅ DONE
`src/tabs/CurrencyTab.jsx`. Amount + base-currency converter across AUD/KRW/HKD/JPY/CNY/USD/GBP (tap a cell to rebase); live rates from `open.er-api.com/v6/latest/AUD` with silent static fallback ("live rates" / "static rates · offline" footer). Seoul + HK price benchmark cards with ≈AUD conversions computed off current rates.

### 10. Phrases tab — ✅ DONE
`src/tabs/PhrasesTab.jsx`. 🇰🇷/🇭🇰 country toggle, search (english + romanized), category chips, tap row → copies local script to clipboard with a "copied ✓" flash. Data from the seeded `phrases` table (33 rows).

### 11. Share tab — ✅ DONE
`src/tabs/ShareTab.jsx` (link minting: trip select, Diary/Itinerary/Map/Costs toggles — Costs off by default, copy + preview) and `src/ShareView.jsx` (the public page). `?share=<slug>&show=journal,flights,map` short-circuits App before the normal shell renders: duck header, trip hero, map with gold flight arcs + run tracks + pins, itinerary rows, full diary, optional costs total. Read-only, no nav, "made with pond hopping 🦆" footer.

## ALL 10 TABS BUILT. Next up: the nav-flow rework (see Open UX debt), NZ + Korea journals (need a post-6-Jun Timeline export), Singapore/Malaysia trip data.

## Key decisions — don't second-guess these

- **Navigation is the app-family bottom nav** (blueprint §3): fixed bottom bar, emoji icons greyscale→colour on active, restyled warm-paper + gold. This supersedes the brief's original top tab-bar idea (David's call). Tabs + emojis are defined in `src/App.jsx` `TABS`.
- **Logo is the real CΛNΛRD artwork** — `public/duck.png` (gold glitter beret, transparent, auto-cropped from David's file). PWA icons (`icon-192/512.png`) are the duck on a beige rounded badge. No more placeholder vector.
- **PWA hardened per blueprint** — iOS standalone meta tags, manifest `start_url=/?source=pwa`, `vercel.json` headers. `InstallChip` component (`src/components/`) gives the install prompt + iOS add-to-home-screen sheet.
- **Push notifications: skipped** (David's call) — keeps the Supabase-only/no-serverless rule intact. The install chip is the useful PWA bit; push can be added later via a Supabase Edge Function if wanted.
- **No Tailwind.** CSS variables only, in `src/styles/globals.css`.
- **No file uploads.** Photos are URLs. No S3, no Supabase storage.
- **Leaflet not Mapbox.** Carto voyager light tiles, no API key.
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
