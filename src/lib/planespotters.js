// Planespotters.net photo lookup by aircraft registration. Free, no key.
// Each FlightCard calls this lazily on expand (per CLAUDE.md — don't centralise).

const cache = new Map()

export async function fetchAircraftPhoto(registration) {
  if (!registration) return null
  const reg = registration.trim().toUpperCase()
  if (cache.has(reg)) return cache.get(reg)

  const promise = (async () => {
    try {
      const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`)
      if (!res.ok) return null
      const data = await res.json()
      const photo = data?.photos?.[0]
      if (!photo) return null
      return {
        thumb: photo.thumbnail_large?.src || photo.thumbnail?.src,
        link: photo.link,
        photographer: photo.photographer,
      }
    } catch {
      return null
    }
  })()

  cache.set(reg, promise)
  return promise
}
