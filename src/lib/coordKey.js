// A coordinate, rounded to something two fixes at the same spot agree on.
//
// Separate from placeCache.js, which talks to Supabase and therefore cannot
// be imported by a plain Node test — the same split the rest of this
// codebase uses to keep the arithmetic answerable without a browser.

/** About eleven metres — finer than the accuracy of the fix that produced
 *  the stop, so two stops that round together really were the same spot. */
export const PLACES = 4

export const round4 = (n) => Number(Number(n).toFixed(PLACES))

export const cacheKey = (lat, lon) => `${round4(lat)},${round4(lon)}`
