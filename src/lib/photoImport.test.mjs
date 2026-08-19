import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  withDeadline,
  asProgress,
  bringThemIn,
  alreadyConnected,
  comingBackTo,
  cameFromConsent,
  freshToken,
  howItWent,
  needsConsent,
  onlyTheNewOnes,
  openEmptyWindow,
  rememberIntent,
  stillRefused,
  takeIntent,
  tokenFacts,
  waitForPick,
} from './photoImport.js'

const PHOTOS = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

function aStore() {
  const held = new Map()
  return {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => held.set(k, String(v)),
    removeItem: (k) => held.delete(k),
    size: () => held.size,
  }
}

test('the trip survives the trip to Google and back', () => {
  // Consent leaves the page, so the component asking for it is gone by the
  // time the answer arrives.
  const store = aStore()
  rememberIntent('trip-1', store)
  assert.equal(takeIntent(store)?.tripId, 'trip-1')
})

test('but it is taken, not read — coming back is a one-time event', () => {
  const store = aStore()
  rememberIntent('trip-1', store)
  takeIntent(store)
  // Otherwise reopening the tab tomorrow starts the import again.
  assert.equal(takeIntent(store), null)
  assert.equal(store.size(), 0)
})

test('and a stale one means nothing', () => {
  const store = aStore()
  rememberIntent('trip-1', store)
  const later = () => Date.now() + 60 * 60 * 1000
  assert.equal(takeIntent(store, later), null)
})

test('rubbish in the key does not take the screen down with it', () => {
  const store = aStore()
  store.setItem('pond:importing', 'not json')
  assert.equal(takeIntent(store), null)
  assert.equal(takeIntent({ getItem: () => { throw new Error('storage off') } }), null)
})

test('a blocked popup is reported, not swallowed', () => {
  // A window that never opens looks exactly like nothing happening, so the
  // caller needs to know in order to offer the link instead.
  assert.equal(openEmptyWindow(() => null), null)
  assert.equal(openEmptyWindow(() => { throw new Error('blocked') }), null)
  assert.ok(openEmptyWindow(() => ({ location: '' })))
})

test('a token granted for Gmail is recognised as not enough', () => {
  // Connecting an inbox deliberately does not come with the photographs.
  assert.equal(needsConsent(new Error('session failed: 403 insufficient scope')), true)
  assert.equal(needsConsent(new Error('session failed: 401')), true)
  assert.equal(needsConsent(new Error('network went away')), false)
  assert.equal(needsConsent(undefined), false)
})

test('waiting stops when something has been picked', async () => {
  let asked = 0
  const said = await waitForPick('t', 's', {
    read: async () => (++asked < 3 ? { pollingConfig: { pollInterval: '1s' } } : { mediaItemsSet: true }),
    sleep: async () => {},
  })
  assert.equal(said.mediaItemsSet, true)
  assert.equal(asked, 3)
})

test('and gives up rather than polling for the life of the tab', async () => {
  // A picker window closed without choosing anything never answers.
  await assert.rejects(
    () =>
      waitForPick('t', 's', {
        read: async () => ({}),
        sleep: async () => {},
        patience: -1,
      }),
    /nothing was picked/
  )
})

test('what the trip already holds is never sent again', async () => {
  const picked = [
    { googleId: 'g1', takenAtHint: '2026-05-22T09:14:03Z' }, // already imported
    { googleId: 'g2', takenAtHint: '2026-05-22T10:00:00Z' }, // new
  ]
  const from = {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [{ google_id: 'g1', fingerprint: null, taken_at: '2026-05-22T09:14:03Z' }] }),
      }),
    }),
  }
  const { fresh, already } = await onlyTheNewOnes('trip-1', picked, { from })
  assert.deepEqual(fresh.map((p) => p.googleId), ['g2'])
  assert.equal(already, 1)
})

test('a failure reading the trip is raised, not treated as an empty trip', async () => {
  // Treating "we could not find out" as "the trip is empty" would re-import
  // the lot, which is the exact failure this whole path exists to avoid.
  const from = {
    from: () => ({ select: () => ({ eq: async () => ({ error: new Error('offline') }) }) }),
  }
  await assert.rejects(() => onlyTheNewOnes('trip-1', [{ googleId: 'g1' }], { from }), /offline/)
})

