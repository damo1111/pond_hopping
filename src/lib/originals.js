// Originals, held on the phone until there is a good moment to send them.
//
// The app uploads two renders and throws the original away, which is why a
// fifty-megapixel photograph costs a few hundred KB instead of eleven MB.
// The cost of that is real: the app is not a backup, and a lost phone is
// lost originals.
//
// Keeping them cannot be done later. A File from a picker is only valid
// while that page is alive — once the sheet closes, and certainly once the
// app restarts, there is no path back to those bytes. So the choice is to
// copy them somewhere durable at the moment they are picked, or to lose
// them. That is what this is: a queue in IndexedDB, drained when somebody
// says so.
//
// Deliberately not automatic. Detecting wi-fi properly needs a Capacitor
// plugin that is not installed, and navigator.connection answers on Android
// and not on iOS — so an "only on wi-fi" switch would behave differently on
// the two devices in this person's pocket without saying so. They always
// know whether they are on hotel wifi. The API frequently does not.

const DB = 'pond-originals'
const STORE = 'queued'
const VERSION = 1

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB here'))
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const out = fn(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(out?.result ?? out)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
  )
}

/**
 * Keep this original against a photo row that already exists.
 *
 * Failure is swallowed on purpose. The photograph is already safely
 * uploaded at this point; a full disk must not turn a successful upload
 * into a failed one.
 */
export async function hold({ id, blob, name }) {
  try {
    await run('readwrite', (s) => s.put({ id, blob, name, bytes: blob.size, at: Date.now() }))
    return true
  } catch {
    return false
  }
}

/** Everything still waiting, oldest first. */
export async function queued() {
  try {
    const all = await run('readonly', (s) => s.getAll())
    return [...(all ?? [])].sort((a, b) => a.at - b.at)
  } catch {
    return []
  }
}

export async function drop(id) {
  try {
    await run('readwrite', (s) => s.delete(id))
    return true
  } catch {
    return false
  }
}

/** What to say about the queue, without having to load the blobs to say it. */
export function summarise(rows = []) {
  const n = rows.length
  const bytes = rows.reduce((sum, r) => sum + (Number(r?.bytes) || 0), 0)
  return { count: n, bytes, label: n ? `${n} original${n === 1 ? '' : 's'} · ${mb(bytes)}` : '' }
}

export function mb(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}
