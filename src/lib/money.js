// The currencies this app can hold, and what they are worth.
//
// This list was written out twice — once in CostsTab and once in the
// database's check constraint — and the last time they drifted apart a
// Thai baht divided by an undefined rate and stored NaN. It is now written
// once here, and anything that makes a cost imports it, so a currency the
// database will refuse can be refused before the insert rather than after.
//
// Static rates, converted at entry time, per the original brief: a travel
// log records what a thing cost you on the day, not what the number would
// be worth if you looked again next year.

export const CURRENCIES = ['AUD', 'EUR', 'GBP', 'USD', 'JPY', 'CNY', 'HKD', 'KRW', 'SGD', 'THB', 'MYR', 'NZD', 'LKR']

/** Units per 1 AUD. */
export const RATES = { AUD: 1, EUR: 0.57, GBP: 0.52, USD: 0.66, JPY: 95, CNY: 4.7, HKD: 5.15, KRW: 905, SGD: 0.85, THB: 21.5, MYR: 2.8, NZD: 1.09, LKR: 197 }

/** The seven boxes Costs sorts spending into. Capitalised, as stored. */
export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Hotel', 'Activity', 'Flight', 'Other']

export function isSupported(code) {
  return CURRENCIES.includes(code)
}

/**
 * What it comes to in Australian dollars.
 *
 * Every total in the app sums `amount_aud` and treats a missing one as
 * zero, so a cost saved without this is not merely incomplete — it is
 * silently absent from the number it should be part of.
 */
export function toAud(amount, currency) {
  const rate = RATES[currency]
  if (!rate || !Number.isFinite(amount)) return null
  return +(amount / rate).toFixed(2)
}
