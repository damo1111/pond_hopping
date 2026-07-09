import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { thumb } from '../lib/imgTransform.js'

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
      <button className="journal-add-btn" onClick={() => setShow(true)}>
        + add photo url
      </button>
    )
  }
  return (
    <div className="journal-form">
      <div className="jf-row">
        <select value={form.trip} onChange={set('trip')}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
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

export default function PhotosTab() {
  const { tripMeta, selectedTrip, setSelectedTrip } = useContext(TripContext)
  const [photos, setPhotos] = useState(null)
  const [covers, setCovers] = useState({})
  const [reload, setReload] = useState(0)
  const gridRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('photos')
      .select('*')
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
  }, [reload])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

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
          {heroCover && <img className="ph-hero-img" src={`${heroCover}=w1200-h500-c`} alt="" loading="lazy" />}
          <div className="ph-hero-overlay" />
          <div className="ph-hero-content">
            <span className="ph-hero-flags">{heroTrip.countries?.join(' ')}</span>
            <span className="ph-hero-title">{heroTrip.title}</span>
            <span className="ph-hero-meta">
              {fmtRange(heroTrip)} · {visible.length} photo{visible.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
      <AddPhoto tripMeta={tripMeta} selectedTrip={selectedTrip} onSaved={() => setReload((r) => r + 1)} />

      {albums.map((t) => {
        const count = photoCountByTrip.get(t.id) || 0
        const cover = covers[t.id] && (
          <span className="album-cover">
            <img src={`${covers[t.id]}=w800-h450-c`} alt="" loading="lazy" />
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
              <span className="album-flags">{t.countries?.join(' ')}</span>
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
              <img src={thumb(p.url)} alt={p.caption || ''} loading="lazy" decoding="async" />
              {p.is_highlight && <span className="photo-star">⭐</span>}
            </button>
          ))}
        </div>
      )}

      {!visible.length && (
        <div className="placeholder" style={{ minHeight: '30vh' }}>
          <div className="placeholder-code">photos</div>
          <div className="placeholder-note">
            No individual photos yet — paste image URLs above, or use the album links.
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
          </div>
        </div>
      )}
    </div>
  )
}
