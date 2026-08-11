import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alreadyAsked, asAsked, confirmed, couldNotSay, howFar, needsLooking, stillAsking, stillOpen, storyRow, theirWords, whatItCosts, worthAsking } from './storyRun.js'
import { clockIn } from './localTime.js'

const pic = (id, over = {}) => ({
  id,
  url: `https://x.supabase.co/storage/v1/object/public/photos/${id}.jpg`,
  taken_at: '2024-01-23T12:16:30Z',
  lat: 41.89703,
  lon: 12.49475,
  ...over,
})

test('a photograph is looked at once, ever', () => {
  const photos = [pic('a'), pic('b', { seen: { what: 'a wall' }, seen_detail: 'low' })]
  assert.deepEqual(needsLooking(photos, 'low').map((p) => p.id), ['a'])
})

test('but the second pass may look again at what was only seen cheaply', () => {
  const photos = [
    pic('a', { seen: { what: 'an awning' }, seen_detail: 'low' }),
    pic('b', { seen: { what: 'a menu' }, seen_detail: 'high' }),
  ]
  assert.deepEqual(needsLooking(photos, 'high').map((p) => p.id), ['a'])
})

test('receipts are not part of anybody holiday', () => {
  assert.deepEqual(needsLooking([pic('r', { kind: 'receipt' })], 'low'), [])
})

test('the second pass asks for more pixels', () => {
  const low = asAsked(pic('a'), 'low')
  const high = asAsked(pic('a'), 'high')
  assert.ok(low.url.includes('width=512'))
  assert.ok(high.url.includes('width=1024'))
})

test('the time goes as text, in the trip own clock', () => {
  // A vision model never sees EXIF, so this is the only way it arrives.
  const asked = asAsked(pic('a'), 'low', 'Europe/Rome', clockIn)
  assert.equal(asked.at, '13:16')
  assert.equal(asked.lat, 41.89703)
})

test('what a run costs, said before it starts', () => {
  const photos = [pic('a'), pic('b'), pic('c', { seen: { what: 'x' }, seen_detail: 'low' })]
  const cost = whatItCosts(photos, 'low')
  assert.equal(cost.looking, 2)
  assert.equal(cost.already, 1)
  assert.equal(cost.calls, 1)
})

test('a question is asked once, and a no is remembered', () => {
  const qs = [
    { asks: 'Was your flight delayed?', answered_at: null },
    { asks: 'Did you eat here?', answer: 'no', answered_at: '2026-08-11T00:00:00Z' },
  ]
  assert.equal(stillAsking(qs).length, 1)
})

test('what they said in words is the evidence', () => {
  // These questions come back open — "What occupied the four-hour break?" —
  // so a sentence is the answer and yes/no answers nothing. A no is still
  // not evidence of the opposite, it is the absence of evidence, and
  // sending it back would invite the writer to argue with it.
  const qs = [
    { asks: 'What were you doing at Piazza Navona?', said: 'A pasta course at Eatalian Cooks', on_date: '2024-01-24' },
    { asks: 'delayed?', answer: 'yes', on_date: '2024-01-22' },
    { asks: 'ate here?', answer: 'no' },
    { asks: 'the four-hour gap?', answer: 'unsure' },
  ]
  assert.deepEqual(confirmed(qs), [
    { on_date: '2024-01-24', asked: 'What were you doing at Piazza Navona?', said: 'A pasta course at Eatalian Cooks' },
    { on_date: '2024-01-22', asked: 'delayed?', said: null },
  ])
})

test('and what they could not remember goes over too', () => {
  // The difference between a gap the writing admits and one it fills.
  const qs = [
    { asks: 'the four-hour gap?', answer: 'unsure', on_date: '2024-01-23' },
    { asks: 'answered one', said: 'the rooftop' },
  ]
  assert.deepEqual(couldNotSay(qs), [{ on_date: '2024-01-23', asked: 'the four-hour gap?' }])
})

test('their own words go over, and reconstructions never do', () => {
  const kept = theirWords([
    { entry_date: '2024-01-22', note: 'The Concorde Room.', built_from: null },
    { entry_date: '2024-01-23', note: 'Pieced together.', built_from: { photos: 4 } },
  ])
  assert.deepEqual(Object.keys(kept), ['2024-01-22'])
})

test('what comes back becomes one row, opening and closing kept', () => {
  const row = storyRow(
    { id: 't1' },
    { opening: 'Some trips feel long.', days: [{ date: '2024-01-22', title: 'To Rome', note: 'It began.' }], closing: 'Three days.' },
    { days: [] }
  )
  assert.equal(row.opening, 'Some trips feel long.')
  assert.equal(row.chapters.length, 1)
  assert.equal(row.closing, 'Three days.')
  assert.equal(row.voice, 'narrator')
})

