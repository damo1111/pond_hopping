// Nothing waits forever.
//
// Uploading 262 photographs is a loop of two awaits — decode and shrink, then
// send — and neither of them can fail to *finish*. They can only fail to
// return. A canvas that never decodes, a fetch on a connection that has gone
// away without closing, a tab that has run out of room for one more bitmap:
// none of those throw. The promise simply never settles, and a sequential
// loop stops on the spot.
//
// Which is what somebody saw at "Uploading 198 of 262": a progress bar frozen
// mid-run, with 64 photographs behind it that were never going to be tried,
// and no error anywhere because nothing had gone wrong in a way JavaScript
// recognises.
//
// A `catch` does not help here. The only thing that helps is agreeing in
// advance how long is too long.

/** Thrown rather than returned, so a caller's existing catch already covers it. */
export class TookTooLong extends Error {
  constructor(what, ms) {
    super(`${what} did not finish inside ${Math.round(ms / 1000)}s`)
    this.name = 'TookTooLong'
    this.what = what
    this.ms = ms
  }
}

/**
 * @param work  a promise, or a function returning one
 * @param ms    how long is too long
 * @param what  what to call it in the error
 *
 * The abandoned work is not cancelled — it cannot be; a fetch that has stopped
 * answering has no handle to pull. It is left to finish or not on its own, and
 * if it does finish afterwards, whatever it was doing still happened. For an
 * upload that means a photograph that arrives without being counted, which is
 * a much smaller problem than sixty-four that never arrive at all.
 */
export function withDeadline(work, ms, what = 'that') {
  const p = typeof work === 'function' ? work() : work
  if (!(ms > 0)) return Promise.resolve(p)

  let timer
  return Promise.race([
    Promise.resolve(p),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TookTooLong(what, ms)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * A photograph's whole journey: read, shrink, upload, record.
 *
 * Generous on purpose. The display copy of a photo is a couple of hundred
 * kilobytes, so this is minutes of headroom on hotel wifi — it is not there
 * to catch slowness, only to catch never.
 */
export const ONE_PHOTO_MS = 90_000
