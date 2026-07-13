import { useEffect, useRef, useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import { supabase } from '../lib/supabase.js'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

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
        <button className="plan-btn" disabled={busy} onClick={onAccept}>
          ✓ Accept, it's booked in
        </button>
        <button className="plan-btn ghost" disabled={busy} onClick={onKeep}>
          Keep as draft
        </button>
        <button className="plan-btn ghost plan-chat-discard" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}

export default function PlanChat({ tripId, traveler = 'both', onClose, onChanged }) {
  const [messages, setMessages] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [proposalBusy, setProposalBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: tripId
          ? "Picking this back up — tell me anything new (dates firming up, a flight booked, something you've decided) and I'll keep building it out."
          : "Tell me whatever you've got — a place, rough dates, something already booked, or just a feeling ('somewhere warm in October'). I'll ask if I need more, and sketch a draft as soon as there's enough to work with.",
      },
    ])
  }, [tripId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

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
        body: JSON.stringify({ message: trimmed, threadId, tripId, traveler }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'chat failed')
      setThreadId(data.threadId)
      setMessages((m) => [...m, { role: 'assistant', content: data.reply || "…" }])
      if (data.proposal) {
        setProposal(data.proposal)
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
          <span>✨ Plan with AI</span>
          <button className="plan-chat-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="plan-chat-log" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`plan-chat-bubble plan-chat-bubble-${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="plan-chat-bubble plan-chat-bubble-assistant plan-chat-typing">thinking…</div>}
          {proposal && (
            <ProposalCard
              proposal={proposal}
              busy={proposalBusy}
              onAccept={acceptProposal}
              onDiscard={discardProposal}
              onKeep={() => setProposal(null)}
            />
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
      </div>
    </div>
  )
}
