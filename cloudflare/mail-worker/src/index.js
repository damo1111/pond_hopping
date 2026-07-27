// Cloudflare Email Worker for mail.eend.app. Cloudflare Email Routing
// delivers the raw MIME message here for any address routed to this
// worker (e.g. bookings@mail.eend.app) — this parses it and forwards
// the useful bits to Pond Hopping's existing inbound-email endpoint,
// which already speaks this exact shape (it was built for Postmark's
// webhook payload, and this worker just mimics that shape so no server
// code needs to know or care which provider is doing the parsing).
import PostalMime from 'postal-mime'

const TARGET = 'https://pond.eend.app/api/inbound-email'

export default {
  async email(message, env, ctx) {
    try {
      const parsed = await PostalMime.parse(message.raw)
      const text = parsed.text || ''

      if (!text.trim()) return // nothing worth sending on

      const res = await fetch(`${TARGET}?key=${encodeURIComponent(env.INBOUND_EMAIL_SECRET)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FromFull: { Email: message.from },
          Subject: parsed.subject || '',
          TextBody: text,
        }),
      })

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