test('progress follows everything settled, not only what was fetched', () => {
  // Nine hundred already here and one fetched is 100% done, not 0.1%.
  const p = asProgress({ total: 901, done: 1, skipped: 900, failed: 0, waiting: 0 })
  assert.equal(p.settled, 901)
  assert.equal(p.part, 1)
})

test('a failure counts as settled — a bar that ignored it would never finish', () => {
  const p = asProgress({ total: 4, done: 2, skipped: 0, failed: 2, waiting: 0 })
  assert.equal(p.part, 1)
  assert.equal(p.failed, 2)
})

test('an import in its first second is 0%, not NaN', () => {
  assert.equal(asProgress({ total: 0 }).part, 0)
  assert.equal(asProgress(undefined).part, 0)
  assert.equal(asProgress(null).finished, false)
})

test('progress never reads as finished while anything is still waiting', () => {
  const p = asProgress({ total: 10, done: 4, skipped: 0, failed: 0, waiting: 6 })
  assert.ok(p.part < 1)
  assert.equal(p.finished, false)
})

test('the intent remembers that it already cost a trip to Google', () => {
  // Without this the resume has no way to tell a first refusal from a second,
  // and answers both the same way — which is a loop.
  const store = aStore()
  rememberIntent('trip-1', store)
  assert.equal(takeIntent(store)?.afterConsent, true)
})

test('the token comes from the live session, not a stale stash', async () => {
  // Coming back from the Photos consent screen, sessionStorage may still hold
  // the token from an ordinary sign-in — email and profile and nothing else.
  // Reading that one produces a confident, wrong report that Google refused
  // the scope, when nobody ever asked with the new token.
  const from = { auth: { getSession: async () => ({ data: { session: { provider_token: 'the-new-one' } } }) } }
  assert.equal(await freshToken({ from }), 'the-new-one')
})

test('and falls back rather than throwing when there is no live one', async () => {
  const from = { auth: { getSession: async () => ({ data: { session: null } }) } }
  // No stash in Node either, so this resolves to null instead of exploding.
  assert.equal(await freshToken({ from }), null)
})

test('the token is read for who issued it, not only what it carries', async () => {
  // The client id was the one thing never asked for, and it is the one that
  // separates "Google refused us" from "we are asking the wrong project".
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ scope: `email profile ${PHOTOS}`, aud: '123-abc.apps.googleusercontent.com' }),
  })
  const facts = await tokenFacts('t', { fetchImpl })
  assert.equal(facts.clientId, '123-abc.apps.googleusercontent.com')
  assert.ok(facts.scopes.includes(PHOTOS))
})

test('and falls back to azp where aud is absent', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ scope: 'email', azp: 'only-azp' }) })
  assert.equal((await tokenFacts('t', { fetchImpl })).clientId, 'only-azp')
})

test('a token Google will not describe is null, not a crash', async () => {
  assert.equal(await tokenFacts('t', { fetchImpl: async () => ({ ok: false }) }), null)
  assert.equal(await tokenFacts('t', { fetchImpl: async () => { throw new Error('offline') } }), null)
})

test('a request that never carried the scope blames the app, not the console', () => {
  // Said first, because everything else is somebody else's switch.
  const said = stillRefused(new Error('403'), { scopes: ['email'], clientId: 'c' }, 'email profile')
  assert.match(said, /did not ask Google for the Photos scope/)
})

test('a refusal on a request that did carry it names the client id instead', () => {
  const said = stillRefused(new Error('403'), { scopes: ['email'], clientId: '123-abc' }, PHOTOS)
  // Prove the check can fail: the app-at-fault sentence must NOT appear here.
  assert.doesNotMatch(said, /did not ask Google/)
  assert.match(said, /Sign-in client: 123-abc/)
  assert.match(said, /two different projects/)
})

test('and no longer claims the app is unverified, which it was not', () => {
  // In Testing mode a test user is granted sensitive scopes. That sentence
  // sent somebody chasing a verification review for a fault that was never
  // verification.
  const said = stillRefused(new Error('403'), { scopes: ['email'], clientId: 'c' }, PHOTOS)
  assert.doesNotMatch(said, /verif/i)
})

test('a refusal with the scope present is reported as itself', () => {
  const said = stillRefused(new Error('session failed: 500 backend error'), { scopes: [PHOTOS], clientId: 'c' }, PHOTOS)
  assert.match(said, /500 backend error/)
})

