import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { thumb } from '../lib/imgTransform.js'
import { H, W, dhash, greyscale, groupSame, pickKeeper } from '../lib/phash.js'

// "I have stylised copies of my own pictures in here."
//
// The hashing happens in this browser, on the thumbnails that are already
// being served — no API call, no cost, nothing sent anywhere. A canvas
// nine pixels wide is all it takes, and the answer is the same on the
// hundredth photograph as on the first.
//
// It proposes; it never deletes on its own. Nothing in this app is worth
// less to get wrong than somebody's photographs.

// The browser will happily open three hundred images at once and then fall
// over. Small enough to be polite, large enough to finish.
const AT_ONCE = 6

async function hashOne(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = url
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, W, H)
  return dhash(greyscale(ctx.getImageData(0, 0, W, H).data))
}

// `autoStart`: on Photos the tools row is the button, so this draws only
// its progress and its findings.
export default function FindDuplicates({ photos = [], onDone, autoStart = false }) {
  const [phase, setPhase] = useState('idle') // idle | hashing | review | removing | done
  const [done, setDone] = useState(0)
  const [groups, setGroups] = useState([])
  const [drop, setDrop] = useState(() => new Set())
  const [trouble, setTrouble] = useState(null)

  const unhashed = photos.filter((p) => !p.phash)

  async function look() {
    setPhase('hashing')
    setTrouble(null)
    setDone(0)

    const hashed = new Map(photos.filter((p) => p.phash).map((p) => [p.id, p.phash]))
    let seen = 0

    for (let i = 0; i < unhashed.length; i += AT_ONCE) {
      const slice = unhashed.slice(i, i + AT_ONCE)
      const results = await Promise.all(
        slice.map(async (p) => {
          try {
            return { id: p.id, phash: await hashOne(p.thumb_url || thumb(p.url)) }
          } catch {
            // A thumbnail that will not load is a photograph this cannot
            // have an opinion about. It is not an error, it is a gap.
            return { id: p.id, phash: null }
          }
        })
      )
      for (const r of results) if (r.phash) hashed.set(r.id, r.phash)
      // Written down so the next run is only ever about new photographs.
      await Promise.all(
        results.filter((r) => r.phash).map((r) => supabase.from('photos').update({ phash: r.phash }).eq('id', r.id))
      )
      seen += slice.length
      setDone(seen)
    }

    const withHash = photos.map((p) => ({ ...p, phash: hashed.get(p.id) ?? p.phash ?? null }))
    const found = groupSame(withHash)
    // Everything except the keeper, ticked — that is the common case, and
    // the keeper is shown beside them so the proposal can be seen rather
    // than trusted.
    const proposed = new Set()
    for (const g of found) {
      const keep = pickKeeper(g)
      for (const p of g) if (p.id !== keep.id) proposed.add(p.id)
    }
    setGroups(found)
    setDrop(proposed)
    setPhase(found.length ? 'review' : 'done')
  }

  async function remove() {
    setPhase('removing')
    const ids = [...drop]
    if (ids.length) {
      const { error } = await supabase.from('photos').delete().in('id', ids)
      if (error) {
        setTrouble(`Couldn't remove them: ${error.message}`)
        setPhase('review')
        return
      }
    }
    setPhase('done')
    onDone?.(ids.length)
  }

  const kicked = useRef(false)
  useEffect(() => {
    if (autoStart && !kicked.current && phase === 'idle' && photos.length >= 2) {
      kicked.current = true
      look()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, phase, photos.length])

  if (phase === 'idle') {
    if (autoStart) return null
    if (photos.length < 2) return null
    return (
      <div className="fd">
        <button className="fd-go" onClick={look}>
          Find duplicates
        </button>
        <div className="fd-note">
          Compares the pictures themselves, here in this browser — nothing is sent anywhere, and
          nothing is removed until you say.
        </div>
      </div>
    )
  }

  if (phase === 'hashing') {
    return (
      <div className="fd">
        <div className="fd-progress">
          Comparing… {done} of {unhashed.length}
        </div>
        <div className="fd-bar">
          <span style={{ width: `${unhashed.length ? (done / unhashed.length) * 100 : 0}%` }} />
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="fd">
        <div className="fd-note">
          {groups.length ? 'Done — the copies are gone.' : 'No duplicates. Every picture in here is its own.'}
        </div>
        {trouble && <div className="fd-trouble">{trouble}</div>}
      </div>
    )
  }

  return (
    <div className="fd fd--review">
      <div className="fd-head">
        {groups.length} picture{groups.length === 1 ? '' : 's'} in here more than once.
      </div>
      <div className="fd-note fd-note--left">
        The one kept is the one that still knows when and where it was taken — a stylised export has
        had that thrown away on the way out. Tap any to change your mind.
      </div>

      {groups.map((group) => {
        const keep = pickKeeper(group)
        return (
          <div className="fd-group" key={keep.id}>
            {group.map((p) => {
              const dropping = drop.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`fd-shot${dropping ? ' fd-shot--drop' : ''}`}
                  onClick={() =>
                    setDrop((set) => {
                      const next = new Set(set)
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                      return next
                    })
                  }
                >
                  <img src={p.thumb_url || thumb(p.url)} alt="" loading="lazy" />
                  <span className="fd-tag">
                    {dropping ? 'remove' : p.lat != null ? 'keep · has a place' : p.taken_at ? 'keep · dated' : 'keep'}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}

      {trouble && <div className="fd-trouble">{trouble}</div>}

      <div className="fd-actions">
        <button className="fd-cancel" onClick={() => setPhase('done')}>
          leave them
        </button>
        <button className="fd-save" disabled={!drop.size || phase === 'removing'} onClick={remove}>
          {phase === 'removing' ? 'removing…' : `Remove ${drop.size}`}
        </button>
      </div>
    </div>
  )
}
