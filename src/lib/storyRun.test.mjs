import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alreadyAsked, asAsked, daysAdded, spliceChapters, widerThanADay, confirmed, couldNotSay, howFar, needsLooking, stillAsking, stillOpen, storyRow, theirWords, likeness, SAME_ENOUGH, whatItCosts, worthAsking } from './storyRun.js'
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

test('the cheap pass takes the stored thumbnail, and asks for no render', () => {
  // The transform endpoint counts a distinct origin image per month, and the
  // account reached 600% of the allowance — at which point every transformed
  // URL in the app stops resolving at once. The 400px file is already there.
  const low = asAsked({ id: 'p', url: 'https://s/photos/t/a.webp', thumb_url: 'https://s/photos/t/a-thumb.webp' }, 'low')
  assert.equal(low.url, 'https://s/photos/t/a-thumb.webp')
  assert.ok(!low.url.includes('/render/image/'))
})

test('and the pass that has to read something takes the display copy', () => {
  // 2048px, which is more than the 1024 this used to ask to be rendered.
  const high = asAsked({ id: 'p', url: 'https://s/photos/t/a.webp', thumb_url: 'https://s/photos/t/a-thumb.webp' }, 'high')
  assert.equal(high.url, 'https://s/photos/t/a.webp')
  assert.ok(!high.url.includes('/render/image/'))
})