test('and a token Google would not describe does not become a diagnosis', () => {
  // null facts means we could not find out — which must not read as "Google
  // withheld the scope".
  const said = stillRefused(new Error('403 nope'), null, PHOTOS)
  assert.doesNotMatch(said, /two different projects/)
  assert.match(said, /403 nope/)
})

test('a tap is not a trip to Google', () => {
  // This is the whole bug. `onClick={go}` handed the import a React
  // SyntheticEvent, which is an object, which is truthy — so every first
  // refusal was read as a second one, the consent screen was never opened,
  // and the Photos scope was never once requested.
  const aClickEvent = { type: 'click', target: {}, preventDefault() {} }
  assert.equal(cameFromConsent(aClickEvent), false)
  assert.equal(cameFromConsent(undefined), false)
  assert.equal(cameFromConsent('true'), false)
  assert.equal(cameFromConsent(1), false)
  // Prove it can still say yes, or the guard against the loop is gone.
  assert.equal(cameFromConsent(true), true)
})

// A real ten-minute poll interval, so without the wake this cannot pass: the
// timeout is what makes the check able to fail rather than hang.
test('coming back to the tab ends the wait early', { timeout: 4000 }, async () => {
  // Picking happens in Google's tab, so this one is backgrounded throughout —
  // and a background tab's timers are throttled to about once a minute. Coming
  // back is the strongest signal picking is over, and waiting a further minute
  // to act on it looks exactly like nothing happening, which is what it did.
  const listeners = {}
  const doc = {
    visibilityState: 'hidden',
    addEventListener: (k, fn) => { listeners[k] = fn },
    removeEventListener: () => {},
  }
  const realDoc = globalThis.document
  const realAdd = globalThis.addEventListener
  const realRemove = globalThis.removeEventListener
  globalThis.document = doc
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  try {
    let asked = 0
    const said = waitForPick('t', 's', {
      read: async () => (++asked < 2 ? { pollingConfig: { pollInterval: '600s' } } : { mediaItemsSet: true }),
    })
    await new Promise((r) => setTimeout(r, 10))
    // Come back to the tab, the way somebody does when they have finished.
    doc.visibilityState = 'visible'
    listeners.visibilitychange?.()
    assert.equal((await said).mediaItemsSet, true)
    assert.equal(asked, 2)
  } finally {
    globalThis.document = realDoc
    globalThis.addEventListener = realAdd
    globalThis.removeEventListener = realRemove
  }
})

test('a token without the scope goes straight to consent, not to a refusal', async () => {
  // The first run used to open a session, be refused 403 for a scope the token
  // visibly did not carry, and only then ask for consent. A wasted round trip
  // that reads as an error on a screen where nothing has gone wrong.
  const steps = []
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        token: 'sign-in-only',
        onStep: (s) => steps.push(s),
        facts: async () => ({ scopes: ['email', 'profile'], clientId: 'c' }),
      }),
    // Shaped as a 403 so the caller's existing consent branch catches it.
    (e) => needsConsent(e) && /photographs/.test(e.message)
  )
  // And it never got as far as opening a session.
  assert.ok(!steps.includes('waiting for you to choose'))
})

test('but a token that does carry it is not stopped on the doorstep', async () => {
  // Prove the check can pass, or it is just a way of never importing anything.
  let opened = false
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        token: 'good',
        facts: async () => ({ scopes: [PHOTOS], clientId: 'c' }),
        open: async () => { opened = true; throw new Error('stop here') },
      }),
    /stop here/
  )
  assert.equal(opened, true)
})

test('and Google declining to describe the token is not grounds to refuse', async () => {
  let opened = false
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        token: 'unknown',
        facts: async () => null,
        open: async () => { opened = true; throw new Error('stop here') },
      }),
    /stop here/
  )
  assert.equal(opened, true)
})

test('the end of it is a sentence, not a row of counters', () => {
  // "1 in · 0 already here" is a table read aloud. At the end of a journey
  // through two tabs and a consent screen it says the machine finished; it
  // does not say the photographs are here.
  const done = (o) => howItWent(asProgress({ finished_at: 'now', ...o }))
  assert.equal(done({ total: 8, done: 8 }), '8 photographs are in.')
  assert.equal(done({ total: 1, done: 1 }), '1 photograph is in.')
  assert.equal(done({ total: 9, done: 6, skipped: 3 }), '6 photographs are in. 3 were already here.')
  assert.equal(done({ total: 3, skipped: 3 }), 'They were all already here.')
  assert.equal(done({ total: 1, skipped: 1 }), 'That one was already here.')
  assert.equal(done({ total: 2, failed: 2 }), 'None of them would come.')
})

