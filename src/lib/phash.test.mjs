import { test } from 'node:test'
import assert from 'node:assert/strict'
import { H, SAME_PICTURE, W, dhash, greyscale, groupSame, hamming, pickKeeper, sameShot } from './phash.js'

// A gradient left to right: every pixel is brighter than the one to its
// right is false everywhere, so every bit is 0.
const gradient = () => Uint8Array.from({ length: W * H }, (_, i) => (i % W) * 28)
const reversed = () => Uint8Array.from({ length: W * H }, (_, i) => (W - 1 - (i % W)) * 28)

test('a hash is sixty-four bits written as sixteen hex characters', () => {
  const h = dhash(gradient())
  assert.equal(h.length, 16)
  assert.match(h, /^[0-9a-f]{16}$/)
})

test('the same picture hashes the same, every time', () => {
  assert.equal(dhash(gradient()), dhash(gradient()))
})

test('a picture and its opposite do not', () => {
  assert.notEqual(dhash(gradient()), dhash(reversed()))
  assert.equal(hamming(dhash(gradient()), dhash(reversed())), 64)
})

test('too little to hash returns nothing rather than a short answer', () => {
  assert.equal(dhash(new Uint8Array(10)), null)
  assert.equal(dhash(null), null)
})

test('a filter shifts brightness without reordering it', () => {
  // What a stylised copy actually does: everything lighter, contrast up.
  // Which pixel is brighter than its neighbour is unchanged, so the hash is.
  const base = gradient()
  const filtered = Uint8Array.from(base, (v) => Math.min(255, v * 1.4 + 20))
  assert.equal(dhash(base), dhash(filtered))
})

test('hamming counts disagreements, and refuses to compare nonsense', () => {
  assert.equal(hamming('0000000000000000', '0000000000000000'), 0)
  assert.equal(hamming('0000000000000001', '0000000000000000'), 1)
  assert.equal(hamming('ffffffffffffffff', '0000000000000000'), 64)
  assert.equal(hamming('abc', '0000000000000000'), Infinity)
  assert.equal(hamming(null, '0000000000000000'), Infinity)
})

test('greyscale weights the channels the way an eye does', () => {
  // Pure green reads much brighter than pure blue at the same value.
  const green = greyscale(new Uint8Array([0, 255, 0, 255]))[0]
  const blue = greyscale(new Uint8Array([0, 0, 255, 255]))[0]
  assert.ok(green > blue)
  assert.equal(greyscale(new Uint8Array([255, 255, 255, 255]))[0], 255)
  assert.equal(greyscale(new Uint8Array([0, 0, 0, 255]))[0], 0)
})

const p = (id, phash, extra = {}) => ({ id, phash, created_at: `2024-01-0${id}`, ...extra })

test('copies of one photograph come back as one group', () => {
  const groups = groupSame([
    p(1, '0000000000000000'),
    p(2, '0000000000000001'),
    p(3, 'ffffffffffffffff'),
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].map((x) => x.id), [1, 2])
})

test('different photographs are left alone', () => {
  assert.deepEqual(groupSame([p(1, '0000000000000000'), p(2, 'ffffffffffffffff')]), [])
  assert.deepEqual(groupSame([]), [])
})

test('a photograph nobody has hashed yet is not evidence of anything', () => {
  assert.deepEqual(groupSame([p(1, null), p(2, null), p(3, 'short')]), [])
})

test('no photograph appears in two groups', () => {
  const groups = groupSame([
    p(1, '0000000000000000'),
    p(2, '0000000000000001'),
    p(3, '0000000000000003'),
    p(4, 'ffffffffffffffff'),
    p(5, 'fffffffffffffffe'),
  ])
  const seen = groups.flat().map((x) => x.id)
  assert.equal(new Set(seen).size, seen.length)
})

test('the copy that still knows where it was taken is the one to keep', () => {
  // The whole point: a stylised export has lost its EXIF, so the copy with
  // a date and coordinates is both the original and the more useful one —
  // it can put itself on a map, and the other cannot.
  const stripped = p(1, '0000000000000000')
  const original = p(2, '0000000000000000', { lat: 41.9, lon: 12.5, taken_at: '2024-01-23T10:00:00Z' })
  assert.equal(pickKeeper([stripped, original]).id, 2)
  assert.equal(pickKeeper([original, stripped]).id, 2)
})

test('but never one you have chosen for the recap', () => {
  // Starring a photograph is a person saying "this one". That outranks
  // anything inferred from metadata.
  const starred = p(1, '0000000000000000', { is_highlight: true })
  const original = p(2, '0000000000000000', { lat: 41.9, lon: 12.5, taken_at: '2024-01-23T10:00:00Z' })
  assert.equal(pickKeeper([starred, original]).id, 1)
})

test('an even match falls to whichever arrived first', () => {
  assert.equal(pickKeeper([p(2, '0000000000000000'), p(1, '0000000000000000')]).id, 1)
})

test('the threshold is a real number of bits, not a fraction', () => {
  assert.ok(SAME_PICTURE > 0 && SAME_PICTURE < 64)
  assert.equal(W * H, 72)
})

// ── The same photograph twice, versus the same fountain twice ─────────────
//
// Measured on a real trip: of a hundred and three pictures, nothing at all
// was within twelve bits. Of the pairs between thirteen and eighteen,
// eleven were taken within ninety seconds and eleven were hours apart.

const shot = (id, phash, taken_at) => ({ id, phash, taken_at })

// Sixteen hex characters; these differ in a handful of bits.
const A = 'f0f0f0f0f0f0f0f0'
const NEAR = 'f0f0f0f0f0f0f0f3' // two bits away
const TEENS = 'f0f0f0f0f3f3ff3f' // fourteen bits — genuinely in the teens

test('a resave is the same photograph whenever it was taken', () => {
  const groups = groupSame([
    shot(1, A, '2024-01-23T12:00:00Z'),
    shot(2, NEAR, '2024-06-01T12:00:00Z'),
  ])
  assert.equal(groups.length, 1)
})

test('a burst is the same photograph, though it is further apart', () => {
  assert.equal(
    sameShot(shot(1, A, '2024-01-23T12:00:00Z'), shot(2, TEENS, '2024-01-23T12:00:04Z')),
    true
  )
})

test('the same scene on two afternoons is two photographs', () => {
  // The failure worth avoiding: offering to delete one of these.
  assert.equal(
    sameShot(shot(1, A, '2024-01-23T09:00:00Z'), shot(2, TEENS, '2024-01-23T16:00:00Z')),
    false
  )
})

test('without a time there is no evidence of a burst, so the tight test stands', () => {
  assert.equal(sameShot(shot(1, A, null), shot(2, TEENS, null)), false)
  assert.equal(sameShot(shot(1, A, null), shot(2, NEAR, null)), true)
})

test('too far apart is too far apart, however close in time', () => {
  assert.equal(
    sameShot(shot(1, A, '2024-01-23T12:00:00Z'), shot(2, '0f0f0f0f0f0f0f0f', '2024-01-23T12:00:01Z')),
    false
  )
})

test('a number still works where one used to be passed', () => {
  // groupSame(photos, 12) was the old shape and is called that way.
  assert.equal(groupSame([shot(1, A, null), shot(2, NEAR, null)], 12).length, 1)
})
