import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { thumb, coverUrl } from '../lib/imgTransform.js'
import { applied } from '../lib/applied.js'
import { afterTap, standing } from '../lib/recapPhotos.js'
import { spanOf } from '../lib/dateRange.js'
import CountryFlags from '../components/CountryFlags.jsx'
import PhotoUpload from '../components/PhotoUpload.jsx'
import TripTools from '../components/TripTools.jsx'
import BringThemIn from '../components/BringThemIn.jsx'

const fmtRange = (t) => spanOf(t, { empty: 'dates tbc' })

function AddPhoto({ tripMeta, selectedTrip, onSaved }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    trip: selectedTrip || tripMeta[0]?.slug || '',
    url: '',
    caption: '',
    city: '',
    date: '',
    is_reel: false,
    is_highlight: false,
  })
  const target = tripMeta.find((x) => x.slug === form.trip) || tripMeta[0]
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggle = (k) => () => setForm((f) => ({ ...f, [k]: !f[k] }))

  async function save() {
    const trip = tripMeta.find((t) => t.slug === form.trip)
    if (!trip || !form.url) return
    setSaving(true)
    const { error } = await supabase.from('photos').insert({
      trip_id: trip.id,
      url: form.url,
      caption: form.caption || null,
      city: form.city || null,
      taken_on: form.date || null,
      is_reel: form.is_reel,
      // null, not false: false now means somebody refused it.
      is_highlight: form.is_highlight || null,
    })
    setSaving(false)
    if (!error) {
      setShow(false)
      setForm((f) => ({ ...f, url: '', caption: '', city: '', date: '' }))
      onSaved()
    } else {
      alert(`Couldn't save: ${error.message}`)
    }
  }

  if (!show) {
    return (
      <div className="ph-add">
        {/* Straight off the phone is what people actually want. Pasting a URL
            assumes you had already uploaded it somewhere else, so it stays,
            but it stops being the headline. */}
        {/* Two ways in, side by side, because they answer one question —
            where from — and stacking them made the phone the headline and
            the cloud an afterthought buried under a story and two tools. */}
        <div className="ph-sources">
          <PhotoUpload trip={target} trips={tripMeta} onDone={onSaved} />
          {target && <BringThemIn trip={target} onDone={onSaved} />}
        </div>
        {/* Which trip these are about to join. It was implicit — whatever was
            selected on Home, or the first trip if nothing was — and with no
            way to delete a photo afterwards, landing forty of them on the
            wrong trip was unrecoverable inside the app. */}
        {target && <div className="ph-target">adding to {target.title}</div>}
        <button className="journal-add-btn" onClick={() => setShow(true)}>
          or paste a photo url
        </button>
      </div>
    )
  }
  return (
    <div className="journal-form">
      <div className="jf-row">
        {/* An example is a copy of a real trip and carries the real trip's
            title, so this list now holds two rows both reading "China &
            Japan" with nothing between them. On a card the sash says which;
            a <select> has no room for a sash, and the wrong pick here puts
            somebody's own photographs on the trip published to everybody.
            So the word goes in the label. */}
        <select value={form.trip} onChange={set('trip')}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.is_demo ? `${t.title} — example` : t.title}
            </option>
          ))}
        </select>
        <input type="date" value={form.date} onChange={set('date')} />
      </div>
      <input placeholder="Image URL" value={form.url} onChange={set('url')} />
      <div className="jf-row">
        <input placeholder="Caption" value={form.caption} onChange={set('caption')} />
        <input placeholder="City" value={form.city} onChange={set('city')} />
      </div>
      <div className="jf-row">
        <button className={`ph-flag${form.is_reel ? ' on' : ''}`} onClick={toggle('is_reel')}>
          🎬 reel
        </button>
        <button className={`ph-flag${form.is_highlight ? ' on' : ''}`} onClick={toggle('is_highlight')}>
          ⭐ highlight
        </button>
      </div>
      <div className="jf-actions">
        <button className="jf-cancel" onClick={() => setShow(false)}>
          cancel
        </button>
        <button className="jf-save" disabled={saving || !form.url} onClick={save}>
          {saving ? 'saving…' : 'save photo'}
        </button>
      </div>
    </div>
  )
}

