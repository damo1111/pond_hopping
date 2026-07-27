# Pond Hopping mail worker

Receives forwarded booking emails at `bookings@mail.eend.app` (Cloudflare
Email Routing → this Worker) and hands them to Pond Hopping's
`/api/inbound-email` endpoint for AI extraction. Free — no Postmark/
Mailgun/SendGrid account needed.

## One-time setup

### 1. Add `mail.eend.app` as its own Cloudflare zone
1. Cloudflare dashboard → **Add a Site** → enter `mail.eend.app` → pick the **Free** plan.
2. Cloudflare gives you two nameservers (e.g. `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`).
3. Go to wherever `eend.app`'s DNS is currently managed and add an **NS record**:
   `mail` → `xxx.ns.cloudflare.com` and `yyy.ns.cloudflare.com`
   This delegates only `mail.eend.app` (and anything under it) to Cloudflare — the rest of `eend.app`, including `pond.eend.app`, is untouched.
4. Wait for Cloudflare to show the zone as **Active** (usually minutes, can take longer depending on DNS propagation).

### 2. Enable Email Routing
1. In the `mail.eend.app` zone → **Email** → **Email Routing** → Enable.
2. Cloudflare will ask to add its own MX + TXT records — let it do this automatically (it's managing the whole `mail.eend.app` zone now, so this is safe).
3. Under **Routing rules**, add a rule: `bookings@mail.eend.app` → **Send to a Worker** → (you'll pick the worker after deploying it below, or come back to wire this up once it exists).

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
`bookings@mail.eend.app`. Save it.

### 5. Test
Forward any real booking confirmation email to `bookings@mail.eend.app`.
Within a minute or two it should show up as a review banner in the Plan
tab of the app.

## Updating

Edit `src/index.js`, then re-run `npx wrangler deploy` from this
directory. No Vercel changes needed unless `/api/inbound-email`'s
expected payload shape changes.
