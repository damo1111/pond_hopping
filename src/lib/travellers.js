// Who was on a trip.
//
// trip_members has carried this since sharing was built — email, role,
// display_name, is_traveller — and it is written by the invite flow and by
// the booking importer, which reads passenger names off a confirmation. What
// there has never been is a way to look at it, or to change it. David, 12
// August: "for Thailand specifically, David Seeby was with me. Where is the
// option to add him?" He is already on it. Nothing said so.
//
// Two different facts live in one row and are easy to confuse:
//
//   role          what they may do — owner, planner, viewer.
//   is_traveller  whether they actually went.
//
// Somebody can plan a trip they are not on (a parent booking a honeymoon)
// and can be on a trip they cannot edit. Flight legs are attributed by
// traveller, so getting this wrong puts somebody else's flights on your map.

/** Ranked worst to best, so a duplicate keeps the strongest. */
const RANK = { viewer: 0, planner: 1, owner: 2 }

const rank = (role) => RANK[role] ?? 0

/**
 * One row per person.
 *
 * The table has duplicates in it — two owner rows for the same address on a
 * couple of trips, from an importer that inserted rather than upserted — and
 * a list that shows the same person twice invites somebody to remove one of
 * them and wonder why nothing changed.
 *
 * Merged by address, keeping the strongest role, any name that was recorded,
 * and travelling if any row says they did.
 */
export function tidy(members = []) {
  const by = new Map()
  for (const m of members ?? []) {
    const key = String(m?.email ?? '').trim().toLowerCase()
    if (!key) continue
    const had = by.get(key)
    if (!had) {
      by.set(key, { ...m, email: key })
      continue
    }
    by.set(key, {
      ...had,
      // Keep the id of the row we are keeping, so removing removes a real row.
      id: rank(m.role) > rank(had.role) ? m.id : had.id,
      role: rank(m.role) > rank(had.role) ? m.role : had.role,
      display_name: had.display_name || m.display_name || null,
      is_traveller: !!(had.is_traveller || m.is_traveller),
      // Every row this person has, so a removal takes all of them.
      ids: [...(had.ids ?? [had.id]), m.id],
    })
  }
  return [...by.values()].sort((a, b) => {
    if (rank(b.role) !== rank(a.role)) return rank(b.role) - rank(a.role)
    return nameOf(a).localeCompare(nameOf(b))
  })
}

/** What to call somebody who may only ever have been an address. */
export function nameOf(member) {
  const name = String(member?.display_name ?? '').trim()
  if (name) return name
  const email = String(member?.email ?? '')
  return email.split('@')[0] || email
}

/**
 * Whether this row can be taken off the trip.
 *
 * Never the owner: the trip would belong to nobody, and every policy on it
 * keys off is_trip_editor. Changing who owns a trip is a different and much
 * larger operation than removing a companion.
 */
export function canRemove(member) {
  return !!member && member.role !== 'owner'
}

/** Every row id this person holds, so removing them removes all of them. */
export function rowsOf(member) {
  const ids = member?.ids ?? (member?.id ? [member.id] : [])
  return [...new Set(ids.filter(Boolean))]
}

/** A new companion, ready to insert. */
export function asNewMember(tripId, email, name) {
  const clean = String(email ?? '').trim().toLowerCase()
  if (!clean || !clean.includes('@')) return null
  return {
    trip_id: tripId,
    email: clean,
    display_name: String(name ?? '').trim() || null,
    // Added to a trip means they were on it. Somebody adding a person to a
    // holiday is saying they came, not granting them permissions — and the
    // permission half is what the share flow is for.
    role: 'viewer',
    is_traveller: true,
  }
}

/**
 * The tense to say it in.
 *
 * "Who was there" on a trip that has not happened yet is wrong, and "0 of
 * you" underneath it is worse — a planned trip with nobody marked reads as a
 * failure rather than as a trip nobody has been on yet, because they have
 * not been.
 *
 * @param trip  needs start_date and end_date
 * @param today YYYY-MM-DD, passed in so this can be tested
 */
export function tenseFor(trip, today) {
  const now = today ?? new Date().toISOString().slice(0, 10)
  const start = trip?.start_date || null

  // Nothing at all: a trip somebody has named and not dated. Ahead is the
  // safer read — a trip with no dates is far more likely to be an idea than
  // a finished holiday nobody recorded the end of.
  if (!start && !trip?.end_date) return AHEAD

  // Only an end date can put a trip in the past. A start with no end is
  // exactly what "I'm off now" makes — open-ended on purpose, because nobody
  // knew when it would finish — and reading that as over would ask "who was
  // there" of somebody standing in an airport.
  if (trip?.end_date && trip.end_date < now) return BEHIND
  if (start && start > now) return AHEAD
  return NOW
}

const BEHIND = {
  when: 'past',
  title: 'Who was there',
  came: 'came along',
  didnt: 'planning only',
  add: 'Someone else was there',
  none: 'Nobody marked yet',
}

const NOW = {
  when: 'now',
  title: "Who's on this trip",
  came: 'on the trip',
  didnt: 'planning only',
  add: 'Someone else is here',
  none: 'Just you so far',
}

const AHEAD = {
  when: 'future',
  title: "Who's coming",
  came: 'coming',
  didnt: 'planning only',
  add: 'Someone else is coming',
  none: 'Nobody else yet',
}
