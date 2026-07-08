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
