// Sizes we already have, instead of sizes we ask to be made.
//
// ── What was happening ────────────────────────────────────────────────────
//
// Supabase Storage will render a resized copy of an object on request, and
// this file built those URLs. The Pro plan counts *origin images* — distinct
// source files transformed — and the account reached 600% of the allowance,
// at which point every transformed URL in the app stops resolving at once:
// covers, grids, heroes, the map. Not a slow degradation. A screen of broken
// images, everywhere, on a plan that is paid up.
//
// ── Why it was never needed ───────────────────────────────────────────────
//
// Every photograph here is already stored twice, by the upload path and by
// the Google Photos worker alike — see photoResize.js:
//
//   url        DISPLAY, 2048px on the long edge, quality 0.82
//   thumb_url  THUMB,    400px on the long edge, quality 0.78
//
// 957 of 961 rows have both. So the transform endpoint was being asked to
// resize images that were already the right size — a 2048px display copy
// re-rendered to 700px for a card, while a 400px thumbnail of the same
// photograph sat in the same bucket, free.
//
// Most callers already knew this and wrote `p.thumb_url || thumb(p.url)`.
// The fallback was the expensive half, and it was reached constantly by the
// places that had no row to read a thumb from — covers, above all.
//
// ── What this does now ────────────────────────────────────────────────────
//
// Nothing, to anything Supabase hosts. The requested width is ignored and
// the stored file is returned untouched, because there is nothing to gain by
// rendering a copy of a file that is already small. Callers keep their
// sizes: they are the honest record of what each place wants, they still
// drive CSS and layout, and they choose between `thumb_url` and `url`
// upstream where the real decision is.
//
// Google's own CDN keeps its resizing. `=w###-h###-c` on an lh3 URL is
// Google's to serve and costs us nothing.
//
// ── The trade, stated ─────────────────────────────────────────────────────
//
// A trip cover is now the 2048px display copy rather than a 700px render, so
// it is a larger download on the World tab. That is bandwidth: metered
// generously, and it degrades gently. The other was a quota that stops dead
// and takes every image in the app with it. There is no version of this
// where a paid allowance sitting at 600% is the better problem to keep.

/** Anything Supabase hosts for us, and therefore anything already sized. */
const ours = (url) => String(url).includes('/storage/v1/object/public/')

/**
 * Deliberately a no-op for our own storage.
 *
 * The signature stays so that twenty-two call sites do not have to change,
 * and so the sizes they ask for remain written down where somebody can read
 * what each place actually wants.
 */
export function thumb(url) {
  return url
}

/**
 * A trip cover, from wherever it came.
 *
 * Two sources: an uploaded photograph in our own bucket, or a scraped Google
 * Photos album image on lh3.googleusercontent.com. Only the second is worth
 * resizing, because only the second is resized by somebody who does it for
 * nothing.
 */
export function coverUrl(url, { width = 800, height = 450 } = {}) {
  if (!url) return url
  if (ours(url)) return url
  if (url.includes('googleusercontent.com')) return `${url}=w${width}-h${height}-c`
  return url
}
