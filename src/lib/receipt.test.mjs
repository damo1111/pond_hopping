import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES } from './money.js'
import {
  MIN_CONFIDENCE,
  readingToCost,
  summarise,
  toAmount,
  toCategory,
  toCurrency,
  toDate,
} from './receipt.js'

const photo = { id: 'p1', trip_id: 't1', taken_on: '2024-01-24', city: 'Rome' }
const good = { is_receipt: true, confidence: 0.9, merchant: 'Trattoria Luzzi', total: '38.50', currency: 'EUR', category: 'restaurant', date: '2024-01-24' }

test('a plain total reads as a number', () => {
  assert.equal(toAmount('38.50'), 38.5)
  assert.equal(toAmount(38.5), 38.5)
  assert.equal(toAmount('€38.50'), 38.5)
  assert.equal(toAmount(' 38.50 EUR'), 38.5)
})

test('both decimal conventions, and the separators that come with them', () => {
  // The same dinner, priced by two different countries' printers.
  assert.equal(toAmount('1.234,50'), 1234.5)
  assert.equal(toAmount('1,234.50'), 1234.5)
  // A comma with exactly three digits after it is thousands, not cents.
  assert.equal(toAmount('1,234'), 1234)
  // Two digits after it is not.
  assert.equal(toAmount('12,50'), 12.5)
})

test('nonsense is not a total', () => {
  assert.equal(toAmount(''), null)
  assert.equal(toAmount('N/A'), null)
  assert.equal(toAmount(0), null)
  assert.equal(toAmount(-5), null)
  assert.equal(toAmount(undefined), null)
})

test('a currency is three letters or it is nothing', () => {
  assert.equal(toCurrency('eur'), 'EUR')
  assert.equal(toCurrency(' jpy '), 'JPY')
  // ¥ is Japan and China both. A symbol is not an answer.
  assert.equal(toCurrency('¥'), null)
  assert.equal(toCurrency('€'), null)
  assert.equal(toCurrency('EUROS'), null)
  assert.equal(toCurrency(null), null)
})

test('and a currency this app cannot hold is caught here, not at the insert', () => {
  // costs.currency has a check constraint. A rupee receipt is a real
  // receipt in a real currency that the table will refuse — better to say
  // so in the review than to have the save fail with a Postgres error.
  assert.equal(toCurrency('INR'), null)
  assert.equal(toCurrency('VND'), null)
  assert.equal(toCurrency('AUD'), 'AUD')
})

test('the reader may answer freely; Costs has seven boxes, capitalised', () => {
  // These are the exact strings costs.category's check constraint allows.
  assert.equal(toCategory('Food'), 'Food')
  assert.equal(toCategory('food'), 'Food')
  assert.equal(toCategory('restaurant'), 'Food')
  assert.equal(toCategory('Ramen shop'), 'Food')
  assert.equal(toCategory('taxi'), 'Transport')
  assert.equal(toCategory('ryokan'), 'Hotel')
  assert.equal(toCategory('museum ticket'), 'Activity')
  assert.equal(toCategory('', 'Bar Luzzi'), 'Food')
  assert.equal(toCategory('something nobody has a box for'), 'Other')
})

test('every category it can produce is one the database will accept', () => {
  const said = ['food', 'restaurant', 'taxi', 'hotel', 'museum', 'shop', 'airline', 'nonsense', '', null]
  for (const s of said) assert.ok(CATEGORIES.includes(toCategory(s)), `${s} → ${toCategory(s)}`)
})

test('the printed date wins when it agrees with the photograph', () => {
  assert.equal(toDate('2024-01-24', '2024-01-24'), '2024-01-24')
  assert.equal(toDate('2024-01-23', '2024-01-24'), '2024-01-23')
})

test('and the photograph wins when the printed date is wild', () => {
  // "03/07" is the third of July or the seventh of March depending on who
  // printed it. The phone's clock came off the network.
  assert.equal(toDate('2024-07-03', '2024-03-07'), '2024-03-07')
  assert.equal(toDate('2019-01-01', '2024-01-24'), '2024-01-24')
})

test('a date only one side has is the date', () => {
  assert.equal(toDate(null, '2024-01-24'), '2024-01-24')
  assert.equal(toDate('2024-01-24', null), '2024-01-24')
  assert.equal(toDate('rubbish', '2024-01-24'), '2024-01-24')
  assert.equal(toDate(null, null), null)
})

test('a clean reading becomes a cost', () => {
  const { verdict, cost } = readingToCost(good, photo)
  assert.equal(verdict, 'cost')
  assert.deepEqual(cost, {
    trip_id: 't1',
    photo_id: 'p1',
    description: 'Trattoria Luzzi',
    amount: 38.5,
    currency: 'EUR',
    amount_aud: 67.54,
    category: 'Food',
    city: 'Rome',
    spent_on: '2024-01-24',
  })
})

test('a holiday photograph is left alone', () => {
  const { verdict, cost } = readingToCost({ is_receipt: false, confidence: 0.99 }, photo)
  assert.equal(verdict, 'photo')
  assert.equal(cost, null)
})

test('a hedged guess is not acted on', () => {
  // The bias is towards missing one rather than inventing one: a missed
  // receipt costs a manual entry, an invented one corrupts a total.
  const { verdict } = readingToCost({ ...good, confidence: MIN_CONFIDENCE - 0.01 }, photo)
  assert.equal(verdict, 'photo')
  assert.equal(readingToCost({ ...good, confidence: undefined }, photo).verdict, 'photo')
})

test('a receipt it could not finish reading is handed back, not guessed at', () => {
  assert.equal(readingToCost({ ...good, total: null }, photo).verdict, 'check')
  assert.equal(readingToCost({ ...good, currency: '¥' }, photo).verdict, 'check')
  assert.equal(readingToCost({ ...good, currency: 'INR' }, photo).verdict, 'check')
  assert.equal(readingToCost({ ...good, total: '4500000' }, photo).verdict, 'check')
})

test('a receipt with no merchant is still a cost', () => {
  // Thermal paper fades from the top down, which is where the name is.
  const { verdict, cost } = readingToCost({ ...good, merchant: '' }, photo)
  assert.equal(verdict, 'cost')
  assert.equal(cost.description, 'Receipt')
})

test('the summary counts what happened', () => {
  const results = [{ verdict: 'cost' }, { verdict: 'cost' }, { verdict: 'check' }, { verdict: 'photo' }]
  assert.deepEqual(summarise(results), { looked: 4, found: 2, check: 1 })
  assert.deepEqual(summarise([]), { looked: 0, found: 0, check: 0 })
})

test('the AUD figure is filled in, because every total sums it', () => {
  // A cost with a null amount_aud is a line you can see and a number the
  // page does not add up to.
  const { cost } = readingToCost({ ...good, total: '95', currency: 'JPY' }, photo)
  assert.equal(cost.amount_aud, 1)
  assert.equal(readingToCost({ ...good, total: '10', currency: 'AUD' }, photo).cost.amount_aud, 10)
})