test('a photograph with no stored thumbnail falls back to the display copy', () => {
  // Four of nine hundred and sixty-one. A render would be the one thing that
  // cannot be afforded, and the display copy is right there.
  const asked = asAsked({ id: 'p', url: 'https://s/photos/t/a.webp' }, 'low')
  assert.equal(asked.url, 'https://s/photos/t/a.webp')
  assert.ok(!asked.url.includes('/render/image/'))
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

// The fifteen questions four runs actually left on the Rome trip. The
// threshold is set from these, so they are the test.
const ROME = [
  ['2024-01-23', 'How did you travel during the early-morning sequence between the Colosseum, the Tiber, the northern river and Via Nazionale?'],
  ['2024-01-22', 'Where did you stay on the first night near Santa Maria Maggiore?'],
  ['2024-01-25', 'What happened on the final day of the trip?'],
  ['2024-01-22', 'Did you spend the first Rome night near Santa Maria Maggiore and then move to H10 Palazzo Galla on 23 January?'],
  ['2024-01-23', 'What took you to the Tiber near the Foro Italico that morning, and how did you travel there and back?'],
  ['2024-01-25', 'How did the Rome trip end on 25 January?'],
  ['2024-01-22', 'Where did the trip begin, and were the photographs over Scotland and at Heathrow from two connecting flights?'],
  ['2024-01-22', 'Did you spend the first Rome night near Santa Maria Maggiore before moving to H10 Palazzo Galla?'],
  ['2024-01-25', 'What happened on the final listed day of the trip?'],
  ['2024-01-22', 'What journey brought you over Scotland and into Heathrow before the Rome flight?'],
  ['2024-01-22', 'What was the place overlooking Santa Maria Maggiore where you had wine, and where did you stay that first night?'],
  ['2024-01-23', 'What did you do between finishing the morning run and reappearing in Monti after 13:00?'],
  ['2024-01-22', 'What was the flight over Scotland before you reached Heathrow, and where had that travel day begun?'],
  ['2024-01-22', 'Where were you staying or stopping that first evening near Santa Maria Maggiore, and what led to the move to H10 Palazzo Galla the next day?'],
  ['2024-01-23', 'What filled the four hours between the end of the morning run and the first midday street photographs?'],
].map(([on_date, asks], i) => ({ id: i + 1, on_date, asks }))

test('fifteen questions about four days come down to five', () => {
  const keep = worthAsking(ROME)
  assert.deepEqual(
    keep.map((q) => q.asks),
    [
      'How did you travel during the early-morning sequence between the Colosseum, the Tiber, the northern river and Via Nazionale?',
      'Where did you stay on the first night near Santa Maria Maggiore?',
      'What happened on the final day of the trip?',
      'Where did the trip begin, and were the photographs over Scotland and at Heathrow from two connecting flights?',
      'What did you do between finishing the morning run and reappearing in Monti after 13:00?',
    ]
  )
})

test('a light stem is what gets the Scotland pair over the line', () => {
  // "flight"/"flights" and "connecting"/"connect" are one word each; without
  // that these two score 0.29 and both reach the screen.
  assert.ok(likeness(ROME[6].asks, ROME[12].asks) >= SAME_ENOUGH)
})

test('and the four days each keep the questions that differ', () => {
  // The morning of the 23rd genuinely holds two: how they got around, and
  // the four-hour hole after the run. Folding those together would lose one.
  const same = (a, b) => likeness(ROME[a].asks, ROME[b].asks)
  // The duplicates, all above the line.
  assert.ok(same(2, 5) >= SAME_ENOUGH, `final day vs trip end: ${same(2, 5)}`)
  assert.ok(same(6, 9) >= SAME_ENOUGH, `trip begin vs Scotland: ${same(6, 9)}`)
  assert.ok(same(11, 14) >= SAME_ENOUGH, `after the run, twice: ${same(11, 14)}`)
  // And the nearest thing to a false positive, comfortably below it.
  assert.ok(same(4, 11) < SAME_ENOUGH, `Tiber vs after-the-run: ${same(4, 11)}`)
  assert.ok(same(0, 14) < SAME_ENOUGH, `getting around vs the gap: ${same(0, 14)}`)
})

// ── One photograph changes one day ────────────────────────────────────────

test('a photograph added later marks only its own day', () => {
  const story = { updated_at: '2026-08-11T04:00:00Z' }
  const photos = [
    { created_at: '2026-08-10T00:00:00Z', taken_on: '2024-01-22' },
    { created_at: '2026-08-11T05:00:00Z', taken_on: '2024-01-24' },
    { created_at: '2026-08-11T05:01:00Z', taken_on: '2024-01-24' },
  ]
  assert.deepEqual(daysAdded(photos, story), ['2024-01-24'])
})

test('nothing to do when the story is newer than everything', () => {
  const story = { updated_at: '2026-08-11T06:00:00Z' }
  assert.deepEqual(daysAdded([{ created_at: '2026-08-11T05:00:00Z', taken_on: '2024-01-24' }], story), [])
  assert.deepEqual(daysAdded([{ created_at: '2026-08-11T05:00:00Z' }], null), [])
})

test('only the rewritten day is replaced', () => {
  const existing = [
    { date: '2024-01-22', title: 'Arrival', note: 'the first day, as written' },
    { date: '2024-01-23', title: 'The river', note: 'the second day, as written' },
  ]
  const out = spliceChapters(existing, [{ date: '2024-01-23', title: 'The river again', note: 'rewritten' }])
  assert.equal(out[0].note, 'the first day, as written')
  assert.equal(out[1].note, 'rewritten')
  assert.equal(out[1].title, 'The river again')
})

test('a day the story never had is added, in its place in the order', () => {
  const existing = [{ date: '2024-01-22', title: 'Arrival', note: 'day one' }]
  const out = spliceChapters(existing, [{ date: '2024-01-21', title: 'The night before', note: 'new day' }])
  assert.deepEqual(out.map((c) => c.date), ['2024-01-21', '2024-01-22'])
})

test('a day that came back empty keeps what it had', () => {
  // A model that returns nothing for a day must never be able to erase one.
  const existing = [{ date: '2024-01-22', title: 'Arrival', note: 'day one' }]
  assert.deepEqual(spliceChapters(existing, [{ date: '2024-01-22', note: '' }]), existing)
  assert.deepEqual(spliceChapters(existing, []), existing)
})

test('one more picture of a fountain does not change what the trip was about', () => {
  const before = { patterns: ['early mornings', 'walks over transport'], returned_to: ['Piazza Venezia'], attention: ['domes'] }
  const after = { patterns: ['walks over transport', 'early mornings'], returned_to: ['Piazza Venezia'], attention: ['domes'] }
  // Same findings, different order. Not a reason to rewrite eleven chapters.
  assert.equal(widerThanADay(before, after), false)
})

test('a new thread means the chapters that lean on it are stale', () => {
  const before = { patterns: ['early mornings'], returned_to: ['Piazza Venezia'], attention: [] }
  const after = { patterns: ['early mornings'], returned_to: ['Piazza Venezia', 'Piazza Navona'], attention: [] }
  assert.equal(widerThanADay(before, after), true)
})

test('with nothing to compare against, rewrite the trip', () => {
  // A story from before the reconstruction was kept has no `before`. Better
  // to spend the call than to splice a day into something unknown.
  assert.equal(widerThanADay(null, { patterns: [] }), true)
  assert.equal(widerThanADay({ patterns: [] }, null), true)
})
