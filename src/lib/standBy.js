// What to say while the ducks are working.
//
// The writing used to be something you asked for: a button called "Write
// again", a progress line, and a screen to sit in front of. David, 12 August:
// "We don't need buttons or a fanfare for writing or updating the OpenAI
// enriched story. It just happens." Quite — a trip that has just received two
// hundred photographs does not need to be asked whether it would like them
// read.
//
// So the only thing left on screen is one line, and its whole job is to
// manage an expectation: this takes minutes, not seconds, you can put the
// phone down, and we will tell you. A spinner says none of that. A percentage
// says it badly — the honest total moves whenever somebody adds more.
//
// The lines are quirky because the wait is long and dull, and because the app
// has a voice. They are also *true*: each one is picked from the stage the
// run is actually in, so somebody watching a line change learns something.
//
// Rotated rather than random-per-render, so a line does not flicker between
// two jokes every four seconds while the run is polled.

/**
 * Each stage gets several. Written to be read once — nobody reads the same
 * line twice on purpose — and to survive being read on the twentieth trip.
 */
const LINES = {
  // Photographs going past a model, ten at a time. The long one.
  looking: [
    'Ducks are hopping through your photographs.',
    'Somebody is looking at every single one of these.',
    'Going through the lot. This is the slow bit.',
    'Reading your photographs. Put the phone down.',
    'Squinting at your dinners, working out which city.',
  ],
  // Times, coordinates and stays being folded into a trace.
  'working it out': [
    'Working out where you actually went.',
    'Laying it all out on a table, in order.',
    'Joining the dots. Some of them are dinners.',
  ],
  // The writing itself.
  writing: [
    'Writing it up.',
    'Choosing which bits were the good bits.',
    'Deciding what to leave out, which is the hard part.',
  ],
  // Anything else, including a run that has only just been claimed.
  '': [
    'Off we go.',
    'Right then.',
  ],
}

/** How long a line stays before the next one, in milliseconds. */
export const HOLD_MS = 9000

/**
 * @param step    the run's step — looking | working it out | writing
 * @param elapsed how long the run has been going, in milliseconds
 * @param extra   how many photographs arrived after it started, if any
 *
 * A line every nine seconds, walking the list rather than picking at random:
 * random repeats, and a repeat inside a minute reads as the app having got
 * stuck.
 */
export function standBy(step, elapsed = 0, extra = 0) {
  // Somebody who added more while it was running gets told that is fine,
  // because the obvious fear is that they have broken it or will have to
  // start again. They have not and they will not.
  if (extra > 0) {
    return extra === 1
      ? 'Got the extra one too. Still going.'
      : `Got the other ${extra} as well. Still going.`
  }
  const list = LINES[step] ?? LINES['']
  const at = Math.max(0, Math.floor(elapsed / HOLD_MS))
  return list[at % list.length]
}

/**
 * The second line: what happens when it is done, said once and plainly.
 *
 * Only worth saying while there is something to wait for — and only worth
 * promising a notification if the device can actually receive one.
 */
export function alsoSay({ canPush = false } = {}) {
  return canPush
    ? "You can close the app — we'll nudge you when it's done."
    : 'You can close the app. It carries on without you.'
}

/** Every line, for the tests and for anybody auditing the voice. */
export const ALL_LINES = LINES
