// Reading and writing the database from a function, as the person who asked.
//
// The browser has a supabase client; a serverless function has a bearer
// token and no client, and importing @supabase/supabase-js into an endpoint
// to make six select calls is a lot of machinery for what is four HTTP
// requests.
//
// The important part is whose token it uses. The runner acts as the signed-in
// hopper — their access token, their row-level security — so an endpoint that
// writes a story cannot be talked into writing somebody else's. There is no
// service key in here on purpose: the moment one appears, every policy in the
// database stops applying to this file.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

/**
 * A small PostgREST client bound to one person's token.
 *
 * @param token  the access token from `Authorization: Bearer …`
 */
export function rest(token) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  async function send(path, init = {}) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    })
    const said = await r.text()
    if (!r.ok) throw new Error(`${path.split('?')[0]} — ${r.status} ${said.slice(0, 200)}`)
    if (!said) return null
    try {
      return JSON.parse(said)
    } catch {
      return null
    }
  }

  return {
    /** Rows, or an empty array. */
    async select(table, query = '') {
      const rows = await send(`${table}?${query}`)
      return Array.isArray(rows) ? rows : rows ? [rows] : []
    },

    /**
     * Insert, and get back what actually landed.
     *
     * `return=representation` is not a nicety. PostgREST answers 204 to a
     * write row-level security refused, which reads as success everywhere it
     * is not checked — a photograph deleted in the app came back on reload
     * for exactly this reason. An empty array is a refusal, and callers are
     * expected to treat it as one.
     */
    async insert(table, rows) {
      const out = await send(table, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(rows),
      })
      return Array.isArray(out) ? out : []
    },

    async upsert(table, row, onConflict) {
      const out = await send(`${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      })
      return Array.isArray(out) ? out : []
    },

    async update(table, query, patch) {
      const out = await send(`${table}?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      })
      return Array.isArray(out) ? out : []
    },

    /** A stored function. Returns whatever it returns. */
    async rpc(name, args = {}) {
      return send(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
    },
  }
}
