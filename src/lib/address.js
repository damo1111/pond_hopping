// Catching a typo before it costs somebody their afternoon.
//
// The address went from the field to signInWithOtp with nothing but a
// trim(). Type gmial.com and the whole machine works perfectly: Supabase
// accepts it, CloudMailin attempts delivery, the code goes to a domain that
// does not exist, and somebody sits on a screen of six empty boxes waiting
// for mail that cannot arrive. Nothing failed. Nothing said anything.
//
// It costs more than the wait. Bounces are what mail providers measure to
// decide whether to trust a sender, and this app's entire sign-in is one
// email — a reputation spent on typos is spent on the only thing that has to
// work.
//
// Two checks, in order of confidence:
//
//   Structure. Refused outright: there is no reading of "dave@" or
//   "dave@localhost" that anybody meant.
//   A likely slip. Suggested, never imposed: aaron@gmial.com is almost
//   certainly gmail, and "almost certainly" is not a licence to rewrite what
//   somebody typed. They confirm it.
//
// Pure and separate, because the interesting cases are the ones nobody
// thinks of at a keyboard: the address that is odd but real, the domain that
// looks like a typo of a common one and is not.

/**
 * Structurally an address, rather than definitely a real one.
 *
 * Deliberately permissive. The only addresses refused here are ones that
 * cannot be delivered to by anybody — and the cost of being wrong is
 * refusing a real person their account, which is far worse than one bounce.
 * Plus-addressing, apostrophes, long TLDs and unicode domains all pass.
 */
export function looksLikeAddress(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s.length > 254) return false
  // Exactly one @, with something either side.
  const at = s.indexOf('@')
  if (at < 1 || at !== s.lastIndexOf('@') || at === s.length - 1) return false
  const [name, host] = [s.slice(0, at), s.slice(at + 1)]
  if (name.length > 64) return false
  if (/\s/.test(s)) return false
  // A host with no dot is a machine on somebody's own network, not a place
  // mail from here can reach.
  if (!host.includes('.')) return false
  // No empty labels: "a..b", a leading or trailing dot.
  if (host.split('.').some((part) => part.length === 0)) return false
  // A TLD is letters, at least two of them.
  const tld = host.slice(host.lastIndexOf('.') + 1)
  return /^[a-z]{2,}$/i.test(tld)
}

/**
 * Domains people mean, and the slips that reach them.
 *
 * Only the handful that actually turn up. A general edit-distance guess
 * against every domain in the world produces confident nonsense — somebody
 * on a small company domain being asked whether they meant gmail is worse
 * than not asking, because it implies their own address is wrong.
 */
const MEANT = {
  'gmail.com': ['gmial.com', 'gmai.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gnail.com', 'gmaill.com', 'gmail.om', 'gamil.com'],
  'hotmail.com': ['hotmial.com', 'hotmai.com', 'hotmail.co', 'hotmail.con', 'hotmial.co', 'hotmil.com'],
  'outlook.com': ['outlok.com', 'outloo.com', 'outlook.co', 'outlook.con', 'outlool.com'],
  'yahoo.com': ['yaho.com', 'yahooo.com', 'yahoo.co', 'yahoo.con', 'yhaoo.com'],
  'icloud.com': ['iclould.com', 'icloud.co', 'icloud.con', 'iclod.com'],
  'me.com': ['me.con'],
  'protonmail.com': ['protonmai.com', 'protonmail.co'],
}

const SLIPS = new Map()
for (const [right, wrongs] of Object.entries(MEANT)) {
  // A domain cannot be a typo of itself. Guarded rather than trusted,
  // because it was: gmail.com sat in its own list of slips, and every
  // correct gmail address was offered gmail as a correction.
  for (const w of wrongs) if (w !== right) SLIPS.set(w, right)
}

/** A .co.uk address is not a .com typo — these are whole, real TLDs and a
 *  suggestion against them would be wrong every time. */
const REAL_TLDS = new Set(['co', 'com', 'net', 'org', 'uk', 'nz', 'au', 'de', 'fr', 'io', 'app', 'dev', 'edu', 'gov'])

/**
 * The address they probably meant, or null.
 *
 * Null is the normal answer. This only speaks when it is nearly certain,
 * because a wrong suggestion on a correct address teaches somebody to ignore
 * the next one.
 */
export function didYouMean(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  const at = s.indexOf('@')
  if (at < 1) return null
  const name = s.slice(0, at)
  const host = s.slice(at + 1)
  if (!name || !host) return null

  const better = SLIPS.get(host)
  if (better) return `${name}@${better}`

  // A .con or .cmo on any domain: nobody has ever meant either.
  const dot = host.lastIndexOf('.')
  if (dot > 0) {
    const tld = host.slice(dot + 1)
    const stem = host.slice(0, dot)
    if ((tld === 'con' || tld === 'cmo' || tld === 'ocm') && !REAL_TLDS.has(tld)) {
      return `${name}@${stem}.com`
    }
  }
  return null
}

/**
 * What the sheet should do about what has been typed.
 *
 * One answer rather than two booleans, so the field cannot end up refusing
 * an address while also suggesting a correction for it.
 */
export function checkAddress(raw) {
  const address = String(raw ?? '').trim()
  if (!address) return { ok: false, quiet: true }
  if (!looksLikeAddress(address)) {
    return {
      ok: false,
      // Says what is wrong with it rather than "invalid email", which tells
      // somebody staring at their own address precisely nothing.
      why: address.includes('@')
        ? 'That address is missing something after the @ — a domain like gmail.com.'
        : 'That doesn’t look like an email address — it needs an @ in it.',
    }
  }
  const meant = didYouMean(address)
  return meant && meant !== address.toLowerCase() ? { ok: true, meant } : { ok: true }
}