test('the progress line names the work, not the pipeline stage', () => {
  // "Working out what happened" is the name of a function. It does not tell
  // anybody standing there waiting what is going on.
  assert.equal(howFar('looking', 40, 286), 'Reading your photographs — 40 of 286')
  assert.equal(howFar('working it out'), 'Retracing where you went')
  assert.equal(howFar('writing'), 'Writing your trip up')
})

// ── Not asking the same thing twice ───────────────────────────────────────
//
// These are the real questions, from four runs over the same four days in
// Rome. Twenty-one of them, none answered, because every re-run asked again.

test('the same question in different words is the same question', () => {
  const asked = [
    { on_date: '2024-01-22', asks: 'What was the flight over Scotland before you reached Heathrow?' },
  ]
  assert.equal(
    alreadyAsked(asked, {
      on_date: '2024-01-22',
      asks: 'What journey brought you over Scotland and into Heathrow before the Rome flight?',
    }),
    true
  )
})

test('and again, for the first evening near Santa Maria Maggiore', () => {
  const asked = [
    { on_date: '2024-01-22', asks: 'Did you spend the first Rome night near Santa Maria Maggiore?' },
  ]
  assert.equal(
    alreadyAsked(asked, {
      on_date: '2024-01-22',
      asks: 'Where were you staying or stopping that first evening near Santa Maria Maggiore?',
    }),
    true
  )
})

test('a different question on the same day is a different question', () => {
  const asked = [
    { on_date: '2024-01-23', asks: 'What filled the four hours between the run and the Forum?' },
  ]
  assert.equal(
    alreadyAsked(asked, {
      on_date: '2024-01-23',
      asks: 'What took you to the Tiber near the Foro Italico that morning?',
    }),
    false
  )
})

test('the same question about a different day is a new question', () => {
  const asked = [{ on_date: '2024-01-23', asks: 'What filled the long gap in the afternoon?' }]
  assert.equal(
    alreadyAsked(asked, { on_date: '2024-01-24', asks: 'What filled the long gap in the afternoon?' }),
    false
  )
})

test('an answered question is still an asked question', () => {
  // The whole point of remembering: they told us it was a pasta course, and
  // nobody should be asked what they were doing there ever again.
  const asked = [
    {
      on_date: '2024-01-24',
      asks: 'What were you doing near Piazza Navona for that final hour?',
      answered_at: '2026-08-11T00:00:00Z',
      said: 'A pasta-making course at Eatalian Cooks.',
    },
  ]
  assert.equal(
    alreadyAsked(asked, { on_date: '2024-01-24', asks: 'What occupied the final hour around Piazza Navona?' }),
    true
  )
})

test('nothing asked yet means nothing is a repeat', () => {
  assert.equal(alreadyAsked([], { on_date: '2024-01-22', asks: 'Anything at all?' }), false)
})

test('what is still open goes to the reconstruction so it stops repeating', () => {
  const qs = [
    { asks: 'Answered one', on_date: '2024-01-22', answered_at: '2026-08-11T00:00:00Z', said: 'yes it was' },
    { asks: 'Open one', on_date: '2024-01-23' },
  ]
  assert.deepEqual(stillOpen(qs), [{ on_date: '2024-01-23', asked: 'Open one' }])
})

test('the repeats already on the table are folded away, oldest wording kept', () => {
  const open = [
    { id: 1, on_date: '2024-01-22', asks: 'What was the flight over Scotland before you reached Heathrow?' },
    { id: 2, on_date: '2024-01-23', asks: 'What filled the four hours between the run and the Forum?' },
    { id: 3, on_date: '2024-01-22', asks: 'What journey brought you over Scotland and into Heathrow?' },
    { id: 4, on_date: '2024-01-23', asks: 'What did you do between finishing the run and reappearing at the Forum?' },
  ]
  assert.deepEqual(worthAsking(open).map((q) => q.id), [1, 2])
})

test('an answered question is not re-asked, and does not clutter the screen', () => {
  const qs = [
    { id: 1, asks: 'Where did you eat that evening?', on_date: '2024-01-22', answered_at: '2026-08-11T00:00:00Z', said: 'Roscioli' },
    { id: 2, asks: 'Where did you eat, later on that evening?', on_date: '2024-01-22' },
  ]
  // Only the open one reaches the screen...
  assert.deepEqual(worthAsking(qs).map((q) => q.id), [2])
  // ...and a third wording of it never gets filed at all.
  assert.equal(alreadyAsked(qs, { on_date: '2024-01-22', asks: 'Where did you eat on that first evening?' }), true)
})

test('what this cannot do, said plainly', () => {
  // Shared content words, not meaning. "Where did you eat?" and "Where did
  // you have dinner?" are the same question and this will not know it —
  // they have no word in common that carries any information. The
  // reconstruction being told what it has already asked is the real
  // defence; this is the net underneath it, and a net with holes in it
  // still catches the three-times-in-three-runs case it was built for.
  const asked = [{ on_date: '2024-01-22', asks: 'Where did you eat?' }]
  assert.equal(alreadyAsked(asked, { on_date: '2024-01-22', asks: 'Where did you have dinner?' }), false)
})
