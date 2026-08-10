import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENES, sceneFor } from './drawnScene.js'

test('a trip always gets the same picture', () => {
  // The point of hashing rather than randomising: a card must not change
  // what it looks like between one render and the next.
  assert.equal(sceneFor('hk-south-korea'), sceneFor('hk-south-korea'))
  assert.equal(sceneFor('trip-from-10-aug'), sceneFor('trip-from-10-aug'))
})

test('every slug lands on a real scene', () => {
  for (const slug of ['a', 'hk-south-korea', 'lisbon-porto', 'rome', '2024-gap-year', '中国'])
    assert.ok(SCENES.includes(sceneFor(slug)))
})

test('nothing to go on still draws something', () => {
  assert.ok(SCENES.includes(sceneFor('')))
  assert.ok(SCENES.includes(sceneFor(null)))
  assert.ok(SCENES.includes(sceneFor(undefined)))
})

test('neighbouring trips do not all come out the same', () => {
  const slugs = ['hk-south-korea', 'trip-from-10-aug', 'lisbon-porto', 'rome', 'china-japan', 'nz-status-run']
  assert.ok(new Set(slugs.map(sceneFor)).size > 1)
})
