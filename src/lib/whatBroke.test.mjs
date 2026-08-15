import test from 'node:test'
import assert from 'node:assert/strict'
import { readEnv, sendState, whatWeKnow, worthSending } from './whatBroke.js'

test('the report answers the questions nobody can answer about themselves', () => {
  const got = whatWeKnow({
    build: '851150e',
    where: { tab: 'photos', trip: 'lisbon-porto' },
    env: {
      platform: 'android',
      width: 412.4,
      height: 915.2,
      agent: 'Mozilla/5.0 (Linux; Android 15)',
      online: true,
      url: 'https://pond.eend.app/',
    },
  })
  assert.equal(got.build, '851150e')
  assert.equal(got.tab, 'photos')
  assert.equal(got.trip, 'lisbon-porto')
  assert.equal(got.platform, 'android')
  // Rounded, because a fractional pixel is not a screen size anybody reads.
  assert.equal(got.screen, '412x915')
  assert.equal(got.online, true)
})

test('and says nothing rather than guessing when it does not know', () => {
  const got = whatWeKnow()
  assert.equal(got.tab, null)
  assert.equal(got.trip, null)
  assert.equal(got.screen, null, 'no window is not a 0x0 screen')
  assert.equal(got.platform, 'web')
})

test('long values are cut, because a report is not a place to store a novel', () => {
  const got = whatWeKnow({ env: { agent: 'x'.repeat(900), url: `https://pond.eend.app/?${'y'.repeat(500)}` } })
  assert.equal(got.agent.length, 400)
  assert.equal(got.url.length, 300)
})

test('reading the world never throws, whatever the webview is missing', () => {
  assert.doesNotThrow(() => readEnv({}))
  const bare = readEnv({})
  assert.equal(bare.platform, 'web')

  const withNothing = readEnv({
    get navigator() { throw new Error('no navigator here') },
    get location() { throw new Error('nor location') },
    Capacitor: { getPlatform: () => { throw new Error('no plugin') } },
  })
  assert.equal(withNothing.platform, 'web', 'a plugin that throws is still the web')
})

test('a browser with no onLine is treated as online, not as offline', () => {
  // "Offline" is a claim, and a wrong one sends somebody looking in entirely
  // the wrong place for a bug that was never about the network.
  assert.equal(readEnv({ navigator: {} }).online, true)
  assert.equal(readEnv({ navigator: { onLine: false } }).online, false)
  assert.equal(readEnv({ navigator: { onLine: true } }).online, true)
})

test('whitespace is a mis-tap, not a report', () => {
  assert.equal(worthSending('   \n\t '), false)
  assert.equal(worthSending(''), false)
  assert.equal(worthSending(null), false)
  assert.equal(worthSending(undefined), false)
  assert.equal(worthSending('the button did nothing'), true)
})

test('a report that failed to send says so, and can be tried again', () => {
  // The state that matters. A reporter that quietly drops the report is
  // strictly worse than no reporter: somebody who believes they have told
  // you goes quiet, and you never learn the thing they were telling you.
  const failed = sendState({ said: 'it broke', failed: true })
  assert.equal(failed.label, 'Try again')
  assert.equal(failed.can, true)
  assert.equal(failed.bad, true)
})

test('and the button cannot be pressed when there is nothing to send', () => {
  assert.equal(sendState({ said: '' }).can, false)
  assert.equal(sendState({ said: '  ' }).can, false)
  assert.equal(sendState({ said: 'something' }).can, true)
  assert.equal(sendState({ said: 'something', sending: true }).can, false)
  assert.equal(sendState({ said: 'something', sent: true }).can, false)
  assert.equal(sendState({ said: 'something', sent: true }).done, true)
  // Failed with nothing typed cannot be retried either — there is nothing
  // to retry with.
  assert.equal(sendState({ said: '', failed: true }).can, false)
})
