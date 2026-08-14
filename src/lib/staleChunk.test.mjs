import { test } from 'node:test'
import assert from 'node:assert/strict'

// The matcher lives in Boundary.jsx, which imports React and cannot be loaded
// here. This is the same expression, held against the wordings the engines
// actually produce — the point being that it must not be tuned to whichever
// browser the bug was first seen in.
const staleChunk = (error) =>
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror/i.test(
    String(error?.message ?? '')
  )

test('a chunk that is no longer on the server is recognised, whoever says it', () => {
  // Chrome — the one seen on the phone, verbatim.
  assert.ok(
    staleChunk(
      new Error('Failed to fetch dynamically imported module: https://pond.eend.app/assets/WorldTab-Dh69l7R3.js')
    )
  )
  // Firefox.
  assert.ok(staleChunk(new Error('error loading dynamically imported module')))
  // Safari.
  assert.ok(staleChunk(new Error('Importing a module script failed.')))
  // Webpack-flavoured, in case a dependency throws its own.
  assert.ok(staleChunk({ message: 'ChunkLoadError: Loading chunk 42 failed.' }))
})

test('and an ordinary crash is not', () => {
  // Prove the check can fail: a real render bug must still reach the screen
  // rather than being answered with a silent reload.
  assert.equal(staleChunk(new Error("Cannot read properties of undefined (reading 'map')")), false)
  assert.equal(staleChunk(new Error('trip is not defined')), false)
  assert.equal(staleChunk(undefined), false)
  assert.equal(staleChunk({}), false)
})
