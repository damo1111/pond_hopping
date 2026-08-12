import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEPS, visibleSteps } from './demoTour.js'

// A stand-in for the document, matching by class in DOM order — which is the
// whole of the bug this file exists for. querySelector returns the *first*
// match, and on Home the first `.wt-card` is the "Add a trip" tile.
const docWith = (elements) => ({
  querySelector: (sel) => {
    const want = sel.replace(/^\./, '')
    return elements.find((el) => el.classes.includes(want)) ?? null
  },
})

const HOME = [
  { name: 'Add a trip', classes: ['wt-card', 'wt-card--add'] },
  { name: 'Rome (the example)', classes: ['wt-card', 'wt-card--demo', 'wt-card--sashed'] },
  { name: 'the globe', classes: ['globe-shift'] },
  { name: 'Plan, in the nav', classes: ['navitem-plan'] },
]

test('the step about the example trip points at the example trip', () => {
  const step = STEPS.find((s) => s.id === 'welcome')
  const hit = docWith(HOME).querySelector(step.anchor)
  assert.equal(hit.name, 'Rome (the example)')
  // The bug, stated so it cannot come back: this selector matches the add
  // tile first, and for eleven weeks that is what got the ring round it.
  assert.notEqual(docWith(HOME).querySelector('.wt-card').name, 'Rome (the example)')
})

test('no step is anchored on a class that several things share', () => {
  // `.wt-card` is on every card in the rail; `.navitem-plan` and
  // `.globe-shift` are on exactly one thing each. A step anchored on the
  // first kind is a coin toss decided by DOM order.
  const shared = ['wt-card']
  for (const step of STEPS) {
    assert.ok(
      !shared.includes(step.anchor.replace(/^\./, '')),
      `${step.id} is anchored on ${step.anchor}, which more than one element has`
    )
  }
})

test('a step whose anchor is not on screen is dropped, not pointed anywhere', () => {
  // The demo card has not rendered yet — a fetch is still out.
  const early = docWith(HOME.filter((el) => !el.classes.includes('wt-card--demo')))
  const shown = visibleSteps(early)
  assert.equal(shown.some((s) => s.id === 'welcome'), false)
  // And the rest still run, so a slow card costs one step rather than the tour.
  assert.equal(shown.length, STEPS.length - 1)
})
