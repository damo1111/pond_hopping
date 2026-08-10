import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { thumb, coverUrl } from '../lib/imgTransform.js'
import CountryFlags from '../components/CountryFlags.jsx'
import PhotoUpload from '../components/PhotoUpload.jsx'
import ReceiptScan from '../components/ReceiptScan.jsx'

function fmtRange(t) {
  if (!t.start_date) return 'dates tbc'
  const opt = { day: 'numeric', month: 'short' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b ? `${a} – ${b}` : a
}

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
      is_highlight: form.is_highlight,
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
        <PhotoUpload trip={target} trips={tripMeta} onDone={onSaved} />
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
  const { tripMeta, selectedTrip, setSelectedTrip, userId } = useContext(TripContext)
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
      .order('taken_on', { ascending: true })
      .then(({ data }) => alive && setPhotos(data ?? []))
    supabase
      .from('photo_cache')
      .select('trip_id,urls,status')
      .then(({ data }) => {
        if (!alive) return
        const byTrip = {}
        for (const row of data ?? []) {
          if (row.status === 'ok' && row.urls?.[0]) byTrip[row.trip_id] = row.urls[0]
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
    const { error } = await supabase.from('photos').delete().eq('id', photo.id)
    setRemoving(false)
    if (error) return alert(`Couldn't remove it: ${error.message}`)
    setPhotos((rows) => rows.filter((r) => r.id !== photo.id))
    setLightbox(null)
  }

  async function setAsCover(photo) {
    setSettingCover(true)
    const { error } = await supabase.from('photo_cache').upsert({
      trip_id: photo.trip_id,
      urls: [photo.url],
      status: 'ok',
      updated_at: new Date().toISOString(),
    })
    setSettingCover(false)
    if (error) {
      alert(`Couldn't set cover: ${error.message}`)
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
  async function toggleHighlight(photo) {
    const next = !photo.is_highlight
    setStarring(true)
    const { error } = await supabase.from('photos').update({ is_highlight: next }).eq('id', photo.id)
    setStarring(false)
    if (error) return alert(`Couldn't change it: ${error.message}`)
    setPhotos((rows) => rows.map((r) => (r.id === photo.id ? { ...r, is_highlight: next } : r)))
    setLightbox((l) => (l && l.id === photo.id ? { ...l, is_highlight: next } : l))
  }

  if (!photos) return <div className="tab-loading">loading photos…</div>

  const visible = photos.filter((p) => !selectedTrip || tripsById.get(p.trip_id)?.slug === selectedTrip)
  const albums = tripMeta.filter(
    (t) => t.photos_url && (!selectedTrip || t.slug === selectedTrip)
  )
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
      <AddPhoto tripMeta={tripMeta} selectedTrip={selectedTrip} onSaved={() => setReload((r) => r + 1)} />

      {/* Only inside a trip. "Find the receipts across everything you have
          ever photographed" is a bill, not a feature. */}
      {heroTrip && (
        <ReceiptScan
          trip={heroTrip}
          photos={visible}
          onDone={() => setReload((r) => r + 1)}
        />
      )}

      {albums.map((t) => {
        const count = photoCountByTrip.get(t.id) || 0
        const cover = covers[t.id] && (
          <span className="album-cover">
            <img src={coverUrl(covers[t.id], { width: 800, height: 450 })} alt="" loading="lazy" />
          </span>
        )
        // Once the real photos are registered in-app, the card should open
        // the in-app grid, not send you out to Google Photos — the album
        // link is only a stand-in until then.
        if (count > 0) {
          return (
            <button
              key={t.slug}
              type="button"
              className="album-card"
              onClick={() => {
                setSelectedTrip(t.slug)
                gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {cover}
              <span className="album-flags">
                <CountryFlags countries={t.countries} size={18} />
              </span>
              <span className="album-title">{t.title}</span>
              <span className="album-open">
                View {count} photo{count === 1 ? '' : 's'} ↓
              </span>
            </button>
          )
        }
        return (
          <a key={t.slug} className="album-card" href={t.photos_url} target="_blank" rel="noreferrer">
            {cover}
            <span className="album-flags">{t.countries?.join(' ')}</span>
            <span className="album-title">{t.title} — Google Photos</span>
            <span className="album-open">Open album →</span>
          </a>
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
              {p.is_highlight && <span className="photo-star">⭐</span>}
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
              className={`lb-star-btn${lightbox.is_highlight ? ' on' : ''}`}
              disabled={starring}
              onClick={(ev) => {
                ev.stopPropagation()
                toggleHighlight(lightbox)
              }}
            >
              {starring ? 'saving…' : lightbox.is_highlight ? '★ in the recap' : '☆ show in the recap'}
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
