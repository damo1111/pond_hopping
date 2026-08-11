import { useContext, useEffect, useState } from 'react'
import { TripContext } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { siteOrigin } from '../lib/siteOrigin.js'

// One link to the whole log, rather than one per trip.
//
// The per-trip links below still exist, but they only work on a trip that is
// public — and trips are private by default now, which is what makes this the
// useful one: it shows everything you have, to whoever holds the link, until
// you turn it off.
function ShowcaseLinks() {
  const { user } = useAuth()
  const [links, setLinks] = useState(null)
  const [label, setLabel] = useState('')
  const [costs, setCosts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)

  const load = () =>
    supabase
      .from('showcase_links')
      .select('*')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setLinks(data ?? []))

  useEffect(() => {
    if (!user) return setLinks([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  async function create() {
    setBusy(true)
    await supabase
      .from('showcase_links')
      .insert({ owner_email: user.email, label: label.trim() || null, include_costs: costs })
    setLabel('')
    setCosts(false)
    await load()
    setBusy(false)
  }

  async function revoke(token) {
    await supabase
      .from('showcase_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token)
    await load()
  }

  const urlFor = (t) => `${siteOrigin()}/?showcase=${t}`

  async function copy(t) {
    try {
      await navigator.clipboard.writeText(urlFor(t))
      setCopied(t)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  if (!user) {
    return (
      <div className="fx-card">
        <div className="ios-sheet-title">Show someone everything</div>
        <div className="ios-sheet-sub">Sign in to make a link to your travel log.</div>
      </div>
    )
  }

  return (
    <div className="fx-card">
      <div className="ios-sheet-title">Show someone everything</div>
      <div className="ios-sheet-sub">
        One read-only link to every trip — no account needed at the other end, and you can turn it
        off whenever you like. Private notes are never included.
      </div>

      <input
        className="account-input"
        placeholder="What's it for? (e.g. work)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <label className="share-toggle">
        <input type="checkbox" checked={costs} onChange={(e) => setCosts(e.target.checked)} />
        <span>Include what each trip cost</span>
      </label>
      <button className="ios-sheet-done" onClick={create} disabled={busy}>
        {busy ? 'Making…' : 'Make a link'}
      </button>

      {links?.map((l) => (
        <div className="showcase-link" key={l.token}>
          <div className="showcase-link-label">
            {l.label || 'Untitled'}
            {l.include_costs ? ' · with costs' : ''}
          </div>
          <div className="showcase-link-url">{urlFor(l.token)}</div>
          <div className="showcase-link-actions">
            <button className="account-btn ghost" onClick={() => copy(l.token)}>
              {copied === l.token ? 'Copied' : 'Copy'}
            </button>
            <button className="account-btn ghost" onClick={() => revoke(l.token)}>
              Turn off
            </button>
          </div>
        </div>
      ))}
      {links && links.length === 0 && (
        <div className="ios-sheet-sub" style={{ marginBottom: 0 }}>No links yet.</div>
      )}
    </div>
  )
}

const SECTIONS = [
  { id: 'journal', label: 'Diary', def: true },
  { id: 'flights', label: 'Itinerary', def: true },
  { id: 'map', label: 'Map', def: true },
  { id: 'costs', label: 'Costs', def: false }, // hidden by default per brief
]

export default function ShareTab() {
  const { tripMeta } = useContext(TripContext)
  const [trip, setTrip] = useState(tripMeta[0]?.slug || '')
  const [on, setOn] = useState(Object.fromEntries(SECTIONS.map((s) => [s.id, s.def])))
  const [copied, setCopied] = useState(false)

  const show = SECTIONS.filter((s) => on[s.id]).map((s) => s.id)
  const url = `${siteOrigin()}/?share=${trip}&show=${show.join(',')}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="share-tab">
      <ShowcaseLinks />

      <div className="fx-card">
        <div className="ios-sheet-title">Share a trip</div>
        <div className="ios-sheet-sub">
          A read-only page for friends — no login, no app needed. Pick the trip and what they get to
          see.
        </div>
        <select className="share-select" value={trip} onChange={(e) => setTrip(e.target.value)}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="share-sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`ph-flag${on[s.id] ? ' on' : ''}`}
              onClick={() => setOn((o) => ({ ...o, [s.id]: !o[s.id] }))}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="share-url">{url}</div>
        {/* The same button as "Make a link" one card above, because it is the
            same kind of thing. It was a different class at a different width
            with a link wedged in beside it, so two cards doing one job read
            as two screens by different hands. Preview goes underneath: it is
            a way out, not the thing anybody came here to do. */}
        <button className="ios-sheet-done" onClick={copy}>
          {copied ? 'copied ✓' : 'copy link'}
        </button>
        <a className="share-preview" href={url} target="_blank" rel="noreferrer">
          preview →
        </a>
      </div>
    </div>
  )
}
