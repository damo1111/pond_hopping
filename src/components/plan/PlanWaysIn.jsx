import Icon from '../Icon.jsx'

// What the Plan tab is when there is nothing planned.
//
// It used to be a title, one line of prose and a button — on a screen that is
// otherwise white. David: "Right now tapping plan is one bar page!" Which it
// was: the tab with the least in it got the least made for it, so the first
// thing a new hopper found on tapping Plan was an apology.
//
// This composes the way GetTripsIn does, because that sheet already solved
// the same problem for the same person a screen earlier: something drawn to
// look at, one obvious way in, one that is genuinely ours, and the rest kept
// quiet underneath. Not a grid of equal tiles — a grid says "choose", and
// somebody who has just arrived does not yet know enough to choose.
//
// It goes away entirely the moment there is one thing in the lane. This is
// scaffolding for an empty room, not furniture.

/**
 * The route you have not taken yet.
 *
 * Same hand as the Add-a-trip tile and the ways-in sheet: stroke only, no
 * fills that need a second colour, and small enough that it costs nothing to
 * draw. Read left to right — where you have been is solid, where you are
 * going is dashed, and the last pin is open rather than filled because that
 * is the whole point of this screen.
 *
 * There was a sun in the corner. It sat away from everything else and joined
 * nothing, so it read as a stray circle rather than as weather — the same
 * fault as the loose lines on the globe. Four marks that all mean something
 * beats five where one is decoration.
 *
 * The viewBox is cropped tight to the marks — 6..194 across, 14..66 down —
 * rather than to the 200×74 grid they were drawn on. The grid had a band of
 * nothing at the top and bottom, and because the drawing is sized by its
 * width that empty band was costing real height on the card: measured, the
 * whole card was 313px against 172px for the Start-from-photos card it is
 * meant to rhyme with. Same drawing, no margins.
 */
function AheadOfYou() {
  return (
    <svg className="pwi-draw" viewBox="6 14 188 52" aria-hidden="true" focusable="false">
      <path className="pwi-horizon" d="M8 60 H192" />
      {/* Behind: two places, joined and done with. */}
      <path className="pwi-been" d="M24 52 Q48 34 72 46" />
      <circle className="pwi-pin pwi-pin--been" cx="24" cy="52" r="3.6" />
      <circle className="pwi-pin pwi-pin--been" cx="72" cy="46" r="3.6" />
      {/* Ahead: dashed, because it has not happened. */}
      <path className="pwi-ahead" d="M72 46 Q112 20 152 38" />
      <circle className="pwi-pin pwi-pin--next" cx="152" cy="38" r="5.4" />
      {/* A flag on the one you have not reached. */}
      <path className="pwi-flag" d="M152 33 V18 M152 18 q7 2 12 0 q-5 4 0 8 q-5 2 -12 0" />
    </svg>
  )
}

/**
 * @param tail  Rendered under a lane that already has something in it, rather
 *              than as the whole screen. Same invitation, quieter: the
 *              suggestion and the wishlist link are already on the page above
 *              it in that state, and repeating them is noise where the point
 *              is simply that planning another one is still the next thing.
 */
export default function PlanWaysIn({ onPlan, onWish, suggestion, tail = false }) {
  return (
    <div className={`pwi${tail ? ' pwi--tail' : ''}`}>
      {/* The one that is a whole screen rather than a row. Somebody who came
          to the Plan tab came to plan; this is not the moment to be even-
          handed about it. */}
      {/* Art band, name, one line — the shape of the Start-from-photos card,
          which is the one people meet first and the one this was asked to
          match. Two things went, and both were height rather than meaning:
          the second and third lines of the body, and the Start something
          pill. The pill was the whole card's job stated twice; a card that
          is entirely a button does not need a button drawn on it, and the
          card it rhymes with has never had one. The chevron keeps it
          obviously tappable for the cost of nothing.

          The pill stays in the tail, where the card is a row and the pill is
          the only part of it that looks like a control. */}
      <button className="pwi-hero pwi-in" style={{ '--in': 1 }} onClick={onPlan}>
        <span className="pwi-hero-art">
          <AheadOfYou />
        </span>
        <span className="pwi-hero-title">
          Plan the next one
          {!tail && <Icon className="pwi-hero-chev" name="chevron" size={16} />}
        </span>
        <span className="pwi-hero-body">Say where and roughly when. I&apos;ll do the rest.</span>
        {tail && (
          <span className="pwi-hero-go">
            <Icon name="plus" size={15} />
            <span>Start something</span>
          </span>
        )}
      </button>

      {/* Second, and only ours.
          This is drawn from the reader's own flights — nowhere else can tell
          somebody which corners of the world they have never landed in. It
          used to appear only once the lane had something in it, which is
          exactly backwards: it is worth most on the screen with nothing on
          it, and that is where it now lives. */}
      {!tail && suggestion && (
        <button className="pwi-never pwi-in" style={{ '--in': 2 }} onClick={onPlan}>
          <span className="pwi-never-count">
            {suggestion.visited}
            <span className="pwi-never-of">/{suggestion.total}</span>
          </span>
          <span className="pwi-never-text">
            <span className="pwi-never-title">You&apos;ve never been to {suggestion.name}</span>
            <span className="pwi-never-body">{suggestion.prompt}</span>
          </span>
        </button>
      )}

      {/* And the quiet one. Not everything is a trip yet — some of it is just
          a place somebody mentioned at dinner. Absent in the tail, where the
          someday list is already the section directly above. */}
      {!tail && (
        <div className="pwi-rest pwi-in" style={{ '--in': suggestion ? 3 : 2 }}>
          <button className="pwi-quiet" onClick={onWish}>
            Or put somewhere on the someday list →
          </button>
        </div>
      )}
    </div>
  )
}
