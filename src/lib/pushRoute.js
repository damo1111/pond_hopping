// Where a tapped notification should land you.
//
// Every push this app sends carries a `data.kind`, and until now nothing
// read it. Tapping "Your Thailand trip is written" opened the app on
// whatever tab you were last on — which is the same thing tapping the icon
// does, so the notification was decoration. The work of writing it, sending
// it and getting it past two push services was spent on a doorway with no
// room behind it.
//
// This is the map from a notification to a place. It is a pure function on
// purpose: the routing is the part with the decisions in it, and a phone is
// the worst place to find out you got one wrong.
//
// ── Why it is defensive about its input ───────────────────────────────
//
// The payload has been through FCM, which stringifies every value in `data`,
// and through APNs, which does not. So `trip_id` arrives as a string either
// way but a number would arrive as `"3"` from one and `3` from the other,
// and anything absent arrives as `undefined`, `null` or the string
// `"undefined"` depending on which road it took. A router that trusts its
// input here sends somebody to a trip called "undefined".
//
// It is also, in the end, a string from the internet. Not attacker-supplied
// in any real sense — you have to be able to send this device a push — but
// it decides what screen opens, so it is checked rather than believed.

/** Tabs a notification is allowed to open. Anything else is ignored. */
export const TABS = ['world', 'plan', 'flights', 'photos', 'journal', 'useful']

const looksLikeUuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const looksLikeDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * @param data the notification's `data` payload, as it arrived
 * @returns `null` when there is nowhere sensible to go — which is a fine
 *          answer and means "just open the app", not "something failed".
 *
 * The shapes:
 *   { go: 'trip',      tripId }        the trip's own screen
 *   { go: 'lookBack',  tripId, date }  one evening's look-back
 *   { go: 'tab',       tab }           a tab, named
 */
export function whereTo(data) {
  if (!data || typeof data !== 'object') return null
  const kind = typeof data.kind === 'string' ? data.kind : null
  const tripId = looksLikeUuid(data.trip_id) ? data.trip_id : null

  switch (kind) {
    // The story finished while they were somewhere else. This is the one
    // that has to work: it is the payoff for a wait measured in minutes.
    case 'story_ready':
      return tripId ? { go: 'trip', tripId } : { go: 'tab', tab: 'world' }

    // Nine in the evening, on the day it is about. The date matters —
    // opened tomorrow morning it should still show last night's day, not
    // today's empty one.
    case 'look_back':
      return tripId && looksLikeDate(data.on_date)
        ? { go: 'lookBack', tripId, date: data.on_date }
        : null

    // A forwarded booking is waiting to be looked at. It carries its own
    // tab already, which is checked rather than trusted.
    case 'email_import':
      return { go: 'tab', tab: TABS.includes(data.tab) ? data.tab : 'plan' }

    // Admin only, and there is no screen for it. Opening the app is the
    // whole of the intent.
    case 'new_signup':
      return null

    default:
      // An unknown kind from a newer server than this build. A tab, if it
      // named one it recognises; otherwise nothing.
      return TABS.includes(data.tab) ? { go: 'tab', tab: data.tab } : null
  }
}

/**
 * The tap, as Capacitor hands it over.
 *
 * `pushNotificationActionPerformed` wraps the payload one layer deeper than
 * `pushNotificationReceived` does, and getting that wrong is a silent
 * nothing-happens rather than an error — so both shapes go through here.
 */
export function whereToFromTap(action) {
  return whereTo(action?.notification?.data ?? action?.data ?? null)
}
