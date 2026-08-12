// A code has been sent and not yet used.
//
// The sign-in flow is two steps — address, then the code that arrives by
// email — and the second step lived entirely in component state. Which means
// the step was lost by exactly the thing the flow requires you to do: leave
// the app, open your mail, find the code. Come back and the sheet has
// forgotten there is a code at all, offers to send one, and the code you are
// holding is now the *previous* code and no longer works.
//
// So the fact that a code is outstanding is written down. Not the code —
// that is in the email, where it belongs, and writing it here would put a
// live credential in localStorage for the sake of saving one paste.
//
// Kept deliberately small and pure so the rules can be tested without a
// browser: two callers use it (the sheet and the Account tab) and they must
// agree, or signing in from one place and returning to the other is the same
// bug again.

const KEY = 'pond:code_sent'

/**
 * How long the written-down step is trusted.
 *
 * Supabase expires an email OTP after an hour by default. This is a little
 * under that, so the app never confidently shows a code box for a code that
 * cannot possibly work any more. Erring short is the safe direction: too
 * short and somebody is offered a fresh code they didn't need; too long and
 * they type a dead code and are told it is wrong, which reads as the app
 * being broken rather than the code being old.
 */
export const CODE_GOOD_FOR_MS = 55 * 60 * 1000

/**
 * How long before offering to send another one.
 *
 * Supabase refuses a second OTP inside a minute, so a button that can be
 * pressed immediately is a button that mostly returns an error. Worse than
 * that: every code that *is* sent invalidates the one before it. Somebody
 * who taps resend three times while waiting ends up holding three emails of
 * which only the last works — and the natural thing to do is type the first
 * one that arrived. That is a slow code turning into a wrong code.
 *
 * So the offer waits, and says how long it is waiting for.
 */
export const RESEND_AFTER_MS = 60 * 1000

/** Milliseconds until another code can be asked for; 0 once it can. */
export function resendIn(at, now = Date.now()) {
  if (!Number.isFinite(at)) return 0
  return Math.max(0, RESEND_AFTER_MS - (now - at))
}

const box = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Private browsing with storage switched off. Every function here then
    // no-ops, and the flow behaves exactly as it did before this file.
    return null
  }
}

/** A code has just gone out to this address. */
export function remember(email, store = box(), now = Date.now()) {
  if (!store || !email) return
  try {
    store.setItem(KEY, JSON.stringify({ email, at: now }))
  } catch {
    /* storage full, or refusing; the flow still works, just not across a trip
       to the mail app */
  }
}

/**
 * The address a code is outstanding for, or null.
 *
 * Anything unreadable, mis-shaped or stale is treated as nothing outstanding
 * and cleared, because a half-remembered step is worse than none: it would
 * put somebody on a code screen with no idea which address to look in.
 */
export function waiting(store = box(), now = Date.now()) {
  if (!store) return null
  let raw = null
  try {
    raw = store.getItem(KEY)
  } catch {
    return null
  }
  if (raw == null) return null

  // From here on there is *something* written down, so every way out that
  // isn't "here is the address" clears it. Leaving unreadable junk behind
  // means re-parsing it on every launch for the rest of the install.
  let saved
  try {
    saved = JSON.parse(raw)
  } catch {
    forget(store)
    return null
  }
  if (!saved || typeof saved.email !== 'string' || !saved.email) {
    forget(store)
    return null
  }
  // A clock that has gone backwards — a phone crossing a timezone the wrong
  // way, or a device whose time was wrong and has just been corrected —
  // should not make a fresh code look ancient. Only elapsed time counts.
  const age = now - (Number(saved.at) || 0)
  if (!(age >= 0) || age > CODE_GOOD_FOR_MS) {
    forget(store)
    return null
  }
  return { email: saved.email, at: Number(saved.at) }
}

/** Signed in, gave up, or changed address. */
export function forget(store = box()) {
  if (!store) return
  try {
    store.removeItem(KEY)
  } catch {
    /* nothing to do about it, and nothing worth throwing over */
  }
}
