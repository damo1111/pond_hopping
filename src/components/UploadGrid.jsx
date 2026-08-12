// Photographs arriving, one tile at a time.
//
// The thumbnail already exists by the time a photograph starts uploading —
// it has just been made, on the phone — so it can be on screen while the file
// is still going up rather than after. Two hundred and sixty tiles filling in
// is the difference between watching something happen and watching a bar.
//
// Lifted out of PhotoUpload because the other door into photographs, the one
// from the globe, had only the bar. David, 12 August: "this is great but i
// didnt see this when i uploaded from the home screen. was just a clunter
// going up."

/**
 * @param rows   [{ name, state, preview?, located?, error? }] — one per file,
 *               in the order they were chosen. `state` is waiting |
 *               shrinking | uploading | done | failed.
 * @param done   how many have landed
 * @param located how many of those knew where they were
 * @param busy   whether to show the counting line at all
 */
export default function UploadGrid({ rows = [], done = 0, located = 0, busy = true }) {
  if (!rows.length) return null

  return (
    <>
      {busy && (
        <div className="pu-progress">
          <div className="pu-progress-said">
            {done} of {rows.length}
            {/* The location count is the point of the whole exercise rather
                than a footnote: those are the photographs that can put
                themselves on a map and reconstruct where the trip went. */}
            {located > 0 && <span className="pu-progress-where"> · {located} know where they were</span>}
          </div>
          <div className="pu-bar">
            <span style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <ul className="pu-grid">
        {rows.map((r, i) => (
          <li
            className={`pu-tile pu-${r.state}`}
            key={`${r.name}-${i}`}
            title={r.state === 'failed' ? r.error : r.name}
          >
            {r.preview ? (
              <img src={r.preview} alt="" />
            ) : (
              <span className="pu-tile-empty" aria-hidden="true" />
            )}
            {r.located && <span className="pu-pin" aria-hidden="true">◦</span>}
            {r.state === 'failed' && <span className="pu-tile-bad" aria-hidden="true">!</span>}
          </li>
        ))}
      </ul>
    </>
  )
}
