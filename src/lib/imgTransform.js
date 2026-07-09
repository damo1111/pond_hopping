// Supabase Storage image transformations (Pro plan) — request a small
// resized render instead of shipping the full multi-MB camera original
// into a grid thumbnail. Falls back to the original url untouched for
// anything not a Supabase Storage public object url (e.g. picsum in
// tests, or future non-Supabase sources).
export function thumb(url, { width = 320, height = 320, resize = 'cover', quality = 60 } = {}) {
  if (!url || !url.includes('/storage/v1/object/public/')) return url
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}width=${width}&height=${height}&resize=${resize}&quality=${quality}`
}
