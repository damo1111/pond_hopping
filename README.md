# POND HOPPING

Travel logs for David + husband — starting with the mini gap year (six trips across Asia and beyond, March–July 2026), built to hold all future travel. Warm-paper editorial, duck-branded, PWA-installable.

Merged from two earlier apps:
- **asia_runs** — the China/Japan running log (its GPS run data now lives in the `runs` table)
- the trip planning brief (see `CLAUDE.md` for the full build plan)

## Stack

- React + Vite (+ `vite-plugin-pwa`)
- Supabase (Postgres, project `cvnvrd`) — the only backend, anon key from the client
- Leaflet + react-leaflet, Carto voyager light tiles
- Planespotters.net API for aircraft photos (no key)
- Raleway + Space Mono, CSS variables only — no Tailwind

## Running

```bash
npm install
cp .env.example .env   # already contains the cvnvrd project URL + publishable key
npm run dev
```

Database setup (already applied to the live project via migrations):

1. `supabase/schema.sql` — tables, `trip_meta` view, RLS
2. `supabase/seed.sql` — the six trips, aircraft types, KR/HK phrases, China+Japan runs

## Build order

Each tab is built as its own session — see `CLAUDE.md`. Session 1 (app shell) is done: boot screen, tab bar, `trip_meta` fetch, design tokens, PWA manifest.

## Getting the apps

**Android** — `pond.eend.app/apk`. One link, always the newest build, no
GitHub or Firebase account needed. Android warns about installing outside
the Play Store; that's expected for a sideloaded build.

You only need to install it again when *native* code changes — a plugin, the
icon, a permission. The Android shell points at the live site, so ordinary
changes to the app arrive on the next launch with no reinstall, and the
service worker inside the WebView keeps it working offline after first load.

**iOS** — TestFlight. Unlike Android it ships the web bundle inside the app,
because App Store review treats a remote-URL wrapper as failing the minimum
functionality bar. So iOS needs a new build per change; Xcode Cloud makes one
on every push to `main`.

**Web** — pond.eend.app, installable as a PWA. Updates itself: the service
worker checks whenever the app comes back to the foreground, and hourly while
it's open. The bottom of the Account tab shows which build is running and
will go and look for a newer one if you tap it.
