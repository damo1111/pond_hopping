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
