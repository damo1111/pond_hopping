import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Which build is actually running. Without it, telling a deployed fix from a
// cached bundle means guessing from behaviour — which cost an hour of "it
// still doesn't work" against a build that predated the fix by one minute.
//
// CI_COMMIT is Xcode Cloud's, and it was the one missing. The iOS app is
// built by ci_scripts/ci_post_clone.sh on a runner where neither of the
// other two is set, so every TestFlight build stamped itself "dev" —
// useless in precisely the case the stamp exists for, since the iOS app
// bakes its web assets in and is the one build a deploy cannot fix.
//
// The prefix says which pipeline, because "is this the web or the app" is
// half of every question that gets asked about a build.
const SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CI_COMMIT ||
  ''
const WHERE = process.env.CI_COMMIT ? 'ios ' : process.env.VERCEL_GIT_COMMIT_SHA ? 'web ' : ''
const BUILD_ID = SHA ? `${WHERE}${SHA.slice(0, 7)}` : 'dev'

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILT_AT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    // Cut what Sentry ships that this app does not use.
    //
    // These are the SDK's own tree-shaking flags. Left unset, `Sentry.init`
    // drags in performance tracing and the debug logger whether or not they
    // are switched on at runtime — measured at 163KB gzipped, which is not a
    // crash reporter, it is a second app. tracesSampleRate is already 0; this
    // is what makes that a build-time fact rather than a runtime one.
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // "autoUpdate" downloads the new service worker but, by default, it
      // waits: the old one keeps serving until every tab is closed. On a
      // phone that is never, so a fix shipped ten minutes ago is invisible
      // for days. Four separate rounds this morning were spent looking at
      // components that had already been deleted.
      //
      // skipWaiting takes over as soon as the new worker installs;
      // clientsClaim puts the open page under it without waiting for a
      // navigation. Together they mean a reload is enough, which is what
      // everybody assumes a reload does.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // The shell is the thing that goes stale. Anything else can be
        // fetched fresh.
        cleanupOutdatedCaches: true,
      },
      // duck.png as well as the icon. It is the brand mark in the header
      // and every pin on the globe, and it was being fetched from the
      // network on every cold start — 220KB, over whatever connection
      // happens to be going. One failed request on 4G and the header shows
      // a broken-image glyph, permanently, because <img> does not retry.
      // Precached, it is there before it is asked for and survives being
      // offline entirely.
      // The sixteen flags that were here before the country picker existed —
      // the ones on trip cards, which have to be there on a cold offline
      // start like the duck is. The other two hundred and fifty-five arrived
      // with the picker and are excluded from the precache below: they are
      // 2.7MB, they are only ever seen while somebody is actively searching a
      // list, and nobody searches for a country offline.
      includeAssets: [
        'icon.svg',
        'duck.png',
        'flags/gb.svg',
        'flags/au.svg',
        'flags/us.svg',
        'flags/th.svg',
        'flags/jp.svg',
        'flags/cn.svg',
        'flags/nz.svg',
        'flags/sg.svg',
        'flags/hk.svg',
        'flags/kr.svg',
        'flags/it.svg',
        'flags/de.svg',
        'flags/nl.svg',
        'flags/my.svg',
        'flags/lk.svg',
        'flags/gb-sct.svg',
      ],
      workbox: {
        // Without this the picker's flags would nearly double the precache.
        globIgnores: ['**/flags/*.svg'],
      },
      manifest: {
        name: 'Pond Hopping',
        short_name: 'Pond Hopping',
        description: 'Travel logs — starting with the mini gap year, Mar–Jul 2026',
        start_url: '/?source=pwa',
        scope: '/',
        theme_color: '#F5F2EB',
        background_color: '#F5F2EB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
