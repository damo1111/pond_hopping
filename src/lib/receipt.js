// Turning what a reader saw on a receipt into a line in Costs.
//
// The model is asked to read a photograph and report what is on it. It is
// not asked to decide anything: whether this is really a receipt, whether
// the number it found is plausible, which of this app's categories it
// belongs in, and what date to file it under are all decided here, where
// the rules are visible and can be argued with without an API key.
//
// The bias throughout is towards *not* creating a cost. A missed receipt
// costs somebody one manual entry. An invented one puts a number in a
// total that is meant to be trusted, and nobody audits a travel log.

import { CATEGORIES, isSupported, toAud } from './money.js'

/** Below this, the reader is guessing and we do not act on guesses. */
export const MIN_CONFIDENCE = 0.55

/** A dinner is not four thousand pounds. Anything above this is a misread
 *  decimal or a phone number, and it is filed as needing a look. */
export const IMPLAUSIBLE = 100000

// The reader answers in plain English; Costs has seven boxes, capitalised,
// and the database has a check constraint that refuses anything else. So
// "ristorante" has to come out the other side as exactly 'Food'.
const CATEGORY_WORDS = {
  Food: ['restaurant', 'ristorante', 'trattoria', 'cafe', 'café', 'coffee', 'bar', 'pub', 'dinner', 'lunch', 'breakfast', 'bakery', 'food', 'grocery', 'supermarket', 'izakaya', 'ramen', 'meal'],
  Flight: ['flight', 'airline', 'boarding', 'baggage fee', 'seat selection'],
  Transport: ['taxi', 'uber', 'grab', 'metro', 'subway', 'train', 'rail', 'bus', 'ferry', 'fuel', 'petrol', 'parking', 'toll', 'transfer', 'transport'],
  Hotel: ['hotel', 'hostel', 'inn', 'ryokan', 'guesthouse', 'airbnb', 'resort', 'lodge', 'accommodation', 'b&b'],
  Activity: ['museum', 'gallery', 'ticket', 'tour', 'entry', 'admission', 'onsen', 'spa', 'cinema', 'theatre', 'activity'],
  Shopping: ['shop', 'store', 'boutique', 'market', 'mall', 'pharmacy', 'duty free', 'souvenir', 'shopping'],
}

/** The reader's free-text guess, made to fit the seven the app sorts by. */
export function toCategory(raw, merchant = '') {
  const said = String(raw ?? '').trim()
  const exact = CATEGORIES.find((c) => c.toLowerCase() === said.toLowerCase())
  if (exact) return exact

  // Flight before Transport: "airport transfer" is transport, but an
  // airline receipt naming an airport is not.
  const haystack = `${said} ${String(merchant ?? '')}`.toLowerCase()
  for (const [category, words] of Object.entries(CATEGORY_WORDS))
    if (words.some((w) => haystack.includes(w))) return category

  return 'Other'
}

/** Three letters, uppercase, and one this app can actually hold.
 *
 *  A receipt that says "¥" has told us a symbol shared by two countries,
 *  which is not a currency. A receipt in Indian rupees has told us a real
 *  currency that the costs table's check constraint will refuse — so it is
 *  caught here, where it can be explained, rather than at the insert. */
export function toCurrency(raw) {
  const code = String(raw ?? '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return null
  return isSupported(code) ? code : null
}

/**
 * The number, from whatever the reader typed.
 *
 * Handles the two decimal conventions and the thousands separators that
 * come with them: "1.234,50" is twelve hundred, "1,234.50" is the same
 * number written by somebody else, and "1,234" is ambiguous — treated as
 * thousands, because a comma with exactly three digits after it almost
 * always is.
 */
export function toAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null

  let text = String(raw ?? '').replace(/[^\d.,-]/g, '')
  if (!text) return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal point; the other is grouping.
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
    else text = text.replace(/,/g, '')
  } else if (lastComma > -1) {
    const after = text.length - lastComma - 1
    text = after === 3 ? text.replace(/,/g, '') : text.replace(',', '.')
  }

  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? n : null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Which day this was spent.
 *
 * The receipt's own date wins when it is a real date near when the photo
 * was taken. When it disagrees wildly the photograph is believed instead:
 * a phone's clock is set by the network, and a misread "03/07" could be
 * either day of the month depending on which country printed it.
 */
export function toDate(printed, takenOn, tolerance = 3) {
  const shot = ISO.test(String(takenOn ?? '')) ? String(takenOn) : null
  const said = ISO.test(String(printed ?? '')) ? String(printed) : null
  if (!said) return shot
  if (!shot) return said
  return Math.abs(daysBetween(said, shot)) <= tolerance ? said : shot
}

function daysBetween(a, b) {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
}

/**
 * One reading → what to do about it.
 *
 * @param reading  what came back for this photo
 * @param photo    the row it was read from
 * @returns { verdict, cost, why }
 *   verdict 'cost'   — a cost row is ready, in `cost`
 *   verdict 'check'  — looks like a receipt, but something needs a human
 *   verdict 'photo'  — not a receipt; leave it in the reel
 */
export function readingToCost(reading = {}, photo = {}) {
  if (!reading?.is_receipt) return { verdict: 'photo', cost: null, why: 'not a receipt' }

  const confidence = Number(reading.confidence)
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE)
    return { verdict: 'photo', cost: null, why: 'not sure enough it is one' }

  const amount = toAmount(reading.total)
  const currency = toCurrency(reading.currency)
  const merchant = String(reading.merchant ?? '').trim()

  // Both of these are the whole point of the exercise. A cost with no
  // number, or a number in no particular currency, is not a cost.
  if (amount === null) return { verdict: 'check', cost: null, why: 'could not read the total' }
  if (!currency) return { verdict: 'check', cost: null, why: 'could not tell which currency' }
  if (amount > IMPLAUSIBLE) return { verdict: 'check', cost: null, why: 'that total looks wrong' }

  return {
    verdict: 'cost',
    why: null,
    cost: {
      trip_id: photo.trip_id ?? null,
      photo_id: photo.id ?? null,
      description: merchant || 'Receipt',
      amount,
      currency,
      // Every total in Costs sums this column and reads a missing one as
      // zero, so a receipt saved without it would be a line you can see
      // and a number it does not add up to.
      amount_aud: toAud(amount, currency),
      category: toCategory(reading.category, merchant),
      city: String(reading.city ?? photo.city ?? '').trim() || null,
      spent_on: toDate(reading.date, photo.taken_on),
    },
  }
}

/** What the whole scan came to, for the sentence at the top of the review. */
export function summarise(results = []) {
  const found = results.filter((r) => r.verdict === 'cost').length
  const check = results.filter((r) => r.verdict === 'check').length
  const looked = results.length
  return { looked, found, check }
}