test('and while it is running it counts up rather than sitting on zero', () => {
  // "0 of 8" in the first second reads as stuck, not as starting.
  assert.equal(howItWent(asProgress({ total: 8 })), 'Bringing them in…')
  assert.equal(howItWent(asProgress({ total: 8, done: 3 })), 'Bringing them in — 3 of 8')
  assert.equal(howItWent(null), null)
})

test('signing in with a code is not a reason to be refused your photographs', () => {
  // Somebody who signed in by email has never been near Google, so there is
  // no token — and this said "not connected to Google" and stopped, as though
  // bringing photographs in were a privilege of having signed in one
  // particular way. Shaped as a 401 so the existing consent path picks it up.
  assert.equal(needsConsent(new Error('401 not connected to Google yet')), true)
})

test('the token with the scope wins, not the one written down first', async () => {
  // There can be two. Signing in *with* Google leaves a provider_token
  // carrying email and profile; connecting Photos later mints a second that
  // carries the Photos scope. Preferring one by position handed Google the
  // sign-in token and got back, correctly, "no photographs on it" — printed
  // under a button somebody had just used to grant exactly that scope.
  let opened = null
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        tokens: async () => ['sign-in-only', 'the-photos-one'],
        facts: async (t) =>
          t === 'the-photos-one'
            ? { scopes: [PHOTOS], clientId: 'c' }
            : { scopes: ['email', 'profile'], clientId: 'c' },
        open: async (t) => { opened = t; throw new Error('stop here') },
      }),
    /stop here/
  )
  assert.equal(opened, 'the-photos-one')
})

test('and a token handed in is held to the same test', async () => {
  // It used to skip the check entirely, which is how a caller could route
  // itself to an error instead of to the consent screen.
  await assert.rejects(
    () => bringThemIn('trip-1', { token: 'sign-in-only', facts: async () => ({ scopes: ['email'] }) }),
    (e) => needsConsent(e) && /photographs/.test(e.message)
  )
})

test('no tokens at all is a 401, not a crash on an empty list', async () => {
  await assert.rejects(
    () => bringThemIn('trip-1', { tokens: async () => [] }),
    (e) => needsConsent(e) && /not connected/.test(e.message)
  )
})

test('a token still arriving is waited for, not reported as a refusal', async () => {
  // Coming back from consent in a wrapper, the appUrlOpen listener and this
  // resume start together and the resume usually wins — reading the session
  // as it was a moment ago and announcing that Google refused a scope it had
  // just granted.
  let looks = 0
  let opened = null
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        // Empty on the first look, holding the good token on the second.
        tokens: async () => (++looks === 1 ? ['sign-in-only'] : ['sign-in-only', 'the-photos-one']),
        facts: async (t) =>
          t === 'the-photos-one' ? { scopes: [PHOTOS] } : { scopes: ['email', 'profile'] },
        rest: async () => {},
        open: async (t) => { opened = t; throw new Error('stop here') },
      }),
    /stop here/
  )
  assert.equal(looks, 2)
  assert.equal(opened, 'the-photos-one')
})

test('but a second empty answer is still a refusal', async () => {
  // Prove the wait can give up: it must not become a way of never reporting
  // a genuinely missing scope.
  let looks = 0
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        tokens: async () => { looks += 1; return ['sign-in-only'] },
        facts: async () => ({ scopes: ['email', 'profile'] }),
        rest: async () => {},
      }),
    (e) => needsConsent(e) && /photographs/.test(e.message)
  )
  assert.equal(looks, 2)
})

// ── A hang is not an error, which is why nothing caught it ────────────────
//
// The import sat at "checking with Google…" and stayed there. Both steps
// before the picker reach the network, and both were wrapped in try/catch —
// which looks like handling the network and is not. catch catches a
// rejection; a request that never settles never rejects. On a marginal
// signal the fetch simply hangs, the step never advances, and the button
// says "checking with Google…" until the app is killed. Nothing is logged,
// because nothing failed.

