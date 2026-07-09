# POND HOPPING — Travel Logs

A travel log web app for David + husband — starting with the mini gap year (six trips, March–July 2026), built to hold all future travel. Warm-paper editorial in aesthetic (the tones of the CΛNΛRD duck artwork — David explicitly rejected the earlier dark look), duck-branded, PWA-installable, shareable with friends. Think a private travel magazine with live data and maps — geek-grade on the flight data, clean and cool everywhere else.

**Production URL**: https://pond.moritz.life (9 Jul — moved off the default `pond-hopping.vercel.app`; David's own domain `moritz.life`, GoDaddy-registered with Gmail Workspace mail on it, is becoming a shared umbrella domain for his apps, each getting its own subdomain — `pond` for this one. DNS: `A @ → 76.76.21.21` at GoDaddy plus a per-project `CNAME pond → c5702b4ff6345d11.vercel-dns-016.com.` — nameservers stayed third-party/GoDaddy throughout, deliberately, so existing Google Workspace MX/SPF/DKIM records were never touched. `pond-hopping.vercel.app` still works too.)

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
- **Private notes — built** (David, 9 Jul): `private_notes` table (trip_id, note_date, body, unique per trip+date) — `ShareView` never queries it, structurally can't leak into a share link. `src/components/PrivateNote.jsx` renders inside each expanded journal entry: locked/dashed-border section, disclaimer text, textarea, save button (upsert on trip_id+note_date). AI summarization NOT built yet — needs an LLM API key stored as a Supabase secret before a summarize Edge Function can be wired up.
- **Flights: board-style row + inline gap-filling** (David, 9 Jul, from a departures-board photo reference): `FlightCard`'s collapsed row is now a dark charcoal "board" strip (`.flight-head.board`) with a small aircraft thumbnail, amber tabular-nums time, route, flight number — a scoped nod to the reference image, not a theme-wide reversion to dark (rest of the app stays light paper). Aircraft photo now fetches on mount (not gated by expand) so the thumbnail shows immediately. Any blank flight field (registration, airline, cabin, seat, config) is now inline-editable — click "+ add", type, saves straight to `flights` via Supabase from the FE, no more needing an SQL edit for a gap. Same pattern for the "Add registration to load aircraft photo" placeholder — it's now a real input.
- **Split-flap flick animation on Flights** (David, 9 Jul, from a Solari-board reference photo): `src/components/FlapText.jsx` — each character cycles through 5-7 random same-type glyphs (digits stay digits, letters stay letters; punctuation/spaces/arrow never flip) with a quick `rotateX` flick (`.flap-char.spin`, `flap-tick` keyframe in globals.css) before landing on the real value. Wired into `FlightCard`'s time/route/flight-number with staggered `groupDelay`s (time → airports → flight no) so the whole row cascades left-to-right like a real board. Replays every time `FlightsTab` mounts (i.e. every time you switch to the Flights tab), since App.jsx unmounts inactive tabs.
- **Fixed: flight times were showing raw UTC, not local-to-airport** (David, 9 Jul): `flights.dep_time`/`arr_time` are stored as plain UTC in Postgres (always `+00`) — the old `fmtTime()` just sliced the ISO string assuming the offset was already local, so every flight showed its UTC time verbatim (e.g. QF448's real 13:30 Melbourne departure showed as 03:30). New `src/lib/airportTz.js`: an IATA-code → IANA-timezone map (`AIRPORT_TZ`, covers every airport currently in the data — add new codes here as new trips are added) + `localTime()`/`localDate()` using `Intl.DateTimeFormat` with an explicit `timeZone`, so display is correct regardless of the viewer's own browser timezone. Wired into `FlightCard` (dep_time local to `dep_airport`, arr_time local to `arr_airport`) and `ShareView`'s flight date line. Duration math (`durationMin`) was already correct — `Date` subtraction is timezone-agnostic — only the *display* was broken.
- **Phrases tab fixed** (9 Jul): both reported issues resolved. (a) Coverage — added Mandarin, Japanese, Thai, Malay, Sinhala, and a small Māori set (widened the `phrases_country_check` constraint to allow the new codes: TH/CN/JP/MY/LK/NZ). (b) Trip-awareness — `PhrasesTab` now reads `TripContext.selectedTrip`, maps it through a `TRIP_LANGS` table (e.g. `south-korea → [KR, HK]`, `china-japan → [CN, JP]`), auto-jumps to that trip's language(s), and hides irrelevant toggles while a trip is filtered. Previously this tab ignored `selectedTrip` entirely.
- **Backlogged, not built**: Phrases — tap the emoji/word to hear it spoken (TTS). David explicitly said this can wait.
- **Subtitle copy** (9 Jul): header subtitle changed from "mini gap year" to "adventures of a digital nomad" (David's own phrase, his words: the old one "sucked"). Same swap applied to `WorldTab`'s default map-briefing title ("the digital nomad life").
- **Tail-fin badges on Flights** (9 Jul, from a Qantas tail-livery reference photo): `src/components/TailFin.jsx` + `src/lib/airlineTails.js` — a small original SVG fin shape (NOT the real airline logos/livery art, which are trademarked; this is a generic slanted-fin silhouette), always the same orientation, tinted by each airline's real brand colour via a regex lookup table. Shows as the `fh-thumb` fallback when there's no Planespotters photo, and as a small corner badge (`.fh-thumb-badge`) overlaid on the real aircraft photo when one exists ("if you overlay with the aircraft images... epic" — David's ask). Extend `AIRLINE_COLORS` in `airlineTails.js` for any airline not yet mapped (falls back to CΛNΛRD gold).
- **Backlogged idea: revive the old running-log site** (David, 9 Jul): "Oh one thing we had before was the running logs - https://damo1111.github.io/asia_runs/. It's in the GIT asia-runs repo. Can we consider bringing this back?" — David explicitly said backlog it, not build now. Lives in a separate repo (`damo1111/asia_runs`), currently deployed standalone via GitHub Pages. Possible future direction: fold its data/maps into this app's `runs` table and Map tab rather than keeping it a separate site — not scoped or investigated yet.
- **Trip-selected highlight, carried across every tab** (9 Jul, David's ask: "what can we do to highlight flights, journal, map, photos?" after seeing the globe fly-to): `src/lib/tripColors.js` now holds the single `TRIP_COLORS` map (moved out of `WorldTab`) and `App.jsx` mirrors the selected trip's colour onto a `--trip-accent` CSS var so any tab can echo it. Flights gets `src/components/RouteStrip.jsx` — an animated mini flight-path per trip section, ordered airports as dots, with a small plane wearing that trip's most-flown airline's real `TailFin` tail livery flying stop to stop (replays every Flights-tab mount, same as the existing `FlapText` pattern). Journal gets `src/components/DayScrubber.jsx` — a horizontal day/mood chip strip above the entries that jumps to (and expands) that day; required making `Entry`'s open state react to a live "jump signal" prop, not just its original mount-only `autoOpen`. Map's journey polyline now draws on point-by-point (`requestAnimationFrame`) when a trip is selected instead of appearing instantly. Photos gets a hero band (cover image + trip colour + date range/count) above the grid.
- **Fixed: Photos album cards still linked out to Google Photos even once real photos were registered** (9 Jul): album cards now check `photos` row-count per trip — if the app already has real photos registered for that trip, tapping the card jumps to (and scrolls to) the in-app grid instead of opening the Google Photos share link; the external link is now only shown for trips that don't have any registered photos yet.
- **Fixed: photo grid thumbnails shipping full camera-original files** (9 Jul, David noticed scroll lag): the uploaded originals are raw phone photos (10–33MB each) — `loading="lazy"` alone doesn't help once a cell scrolls into view. `src/lib/imgTransform.js` now rewrites Supabase Storage public URLs to the `/render/image/public/` transform endpoint (Pro-plan feature) requesting a small resized render for grid cells; the lightbox still opens the untouched full-res original.
- **Fixed: 71 of 181 uploaded south-korea photos weren't showing** (9 Jul): they existed in the `photos` Storage bucket but had never been INSERTed into the `photos` table (the bulk-registration SQL had only been run once, earlier, against a partial upload). Re-ran the same registration query — all 181 now have rows.
- **Fixed: Storage image-transform endpoint 400s on larger camera originals** (9 Jul): mostly files 13MB+, not a clean size cutoff — looks like a flaky origin timeout rather than a hard limit. `PhotosTab`'s grid `<img onError>` now falls back to the untouched original url once, so a failed thumbnail render shows the (slower-loading) full photo instead of staying permanently broken.
- **AI trip summary — built and confirmed working** (9 Jul, David: "I have a shed load of OpenAI credits"): new `summarize-trip` Edge Function (deployed, not in repo source tree — pull via `supabase functions download summarize-trip` if editing) reads a trip's `journal_entries` and asks OpenAI (`gpt-5.5` — David's call, "use the top model, I have lots of credit"; note it doesn't accept a custom `temperature`, only the default) for a 150–250 word recap, upserting the result into a new `trip_summaries` table (trip_id PK) so reopening the trip later doesn't re-spend tokens. `src/components/TripSummary.jsx` renders in Journal above the day scrubber — a "✨ Summarize this trip" button when nothing's cached yet, or the cached text plus a regenerate button once there is. Requires an `OPENAI_API_KEY` project secret set via the Supabase dashboard (Edge Functions → Manage secrets) — David's own key, tied to the OpenAI project holding his $2500 credit grant (his ChatGPT subscription credits are a separate system and don't work here). Getting this working took a few rounds: first the wrong OpenAI key (0 balance) was saved, then the right key but from the wrong OpenAI *project* within the org, then a model mismatch (`gpt-4o-mini` swapped for `gpt-5.5` per David's ask) which briefly hit a `temperature` param error until it was dropped. A temporary `_debug_log` table was used mid-session to surface the actual OpenAI error text (Supabase's `get_logs` edge-function service only exposes the request/response line, not console output) — since removed now that it's working.
- **AI trip summary: auto-generate + streaming + glitzy styling** (9 Jul, David: "the summary still takes a while to generate... can we add an ai type background... cache this and have it always loaded, async"): `TripSummary` now auto-triggers generation in the background the first time a trip with journal entries is opened (no button tap needed) and never blocks the rest of the tab. `summarize-trip` calls OpenAI with `stream:true` and pipes delta text straight through as plain-text chunks — `TripSummary` fetches it directly with raw `fetch()` (not `supabase.functions.invoke()`, which always awaits the full body) and renders the summary typing itself out with a blinking cursor, so the wait is felt as progress instead of a blank spinner. The Edge Function still accumulates the full text server-side and upserts `trip_summaries` once OpenAI's own stream ends, independent of whether the client is even still connected, so a backgrounded tab still gets a cached result waiting next time. The card also clamps to 4 lines (show more/less) and has an animated gold→purple→blue "aurora" gradient border + moving sheen to read as a distinct AI feature against the rest of the warm-paper theme.
- **Bottom-nav nudge after picking a trip on Home** (9 Jul, David: "anything that can be done to signify to the user they should tap Flights, Journal or some such?"): selecting a trip on the World/Home globe now briefly pulses the Flights/Journal/Map/Photos nav icons (full colour + a soft glow ring, staggered) every time, plus a one-off text hint ("↓ explore Flights, Journal, Map & Photos") above the nav the very first time ever — gated on a `ph_nav_hint_seen` localStorage flag so it never shows again after that. Lives in `App.jsx` (`navPulse`/`navHint` state) + `.nav-hint`/`nav-pulse*` in globals.css.
- **Usage analytics** (9 Jul, David: "can we add analytics so i can see people using it"): this is a tab-based SPA with no real per-tab URLs (`activeTab` is just React state), so generic page-view analytics (Vercel/GA) would only ever register one page — built a tiny first-party event log instead. New `app_events` table (session_id, event, detail jsonb, created_at) + `src/lib/analytics.js`'s fire-and-forget `track()`, wired in `App.jsx` for `app_open`, `tab_view` (per tab switch), and `trip_select`. RLS grants INSERT only, no SELECT policy — the anon key can log events but can never read any of it back, so usage data is only queryable server-side (ask Claude, or query `app_events` directly via the Supabase MCP tools/dashboard). No in-app dashboard was built — deliberately, consistent with keeping anything not meant for the "trusted circle" share link off the client entirely.
- **Production URL moved to `pond.moritz.life`** (9 Jul): David's own domain, GoDaddy DNS, Gmail Workspace mail — becoming a shared umbrella domain for his apps, one subdomain each. `pond-hopping.vercel.app` still works too.
- **First trip reconstructed with no Google Timeline export** (9 Jul, David: "I have no Google Timeline data. Can we get an idea of the trip? It started in Edinburgh"): new `new-orleans` trip (title "Edinburgh + New Orleans", 4–8 Mar 2024 — David's first trip predating the other six, sort_order 0). Two-step reconstruction, no Timeline needed at all: (1) David ran `exiftool -csv -filename -gpslatitude# -gpslongitude# -datetimeoriginal` locally against his 625 originals and pasted the CSV back; 323 JPEG/HEIC rows with both GPS+date were bulk-upserted into `photos` (new `lat`/`lon`/`taken_at` columns + a unique index on `url` to make it idempotent). (2) David then pasted the trip's ByAir export — 5 real flights (EDI→LHR→ATL→MSY out, MSY→LHR→EDI back) matched the GPS clusters exactly and got loaded into `flights`; 2 mismatched rows in that same paste (different ByAir ID batch, physically-impossible connecting times) were correctly excluded rather than blindly imported. `airportTz.js` gained EDI/ATL/MSY. A one-off `extract-exif` Edge Function (`npm:exifr`, paginated, `verify_jwt:false` so it can be triggered by just pasting a URL) was also built and deployed as a Storage-side fallback for a future trip if local originals aren't handy — for this trip, running exiftool locally and pasting the CSV was faster and more reliable than that Edge Function chewing through 620+ Storage downloads. sort_order corrected to 7 (last) once its actual 2024 date was known — chronologically the oldest of all seven trips, so it belongs at the end of the newest-first list, not the front. 5 real `journal_entries` were written from the reconstructed day-by-day movement (day pin = the average GPS cluster for that date) — explicitly worded as a GPS/flight reconstruction rather than firsthand memory, since that's all the data supports. `MapTab` now also fetches `photos` with lat/lon and folds them into its bounds calculation (previously nothing at all for this trip → fell back to a hardcoded Asia-Pacific default view) plus renders them as a gold photo-trail polyline + small dot markers (thumbnail popups), same progressive draw-on as the journal journey line — the de facto route for any Timeline-less trip.
- **Roadmap, per David (9 Jul)**: next up is improving the Map tab, then auth — "let's get this one ready to ship to other customers." Auth doesn't exist yet; RLS is fully permissive everywhere by design for the current single/two-user personal use. Multi-tenancy will need real per-recipient accounts before Costs/private notes (currently just hidden client-side) or a public share link become genuinely safe to open up.

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

