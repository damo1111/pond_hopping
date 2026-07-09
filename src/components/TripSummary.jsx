import { useEffect, useRef, useState } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase.js'

function fmtWhen(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A cached AI recap of the whole trip. Auto-generates itself in the
// background the first time a trip with journal entries is opened (fire
// and forget — never blocks the rest of the tab from rendering), streamed
// in live from the summarize-trip Edge Function so the text appears as
// OpenAI generates it instead of one long blocking wait. The Edge
// Function upserts the final text into trip_summaries once its own
// OpenAI stream ends (independent of the client), so every later visit —
// or a backgrounded tab that comes back — loads instantly from cache.
export default function TripSummary({ tripId, hasEntries }) {
  const [summary, setSummary] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const genToken = useRef(0)

  async function generate(id) {
    const myToken = ++genToken.current
    setLoading(true)
    setError(null)
    setSummary('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/summarize-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ trip_id: id }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        if (genToken.current === myToken) {
          setError(body?.error || `request failed (${res.status})`)
          setSummary(null)
          setLoading(false)
        }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        if (genToken.current === myToken) setSummary(acc)
      }
      if (genToken.current === myToken) {
        setGeneratedAt(new Date().toISOString())
        setLoading(false)
      }
    } catch (e) {
      if (genToken.current === myToken) {
        setError(String(e))
        setSummary(null)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    genToken.current++ // invalidate any in-flight stream from the previous trip
    setSummary(null)
    setGeneratedAt(null)
    setError(null)
    setExpanded(false)
    setLoading(false)
    if (!tripId) return
    let alive = true
    supabase
      .from('trip_summaries')
      .select('summary, generated_at')
      .eq('trip_id', tripId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setSummary(data.summary)
          setGeneratedAt(data.generated_at)
        } else if (hasEntries) {
          // Nothing cached yet — kick off generation quietly in the
          // background so the trip has a summary "always loaded" next time.
          generate(tripId)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, hasEntries])

  if (!tripId || (!hasEntries && !summary)) return null

  return (
    <div className="trip-summary">
      <div className="trip-summary-inner">
        {summary ? (
          <>
            <div className={`ts-body${!loading && !expanded ? ' clamp' : ''}`}>
              {summary}
              {loading && <span className="ts-cursor" />}
            </div>
            {!loading && (
              <div className="ts-foot">
                <span>✨ generated {fmtWhen(generatedAt)}</span>
                <span className="ts-foot-actions">
                  <button className="ts-regen" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'show less' : 'show more'}
                  </button>
                  <button className="ts-regen" onClick={() => generate(tripId)}>
                    regenerate
                  </button>
                </span>
              </div>
            )}
          </>
        ) : loading ? (
          <div className="ts-loading">✨ summarizing this trip…</div>
        ) : (
          <button className="ts-generate" onClick={() => generate(tripId)}>
            ✨ Summarize this trip
          </button>
        )}
        {error && <div className="ts-error">{error}</div>}
      </div>
    </div>
  )
}
