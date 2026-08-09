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
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
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
