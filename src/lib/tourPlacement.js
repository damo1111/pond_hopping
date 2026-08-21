// Which side of a spotlighted element a tooltip card should sit on.
//
// Proven necessary rather than assumed: a card fixed to the bottom of the
// screen, tried against the app's own layout, sat directly on top of the
// ring around the hero tile — both live in the bottom third of Home, where
// the strip and the way in already are. A card that always docks to
// whichever side has more room between the target and the screen edge
// never has that fight, on Home or anywhere else this runs.
//
// The bottom nav is fixed chrome, not empty space, so it counts against the
// room below a target even though nothing in the DOM measurement says so.

const NAV_CLEARANCE = 90

/**
 * @param rect            The spotlighted element's getBoundingClientRect(),
 *                        or null if nothing was found to measure.
 * @param viewportHeight  window.innerHeight.
 * @param navClearance    Height of fixed chrome at the bottom of the
 *                        screen, subtracted from the room below.
 * @returns 'above' | 'below' — where the card should sit relative to the
 *          target. Ties, and a missing rect, go to 'above': the common
 *          case here is a target low on the screen, where 'above' is right
 *          far more often than not.
 */
export function cardSide(rect, viewportHeight, navClearance = NAV_CLEARANCE) {
  if (!rect) return 'above'
  const spaceAbove = rect.top
  const spaceBelow = viewportHeight - rect.bottom - navClearance
  return spaceBelow > spaceAbove ? 'below' : 'above'
}
