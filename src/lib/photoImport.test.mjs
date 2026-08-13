import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  asProgress,
  needsConsent,
  onlyTheNewOnes,
  openEmptyWindow,
  rememberIntent,
  takeIntent,
  waitForPick,
} from './photoImport.js'

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
