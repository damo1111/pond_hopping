import { checklist, summarise } from '../lib/whatWeHave.js'
import { track } from '../lib/analytics.js'
import Icon from './Icon.jsx'
import SheetGrip from './SheetGrip.jsx'

// One screen, at the only moment anybody is willing to answer it.
//
// The app writes a trip up from photographs alone and never mentions that the
// booking inbox, the Timeline export and the runs were sitting there unused —
// so the story comes out thinner than it needed to be and nobody knows why.
//
// Asked before the writing rather than after, because after, the answer is
// "well, it is written now". And it is an offer, not a gate: writing now and
// adding more later is always allowed, the button says so, and re-running the
// build over a fuller trip is a thing the app already does well.

export default function BeforeWeWrite({ facts, onWrite, onGet, onClose }) {
  const rows = checklist(facts)
  const missing = rows.filter((r) => !r.got && !r.optional)

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet bww" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        <div className="ios-sheet-title">Before I write this up</div>
        {/* What it has, before what it lacks. The point is to make somebody
            want to add one more thing, not to feel they have failed an
            inspection. */}
        <div className="ios-sheet-sub">{summarise(facts)}</div>

        <ul className="bww-list">
          {rows.map((r) => (
            <li key={r.key} className={`bww-row${r.got ? ' bww-row--got' : ''}`}>
              <span className="bww-tick" aria-hidden="true">
                {r.got ? <Icon name="check" size={12} /> : <span className="bww-box" />}
              </span>
              <span className="bww-what">
                <span className="bww-label">{r.label}</span>
                {r.got && <span className="bww-n">{r.n.toLocaleString('en-GB')}</span>}
              </span>
              {!r.got && (
                <button
                  type="button"
                  className="bww-get"
                  onClick={() => {
                    track('before_write_get', { what: r.key })
                    onGet?.(r.route)
                  }}
                >
                  {r.get}
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          className="ios-sheet-done"
          onClick={() => {
            track('before_write_go', { missing: missing.length })
            onWrite?.()
          }}
        >
          Write it up now
        </button>

        {/* Said plainly, because the whole reason a checklist is bearable is
            knowing it is not a gate. Somebody who adds a Timeline export next
            week can write it again and get a better story. */}
        <div className="bww-note">
          You can add any of these later and write it again — it only gets better.
        </div>

        <button className="account-btn ghost" onClick={onClose}>
          Not yet
        </button>
      </div>
    </div>
  )
}
