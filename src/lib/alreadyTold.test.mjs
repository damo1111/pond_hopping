import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alreadyTold } from './photoImport.js'

// The poller's own guard is "if finished, return" — one path in, and it
// stops itself. What it cannot guard against is a *second* watcher starting
// from scratch on an import that already finished, which is what an
// unstable onDone identity in the effect's dependency array produces: 224
// duplicate "finished" reports in 47 seconds on one real import, reported as
// the app hanging before the next picker would open.

test('a run reported for the first time is not "already told"', () => {
  assert.equal(alreadyTold('import-1', null), false)
  assert.equal(alreadyTold('import-1', undefined), false)
})

test('the same run, asked again, is', () => {
  assert.equal(alreadyTold('import-1', 'import-1'), true)
})

test('a different run is not silenced by the last one', () => {
  // Starting a genuinely new import must still be announced — this is not
  // "only ever tell once", it is "do not tell the same thing twice".
  assert.equal(alreadyTold('import-2', 'import-1'), false)
})

test('nothing being watched yet is never "already told"', () => {
  assert.equal(alreadyTold(null, 'import-1'), false)
  assert.equal(alreadyTold(undefined, undefined), false)
})
