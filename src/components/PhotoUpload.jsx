import { useRef, useState } from 'react'
import { ingest, runTotals } from '../lib/photoIngest.js'
import { savingsLabel } from '../lib/photoResize.js'
import Icon from './Icon.jsx'

// Adding photos used to mean pasting a URL, which assumes you had already
// uploaded them somewhere else. This takes them off the phone.
//
// Everything expensive happens before anything is sent: the file is decoded
// once, its EXIF read, and two small copies written — so what goes over the
// wire is a few hundred KB rather than the eleven megabytes a 50MP sensor
// produces. The original never leaves the device.

const STATE_LABEL = {
  waiting: 'waiting',
  shrinking: 'shrinking',
  uploading: 'uploading',
  done: 'added',
  failed: 'failed',
}

export default function PhotoUpload({ trip, traveler = null, onDone }) {
  const inputRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [running, setRunning] = useState(false)

  async function pick(e) {
    const files = [...(e.target.files || [])]
    // Chrome keeps the same input value, so re-picking the same shot after a
    // failure would otherwise silently do nothing.
    e.target.value = ''
    if (!files.length || !trip?.id) return

    setRunning(true)
    const results = await ingest(files, {
      tripId: trip.id,
      traveler,
      onProgress: (_i, _row, all) => setRows([...all]),
    })
    setRunning(false)
    setRows([...results])
    if (results.some((r) => r.state === 'done')) onDone?.(results)
  }

  const totals = rows ? runTotals(rows) : null
  const saving = totals?.before ? savingsLabel(totals.before, totals.after) : null

  return (
    <div className="photo-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={pick}
      />
      <button className="pu-pick" disabled={running || !trip?.id} onClick={() => inputRef.current?.click()}>
        <Icon name="photo" size={16} />
        <span>{running ? 'Adding…' : 'Add photos from this phone'}</span>
      </button>

      {rows?.length > 0 && (
        <ul className="pu-list">
          {rows.map((r, i) => (
            <li className={`pu-row pu-${r.state}`} key={`${r.name}-${i}`}>
              <span className="pu-name">{r.name}</span>
              <span className="pu-state">
                {r.state === 'failed' ? r.error : STATE_LABEL[r.state]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!running && totals?.done > 0 && (
        <div className="pu-summary">
          {/* The location count is the point of the whole exercise, not a
              footnote: those are the photos that can put themselves on the
              map and reconstruct where a trip went. */}
          <strong>{totals.done} added</strong>
          {totals.located > 0 && <span>{totals.located} with a location</span>}
          {saving && <span>{saving}</span>}
          {totals.failed > 0 && <span className="pu-bad">{totals.failed} failed</span>}
        </div>
      )}
    </div>
  )
}
