import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { oops, track } from '../../lib/analytics.js'
import { asNewMember, canRemove, nameOf, rowsOf, tenseFor, tidy } from '../../lib/travellers.js'
import Icon from '../Icon.jsx'

// Who was on this trip.
//
// The row has existed since sharing was built and is written by the invite
// flow and by the booking importer, which reads passenger names off a
// confirmation. There has never been anywhere to look at it. David Seeby has
// been on the Thailand trip this whole time and the only way to find out was
// to query the database.
//
// It is deliberately not the sharing screen. Adding somebody here says they
// came, not that they may edit — those are different questions and conflating
// them is how a companion quietly acquires the right to rewrite your journal.

export default function Travellers({ trip }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('trip_members')
      .select('id,email,display_name,role,is_traveller')
      .eq('trip_id', trip.id)
    if (error) oops('members', error, 'Travellers/load')
    setRows(tidy(data ?? []))
  }

  useEffect(() => {
    if (!trip?.id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id])

  async function add(e) {
    e.preventDefault()
    const row = asNewMember(trip.id, email, name)
    if (!row) return setTrouble('That does not look like an email address.')
    setBusy(true)
    setTrouble(null)
    const { error } = await supabase.from('trip_members').insert(row)
    setBusy(false)
    if (error) {
      // A duplicate is not a failure — they are already on the trip, which is
      // what the person wanted.
      if (error.code !== '23505') {
        setTrouble('That would not save. Worth trying again.')
        oops('members', error, 'Travellers/add')
        return
      }
    }
    track('traveller_added')
    setEmail('')
    setName('')
    setAdding(false)
    load()
  }

  async function wasHere(member, on) {
    setRows((list) => list.map((r) => (r.email === member.email ? { ...r, is_traveller: on } : r)))
    const { error } = await supabase
      .from('trip_members')
      .update({ is_traveller: on })
      .in('id', rowsOf(member))
    if (error) {
      oops('members', error, 'Travellers/wasHere')
      load()
    }
  }

  async function remove(member) {
    if (!canRemove(member)) return
    setRows((list) => list.filter((r) => r.email !== member.email))
    // Every row they hold, not only the one being shown — the table has
    // duplicates in it and removing one of two changes nothing visible.
    const { error } = await supabase.from('trip_members').delete().in('id', rowsOf(member))
    if (error) {
      oops('members', error, 'Travellers/remove')
      load()
      return
    }
    track('traveller_removed')
  }

  if (!rows) return null

  const went = rows.filter((r) => r.is_traveller).length
  // Asked in the tense of the trip. "Who was there" on a holiday two months
  // off is wrong, and "0 of you" under it is worse — a planned trip with
  // nobody marked read as a failure rather than as a trip nobody has been on
  // yet, because nobody has.
  const said = tenseFor(trip)

  return (
    <div className="tv">
      <div className="tv-head">
        <span className="tv-title">{said.title}</span>
        <span className="tv-count">
          {went === 0 ? said.none : went === 1 ? 'just you' : `${went} of you`}
        </span>
      </div>

      <ul className="tv-list">
        {rows.map((m) => (
          <li key={m.email} className={`tv-one${m.is_traveller ? '' : ' tv-one--away'}`}>
            <button
              type="button"
              className="tv-was"
              aria-pressed={m.is_traveller}
              onClick={() => wasHere(m, !m.is_traveller)}
              title={m.is_traveller ? said.came : said.didnt}
            >
              {m.is_traveller ? <Icon name="check" size={12} /> : <span className="tv-dot" />}
            </button>
            <span className="tv-who">
              <span className="tv-name">{nameOf(m)}</span>
              <span className="tv-role">
                {m.role === 'owner' ? 'owner' : m.is_traveller ? said.came : said.didnt}
              </span>
            </span>
            {canRemove(m) && (
              <button
                type="button"
                className="tv-drop"
                onClick={() => remove(m)}
                aria-label={`Remove ${nameOf(m)}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form className="tv-add" onSubmit={add}>
          <input
            className="plan-input"
            type="email"
            autoFocus
            required
            placeholder="their email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="plan-input"
            placeholder="name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="tv-add-do">
            <button type="submit" className="tv-save" disabled={busy}>
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className="tv-cancel" onClick={() => { setAdding(false); setTrouble(null) }}>
              Cancel
            </button>
          </div>
          {/* Said here rather than after the fact: somebody adding a
              companion reasonably expects that to have shared the trip with
              them, and it has not. */}
          <div className="tv-note">
            This records that they came. It does not let them see the trip —
            that is Share.
          </div>
          {trouble && <div className="account-error">{trouble}</div>}
        </form>
      ) : (
        <button type="button" className="tv-open" onClick={() => setAdding(true)}>
          + {said.add}
        </button>
      )}
    </div>
  )
}
