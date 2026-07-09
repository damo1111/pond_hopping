function fmtShort(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// A trip-at-a-glance strip above the journal entries — every day as one
// chip (day number + mood), tap to jump straight to that entry.
export default function DayScrubber({ entries, onJump }) {
  if (entries.length < 2) return null

  return (
    <div className="day-scrub">
      {entries.map((e) => (
        <button key={e.id} className="ds-chip" onClick={() => onJump(e.id)}>
          <span className="ds-mood">{e.mood || '·'}</span>
          <span className="ds-day">{e.day_number ? `D${e.day_number}` : fmtShort(e.entry_date)}</span>
        </button>
      ))}
    </div>
  )
}
