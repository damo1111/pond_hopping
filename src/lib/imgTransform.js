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

// Trip "cover" images come from two different places — a scraped Google
// Photos album share link (lh3.googleusercontent.com, resized with its
// own `=w###-h###-c` URL suffix) or, since a trip's cover can now also be
// set directly from an uploaded photo, a Supabase Storage url (resized
// via the transform endpoint like everything else). Picks whichever
// resize mechanism actually applies instead of assuming Google Photos.
export function coverUrl(url, { width = 800, height = 450 } = {}) {
  if (!url) return url
  if (url.includes('/storage/v1/object/public/')) return thumb(url, { width, height, resize: 'cover' })
  if (url.includes('googleusercontent.com')) return `${url}=w${width}-h${height}-c`
  return url
}