test('a promise that never settles is not allowed to hold the app', async () => {
  const never = new Promise(() => {})
  const got = await withDeadline(never, 20, 'gave up')
  assert.equal(got, 'gave up')
})

test('and one that answers in time is not interfered with', async () => {
  assert.equal(await withDeadline(Promise.resolve('answered'), 500, 'gave up'), 'answered')
  // A rejection is the ordinary failure and lands on the same fallback,
  // because the caller has one thing to do about either.
  assert.equal(await withDeadline(Promise.reject(new Error('no')), 500, 'gave up'), 'gave up')
  // Including one thrown synchronously, which is not a rejection at all.
  assert.equal(await withDeadline(() => { throw new Error('sync') }, 500, 'gave up'), 'gave up')
})

test('the deadline never resolves twice, whichever wins', async () => {
  let count = 0
  const slow = new Promise((r) => setTimeout(() => r('late'), 30))
  const out = await withDeadline(slow, 5, 'gave up')
  count += 1
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(out, 'gave up')
  assert.equal(count, 1)
})

test('Google refusing to answer at all still lets the import carry on', async () => {
  // The behaviour that matters. tokenFacts returning null means "Google
  // would not say", and bringThemIn already treats that as a token worth
  // trying — so a dead tokeninfo endpoint costs six seconds and a picker,
  // rather than a spinner that never ends.
  const hangs = () => new Promise(() => {})
  const facts = await tokenFacts('a-token', { fetchImpl: hangs })
  assert.equal(facts, null, 'a hung lookup is "do not know", not a hang')
})

test('and a token Google will not describe still reaches the picker', async () => {
  // The behaviour that was broken. "checking with Google" is the step before
  // the picker, and it is where the app sat forever. What matters is that a
  // silent Google no longer stops the flow there: openSession is reached,
  // with the token, and the picker address comes back.
  let opened = null
  let handed = null
  const steps = []
  await bringThemIn('trip-1', {
    token: 'the-only-token',
    facts: async () => null, // Google says nothing at all about it
    open: async (key) => {
      opened = key
      return { id: 'sess-1', pickerUri: 'https://photos.google.com/picker/x' }
    },
    tokens: async () => ['the-only-token'],
    rest: async () => {},
    show: async () => true,
    hide: async () => {},
    onPicker: (uri) => { handed = uri },
    onStep: (s) => steps.push(s),
  }).catch(() => {})

  assert.equal(opened, 'the-only-token', 'it got past "checking with Google"')
  assert.equal(handed, 'https://photos.google.com/picker/x', 'and handed out the picker')
  assert.ok(steps.includes('checking with Google'))
  assert.ok(steps.includes('asking Google'), 'the step advanced rather than sticking')
})

test('a deadline that swallows rejections is the wrong tool for the tap path', () => {
  // Pinning a distinction I got wrong while writing it, and nearly shipped.
  //
  // withDeadline turns a rejection into its fallback, which is right for a
  // lookup whose answer is optional. It is wrong for bringThemIn, whose
  // rejections are load-bearing: a 401 is how "not connected to Google yet"
  // reaches the consent branch. Swallowed, the button reports a stall and
  // nobody is ever sent to Google — the exact symptom being chased.
  //
  // So the tap path uses Promise.race, which only adds an upper bound.
  const boom = () => Promise.reject(new Error('401 not connected to Google yet'))
  const LATE = Symbol('late')

  return Promise.all([
    // withDeadline: the 401 disappears.
    withDeadline(boom(), 50, 'swallowed').then((v) =>
      assert.equal(v, 'swallowed', 'withDeadline hides the rejection — which is why it is not used there'),
    ),
    // race: the 401 survives, and that is what reaches the consent branch.
    Promise.race([boom(), new Promise((r) => setTimeout(() => r(LATE), 50))]).then(
      () => assert.fail('the rejection should have come through'),
      (e) => assert.match(e.message, /401/, 'race preserves the throw'),
    ),
  ])
})

