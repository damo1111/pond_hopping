# Forwarding a booking in

Forward a confirmation email to an address and it appears in the app, pulled
apart into flights, stays and dinners, filed against the right trip, with a
push to say it arrived. Nothing is added to an itinerary until it has been
looked at.

## Why this and not "connect my inbox"

Gmail read access is a *restricted scope*. Shipping it to anybody but
yourself means Google's restricted-scope verification and an annual CASA
security assessment — money, delay, and a real chance of being refused.

Forwarding needs no permission at all. It works from any mail client on any
platform, and it handles the case an inbox scan cannot: the confirmation
somebody else booked and forwarded to you.

`api/gmail-scan.js` still exists and still works for anyone who has connected
Google. It is the power-user option, not the front door.

## What is already built

- **`api/inbound-email.js`** — takes whatever the provider posts, normalises
  CloudMailin / Postmark / SendGrid / Cloudflare payloads, reads PDF
  attachments, runs the same extraction as the paste box, guesses the trip,
  files it in `email_imports` as pending, sends a push.
- **`email_imports`** — the table, with RLS scoping every row to the address
  it arrived from.
- **`api_guess_trip(p_email, p_dates)`** — matches against trips the
  *forwarder* is a member of, private drafts included.
- **`EmailImportsReview.jsx`** — the review screen on the Plan tab.
- **`ForwardBookings.jsx`** — the address, in the app, where somebody can see
  it.

## What switches it on

One environment variable in Vercel:

```
VITE_FORWARD_EMAIL = <the address the provider gave you>
```

Until that is set, `forwardingOn()` is false and the block does not render at
all. A half-configured feature shows nothing rather than an address that
bounces.

The endpoint also needs `INBOUND_EMAIL_SECRET`, which is already set. It is
the only thing standing between this endpoint and the open internet — no
inbound-email provider signs its webhooks — so the provider must be pointed
at the URL with the key on it:

```
https://pond.eend.app/api/inbound-email?key=<INBOUND_EMAIL_SECRET>
```

Basic auth works too: any username, the secret as the password.

## Setting up CloudMailin

1. Sign up. The free tier is 200 emails a month, which is more forwarded
   bookings than anybody has.
2. It gives you an address on its own domain immediately —
   `something@cloudmailin.net`. **This works with no DNS changes at all**,
   which is the reason for choosing it: `eend.app` has four live subdomains
   and its nameservers are not somewhere Email Routing can reach.
3. Point the target at the URL above. Format: **JSON**.
4. Put that address in `VITE_FORWARD_EMAIL` and redeploy.

Test it by forwarding a real confirmation. It should appear on the Plan tab
within a few seconds, with a push.

### Later: booking@eend.app

The friendly address is a straight swap once MX records point at the
provider — CloudMailin supports custom domains. Nothing in the app changes
except the environment variable. Worth doing before anybody outside the
household uses this; `a1b2c3d4@cloudmailin.net` is not an address anyone will
remember or trust.

## The one way this fails

**The match is on the sender.** A forward from an address that is not on the
account is filed under an address nobody owns, and RLS makes it invisible
from that moment — no error, no push, no row anybody can see.

So the sheet names the addresses that currently work, and offers to add
another. Those go to `profiles.email_aliases`, which `is_my_address()` and
therefore all of the RLS already understands.

Worth knowing: a forward with **no From header at all** stores `owner_email`
as null, and the read policy is `owner_email IS NULL OR is_my_address(...)`
— so such a row is readable by every signed-in user. Rare, since mail without
a sender barely exists, but it is a hole and it should be closed by dropping
the null branch once there is anybody here but us.
