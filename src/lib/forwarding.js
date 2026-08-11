// Forwarding a confirmation email straight into the app.
//
// The whole pipeline behind this already exists — api/inbound-email.js takes
// whatever an inbound-email provider posts at it, runs the same extraction
// as the paste box, guesses which trip it belongs to from the dates, files
// it for review and sends a push. What it never had was an address printed
// anywhere a person could see it, which made it a feature nobody could use.
//
// Why forwarding rather than connecting an inbox: Gmail read access is a
// restricted scope, which means Google's verification and an annual security
// assessment before it can ship to anybody. Forwarding needs no permission
// at all, works from any mail client, and handles the confirmation somebody
// else booked and sent on to you — which a scan of your own inbox cannot.
//
// The address is configurable because the provider decides it. CloudMailin
// hands you one on its own domain the moment you sign up, and that works
// today with no DNS changes; booking@eend.app is where it points once the
// MX records are in. Set VITE_FORWARD_EMAIL to whichever is live.

/** Where bookings get forwarded. Falsy when nothing has been set up yet. */
export const FORWARD_TO = (import.meta.env?.VITE_FORWARD_EMAIL || '').trim()

/** Is there an address to show at all? */
export function forwardingOn() {
  return !!FORWARD_TO && FORWARD_TO.includes('@')
}

/**
 * A pre-addressed blank email, for the tap that opens the mail app.
 *
 * Deliberately empty of everything else. A subject or body would be
 * overwritten by the forward anyway, and a mailto that arrives with text
 * already in it reads as the app trying to write your email for you.
 */
export function mailtoLink() {
  return forwardingOn() ? `mailto:${FORWARD_TO}` : null
}

/**
 * Which addresses a forward can arrive from and still be recognised.
 *
 * The match is on the sender, against the addresses on the account — the
 * login address plus any aliases. Anything else is filed under an address
 * nobody owns and is invisible from that moment on, which is the one way
 * this feature fails silently. Hence the aliases, and hence saying out loud
 * which addresses currently work.
 */
export function addressesFor(profile = {}, user = {}) {
  const all = [user?.email, profile?.email, ...(profile?.email_aliases ?? [])]
  const seen = new Set()
  const out = []
  for (const a of all) {
    const clean = String(a ?? '').trim().toLowerCase()
    if (!clean || !clean.includes('@') || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out
}

/** Tidy an address somebody typed. Returns null for anything unusable. */
export function tidyAddress(raw) {
  const clean = String(raw ?? '').trim().toLowerCase()
  if (!clean) return null
  // "David Moritz <david@moritznet.com>" is what gets pasted out of a mail
  // client at least as often as the bare address.
  const angled = clean.match(/<([^>]+)>/)
  const addr = (angled ? angled[1] : clean).trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null
}

/**
 * Add an address to the list, refusing duplicates and anything already on
 * the account. Returns the new alias list, or null when there is nothing
 * to change — the caller can skip the write.
 */
export function withAddress(profile = {}, user = {}, raw = '') {
  const addr = tidyAddress(raw)
  if (!addr) return null
  if (addressesFor(profile, user).includes(addr)) return null
  return [...(profile?.email_aliases ?? []), addr]
}

/** Remove one, leaving the login address alone — that one is not an alias
 *  and cannot be taken off. */
export function withoutAddress(profile = {}, raw = '') {
  const addr = tidyAddress(raw)
  const now = profile?.email_aliases ?? []
  if (!addr || !now.length) return null
  const next = now.filter((a) => String(a).trim().toLowerCase() !== addr)
  return next.length === now.length ? null : next
}
