import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function fmtWhen(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A cached AI recap of the whole trip, generated on demand from the
// journal entries — src/lib not needed, calls the summarize-trip Edge
// Function (OpenAI, gpt-4o-mini) which also upserts trip_summaries so
// re-opening the trip later doesn't re-spend tokens.
export default function TripSummary({ tripId }) {
  const [summary, setSummary] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setSummary(null)
    setGeneratedAt(null)
    setError(null)
    if (!tripId) return
    let alive = true
    supabase
      .from('trip_summaries')
      .select('summary, generated_at')
      .eq('trip_id', tripId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setSummary(data.summary)
        setGeneratedAt(data.generated_at)
      })
    return () => {
      alive = false
    }
  }, [tripId])

  async function generate() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('summarize-trip', { body: { trip_id: tripId } })
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

  if (!tripId) return null

  return (
    <div className="trip-summary">
      {summary ? (
        <>
          <div className="ts-body">{summary}</div>
          <div className="ts-foot">
            <span>✨ generated {fmtWhen(generatedAt)}</span>
            <button className="ts-regen" onClick={generate} disabled={loading}>
              {loading ? 'regenerating…' : 'regenerate'}
            </button>
          </div>
        </>
      ) : (
        <button className="ts-generate" onClick={generate} disabled={loading}>
          {loading ? '✨ summarizing…' : '✨ Summarize this trip'}
        </button>
      )}
      {error && <div className="ts-error">{error}</div>}
    </div>
  )
}
