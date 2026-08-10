import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { thumb } from '../lib/imgTransform.js'
import { readingToCost, summarise } from '../lib/receipt.js'

// "Find the receipts in this trip's photographs."
//
// David photographs receipts to remember what he spent, so they arrive
// mixed in with the holiday. This looks through the ones nobody has looked
// at yet, and offers what it found as costs — offers, not files: a number
// in a total is a thing people trust, and nothing here is good enough to
// put one there without being shown first.
//
// On demand rather than at upload. Reading a photograph costs an AI call,
// and three hundred holiday snaps is three hundred calls nobody asked for
// on the day they dumped a camera roll in.

const BATCH = 12

// What the scan did, in order, so nothing about it is a surprise.
const PHASES = { idle: 'idle', reading: 'reading', review: 'review', saving: 'saving', done: 'done' }

export default function ReceiptScan({ trip, photos = [], onDone }) {
  const [phase, setPhase] = useState(PHASES.idle)
  const [done, setDone] = useState(0)
  const [results, setResults] = useState([])
  const [keep, setKeep] = useState(() => new Set())
  const [trouble, setTrouble] = useState(null)

  // Only ever the ones nobody has looked at. A second run after adding
  // forty more photographs costs forty calls, not three hundred and forty.
  const unread = photos.filter((p) => !p.scanned_at)

  async function scan() {
    setPhase(PHASES.reading)
    setTrouble(null)
    setDone(0)

    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    if (!token) {
      setTrouble('Sign in first.')
      setPhase(PHASES.idle)
      return
    }

    const found = []
    for (let i = 0; i < unread.length; i += BATCH) {
      const slice = unread.slice(i, i + BATCH)
      let readings = []
      try {
        const r = await fetch('/api/read-receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: slice.map((p) => p.id) }),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `server said ${r.status}`)
        readings = (await r.json()).readings ?? []
      } catch (e) {
        // A batch that fails is a batch not looked at, which is recoverable
        // by running it again — losing the eleven batches that worked is
        // not. So it stops, keeps what it has, and says why.
        setTrouble(`Stopped after ${i} of ${unread.length}: ${e.message}`)
        break
      }

      for (const { id, photo, reading } of readings) {
        if (!reading) continue
        const verdict = readingToCost(reading, photo)
        found.push({ id, photo, reading, ...verdict })
      }

      // Written as we go, so a scan that stops halfway has still banked the
      // half it did and the next run picks up where it left off.
      await supabase
        .from('photos')
        .update({ scanned_at: new Date().toISOString() })
        .in('id', readings.map((r) => r.id))
      for (const { id, reading } of readings) {
        if (reading) await supabase.from('photos').update({ receipt: reading }).eq('id', id)
      }

      setDone(Math.min(i + slice.length, unread.length))
      setResults([...found])
    }

    const worth = found.filter((f) => f.verdict !== 'photo')
    setResults(worth)
    setKeep(new Set(worth.filter((f) => f.verdict === 'cost').map((f) => f.id)))
    setPhase(worth.length ? PHASES.review : PHASES.done)
  }

  async function save() {
    setPhase(PHASES.saving)
    const taking = results.filter((r) => keep.has(r.id) && r.cost)
    if (taking.length) {
      const { error } = await supabase.from('costs').insert(taking.map((r) => r.cost))
      if (error) {
        setTrouble(`Couldn't save: ${error.message}`)
        setPhase(PHASES.review)
        return
      }
      // Out of the reel and onto the cost. Only now, and only for the ones
      // actually kept — a photograph wrongly called a receipt should not
      // vanish from somebody's holiday because a model was confident.
      await supabase
        .from('photos')
        .update({ kind: 'receipt' })
        .in('id', taking.map((r) => r.id))
    }
    setPhase(PHASES.done)
    onDone?.(taking.length)
  }

  const totals = summarise(results)

  if (phase === PHASES.idle) {
    if (!unread.length) return null
    return (
      <div className="rs">
        <button className="rs-go" onClick={scan}>
          Find receipts in these {unread.length} photo{unread.length === 1 ? '' : 's'}
        </button>
        <div className="rs-note">Reads each one and offers what it finds as a cost. Nothing is saved until you say.</div>
        {trouble && <div className="rs-trouble">{trouble}</div>}
      </div>
    )
  }

  if (phase === PHASES.reading) {
    return (
      <div className="rs">
        <div className="rs-progress">
          Looking… {done} of {unread.length}
        </div>
        <div className="rs-bar">
          <span style={{ width: `${unread.length ? (done / unread.length) * 100 : 0}%` }} />
        </div>
      </div>
    )
  }

  if (phase === PHASES.done) {
    return (
      <div className="rs">
        <div className="rs-note">
          {totals.found
            ? `${totals.found} receipt${totals.found === 1 ? '' : 's'} filed under Costs.`
            : 'No receipts in those — all holiday photographs.'}
        </div>
        {trouble && <div className="rs-trouble">{trouble}</div>}
      </div>
    )
  }

  return (
    <div className="rs rs--review">
      <div className="rs-head">
        Looked at {totals.looked === 0 ? unread.length : done}. Found {totals.found}
        {totals.check ? `, and ${totals.check} that need you` : ''}.
      </div>

      {results.map((r) => (
        <label key={r.id} className={`rs-row${r.verdict === 'check' ? ' rs-row--check' : ''}`}>
          <input
            type="checkbox"
            checked={keep.has(r.id)}
            disabled={r.verdict !== 'cost'}
            onChange={() =>
              setKeep((set) => {
                const next = new Set(set)
                next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                return next
              })
            }
          />
          <img className="rs-thumb" src={r.photo.thumb_url || thumb(r.photo.url)} alt="" loading="lazy" />
          <span className="rs-what">
            <span className="rs-merchant">{r.cost?.description || r.reading?.merchant || 'Receipt'}</span>
            <span className="rs-sub">
              {r.verdict === 'cost'
                ? [r.cost.spent_on, r.cost.category].filter(Boolean).join(' · ')
                : r.why}
            </span>
          </span>
          {r.verdict === 'cost' && (
            <span className="rs-amount">
              {r.cost.currency} {r.cost.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </span>
          )}
        </label>
      ))}

      {trouble && <div className="rs-trouble">{trouble}</div>}

      <div className="rs-actions">
        <button className="rs-cancel" onClick={() => setPhase(PHASES.done)}>
          not now
        </button>
        <button className="rs-save" disabled={!keep.size || phase === PHASES.saving} onClick={save}>
          {phase === PHASES.saving ? 'saving…' : `Add ${keep.size} to Costs`}
        </button>
      </div>
      <div className="rs-note">
        {trip?.title ? `They'll join ${trip.title}'s costs, ` : 'They’ll join this trip’s costs, '}
        and come out of the photo grid.
      </div>
    </div>
  )
}
