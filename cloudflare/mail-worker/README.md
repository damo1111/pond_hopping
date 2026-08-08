# Pond Hopping mail worker

Receives forwarded booking emails at `bookings@eend.app` (Cloudflare Email
Routing → this Worker) and hands them to Pond Hopping's
`/api/inbound-email` endpoint for AI extraction. Free — no Postmark/
Mailgun/SendGrid account needed.

> **Not yet set up.** This needs `eend.app`'s nameservers pointed at
> Cloudflare, which hasn't been done. Until then the Worker is unused and
> booking import happens by pasting into the Plan tab, or via the MCP
> server (`/api/mcp`), which needs no DNS at all.

## One-time setup

### 1. Move `eend.app` to Cloudflare
An earlier version of this file said to add `mail.eend.app` as its own
zone, delegated with a single NS record. **That doesn't work**:
[subdomain zones are Enterprise-only](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/),
so Free and Pro accounts can only add a registrable domain. Cloudflare has
to be authoritative for the whole of `eend.app`.

1. Cloudflare dashboard → **Add a domain** → `eend.app` → **Free**. It
   scans and imports the existing DNS records.
2. **Check the imported records before going further** — particularly
   `pond` → Vercel, which serves the live app *and* the calendar/MCP
   endpoints. Anything missed here goes down when the nameservers switch.
3. Set `pond` to **DNS only** (grey cloud). Proxying it through Cloudflare
   can break Vercel's certificate issuance; grey-cloud keeps it behaving
   exactly as it does today.
4. Change the nameservers at the registrar. `pond-hopping.vercel.app`
   keeps working throughout as a fallback.
5. Wait for Cloudflare to show the zone **Active**.

### 2. Enable Email Routing
1. In the `eend.app` zone → **Email** → **Email Routing** → Enable.
2. Let Cloudflare add its own MX + TXT records automatically.
   ⚠️ This claims the apex's MX. If you later want real mailboxes on
   `eend.app` (Google Workspace and the like), set that up *first* — a
   domain can only point its MX at one mail system.
3. Under **Routing rules**, add a rule: `bookings@eend.app` → **Send to a
   Worker** → (pick the worker after deploying it below).

### 3. Deploy the Worker
From this directory (`cloudflare/mail-worker/`):

```sh
npm install
npx wrangler login          # opens a browser to authorize your Cloudflare account
npx wrangler secret put INBOUND_EMAIL_SECRET
# paste the SAME secret you set as INBOUND_EMAIL_SECRET in Vercel's
# pond-hopping project env vars — they must match exactly
npx wrangler deploy
```

### 4. Wire the routing rule to the deployed Worker
Back in **Email Routing → Routing rules** (step 2.3), the deployed
`pond-hopping-mail-worker` will now be selectable as the destination for
`bookings@eend.app`. Save it.

### 5. Test
Forward any real booking confirmation email to `bookings@eend.app`.
Within a minute or two it should show up as a review banner in the Plan
tab of the app.

## Updating

Edit `src/index.js`, then re-run `npx wrangler deploy` from this
directory. No Vercel changes needed unless `/api/inbound-email`'s
expected payload shape changes.

---

## Why this Worker probably isn't the route to take

`eend.app` has four live properties on it — the website itself, plus
`pond`, `nouse` and `duckworth`. Cloudflare Email Routing needs Cloudflare
to be authoritative for the whole zone (subdomain zones are
Enterprise-only), which means moving nameservers and re-homing all four.
That's a real risk for a convenience feature.

**Use [CloudMailin](https://www.cloudmailin.com/inbound) instead.** It
hands you an address on its own domain, so there is no DNS change at all:

1. Sign up (free tier).
2. Set the target to `https://pond.eend.app/api/inbound-email?key=<INBOUND_EMAIL_SECRET>`,
   POST format JSON.
3. Set `INBOUND_EMAIL_SECRET` in the Vercel project to the same value.
4. Set `VITE_INBOX_ADDRESS` in Vercel to the address CloudMailin gives you —
   that's what makes the "forward your bookings" option appear in
   onboarding. Until it's set, that route stays hidden.

`api/inbound-email.js` normalises CloudMailin, Postmark and SendGrid
payload shapes, so swapping provider later needs no code change.

## Attachments

Plenty of confirmations say "your itinerary is attached" and put nothing
useful in the body, so PDFs are read too — handed straight to the
extraction model, which copes with a scan as well as with generated text.
Whichever provider sits in front has to actually send them:

* **CloudMailin** — its JSON format must be set to include attachments
  inline (base64). The attachment-store option works as well;
  `api/_lib/attachments.js` fetches by URL when a row carries one instead
  of bytes.
* **This Worker** — nothing to configure, it forwards them itself.

Limits are deliberately tight: PDFs only, at most 4 per email, 3.5 MB each
and ~3.8 MB in total. Vercel rejects a request body over 4.5 MB and base64
inflates by a third, so anything bigger is skipped rather than sinking the
whole email — the body text and the other attachments still get through.

This Worker stays here in case `eend.app` ever does move to Cloudflare for
other reasons — at which point it's a better fit, since the address can
then live on your own domain.
