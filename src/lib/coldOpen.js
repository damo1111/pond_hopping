// The geometry the cold open is drawn from.
//
// Kept out of the component because it is arithmetic, not markup, and because
// getting it wrong is invisible in a screenshot and obvious in motion — three
// separate attempts at the arcs looked plausible written down and looked like
// tangled string on a phone. The rule that finally worked is testable, so it
// is tested rather than eyeballed.

/**
 * An arc between two points, bowing away from the chord.
 *
 * Every arc bows the SAME way — perpendicular to its own chord, always toward
 * the top of the frame, by a fixed fraction of its length. That is what an
 * airline route map looks like and it is why one reads instantly.
 *
 * The two attempts before this both pushed the control point radially out from
 * the globe's centre, which sounds right and is not: when an anchor sits near
 * the middle of the sphere that direction is tiny and unstable, so neighbouring
 * arcs bowed by wildly different amounts in unrelated directions. Consistency
 * is the whole effect.
 *
 * @param a    [x, y] start, in the 300-wide drawing space
 * @param b    [x, y] end
 * @param bow  how far off the chord, as a fraction of its length
 */
export function arcUp(a, b, bow = 0.24) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  let px = -dy / len
  let py = dx / len
  // Whichever normal points up-screen. Without this half the arcs bow under
  // the globe and the family stops reading as one thing.
  if (py > 0) {
    px = -px
    py = -py
  }
  const k = len * bow
  const cx = a[0] + dx / 2 + px * k
  const cy = a[1] + dy / 2 + py * k
  return `M${a[0]} ${a[1]} Q${round(cx)} ${round(cy)} ${b[0]} ${b[1]}`
}

const round = (n) => Math.round(n * 10) / 10

/** How long the whole thing runs, so the screen holding it agrees. */
export const COLD_OPEN_MS = 9600

/** Where the routes meet. One hub, so the map reads as a hub. */
export const HUB = [107, 175]

/** And where they go. */
export const SPOKES = [
  [71, 115],
  [133, 82],
  [197, 99],
  [230, 145],
  [176, 194],
]

/**
 * What each pin turns out to be holding.
 *
 * These land on cue with the line that names them — a photograph as "a photo
 * you already have" is said, footprints on "a walk your phone remembers", a
 * roof on "a booking in your inbox" — so the globe is answering the sentence
 * rather than decorating it, and the four seconds the drawing used to sit
 * still are the four seconds it now does its half of the talking.
 *
 * They accumulate rather than replacing one another. By the last frame the
 * globe is holding all three at once, which is the actual claim.
 */
export const MARKS = [
  { kind: 'photo', at: SPOKES[1], from: 4250 },
  { kind: 'walk', at: SPOKES[4], from: 5750 },
  { kind: 'stay', at: SPOKES[2], from: 7250 },
]

/**
 * Where the duck goes, and when.
 *
 * He does not land and then sit there. Each line of the sentence names a thing,
 * and he goes and finds it — arriving at the photograph as "a photo you already
 * have" is said, at the footprints on "a walk your phone remembers", at the roof
 * on "a booking in your inbox". The mark pops as he arrives, so it reads as him
 * turning something up rather than as an icon fading in beside him.
 *
 * Arriving just after each line rather than on it is deliberate: the word first,
 * then the thing. The other way round and the picture spoils its own caption.
 *
 * It also fixes the hole this all started from — the drawing used to finish at
 * 4.0s and hold still until the swell at 8.1s, four seconds of nothing moving
 * under text that was still talking.
 */
export const JOURNEY = [
  { to: SPOKES[3], arrive: 3600 }, // the long hop, flown
  { to: SPOKES[1], leave: 3800, arrive: 4300 },
  { to: SPOKES[4], leave: 5300, arrive: 5800 },
  { to: SPOKES[2], leave: 6800, arrive: 7300 },
]

/** When he sets off, and how long the whole journey lasts. */
export const JOURNEY_FROM = 2900
export const JOURNEY_MS = COLD_OPEN_MS - JOURNEY_FROM

/**
 * The journey as keyframes, built from the same geometry the arcs are.
 *
 * Handed to element.animate() rather than written into the stylesheet, because
 * the alternative is thirty hand-computed coordinates in CSS that silently stop
 * agreeing with this file the first time the globe is resized — which is exactly
 * what happened to the duck's flight path when the globe grew.
 */
export function duckFrames(from = LONG_HOP[0], journey = JOURNEY, start = JOURNEY_FROM, total = JOURNEY_MS) {
  const at = (ms) => Math.min(1, Math.max(0, (ms - start) / total))
  const frames = []
  let here = from
  let clock = start

  journey.forEach((leg, i) => {
    const leaves = leg.leave ?? clock
    // Standing still counts: without a frame at the moment he sets off, the
    // browser interpolates the whole pause into a slow drift.
    if (leaves > clock) frames.push({ offset: at(clock), transform: xy(here) })
    const pts = samplePath(here, leg.to, i === 0 ? 0.24 : 0.34, 6)
    pts.forEach((pt, j) => {
      frames.push({
        offset: at(leaves + ((leg.arrive - leaves) * j) / (pts.length - 1)),
        transform: xy(pt),
      })
    })
    here = leg.to
    clock = leg.arrive
  })

  frames.push({ offset: 1, transform: xy(here) })
  // Fades in over the first hop rather than appearing at full strength on a pin.
  frames[0].opacity = 0
  if (frames[1]) frames[1].opacity = 1
  return dedupe(frames)
}

const xy = ([x, y]) => `translate(${x}px, ${y}px)`

