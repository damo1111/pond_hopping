// Does the built app actually draw?
//
// This exists because it has now happened twice. `coversIn is not defined`
// took pond.eend.app down on a cold load, and checks.yml was written in
// response — unit tests, the linter, a production build. Then WorldTab read
// a const from above its own declaration, which is a temporal dead zone, and
// the app threw on first render for everybody. Every one of those three
// checks passed.
//
// They pass because none of them is the check. A bundler has no opinion
// about the order in which a function reads its own variables, or about an
// identifier it does not recognise — it assumes a global and leaves it to
// the browser. The tests are node:test over pure modules and never mount a
// component. The gap between "it compiles" and "it renders" is where both
// outages lived, and nothing in the pipeline had ever opened the page.
//
// So this opens the page. Serve dist, load it in headless Chromium, and fail
// on an uncaught exception or on the crash screen appearing. It takes a few
// seconds and it is the only check here that would have caught either bug.
//
// What it deliberately does not do: assert on console noise. A signed-out
// load produces failed requests and warnings that mean nothing, and a check
// that cries wolf gets switched off. Only two things fail it — a thrown
// exception, and the error boundary rendering.

import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('dist')
const PORT = Number(process.env.SMOKE_PORT || 4180)
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('smoke: no dist/index.html — run `npm run build` first')
  process.exit(1)
}

// A single-page app: anything that is not a file on disk is the app itself.
const server = http.createServer((req, res) => {
  const asked = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(DIST, asked)
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

/**
 * Which Chromium to drive.
 *
 * Undefined is the right answer nearly everywhere: Playwright then uses the
 * one it installed itself, which is the version it was built against. The
 * guessing only happens where a browser is provided *instead* of that —
 * `PLAYWRIGHT_BROWSERS_PATH` being set is the signal, and pointing at a
 * stray system Chrome when Playwright has its own would swap a known-good
 * pairing for an unknown one.
 */
function browserPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) return undefined
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  return [`${root}/chromium/chrome-linux/chrome`, `${root}/chromium`].find((p) => fs.existsSync(p))
}

const problems = []
let browser

try {
  await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok))
  browser = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] })
  const page = await browser.newPage()

  page.on('pageerror', (e) => problems.push(`threw: ${e.message}`))

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })

  // Watch the cold open all the way out.
  //
  // Act two — the photographs folding into a route, and the one sentence
  // that says what the app is for — is the whole of what a new arrival is
  // told, and it is rendered conditionally. Tying that condition to state
  // that the ending timer also changes pulled it out of the DOM on exactly
  // the frame the screen began to fade: the pitch vanished and an empty
  // globe faded out after it. Every screenshot of that looks fine. Only the
  // frames in between are wrong, which is why this samples rather than
  // looks.
  //
  // The rule is the narrow one that cannot misfire on a slow machine: if
  // the opening was ever seen leaving, its sentence was still there when it
  // went. Nothing is asserted about a load too slow to have got that far.
  await page.evaluate(() => {
    window.__coldOpen = { everLeft: false, leftWithout: false }
    const tick = () => {
      const boot = document.querySelector('.boot')
      if (boot?.classList.contains('leaving')) {
        window.__coldOpen.everLeft = true
        if (!document.querySelector('.boot-say')) window.__coldOpen.leftWithout = true
      }
      if (boot) requestAnimationFrame(tick)
    }
    tick()
  })

  // Long enough for the lazy chunks to arrive and the first render to
  // happen. Not waiting on the network: a signed-out load talks to Supabase
  // and this must not depend on that answering.
  await page.waitForTimeout(6000)

  const opening = await page.evaluate(() => window.__coldOpen)
  if (opening?.everLeft && opening.leftWithout) {
    problems.push('the cold open faded out with its own sentence already gone')
  }

  // Boundary.jsx, by class rather than by its words. The first version of
  // this looked for "That didn't work" and would never once have fired: the
  // component is written with a typographic apostrophe. A check that cannot
  // fail is worse than no check, because it reports green.
  // Every tab, not just the one the app opens on.
  //
  // "Cannot access 'Q' before initialization" shipped to production and to a
  // TestFlight build. A const read above its own declaration is a temporal
  // dead zone: it throws the instant the component renders, for everybody,
  // with no data required. The unit tests never mount a component, the
  // linter has no opinion about ordering inside a function body, and this
  // check only ever opened the World tab — so nothing in the pipeline went
  // anywhere near PhotosTab, which is where it was.
  //
  // Clicking each tab costs a couple of seconds and covers every lazily
  // loaded screen in the app. It needs no account and no network: the crash
  // it is looking for happens at render, before anything is fetched.
  for (const tab of ['plan', 'flights', 'journal', 'map', 'photos', 'useful', 'world']) {
    const button = await page.$(`.navitem[data-tab="${tab}"], .navitem-${tab}`)
    if (!button) continue
    await button.click().catch(() => {})
    await page.waitForTimeout(900)
    if (await page.$('.crash')) {
      const why = await page.$eval('.crash-detail', (el) => el.textContent).catch(() => '')
      problems.push(`the ${tab} tab crashed the app — ${why || 'no detail'}`)
      break
    }
  }

  const crashed = await page.$('.crash')
  if (crashed) {
    const said = await page.$eval('.crash-detail', (el) => el.textContent).catch(() => '')
    problems.push(`the error boundary rendered — ${said || 'no detail'}`)
  }
  if (!(await page.innerText('body')).trim()) problems.push('the page rendered nothing at all')
} catch (e) {
  problems.push(`could not load it: ${e.message}`)
} finally {
  await browser?.close()
  server.close()
}

if (problems.length) {
  console.error('smoke: the built app does not draw\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('smoke: the built app draws')