export default function PhotosTab({ openPhotoId = null }) {
  const { tripMeta, selectedTrip, userId, notePhotosChanged, openPlanner } = useContext(TripContext)
  const [photos, setPhotos] = useState(null)
  const [covers, setCovers] = useState({})
  const [reload, setReload] = useState(0)
  const gridRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)
  const [settingCover, setSettingCover] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [starring, setStarring] = useState(false)

  useEffect(() => {
    let alive = true
    supabase
      .from('photos')
      .select('*')
      // Receipts have been filed under the cost they paid for. They are
      // still photographs and still in this table; they are just not part
      // of anybody's holiday.
      .neq('kind', 'receipt')
      // Day, then the instant inside it. Ordering on taken_on alone sorts to
      // day granularity and leaves everything within a day in whatever order
      // Postgres felt like — so a day's photographs came back shuffled, and
      // differently on each load. id last so the order is total: photos with
      // no EXIF time at all still land somewhere stable rather than moving
      // about between renders.
      .order('taken_on', { ascending: true })
      .order('taken_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .then(({ data }) => alive && setPhotos(data ?? []))
    // A cover somebody chose wins over one scraped from an album.
    Promise.all([
      supabase.from('trips').select('id,cover_photo_url'),
      supabase.from('photo_cache').select('trip_id,urls,status'),
    ]).then(([t, c]) => {
      if (!alive) return
      const byTrip = {}
      for (const row of c.data ?? []) {
        if (row.status === 'ok' && row.urls?.[0]) byTrip[row.trip_id] = row.urls[0]
      }
      for (const row of t.data ?? []) {
        if (row.cover_photo_url) byTrip[row.id] = row.cover_photo_url
      }
      setCovers(byTrip)
    })
    return () => {
      alive = false
    }
    // Keyed on userId because restoring a session is asynchronous: a read
    // fired at mount goes out before the token exists, comes back answered
    // as an anonymous request, and this loaded empty and never tried again.
  }, [reload, userId])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  // Opened by tapping a photograph rather than the count: land on that
  // photograph. Waits for the fetch, because the caller only has an id —
  // the row it names arrives with everybody else's.
  //
  // Honoured once. The list reloads after an upload or a removal, and an
  // effect that simply watched `photos` would shove the lightbox back open
  // over a screen somebody had already closed it on.
  const honoured = useRef(null)
  useEffect(() => {
    if (!openPhotoId || !photos || honoured.current === openPhotoId) return
    const found = photos.find((p) => p.id === openPhotoId)
    if (!found) return
    honoured.current = openPhotoId
    setLightbox(found)
  }, [openPhotoId, photos])

  // Removes the row, never the file. The example trip's photos point at the
  // same pictures as the real one, so deleting the bytes would take them out
  // of a trip nobody asked to change.
  async function removePhoto(photo) {
    if (!globalThis.confirm?.('Remove this photo from the trip? It stays in storage.')) return
    setRemoving(true)
    // .select() so the refusal is visible: without it a delete that RLS
    // declines returns no error and no rows, and this took the photograph
    // off the screen and put it back on the next load.
    const done = applied(
      await supabase.from('photos').delete().eq('id', photo.id).select('id'),
      'that photo'
    )
    setRemoving(false)
    if (!done.ok) return alert(done.why)
    setPhotos((rows) => rows.filter((r) => r.id !== photo.id))
    setLightbox(null)
  }

  // A chosen cover goes on the trip, not in the scrape cache.
  //
  // This used to overwrite photo_cache.urls — the cache of pictures scraped
  // from a Google Photos album — with a single URL. Two things wrong with
  // that. It threw away whatever else was in that cache, which the planner
  // reads. And it was not a durable choice: anything that refreshed the
  // cache would quietly replace it, which is how a deliberately chosen
  // Trevi Fountain became a table of empty glasses.
  //
  // trips.cover_photo_url is the column for this and was sitting empty.
  async function setAsCover(photo) {
    setSettingCover(true)
    const done = applied(
      await supabase
        .from('trips')
        .update({ cover_photo_url: photo.url })
        .eq('id', photo.trip_id)
        .select('id'),
      'the cover'
    )
    setSettingCover(false)
    if (!done.ok) {
      alert(done.why)
      return
    }
    setCovers((c) => ({ ...c, [photo.trip_id]: photo.url }))
  }

  // Which pictures the recap shows.
  //
  // The recap takes twelve, highlights first. With no way to set the flag
  // on a photograph already in the app, "highlight" only ever meant "the
  // first one uploaded", and a trip with three hundred and one pictures
  // showed whichever nine the sort happened to reach — which is no way to
  // choose what a trip looks like to somebody you are showing it to.
  async function toggleHighlight(photo, want = 'chosen') {
    const next = afterTap(photo, want)
    setStarring(true)
    const done = applied(
      await supabase.from('photos').update({ is_highlight: next }).eq('id', photo.id).select('id'),
      'that photo'
    )
    setStarring(false)
    if (!done.ok) return alert(done.why)
    setPhotos((rows) => rows.map((r) => (r.id === photo.id ? { ...r, is_highlight: next } : r)))
    setLightbox((l) => (l && l.id === photo.id ? { ...l, is_highlight: next } : l))
  }

  if (!photos) return <div className="tab-loading">loading photos…</div>

  const visible = photos.filter((p) => !selectedTrip || tripsById.get(p.trip_id)?.slug === selectedTrip)
  // Album cards are for trips you are *not* looking at.
  //
  // Inside a trip this used to show a card for that same trip — a title, a
  // count, a Bring them in button and a link out to Google — while the top
  // of the screen now offers the same thing as one of two buttons. Two doors
  // to one room, one of them buried under a story and two tools.
  const albums = tripMeta.filter((t) => t.photos_url && !selectedTrip)
  const photoCountByTrip = new Map()
  for (const p of photos) photoCountByTrip.set(p.trip_id, (photoCountByTrip.get(p.trip_id) || 0) + 1)
  const heroTrip = selectedTrip ? tripMeta.find((t) => t.slug === selectedTrip) : null
  const heroCover = heroTrip ? covers[heroTrip.id] : null

  return (
    <div className="photos-tab">
      {heroTrip && (
        <div className="photos-hero" style={{ '--ph-color': tripColor(heroTrip.slug) }}>
          {heroCover && (
            <img
              className="ph-hero-img"
              src={coverUrl(heroCover, { width: 1200, height: 500 })}
              alt=""
              loading="lazy"
            />
          )}
          <div className="ph-hero-overlay" />
          <div className="ph-hero-content">
            <span className="ph-hero-flags">
              <CountryFlags countries={heroTrip.countries} size={22} />
            </span>
            <span className="ph-hero-title">{heroTrip.title}</span>
            <span className="ph-hero-meta">
              {fmtRange(heroTrip)} · {visible.length} photo{visible.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
      <AddPhoto
        tripMeta={tripMeta}
        selectedTrip={selectedTrip}
        onSaved={() => {
          setReload((r) => r + 1)
          notePhotosChanged?.()
        }}
      />

      {/* Only inside a trip. "Find the receipts across everything you have
          ever photographed" is a bill, not a feature. */}
      {heroTrip && (
        <TripTools
          trip={heroTrip}
          photos={visible}
          onDone={() => {
            setReload((r) => r + 1)
            notePhotosChanged?.()
          }}
          onGet={(route) => {
            // The checklist's "go and get it" buttons. Every one of these
            // already has a door somewhere in the app; this only walks you
            // to it rather than describing where it is.
            if (route === 'photos') {
              document.querySelector('.pu-pick')?.click()
              return
            }
            // Timeline exports, bookings and runs all live in the trip's own
            // planner, which is one screen away and knows how to do each.
            openPlanner?.(heroTrip.id)
          }}
        />
      )}


      {albums.map((t) => {
        const count = photoCountByTrip.get(t.id) || 0
        const cover = covers[t.id] && (
          <span className="album-cover">
            <img src={coverUrl(covers[t.id], { width: 800, height: 450 })} alt="" loading="lazy" />
          </span>
        )
        // It used to be a link out, which was the only thing it could offer,
        // and it was hidden the moment any photograph arrived — "View 205
        // photos ↓" above the grid it was describing was a screen of nothing.
        //
        // It is the way *in* now, and that gate is backwards: one photograph
        // uploaded off a phone would hide the route for the other nine
        // hundred still in Google, and a trip like Thailand with 264 already
        // here could never show it at all. Bringing more in later is the
        // normal case, not the exception, and the dedupe exists precisely so
        // asking twice is free.
        //
        // What is kept from the old rule is its actual point: don't be a
        // large box above a full grid. With photographs already here it
        // becomes one quiet line instead of a card.
        const already = count > 0
        return (
          <div key={t.slug} className={`album-card${already ? ' album-card--slim' : ''}`}>
            {!already && cover}
            {!already && <span className="album-flags">{t.countries?.join(' ')}</span>}
            <span className="album-title">
              {t.title}
              {already ? ` — ${count} here` : ' — Google Photos'}
            </span>
            <BringThemIn trip={t} onDone={() => setReload((r) => r + 1)} />
            <a className="album-elsewhere" href={t.photos_url} target="_blank" rel="noreferrer">
              or open the album →
            </a>
          </div>
        )
      })}

      {visible.length > 0 && (
        <div ref={gridRef} className="photo-grid">
          {visible.map((p) => (
            <button key={p.id} className="photo-cell" onClick={() => setLightbox(p)}>
              <img
                src={p.thumb_url || thumb(p.url)}
                alt={p.caption || ''}
                loading="lazy"
                decoding="async"
                // Prefers the pre-generated static thumb_url (see
                // api/resize-photo.js) — the on-demand transform 400s
                // outright on the 50MP originals ("resolution too large
                // to process"), which thumb_url exists specifically to
                // avoid. Falls back to the untouched original if even
                // that 404s (e.g. a photo whose thumbnail hasn't been
                // backfilled yet and the live transform also failed).
                onError={(ev) => {
                  if (ev.currentTarget.src !== p.url) ev.currentTarget.src = p.url
                }}
              />
              {p.is_highlight === true && <span className="photo-star">⭐</span>}
            </button>
          ))}
        </div>
      )}

      {!visible.length && (
        /* Written when pasting a URL was the only way in, and left standing
           after uploading straight off the phone became the headline — so
           the one empty screen whose whole job is to say what to do next
           was pointing at the fallback. */
        <div className="placeholder" style={{ minHeight: '30vh' }}>
          <div className="placeholder-code">photos</div>
          <div className="placeholder-note">
            No photos here yet — “Add photos from this phone” at the top puts them in, dates and
            places and all.
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt="" />
          <div className="lightbox-meta">
            {lightbox.caption && <div className="lb-caption">{lightbox.caption}</div>}
            <div className="lb-sub">
              {[lightbox.city, lightbox.taken_on].filter(Boolean).join(' · ')}
            </div>
            {/* The one control here that changes what other people see.
                A trip's recap shows twelve pictures out of however many
                there are, highlights first — so this is how you choose
                which, and until now there was no way to. */}
            <button
              className={`lb-star-btn${standing(lightbox) === 'chosen' ? ' on' : ''}`}
              disabled={starring}
              onClick={(ev) => {
                ev.stopPropagation()
                toggleHighlight(lightbox, 'chosen')
              }}
            >
              {/* Named for where it goes. "Always show" is an instruction
                  with no object — show where? — and somebody looking for
                  the way to put a picture into the twelve on the recap
                  could not find it, because nothing on screen said recap. */}
              {starring ? 'saving…' : '★ add to the recap'}
            </button>
            {/* The other half of the choice, and the one that was missing.
                A photograph can be on the recap without being chosen — the
                page fills itself — so "unstar" could not take it out, and
                the only button on offer said "show in the recap" to
                somebody looking at it in the recap.

                Tapping whichever is already true goes back to undecided,
                which is the way back to letting the app choose. */}
            <button
              className={`lb-star-btn${standing(lightbox) === 'refused' ? ' on' : ''}`}
              disabled={starring}
              onClick={(ev) => {
                ev.stopPropagation()
                toggleHighlight(lightbox, 'refused')
              }}
            >
              {/* Not "remove from the recap": most photographs are
                  undecided and not on that page, so it offered to take out
                  something that was never in. This is true whichever state
                  it is in, and the lit one is the one that is set. */}
              {starring ? 'saving…' : '✕ keep out of the recap'}
            </button>
            <button
              className="lb-cover-btn"
              disabled={settingCover || covers[lightbox.trip_id] === lightbox.url}
              onClick={(ev) => {
                ev.stopPropagation()
                setAsCover(lightbox)
              }}
            >
              {covers[lightbox.trip_id] === lightbox.url
                ? '★ current cover'
                : settingCover
                  ? 'setting…'
                  : '☆ set as trip cover'}
            </button>
            {/* Until now the app could only ever add. Fine for a diary, wrong
                for a travel log — the reason to take a photo out is usually
                that it has somebody in it, and "you can't" is not an answer
                to that. Asks first, because there is no undo. */}
            <button
              className="lb-remove-btn"
              disabled={removing}
              onClick={(ev) => {
                ev.stopPropagation()
                removePhoto(lightbox)
              }}
            >
              {removing ? 'removing…' : 'remove this photo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
