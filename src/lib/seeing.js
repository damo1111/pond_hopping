// Deciding how hard to look, and what to do with what was seen.
//
// Two passes, and the reason for two is arithmetic. A photograph at OpenAI's
// low detail is 85 input tokens — a 512-pixel thumbnail. That is plenty for
// "indoors, restaurant, food on the table, window onto a street", and it is
// nowhere near enough to read the name off an awning. High detail is 765,
// and can. Three hundred photographs is 24,000 tokens one way and 219,000
// the other.
//
// The temptation is to guess in advance which photographs carry a name —
// pick the ones inside long stationary clusters, because that is where a
// name settles something. That guess is worse than it sounds: the awning is
// as likely to be in the shot taken walking up to the place as in the four
// taken at the table.
//
// So the first pass decides the second. Look at everything cheaply, and
// then look again, properly, only at the ones the cheap pass says have
// writing in them. It costs one extra call per handful of photographs and
// it aims the expensive tokens at the frames that actually have something
// to read.

/** Images per request.
 *
 *  The instruction is the expensive part of a small call, so batching pays
 *  it once per group rather than once per photograph. Twenty was the number
 *  until it met the other constraint: these run as Vercel functions with a
 *  sixty-second ceiling, and twenty images at high detail will not come back
 *  inside it. Ten will, and costs one more instruction per twenty
 *  photographs — about seven hundred tokens, which is nothing against being
 *  timed out halfway through a trip. */
export const BATCH = 10

/** Input tokens per image, by detail setting. OpenAI's published sizes: a
 *  flat 85 for low, and 85 plus 170 a tile for high, which is four tiles
 *  for anything up to about 1024 square. */
export const TOKENS = { low: 85, high: 765 }

/** Subjects where a name, a price or a label is plausibly in the frame. */
const MIGHT_READ = ['document', 'interior', 'food', 'drink', 'street', 'transport']

const said = (s) => String(s ?? '').toLowerCase()

/**
 * What the cheap pass says is worth looking at properly.
 *
 * Two kinds qualify. Anything that already yielded text — a partial read is
 * a strong sign the frame has more, and a half-read awning is exactly the
 * case a second look settles. And anything whose subject is the sort of
 * thing that carries writing, even where the first pass read none, because
 * at 512 pixels an unreadable sign and no sign look identical.
 */
export function readingList(seen = [], { limit = 40 } = {}) {
  return seen
    .filter((s) => {
      if (s?.id == null) return false
      if (said(s.text).trim()) return true
      if (said(s.notable).includes('sign')) return true
      return MIGHT_READ.includes(said(s.subject))
    })
    .slice(0, limit)
    .map((s) => s.id)
}

/** What a pass will cost, before spending it. In tokens, because the price
 *  of a token is not ours to know and changes without telling us. */
export function costOf(howMany = 0, detail = 'low', { batch = 20, instruction = 700 } = {}) {
  const images = howMany * (TOKENS[detail] ?? TOKENS.low)
  const prompts = Math.ceil(howMany / batch) * instruction
  return { images, prompts, input: images + prompts, calls: Math.ceil(howMany / batch) }
}

/** Photographs in groups small enough for one request. */
export function batches(photos = [], size = 20) {
  const out = []
  for (let i = 0; i < photos.length; i += size) out.push(photos.slice(i, i + size))
  return out
}

/**
 * The observations, merged. A second look replaces the first for the fields
 * it improves on, and never blanks one the first pass filled — a high-detail
 * read that returns no text where the low one found some is a worse answer,
 * not a newer one.
 */
export function merge(first = [], second = []) {
  const better = new Map(second.filter((s) => s?.id != null).map((s) => [String(s.id), s]))
  return first.map((s) => {
    const b = better.get(String(s?.id))
    if (!b) return s
    return {
      ...s,
      ...b,
      text: said(b.text).trim() ? b.text : s.text,
      notable: said(b.notable).trim() ? b.notable : s.notable,
    }
  })
}

/**
 * The observations, attached to the trip's own trace.
 *
 * Each day's rows are in photograph order, so an observation joins by id and
 * lands beside the time and the coordinate it belongs to. Rows with nothing
 * seen keep their place — a photograph nobody looked at is still a
 * photograph taken at that minute in that spot.
 */
export function foldInto(trace = {}, seen = []) {
  const byId = new Map(seen.filter((s) => s?.id != null).map((s) => [String(s.id), s]))
  return {
    ...trace,
    days: (trace.days ?? []).map((day) => ({
      ...day,
      trace: (day.trace ?? []).map((row) => {
        const s = byId.get(String(row.id))
        if (!s) return row
        const { id, ...rest } = s
        // Drop the empties rather than send a hundred "text": "" pairs.
        for (const k of Object.keys(rest)) if (rest[k] === '' || rest[k] == null) delete rest[k]
        return { ...row, ...rest }
      }),
    })),
  }
}
