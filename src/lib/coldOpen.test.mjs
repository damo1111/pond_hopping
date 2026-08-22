import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GLOBE,
  JOURNEY,
  LEGS,
  PER_LEG,
  PILE,
  TARGETS,
  WALK,
  arcUp,
  droppings,
  duckFrames,
  regrow,
  samplePath,
  swellTo,
} from './coldOpen.js'

// The control point of `M a Q c b` — the whole thing this file exists to get right.
const control = (d) => d.match(/Q([\d.-]+) ([\d.-]+)/).slice(1, 3).map(Number)

test('every arc bows the same way — up-screen, never down', () => {
  // Prove the check can fail: without the normal-flipping, an arc drawn
  // right-to-left bows under the globe and the family stops reading as one
  // set of routes. Both directions of the same pair must bow to the same side.
  for (const [a, b] of LEGS) {
    const [, cy] = control(arcUp(a, b))
    const mid = (a[1] + b[1]) / 2
    assert.ok(cy < mid, `arc ${JSON.stringify(a)}→${JSON.stringify(b)} bows downward`)
  }
})

test('and bows the same way whichever end you start from', () => {
  const a = [89, 112]
  const b = [211, 135]
  assert.deepEqual(control(arcUp(a, b)), control(arcUp(b, a)))
})

test('a longer hop bows further than a short one', () => {
  // Fixed lift was the other way this could have been written, and it makes
  // long hops look flat next to short ones.
  const short = control(arcUp([140, 130], [160, 130]))
  const long = control(arcUp([90, 130], [210, 130]))
  assert.ok(130 - long[1] > 130 - short[1])
})

test('a zero-length leg does not divide by zero', () => {
  assert.doesNotThrow(() => arcUp([100, 100], [100, 100]))
})

test('the sampled flight path starts and ends on its own arc', () => {
  const a = [89, 112]
  const b = [211, 135]
  const pts = samplePath(a, b)
  assert.deepEqual(pts[0], a)
  assert.deepEqual(pts[pts.length - 1], b)
  assert.equal(pts.length, 6)
})

test('and every sampled point lifts above the straight line between the ends', () => {
  const pts = samplePath([89, 112], [211, 135])
  for (const [x, y] of pts.slice(1, -1)) {
    const t = (x - 89) / (211 - 89)
    assert.ok(y < 112 + t * (135 - 112), `point ${x},${y} sags below the chord`)
  }
})

test('the pile is rescaled onto whatever size the globe actually is', () => {
  // The heap was composed against a 52px globe and ships against a 66px one.
  // Its centre must move with the globe's, or the photographs land beside it.
  assert.deepEqual(regrow([150, 112]), [GLOBE.cx, GLOBE.cy])
  const [, y] = regrow([150, 60])
  assert.ok(y < GLOBE.cy, 'a point above the old centre stays above the new one')
})

test('every chip has somewhere real to land', () => {
  PILE.forEach((row, i) => {
    assert.equal(row.length, 7, `pile row ${i} is malformed`)
    assert.ok(TARGETS[i % TARGETS.length], `chip ${i} has no target`)
  })
})

test('the swell keeps the globe centred while it grows', () => {
  const { x, y, scale } = swellTo(1.62)
  // Where the centre ends up after translate-then-scale.
  assert.ok(Math.abs(x + GLOBE.cx * scale - GLOBE.cx) < 0.2)
  assert.ok(Math.abs(y + GLOBE.cy * scale - GLOBE.cy) < 0.2)
})

test('and a swell of 1 moves nothing at all', () => {
  assert.deepEqual(swellTo(1), { x: 0, y: 0, scale: 1 })
})

test('he drops one kind of thing per line, in the order they are said', () => {
  const kinds = droppings().map((d) => d.kind)
  assert.deepEqual(
    [...new Set(kinds)],
    WALK.map((w) => w.kind),
    'the trail must follow the sentence, not some other order'
  )
  assert.equal(kinds.length, WALK.length * PER_LEG)
})

test('and every one of them lands while its own line is on screen', () => {
  // The whole point: the footsteps are the thing the words are naming. A mark
  // arriving after its line has gone is illustrating the wrong sentence.
  const byKind = Object.fromEntries(WALK.map((w) => [w.kind, w]))
  for (const d of droppings()) {
    const leg = byKind[d.kind]
    assert.ok(d.when > leg.from && d.when <= leg.until, `${d.kind} at ${d.when} is outside its line`)
  }
})

test('the marks sit on the path the duck actually walks', () => {
  // Worked out separately these drift apart and the trail runs beside the bird
  // instead of behind it. Both come off samplePath with the same bow.
  const drops = droppings()
  const last = drops[drops.length - 1]
  assert.deepEqual(last.at, JOURNEY[JOURNEY.length - 1].to)
})

test('the duck never stands still while there are words on screen', () => {
  // The fault this replaced: 500ms hops with a second of nothing between them,
  // which read as a bird on speed and left the picture dead for four seconds.
  JOURNEY.slice(1).forEach((leg, i) => {
    assert.equal(leg.leave, JOURNEY[i].arrive, 'a gap opened up between two legs')
    assert.ok(leg.arrive - leg.leave >= 1200, 'that leg is too quick to read')
  })
})

test('his keyframes stay in order and end where the journey does', () => {
  const frames = duckFrames()
  frames.forEach((f, i) => {
    if (i) assert.ok(f.offset >= frames[i - 1].offset, 'offsets went backwards')
    assert.ok(f.offset >= 0 && f.offset <= 1)
  })
  const [x, y] = JOURNEY[JOURNEY.length - 1].to
  assert.equal(frames[frames.length - 1].transform, `translate(${x}px, ${y}px)`)
})
