// Pulling PDFs out of an inbound-email webhook payload.
//
// Plenty of confirmations put nothing useful in the body — "your itinerary
// is attached" and a PDF — so an inbox that only reads body text quietly
// drops half of what gets forwarded to it. Every provider names the
// attachment array differently, so normalise here the same way normalise()
// in inbound-email.js does for the body:
//
//   CloudMailin   attachments[] { file_name, content_type, content|url }
//   Postmark      Attachments[] { Name, ContentType, Content }
//   Cloudflare    (our Worker mimics Postmark's shape)
//
// Limits are deliberately tight. Vercel caps a serverless request body at
// 4.5 MB and base64 inflates by a third, so a payload big enough to be
// interesting is a payload that never arrives — better to skip one fat
// scan and still import the other three tickets than to lose the lot.

export const MAX_FILE_BYTES = 3_500_000
export const MAX_TOTAL_BYTES = 6_000_000
export const MAX_FILES = 4

function looksLikePdf(name, type) {
  if (String(type || '').toLowerCase().includes('pdf')) return true
  return /\.pdf$/i.test(String(name || ''))
}

// Inline attachments (a logo in the signature, a tracking pixel) are not
// the itinerary, and airlines love a 40 KB header image.
function isInline(a) {
  const d = String(a.disposition || a.Disposition || '').toLowerCase()
  return d === 'inline' || Boolean(a.content_id || a.ContentID)
}

function rows(payload) {
  const list = payload?.Attachments || payload?.attachments || []
  return Array.isArray(list) ? list : []
}

/**
 * Every PDF worth showing the extraction model, base64 encoded.
 *
 * @returns {Promise<Array<{ name: string, base64: string, bytes: number }>>}
 */
export async function pdfAttachments(payload) {
  const out = []
  let total = 0

  for (const a of rows(payload)) {
    if (out.length >= MAX_FILES) break
    const name = a.Name || a.file_name || a.fileName || a.filename || 'attachment.pdf'
    const type = a.ContentType || a.content_type || a.contentType || ''
    if (!looksLikePdf(name, type) || isInline(a)) continue

    let base64 = a.Content || a.content || null

    // CloudMailin hands back a URL rather than bytes once its attachment
    // store is switched on. Best-effort: a fetch that fails costs us this
    // one attachment, not the email.
    if (!base64 && (a.url || a.URL)) {
      try {
        const res = await fetch(a.url || a.URL)
        if (!res.ok) continue
        base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
      } catch {
        continue
      }
    }
    if (!base64) continue

    base64 = String(base64).replace(/\s+/g, '')
    const bytes = Math.floor((base64.length * 3) / 4)
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue

    total += bytes
    out.push({ name, base64, bytes })
  }

  return out
}
