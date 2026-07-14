import { useEffect, useRef, useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import ItineraryTimeline from './ItineraryTimeline.jsx'
import { supabase } from '../lib/supabase.js'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

function slugify(title) {
  return (
    (title || 'trip')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now().toString(36)
  )
}

function ProposalCard({ proposal, onAccept, onDiscard, onKeep, busy }) {
  return (
    <div className="plan-chat-proposal">
      <div className="plan-chat-proposal-head">
        <CountryFlags countries={proposal.countries} size={16} />
        <span className="plan-trip-badge">✏️ Draft itinerary</span>
      </div>
      <div className="plan-trip-title">{proposal.title}</div>
      {proposal.subtitle && <div className="plan-trip-subtitle">{proposal.subtitle}</div>}
      <div className="plan-trip-stats">
        {proposal.start_date ? new Date(proposal.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'dates tbc'}
        {proposal.end_date ? ` – ${new Date(proposal.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
      </div>
      {proposal.events?.length > 0 && (
        <ul className="plan-chat-proposal-events">
          {proposal.events.map((e, i) => (
            <li key={i}>
              <span className="plan-chat-proposal-date">{e.event_date ? new Date(e.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
              <span>
                {e.title}
                {e.city ? ` · ${e.city}` : ''}
                {e.note ? <span className="plan-chat-proposal-note"> — {e.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="plan-form-actions">
        <button className="plan-btn text-link" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
        <button className="plan-btn ghost" disabled={busy} onClick={onKeep}>
          Keep as draft
        </button>
        <button className="plan-btn" disabled={busy} onClick={onAccept}>
          ✓ It's booked in
        </button>
      </div>
    </div>
  )
}

function QuickForm({ tripId, onSaved, onCancel }) {
  const [loading, setLoading] = useState(Boolean(tripId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ title: '', subtitle: '', traveler: '', start_date: '', end_date: '' })

  useEffect(() => {
    if (!tripId) return
    supabase
      .from('trips')
      .select('title,subtitle,traveler,start_date,end_date')
      .eq('id', tripId)
      .single()
      .then(({ data }) => {
        if (data) setForm({ title: data.title || '', subtitle: data.subtitle || '', traveler: data.traveler || '', start_date: data.start_date || '', end_date: data.end_date || '' })
        setLoading(false)
      })
  }, [tripId])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const row = {
      title: form.title,
      subtitle: form.subtitle || null,
      traveler: form.traveler || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    let newId = tripId
    let error
    if (tripId) {
      ;({ error } = await supabase.from('trips').update(row).eq('id', tripId))
    } else {
      const res = await supabase
        .from('trips')
        .insert({ ...row, slug: slugify(form.title), countries: [], status: 'draft', sort_order: 0 })
        .select('id')
        .single()
      error = res.error
      newId = res.data?.id
    }
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved(newId)
  }

  if (loading) return <div className="plan-chat-form">loading…</div>

  return (
    <form className="plan-chat-form" onSubmit={save}>
      <input className="plan-input" placeholder="Title (e.g. UK, or Japan ski trip)" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      <input className="plan-input" placeholder="Subtitle / notes (optional)" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      <input className="plan-input" placeholder="Whose trip? (leave blank if it's yours)" value={form.traveler} onChange={(e) => setForm((f) => ({ ...f, traveler: e.target.value }))} />
      <div className="plan-input-row">
        <input className="plan-input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
        <input className="plan-input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
      </div>
      <div className="plan-input-hint">Dates can be rough guesses — nothing here needs to be locked in yet.</div>
      {error && <div className="plan-error">{error}</div>}
      <div className="plan-form-actions">
        <button className="plan-btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="plan-btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : tripId ? 'Save' : 'Create draft'}
        </button>
      </div>
    </form>
  )
}

export default function PlanChat({ tripId, traveler = 'both', initialMode, seedMessage, onClose, onChanged }) {
  const [activeTripId, setActiveTripId] = useState(tripId || null)
  const [mode, setMode] = useState(initialMode || (tripId ? 'itinerary' : 'chat'))
  const [messages, setMessages] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [proposalBusy, setProposalBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [itineraryEvents, setItineraryEvents] = useState([])
  const recognitionRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content:
          seedMessage ||
          (tripId
            ? "Picking this back up — tell me anything new (dates firming up, a flight booked, something you've decided) and I'll keep building it out."
            : "Tell me whatever you've got — a place, rough dates, something already booked, or just a feeling ('somewhere warm in October'). I'll ask if I need more, and sketch a draft as soon as there's enough to work with. Or switch to the plain form if you'd rather just type the basics in."),
      },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  useEffect(() => {
    if (!activeTripId) {
      setItineraryEvents([])
      return
    }
    supabase
      .from('planned_events')
      .select('*')
      .eq('trip_id', activeTripId)
      .then(({ data }) => setItineraryEvents(data ?? []))
  }, [activeTripId, proposal])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, mode])

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setMessages((m) => [...m, { role: 'user', content: trimmed }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/plan-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, threadId, tripId: activeTripId, traveler }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'chat failed')
      setThreadId(data.threadId)
      setMessages((m) => [...m, { role: 'assistant', content: data.reply || '…' }])
      if (data.proposal) {
        setProposal(data.proposal)
        setActiveTripId(data.proposal.trip_id)
        onChanged?.()
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Hit a snag talking to the planner: ${e.message}` }])
    } finally {
      setSending(false)
    }
  }

  function toggleMic() {
    if (!SpeechRecognition) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-GB'
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setInput((prev) => (prev ? `${prev} ${text}` : text))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function onFormSaved(newId) {
    const isNew = !activeTripId
    setActiveTripId(newId)
    setMode(isNew ? 'chat' : 'itinerary')
    if (isNew) {
      setMessages((m) => [...m, { role: 'assistant', content: "Saved as a draft. Want a hand filling in the rest, or happy to keep typing it in yourself?" }])
    }
    onChanged?.()
  }

  async function acceptProposal() {
    setProposalBusy(true)
    await supabase.from('trips').update({ status: 'confirmed' }).eq('id', proposal.trip_id)
    setProposalBusy(false)
    onChanged?.()
    onClose?.()
  }

  async function discardProposal() {
    setProposalBusy(true)
    await supabase.from('trips').delete().eq('id', proposal.trip_id)
    setProposalBusy(false)
    setProposal(null)
    onChanged?.()
  }

  return (
    <div className="plan-chat-modal">
      <div className="plan-chat-panel">
        <div className="plan-chat-head">
          <span className="plan-chat-head-title">✨ Plan with AI</span>
          <div className="plan-chat-modes">
            {activeTripId && (
              <button className={`plan-chat-mode${mode === 'itinerary' ? ' active' : ''}`} onClick={() => setMode('itinerary')}>
                🗓️ plan
              </button>
            )}
            <button className={`plan-chat-mode${mode === 'chat' ? ' active' : ''}`} onClick={() => setMode('chat')}>
              💬 chat
            </button>
            <button className={`plan-chat-mode${mode === 'form' ? ' active' : ''}`} onClick={() => setMode('form')}>
              📝 form
            </button>
          </div>
          <button className="plan-chat-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {mode === 'form' ? (
          <QuickForm tripId={activeTripId} onSaved={onFormSaved} onCancel={() => setMode(activeTripId ? 'itinerary' : 'chat')} />
        ) : mode === 'itinerary' ? (
          <div className="plan-chat-itinerary">
            <ItineraryTimeline events={itineraryEvents} onEventsChange={setItineraryEvents} />
            <button className="plan-add-btn plan-chat-itinerary-cta" onClick={() => setMode('chat')}>
              💬 continue planning
            </button>
          </div>
        ) : (
          <>
            <div className="plan-chat-log" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`plan-chat-bubble plan-chat-bubble-${m.role}`}>
                  {m.content}
                </div>
              ))}
              {sending && <div className="plan-chat-bubble plan-chat-bubble-assistant plan-chat-typing">thinking…</div>}
              {proposal && (
                <ProposalCard proposal={proposal} busy={proposalBusy} onAccept={acceptProposal} onDiscard={discardProposal} onKeep={() => setProposal(null)} />
              )}
            </div>
            <form
              className="plan-chat-input-row"
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
            >
              <textarea
                className="plan-chat-input"
                rows={1}
                placeholder="Type or tap the mic and just talk…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              {SpeechRecognition && (
                <button type="button" className={`plan-chat-mic${listening ? ' listening' : ''}`} onClick={toggleMic}>
                  🎙️
                </button>
              )}
              <button className="plan-btn" type="submit" disabled={sending || !input.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
