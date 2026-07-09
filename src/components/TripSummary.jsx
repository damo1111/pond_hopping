import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function fmtWhen(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A cached AI recap of the whole trip. Auto-generates itself in the
// background the first time a trip with journal entries is opened (fire
// and forget — never blocks the rest of the tab from rendering), then
// calls the summarize-trip Edge Function (OpenAI) which upserts
// trip_summaries so every later visit loads instantly from cache instead
// of re-spending tokens.
export default function TripSummary({ tripId, hasEntries }) {
  const [summary, setSummary] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  async function generate(id) {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('summarize-trip', { body: { trip_id: id } })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    if (data?.error) {
      setError(data.error)
      return
    }
    setSummary(data.summary)
    setGeneratedAt(data.generated_at)
  }

  useEffect(() => {
    setSummary(null)
    setGeneratedAt(null)
    setError(null)
    setExpanded(false)
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
            <div className={`ts-body${expanded ? '' : ' clamp'}`}>{summary}</div>
            <div className="ts-foot">
              <span>✨ generated {fmtWhen(generatedAt)}</span>
              <span className="ts-foot-actions">
                <button className="ts-regen" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'show less' : 'show more'}
                </button>
                <button className="ts-regen" onClick={() => generate(tripId)} disabled={loading}>
                  {loading ? 'regenerating…' : 'regenerate'}
                </button>
              </span>
            </div>
          </>
        ) : loading ? (
          <div className="ts-loading">✨ summarizing this trip…</div>
        ) : (
          <button className="ts-generate" onClick={() => generate(tripId)} disabled={loading}>
            ✨ Summarize this trip
          </button>
        )}
        {error && <div className="ts-error">{error}</div>}
      </div>
    </div>
  )
}
