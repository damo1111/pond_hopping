import { couldAdd, richness, summarise } from '../lib/whatWeHave.js'
import { track } from '../lib/analytics.js'
import SheetGrip from './SheetGrip.jsx'

// One screen, at the only moment anybody is willing to answer it.
//
// The app writes a trip up from photographs alone and never mentions that the
// booking inbox, the Timeline export and the runs were sitting there unused —
// so the story comes out thinner than it needed to be and nobody knows why.
//
// It is a prompt for more, not a form to complete. David, 12 August: "I would
// just start writing it up (make that clear) and say they can add more if
// they want (point being they dont have to)." So the writing is the headline
// and the extras are chips underneath it — five ticked rows and a checklist
// read as five things to do first.
//
// The bar is the whole explanation. Colour by colour it says what the story
// is made of, and the empty part of it says, without a word, that there is
// more available. Nobody has to read anything to understand it.

export default function BeforeWeWrite({ facts, onWrite, onGet, onClose }) {
  const { segments, filled } = richness(facts)
  const chips = couldAdd(facts)

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet bww" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        <div className="bww-top">Off I go</div>

        {/* Not a progress bar towards a target — there is no target. It is
            what the story is made of, in the colours the rest of the app
            already uses for those things. */}
        <div className="bww-bar" role="img" aria-label={summarise(facts)}>
          {segments.map((s) => (
            <span
              key={s.key}
              className={`bww-seg${s.got ? ' bww-seg--got' : ''}`}
              style={{ width: `${s.share * 100}%`, '--seg': s.colour }}
            />
          ))}
        </div>

        <div className="bww-said">{summarise(facts)}</div>

        <button
          className="ios-sheet-done bww-go"
          onClick={() => {
            track('before_write_go', { filled: Math.round(filled * 100) })
            onWrite?.()
          }}
        >
          Write it up
        </button>

        {chips.length > 0 && (
          <div className="bww-more">
            {/* "If you have" and not "you should": the point is that they do
                not have to. */}
            <div className="bww-more-said">Even better if you have</div>
            <div className="bww-chips">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="bww-chip"
                  style={{ '--seg': c.colour }}
                  onClick={() => {
                    track('before_write_get', { what: c.key })
                    onGet?.(c.route)
                  }}
                >
                  <span className="bww-chip-dot" aria-hidden="true" />
                  {c.get}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
