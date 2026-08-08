// Cloudflare Email Worker for eend.app. Cloudflare Email Routing
// delivers the raw MIME message here for any address routed to this
// worker (e.g. bookings@eend.app) — this parses it and forwards
// the useful bits to Pond Hopping's existing inbound-email endpoint,
// which already speaks this exact shape (it was built for Postmark's
// webhook payload, and this worker just mimics that shape so no server
// code needs to know or care which provider is doing the parsing).
import PostalMime from 'postal-mime'

const TARGET = 'https://pond.eend.app/api/inbound-email'

// Vercel refuses a request body over 4.5 MB and base64 adds a third, so the
// budget here is what can actually be delivered rather than what an airline
// is willing to attach. Skipping one oversized scan still lets the body
// text and the other tickets through.
const MAX_FILE_BYTES = 3_500_000
const MAX_TOTAL_BYTES = 3_800_000
const MAX_FILES = 4

function isPdf(a) {
  return /pdf/i.test(a.mimeType || '') || /\.pdf$/i.test(a.filename || '')
}

function toBase64(content) {
  const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content
  if (typeof bytes === 'string') return bytes.replace(/\s+/g, '')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// "Your itinerary is attached" with an empty body is a whole genre of
// confirmation email, so PDFs travel on with the text rather than being
// dropped at the door.
function pdfs(parsed) {
  const out = []
  let total = 0
  for (const a of parsed.attachments || []) {
    if (out.length >= MAX_FILES) break
    if (!isPdf(a) || a.disposition === 'inline') continue
    const base64 = toBase64(a.content)
    const bytes = Math.floor((base64.length * 3) / 4)
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue
    total += bytes
    out.push({ Name: a.filename || 'attachment.pdf', ContentType: 'application/pdf', Content: base64 })
  }
  return out
}

export default {
  async email(message, env, ctx) {
    try {
      const parsed = await PostalMime.parse(message.raw)
      const text = parsed.text || ''
      const Attachments = pdfs(parsed)

      if (!text.trim() && !Attachments.length) return // nothing worth sending on

      const post = (attachments) =>
        fetch(`${TARGET}?key=${encodeURIComponent(env.INBOUND_EMAIL_SECRET)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            FromFull: { Email: message.from },
            Subject: parsed.subject || '',
            TextBody: text,
            Attachments: attachments,
          }),
        })

      let res = await post(Attachments)

      // The platform's own body-size ceiling is the one limit we can't
      // measure from here. If we hit it, send the email again without its
      // attachments rather than losing the covering note as well.
      if (res.status === 413 && Attachments.length && text.trim()) {
        console.error('inbound-email rejected payload as too large; retrying without attachments')
        res = await post([])
      }

      if (!res.ok) {
        console.error('inbound-email forward failed', res.status, await res.text())
      }
    } catch (err) {
      // Never reject the message over a parsing/forwarding hiccup — the
      // email still exists in whoever sent it; worst case this one
      // booking just doesn't show up for review and gets pasted by hand.
      console.error('mail-worker error', err)
    }
  },
}