test('the trip somebody left from can be read without spending the intent', async () => {
  // Coming back from consent lands on the site root, so somebody who left
  // from a trip's Photos tab returns to the home screen — where BringThemIn
  // does not exist and nothing resumes. Routing needs to know where to send
  // them, and must not consume the intent doing it: the screen it navigates
  // to is what actually resumes, and would arrive with nothing to act on.
  const box = { 'pond:importing': JSON.stringify({ tripId: 'trip-9', at: Date.now(), afterConsent: true }) }
  const store = {
    getItem: (k) => box[k] ?? null,
    setItem: (k, v) => { box[k] = String(v) },
    removeItem: (k) => { delete box[k] },
  }
  assert.equal(comingBackTo(store), 'trip-9')
  assert.equal(comingBackTo(store), 'trip-9', 'peeking twice is still the same answer')
  assert.ok(box['pond:importing'], 'and the intent is still there for whoever resumes')

  // Only then is it spent.
  assert.equal(takeIntent(store)?.tripId, 'trip-9')
  assert.equal(comingBackTo(store), null)
})

test('and a stale intent from yesterday routes nobody anywhere', () => {
  const old = JSON.stringify({ tripId: 'trip-9', at: Date.now() - 40 * 60 * 1000 })
  assert.equal(comingBackTo({ getItem: () => old }), null)
  assert.equal(comingBackTo({ getItem: () => null }), null)
  assert.equal(comingBackTo({ getItem: () => 'not json' }), null)
})

test('a token that already carries the scope means no second consent', () => {
  // The card can then be a link on arrival rather than a button that has to
  // be tapped to become one — which is the duplicate tap, every time.
  return alreadyConnected({
    tokens: async () => ['sign-in-only', 'the-photos-one'],
    facts: async (t) =>
      t === 'the-photos-one'
        ? { scopes: ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'], clientId: 'x' }
        : { scopes: ['email'], clientId: 'x' },
  }).then((got) => assert.equal(got, 'the-photos-one'))
})

test('and no such token means the card must ask first', async () => {
  assert.equal(await alreadyConnected({ tokens: async () => [], facts: async () => null }), null)
  assert.equal(
    await alreadyConnected({
      tokens: async () => ['inbox-only'],
      facts: async () => ({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'], clientId: 'x' }),
    }),
    null,
  )
})

test('a token Google will not describe is still treated as usable', async () => {
  // Being unable to ask is not a refusal — the same rule the import follows.
  assert.equal(
    await alreadyConnected({ tokens: async () => ['mystery'], facts: async () => null }),
    'mystery',
  )
})

test('a grant from a previous session means no consent screen', () => {
  // The point of the whole thing. The two token sources in the browser are a
  // live session and a sessionStorage stash, and both are gone the moment the
  // app closes — so every new session began at Google. A grant kept on the
  // server does not go anywhere.
  return assert.doesNotReject(async () => {
    let opened = false
    await assert.rejects(
      () =>
        bringThemIn('trip-1', {
          // Nothing in the browser at all: the ordinary state of a fresh
          // launch the morning after connecting.
          tokens: async () => [],
          fromGrant: async () => 'ya29.from-the-grant',
          facts: async () => ({ scopes: [PHOTOS], clientId: 'c' }),
          open: async () => { opened = true; throw new Error('stop here') },
        }),
      /stop here/
    )
    // It got as far as opening a picker, which is the thing that used to
    // require a trip to Google first.
    assert.equal(opened, true)
  })
})

test('and prove it can fail: no grant either, and it is the consent screen', async () => {
  await assert.rejects(
    () => bringThemIn('trip-1', { tokens: async () => [], fromGrant: async () => null }),
    (e) => needsConsent(e) && /not connected to Google/.test(e.message)
  )
})

test('a withdrawn grant is said, not swallowed', async () => {
  // Revoked in somebody's Google account, or six months unused. That is a
  // thing to tell them, and the consent path is the answer — so it has to
  // reach the caller as a 403 rather than as "no token".
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        tokens: async () => [],
        fromGrant: async () => { throw new Error('403 your Google connection was withdrawn') },
      }),
    (e) => needsConsent(e) && /withdrawn/.test(e.message)
  )
})

test('a grant that does not carry the Photos scope is not used', async () => {
  // Same rule every other token here is held to. A grant is not a promise
  // about what is in it.
  await assert.rejects(
    () =>
      bringThemIn('trip-1', {
        tokens: async () => [],
        fromGrant: async () => 'ya29.sign-in-only',
        facts: async () => ({ scopes: ['email', 'profile'], clientId: 'c' }),
      }),
    (e) => needsConsent(e)
  )
})
