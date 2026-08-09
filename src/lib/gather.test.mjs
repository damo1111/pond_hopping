import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gather } from './gather.js'

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
const after = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms))
const never = () => new Promise(() => {})

// Small numbers so the suite stays quick; the behaviour is the same shape.
const fast = { grace: 30, timeout: 60 }

const job = (query, key) => ({ query, take: (res) => ({ [key]: res.data }) })

test('everything that arrives in time arrives together', async () => {
  const slices = []
  gather([job(after(1, { data: 1 }), 'a'), job(after(2, { data: 2 }), 'b')], {
    ...fast,
    onSlice: (s) => slices.push(s),
  })
  await tick(20)
  assert.deepEqual(slices, [{ a: 1, b: 2 }])
})

test('one request that never returns costs one figure, not all of them', async () => {
  // The actual bug. Promise.all kept nothing; this keeps everything else.
  const slices = []
  let ready = 0
  gather([job(after(1, { data: 'flights' }), 'flights'), job(never(), 'photos')], {
    ...fast,
    onSlice: (s) => slices.push(s),
    onReady: () => (ready += 1),
  })
  await tick(45)
  assert.deepEqual(slices, [{ flights: 'flights' }])
  assert.equal(ready, 1)
})

test('a refusal is skipped rather than stored as an answer', async () => {
  const trouble = []
  const slices = []
  gather([job(after(1, { error: { message: 'permission denied' } }), 'runs'), job(after(1, { data: 7 }), 'km')], {
    ...fast,
    onSlice: (s) => slices.push(s),
    onTrouble: (m) => trouble.push(m),
  })
  await tick(20)
  assert.deepEqual(slices, [{ km: 7 }])
  assert.deepEqual(trouble, ['permission denied'])
})

test('a thrown request is a reason, not an unhandled rejection', async () => {
  const trouble = []
  gather([job(Promise.reject(new Error('offline')), 'a')], { ...fast, onTrouble: (m) => trouble.push(m) })
  await tick(20)
  assert.equal(trouble.length, 1)
})

test('slow answers fill in behind the page rather than being lost', async () => {
  const slices = []
  gather([job(after(1, { data: 'a' }), 'a'), job(after(40, { data: 'b' }), 'b')], {
    ...fast,
    onSlice: (s) => slices.push(s),
  })
  await tick(55)
  assert.deepEqual(slices, [{ a: 'a' }, { b: 'b' }])
})

test('the page is told it is worth opening exactly once', async () => {
  let ready = 0
  gather([job(after(1, { data: 1 }), 'a'), job(after(40, { data: 2 }), 'b')], { ...fast, onReady: () => (ready += 1) })
  await tick(70)
  assert.equal(ready, 1)
})

test('everything failing still opens the page', async () => {
  // Honestly little beats a spinner with no limit on it.
  let ready = 0
  const slices = []
  gather([job(never(), 'a'), job(never(), 'b')], {
    ...fast,
    onReady: () => (ready += 1),
    onSlice: (s) => slices.push(s),
  })
  await tick(45)
  assert.equal(ready, 1)
  assert.deepEqual(slices, [])
})

test('cancelling means nothing is called again', async () => {
  const slices = []
  let ready = 0
  const cancel = gather([job(after(20, { data: 1 }), 'a')], {
    ...fast,
    onSlice: (s) => slices.push(s),
    onReady: () => (ready += 1),
  })
  cancel()
  await tick(45)
  assert.deepEqual(slices, [])
  assert.equal(ready, 0)
})

test('nothing to fetch is not a hang', async () => {
  let ready = 0
  gather([], { ...fast, onReady: () => (ready += 1) })
  await tick(45)
  assert.equal(ready, 1)
})
