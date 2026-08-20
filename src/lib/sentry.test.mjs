import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrubbed, watchForCrashes } from './sentry.js'

// The redaction is the only part of this worth testing, and it is the part
// that must be tested: its failure mode is invisible from inside the app and
// surfaces as somebody's email address sitting in a third party's dashboard.

test('credentials in a URL never leave the building', () => {
  const out = scrubbed({
    request: { url: 'https://pond.eend.app/?code=4/0AXabc&state=eyJ1aWQ&access_token=ya29.secret' },
  })
  assert.ok(!out.request.url.includes('4/0AXabc'), out.request.url)
  assert.ok(!out.request.url.includes('ya29.secret'), out.request.url)
  assert.ok(!out.request.url.includes('eyJ1aWQ'), out.request.url)
  assert.match(out.request.url, /code=\[removed\]/)
})

test('and neither do email addresses', () => {
  const out = scrubbed({ message: 'could not send to david@moritznet.com' })
  assert.equal(out.message, 'could not send to [email]')
})

test('breadcrumbs are scrubbed too, which is where URLs actually accumulate', () => {
  // The request URL is one string. Breadcrumbs are every fetch the app made
  // before it broke, which is where a token is far more likely to be.
  const out = scrubbed({
    breadcrumbs: [
      { data: { url: 'https://x.test/rpc?apikey=sb_secret_abc' } },
      { message: 'signed in as someone@example.org' },
    ],
  })
  assert.match(out.breadcrumbs[0].data.url, /apikey=\[removed\]/)
  assert.ok(!out.breadcrumbs[0].data.url.includes('sb_secret_abc'))
  assert.equal(out.breadcrumbs[1].message, 'signed in as [email]')
})

test('a malformed event is passed through rather than thrown on', () => {
  // A scrubber that throws becomes the crash it was watching for.
  assert.equal(scrubbed(null), null)
  assert.deepEqual(scrubbed({}), {})
  assert.doesNotThrow(() => scrubbed({ breadcrumbs: 'not an array', request: 7 }))
})

test('with no DSN the SDK is never even fetched', async () => {
  // The state the app ships in until somebody sets VITE_SENTRY_DSN, so it
  // has to cost nothing rather than throw.
  let asked = false
  const on = await watchForCrashes({ dsn: '', load: () => { asked = true; return {} } })
  assert.equal(on, false)
  assert.equal(asked, false)
})

test('and a DSN that cannot load leaves the app running', async () => {
  const on = await watchForCrashes({ dsn: 'https://k@o.ingest.sentry.io/1', load: () => { throw new Error('blocked by an extension') } })
  assert.equal(on, false)
})