// Two frames at one offset is a hard error in Web Animations, and the pauses
// make them easy to produce by accident.
function dedupe(frames) {
  const out = []
  for (const f of frames) {
    if (out.length && Math.abs(out[out.length - 1].offset - f.offset) < 1e-6) out.pop()
    out.push(f)
  }
  return out
}

/** Each hop as a path, so a dotted trail can be drawn along it behind him. */
export function trails(from = LONG_HOP[0], journey = JOURNEY) {
  let here = from
  return journey.map((leg, i) => {
    const d = arcUp(here, leg.to, i === 0 ? 0.24 : 0.34)
    here = leg.to
    return { d, leave: leg.leave ?? 0, arrive: leg.arrive }
  })
}

/**
 * How many meridians sweep, and how long one turn takes.
 *
 * A wireframe globe cannot cheaply rotate, but it does not have to: a meridian
 * at longitude θ projects to an ellipse whose width is r·|cos θ|, so animating
 * the width of several evenly-spaced meridians *is* the rotation, exactly. Four
 * is enough to read as a turning sphere and cheap enough to be free — it is
 * four transforms on the compositor and nothing else.
 */
export const MERIDIANS = 4
export const TURN_MS = 10000

/**
 * Which pairs get a line.
 *
 * Five off the hub, plus one long hop between two spokes that goes right over
 * the top — that last one is the duck's flight path, and it is the only arc
 * that leaves the hub out of it, which is what stops the drawing being a fan.
 */
export const LEGS = [
  [HUB, SPOKES[1]],
  [HUB, SPOKES[0]],
  [HUB, SPOKES[2]],
  [HUB, SPOKES[4]],
  [HUB, SPOKES[3]],
  [SPOKES[0], SPOKES[3]],
]

/** The long hop, by name, because the duck has to fly exactly it. */
export const LONG_HOP = [SPOKES[0], SPOKES[3]]

/**
 * Points along a quadratic curve, for keyframing something along it.
 *
 * offset-path would say this in one line and is the one thing here an older
 * WebView might not have, so the duck is keyframed off sampled points instead
 * — the same trick the previous opening used for the same reason.
 */
export function samplePath(a, b, bow = 0.24, steps = 5) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  let px = -dy / len
  let py = dx / len
  if (py > 0) {
    px = -px
    py = -py
  }
  const k = len * bow
  const c = [a[0] + dx / 2 + px * k, a[1] + dy / 2 + py * k]
  const out = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([
      round(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]),
      round(u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]),
    ])
  }
  return out
}

/**
 * The heap of photographs, before it is pulled onto the globe.
 *
 * Written out rather than random so it composes the same way every launch and
 * so a screenshot of it means something. Each row is a start (above the frame),
 * a resting place in the pile, and the rotation at each.
 */
export const PILE = [
  [46, -62, -19, 104, 88, -15, 'a'],
  [142, -84, 8, 146, 74, 6, 'b'],
  [238, -66, 23, 190, 96, 18, 'c'],
  [74, -98, -28, 116, 120, -22, 'd'],
  [212, -90, 16, 176, 128, 13, 'e'],
  [112, -54, -7, 150, 102, -5, 'f'],
  [180, -74, 31, 162, 152, 25, 'g'],
  [86, -112, -14, 98, 148, -11, 'paper'],
  [160, -60, 21, 128, 136, 17, 'a'],
  [58, -80, 7, 184, 118, 6, 'c'],
  [224, -106, -22, 134, 108, -18, 'e'],
  [126, -94, 28, 170, 88, 22, 'paper'],
  [96, -68, -10, 110, 104, -8, 'f'],
  [192, -58, 13, 156, 122, 11, 'b'],
  [66, -90, 25, 192, 140, 20, 'd'],
  [248, -78, -17, 122, 160, -14, 'g'],
  [152, -120, 4, 180, 110, 3, 'a'],
  [104, -48, -25, 144, 166, -20, 'c'],
  [200, -118, 11, 96, 124, 9, 'f'],
  [78, -56, 18, 166, 110, 15, 'e'],
  [170, -102, -12, 138, 90, -10, 'd'],
  [132, -70, 29, 108, 138, 23, 'paper'],
]

/**
 * The pile was composed around a smaller globe than the one that shipped.
 *
 * Rescaling it here beats re-typing twenty-two hand-placed coordinates, and it
 * means the heap keeps landing exactly on the hub and spokes if the globe is
 * ever resized again — change GLOBE below and the pile follows.
 */
const DRAWN_FOR = { cx: 150, cy: 112, r: 52 }
export const GLOBE = { cx: 150, cy: 138, r: 86 }

export function regrow([x, y]) {
  const s = GLOBE.r / DRAWN_FOR.r
  return [round(GLOBE.cx + (x - DRAWN_FOR.cx) * s), round(GLOBE.cy + (y - DRAWN_FOR.cy) * s)]
}

/** Everything a chip could land on, in the order they are handed out. */
export const TARGETS = [HUB, ...SPOKES]

/**
 * The swell at the end, as a transform.
 *
 * Written translate-then-scale rather than with transform-origin because older
 * WebViews get transform-box wrong on SVG groups, and both wrappers are
 * WebViews. Scaling about (0,0) by s sends the globe's centre to (cx*s, cy*s);
 * the translate is exactly what puts it back.
 */
export function swellTo(scale, globe = GLOBE) {
  return {
    x: round(globe.cx - globe.cx * scale),
    y: round(globe.cy - globe.cy * scale),
    scale,
  }
}

