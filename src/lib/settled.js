// A call that never comes back must not be able to strand the screen that is
// waiting for it.
//
// The case this was written for: the permission prompt for background
// location is answered through a CoreLocation delegate callback, and there
// are states where that callback simply never arrives — a dialog dismissed
// rather than answered, a request iOS quietly declines to show. The button
// that asked then sits on "one sec…" forever. Consent recorded, switch
// flipped, label stuck, and no way back but restarting the app.
//
// Nothing here can make a hung call finish. It stops it being permanent: the
// caller gets `undefined`, treats that as "no answer", and goes back to
// rendering the state it can actually see.
//
// Kept free of imports so it can be tested without a bundler, which is the
// whole reason it does not live in visits.js.
export function settled(promise, ms) {
  let timer
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

// Long, because on the far side of this is a person reading a dialog. Short
// enough that a prompt which never appeared does not hold the screen for the
// rest of the session.
export const ASK_MS = 60000

// Everything else is the app talking to itself and should be instant.
export const CALL_MS = 10000
