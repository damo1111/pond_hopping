import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closePicker, openPicker } from './showPicker.js'

test('on the web there is nothing to open and nothing to close', async () => {
  // The card's link is the way through there, and a tab somebody switched
  // back to is not ours to dismiss.
  const get = async () => null
  assert.equal(await openPicker('https://photos.google.com/picker', { get }), false)
  assert.equal(await closePicker({ get }), false)
})

test('in a wrapper it opens the picker itself, so it can be put away again', async () => {
  // Handed to Chrome, the picker ends on Google's own dead end — "Done!
  // Continue in the other app or device" — and stays there, because that page
  // has never heard of us.
  let opened = null
  let closed = false
  const get = async () => ({
    open: async ({ url }) => { opened = url },
    close: async () => { closed = true },
  })
  assert.equal(await openPicker('https://photos.google.com/picker', { get }), true)
  assert.equal(opened, 'https://photos.google.com/picker')
  assert.equal(await closePicker({ get }), true)
  assert.equal(closed, true)
})

test('a picker that will not open is reported, not thrown', async () => {
  // The link on the card still works; only the closing is lost.
  const get = async () => ({ open: async () => { throw new Error('no tab') }, close: async () => {} })
  assert.equal(await openPicker('https://x', { get }), false)
})

test('and closing one that has already gone is not an error', async () => {
  // Closed by hand, or never opened. Not worth a word.
  const get = async () => ({ open: async () => {}, close: async () => { throw new Error('gone') } })
  assert.equal(await closePicker({ get }), false)
})

test('no address, no sheet', async () => {
  let opened = false
  const get = async () => ({ open: async () => { opened = true }, close: async () => {} })
  assert.equal(await openPicker('', { get }), false)
  assert.equal(opened, false)
})
