// Which sketch a trip without a photograph gets.
//
// Every coverless card drawing the same picture would be worse than the
// gradient it replaces — a row of identical tiles reads as a loading state.
// So the slug picks the scene, which means a given trip always looks like
// itself (no reshuffling on every render) and neighbours in a row are
// usually different.
//
// Deliberately not chosen from the countries: a trip to Japan is not more
// "city" than "coast", and guessing wrong is worse than not guessing. This
// is wallpaper until a photograph arrives, and it should be pretty and
// quiet rather than clever and occasionally silly.

export const SCENES = ['peaks', 'coast', 'city']

/** Stable pick from the slug. Same trip, same picture, forever. */
export function sceneFor(slug) {
  const text = String(slug ?? '')
  if (!text) return SCENES[0]
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
  return SCENES[hash % SCENES.length]
}
