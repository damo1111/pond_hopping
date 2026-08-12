// When to show a new arrival the guided tour, and when to stop.
//
// The rule that matters is the second one. A tour that keeps running after
// you have your own trips in the app is no longer a tour, it is an
// advertisement for a stranger's holiday sitting on top of your own — so the
// moment there is one real trip, the demo stops being introduced and starts
// being just another trip you can delete.
//
// "Real" is the negative of is_demo rather than a count of anything else,
// because a half-built trip with no flights yet is still yours and still
// means the app is no longer empty.


export const isDemo = (trip) => !!(trip?.is_demo ?? trip?.isDemo)

// Trips that are actually yours.
//
// This used to mean "not flagged as the example", which is the same thing
// only while every non-demo trip belongs to whoever is looking. The moment a
// real trip is made public — Rome, for the work group — every visitor on
// earth counts as having a trip of their own: the example steps aside for
// them, and somebody on their first launch meets a globe holding one
// stranger's holiday with nothing to explain it.
//
// `mine` comes from the trip_meta view and answers for whoever is asking.
// Where it is absent — older callers, and tests written before it existed —
// fall back to the flag, which is right for every row that has no other
// owner.
export const ownTrips = (trips) =>
  (trips ?? []).filter((t) => !isDemo(t) && (t?.mine === undefined || t.mine))


export const shouldBadge = (trip) => isDemo(trip)

// The tour that used to live here is gone: three tooltip steps, the rule for
// when to run them, and the flag that remembered. Its copy is in
// docs/copy-parked.md, and its one irreplaceable line — "someone else's pond",
// the only thing that explained why a stranger's holiday was on your globe —
// moves onto the example trip itself rather than into an overlay pointing at
// it. What is left here is what four other files actually use: who owns a
// trip, and whether one is the example.
