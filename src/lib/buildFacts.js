// What this build was made with, where somebody can read it.
//
// Every iOS build ever cut shipped without Apple or Google sign-in, and
// nobody could tell. VITE_WAYS_IN is read at build time through
// import.meta.env and baked into the bundle; Vercel had it, Xcode Cloud did
// not, and waysIn('') returns an empty list on purpose — a missing setting
// must not put a dead button in front of anybody. So the app behaved
// correctly, differently, on two platforms, and the only visible symptom was
// a tester saying "there's no Google button" while the web showed one.
//
// The build id alone does not answer that. Two bundles from the *same
// commit* differ if they were built on machines with different environments,
// which is exactly the case here: the web and the wrapper are built from one
// repository by two CI systems that share no configuration.
//
// So the app says what it was built with, beside the build it was built as.
// Not the values — some are keys — only whether each was there, and only for
// the ones whose absence changes what somebody sees.
//
// Pure and injectable, because the interesting case is the one that cannot
// be reproduced on the machine asking the question.

/**
 * Settings whose absence changes behaviour rather than breaking the build.
 *
 * Deliberately not everything. VITE_SUPABASE_URL and its key both have
 * hardcoded fallbacks pointing at the real project, so a build without them
 * behaves identically and listing them would be noise. These are the ones
 * where missing means *quietly less app*.
 */
export const MATTERS = [
  { key: 'VITE_WAYS_IN', says: 'sign-in providers' },
  { key: 'VITE_INBOX_ADDRESS', says: 'forwarding address' },
]

/**
 * @param env   import.meta.env, or anything shaped like it
 * @returns [{ key, says, there }] — one row per setting that matters
 */
export function buildFacts(env = {}) {
  return MATTERS.map(({ key, says }) => ({
    key,
    says,
    // Present *and* not empty. An empty string is what an unset variable
    // looks like after a shell has interpolated it, and it behaves exactly
    // like absent — so it is reported that way rather than as "set".
    there: Boolean(String(env?.[key] ?? '').trim()),
  }))
}

/**
 * The one line to print under the build id.
 *
 * Says what is *missing*, because that is the actionable half and because a
 * build with everything is the ordinary case and deserves no words. Returns
 * null when there is nothing to report.
 */
export function whatIsMissing(env = {}) {
  const gone = buildFacts(env).filter((f) => !f.there)
  if (!gone.length) return null
  return `built without ${gone.map((f) => f.says).join(' and ')}`
}
