import { useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'

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
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const [photos, setPhotos] = useState(null)
  const [reload, setReload] = useState(0)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('photos')
      .select('*')
      .order('taken_on', { ascending: true })
      .then(({ data }) => alive && setPhotos(data ?? []))
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

  return (
    <div className="photos-tab">
      <AddPhoto tripMeta={tripMeta} selectedTrip={selectedTrip} onSaved={() => setReload((r) => r + 1)} />

      {albums.map((t) => (
        <a key={t.slug} className="album-card" href={t.photos_url} target="_blank" rel="noreferrer">
          <span className="album-flags">{t.countries?.join(' ')}</span>
          <span className="album-title">{t.title} — Google Photos</span>
          <span className="album-open">Open album →</span>
        </a>
      ))}

      {visible.length > 0 && (
        <div className="photo-grid">
          {visible.map((p) => (
            <button key={p.id} className="photo-cell" onClick={() => setLightbox(p)}>
              <img src={p.url} alt={p.caption || ''} loading="lazy" />
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
