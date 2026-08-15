// What this person has already been shown, in one place.
//
// There were four of these and none of them knew about each other:
// `pond:intro` for the cards, `pond:tourdone` for the tour,
// `ph_recap_hint_seen` for a hint, and `profiles.onboarded_at` in the
// database for the form. Four independent gates, each deciding on its own
// whether to fire.
//
// The failure that causes is not one of them being wrong. It is several
// being right at once — the cold open finishing into a carousel, which
// dismisses into a tour, which points at a card, on top of a form. Every
// one of those did exactly what it was told.
//
// So: one key, one shape, one place to ask. Anything that wants to show
// itself once asks here first and says so afterwards.
//
// ── Why localStorage and not the database ─────────────────────────────
//
// Because a signed-out visitor is exactly who this is for. `onboarded_at`
// lived on `profiles`, so it could only ever gate something that happened
// after sign-in — which is the wrong end of the experience entirely. This
// works before anybody has an account and survives into having one.
//
// The cost is that it is per-device: a new phone sees the cold open again.
// That is the right way round. Seeing it twice in two years is a much
// smaller harm than a returning hopper being shown the pitch again because
// the server had not answered yet.

const KEY = 'pond:seen'

/**
 * The things that happen once. Adding one is a line here, and that is on
 * purpose — a new first-run interruption should require going past this
 * comment.
 */
export const ONCE = {
  /** The globe flying in, and — behind it — the photographs turning into a
   *  trip. First launch only: it is genuinely good and it is also a thing
   *  between the person and the app, every single time.
   *
   *  `pitch` used to sit between this and `whose_trip`: one card, shown
   *  after the opening, saying what the app was for. The opening says it
   *  itself now, so there is nothing left to gate. Anybody carrying a
   *  `pitch` in their record keeps it — it is simply never asked about. */
  cold_open: 'cold_open',
}

// `pitch` and `whose_trip` were both here and both gone now, for the same
// reason each time: a thing that has to be dismissed is worse than a thing
// that simply describes where you are. The pitch became act two of the cold
// open; the note about whose trip that is became a line above the trip rail
// that is shown exactly while nothing on the globe is yours. Neither needs
// remembering, so neither is gated here.
//
// One entry left, and the machinery stays for it: the queue is what stops
// the next addition arriving on top of the opening, which is the failure it
// was built after.

function read(store) {
  try {
    const raw = store?.getItem(KEY)
    const seen = raw ? JSON.parse(raw) : null
    return seen && typeof seen === 'object' ? seen : {}
  } catch {
    // Private browsing, a webview with storage off, or somebody's hand-edited
    // rubbish in the key. Showing the cold open again is a far better failure
    // than throwing during boot.
    return {}
  }
}

/** Has this been shown already? */
export function seen(what, store = globalThis.localStorage) {
  return Boolean(read(store)[what])
}

/**
 * Write it down, and hand back what the whole record now says.
 *
 * Stores when rather than merely that, because "shown at some point" and
 * "shown eight months ago on a build that no longer exists" are different
 * facts and only one of them is worth having later.
 */
export function markSeen(what, store = globalThis.localStorage, now = () => new Date()) {
  const next = { ...read(store), [what]: now().toISOString() }
  try {
    store?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Nothing to do. It shows again next launch, which is the harmless way
    // round and the same thing the old flags did.
  }
  return next
}

/**
 * Un-see it.
 *
 * The record was write-only, which was fine right up until somebody wanted
 * to watch the opening again — and everybody does. An Android build is
 * installed over the top of the last one, so the WebView's storage survives
 * the update: a "fresh" launch of a new build finds cold_open already
 * stamped and correctly shows nothing. Correct, and indistinguishable from
 * the opening being broken, which is exactly how it was reported.
 *
 * It also has a real job beyond debugging. Handing your phone to somebody so
 * they can see what the app is has no other route: the pitch lives in the
 * opening now, and the opening had no second showing.
 *
 * Deliberately deletes rather than writing a falsy value, so the record only
 * ever holds things that genuinely happened and `seen()` stays a question
 * about presence.
 */
export function forget(what, store = globalThis.localStorage) {
  const next = { ...read(store) }
  delete next[what]
  try {
    store?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage refused the write, so the flag stands and the opening does not
    // replay on the next launch. The in-place replay this is called from has
    // already happened either way.
  }
  return next
}

/**
 * Only one interruption at a time, ever.
 *
 * The order is the order somebody should meet them, and this hands back the
 * first that is still owed. Everything else waits for the next launch —
 * which is the rule the four old flags had no way of expressing, and the
 * whole reason a new hopper could meet three things in eight seconds.
 */
export const IN_ORDER = [ONCE.cold_open]

export function nextUp(store = globalThis.localStorage, order = IN_ORDER) {
  return order.find((what) => !seen(what, store)) ?? null
}

/**
 * Carry the old flags over, so nobody who has already sat through the
 * carousel and the tour is shown them again by a rewrite.
 *
 * Runs once at boot and is safe to run repeatedly. It deliberately does not
 * delete the old keys: if this has to be reverted, the old code finds them
 * exactly where it left them.
 */
export function bringOldFlagsOver(store = globalThis.localStorage) {
  const already = read(store)
  const carried = { ...already }
  try {
    // Anybody who dismissed the cards has met the cold open.
    if (store?.getItem('pond:intro') === '1') {
      carried[ONCE.cold_open] ??= 'carried-over'
    }
    // Anybody who finished the tour has met the opening on the way to it.
    if (store?.getItem('pond:tourdone') === '1') {
      carried[ONCE.cold_open] ??= 'carried-over'
    }
  } catch {
    return already
  }
  if (Object.keys(carried).length !== Object.keys(already).length) {
    try {
      store?.setItem(KEY, JSON.stringify(carried))
    } catch {
      /* as above */
    }
  }
  return carried
}
