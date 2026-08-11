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
// Quality 60 is right for a grid thumbnail forty millimetres across and
// wrong for a full-bleed hero, which is what this is mostly used for. The
// uploaded original is 2048 on its long edge at quality 0.82, so there is
// plenty of source; the request was simply asking for a third of the pixels
// a 3x phone screen shows and then compressing them.
export function coverUrl(url, { width = 800, height = 450, quality = 78 } = {}) {
  if (!url) return url
  if (url.includes('/storage/v1/object/public/')) return thumb(url, { width, height, resize: 'cover', quality })
  if (url.includes('googleusercontent.com')) return `${url}=w${width}-h${height}-c`
  return url
}
