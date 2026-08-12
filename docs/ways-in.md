# Getting in

Three ways, in the order they cost somebody time:

| | how long | needs |
|---|---|---|
| **Apple** | one tap | an Apple device, or an Apple ID on the web |
| **Google** | one tap | a Google account |
| **A code by email** | a minute or two | a working inbox, right now |

The code is last on that list and was, until now, the only one. It is the
slowest possible sign-in and the only one that needs a working inbox at the
exact moment somebody is trying to get in — on a trip, on hotel wifi, behind
a mail server that greylists for four minutes. Which is precisely when this
app is used. On 12 August a code took three to four minutes to arrive; the
CloudMailin log shows it was sent in three seconds and deferred by the
receiving end.

It stays, because it is the only way in that works for somebody with neither
account, and because it is what every hopper who already has an account uses.

## What the app does

Nothing until it is told the providers exist.

`VITE_WAYS_IN` is a comma-separated list — `apple,google` — and is **empty by
default**. Empty means the sheet is exactly the email-and-code sheet it has
always been. This is deliberate: a button for a provider the Supabase project
has not been told about comes back with `Unsupported provider`, which is not a
sentence anybody should read at the front door.

The rules are in `src/lib/waysIn.js` and tested. Whatever somebody used last
time is drawn first, because *"which of these did I use?"* is the single most
common way a person ends up with two accounts.

## What has to be done outside the code

Neither of these can be done from the repository.

### Google

**This section used to say Google was already wired and there was nothing to
set up. That was wrong**, and it was the most expensive kind of wrong: it
would have had somebody flip `VITE_WAYS_IN` and ship a button that answers
`Unsupported provider`. Asked directly on 12 August:

    GET /auth/v1/authorize?provider=google
    400 {"error_code":"validation_failed",
         "msg":"Unsupported provider: provider is not enabled"}

The same for `apple`. And `auth.identities` holds five rows, all `email` —
nobody has ever completed an OAuth sign-in on this project, which also means
`connectGoogle()` in `src/lib/google.js` cannot be working either. The code
existing is not the same as the provider being enabled, and this doc
confused the two.

What is actually needed, in the Google Cloud console for the project that
owns the app:

1. **OAuth consent screen** configured. External. While it is in Testing,
   only addresses on the test-user list can sign in at all.
2. **Credentials → OAuth client ID → Web application**, with
   - Authorised JavaScript origin: `https://pond.eend.app`
   - Authorised redirect URI:
     `https://qslksdgxoibzrisywvqk.supabase.co/auth/v1/callback`
3. Its **Client ID and Client Secret** into Supabase → Authentication →
   Sign In / Providers → Google, and the provider switched **on**.

Signing in asks for **no scopes**, which is the whole reason it is separate
from connecting an inbox: `gmail.readonly` is a *restricted* scope, and a
restricted scope means Google verification — a review, a privacy policy, a
demo video — before anybody outside the test-user list may grant it. Sign-in
needs none of that. Keeping the two apart means the front door works today
and the Gmail import waits on a review that has not been started.

### Apple

Not configured either. Four objects in the Apple Developer console, and the
thing that makes it confusing is that **two of them are called identifiers
and only one of them is the one Supabase wants.**

1. **An App ID** (Identifiers → App IDs). This is the native app,
   `app.eend.pond`. Tick *Sign in with Apple*. It is the *primary* — it is
   not what you give Supabase.
2. **A Services ID** (Identifiers → Services IDs). A second, separate
   identifier, conventionally something like `app.eend.pond.web`. **This is
   the client ID Supabase wants.** Configure it:
   - Primary App ID: the one from step 1
   - Domains and Subdomains: `qslksdgxoibzrisywvqk.supabase.co`
   - Return URLs: `https://qslksdgxoibzrisywvqk.supabase.co/auth/v1/callback`

   Both are the *Supabase* domain, not `pond.eend.app`. The browser comes
   back to Supabase, which then sends it on to us — putting our own domain
   here is the single most common way this ends in `invalid_client`.
3. **A key** (Keys → +), with *Sign in with Apple* enabled and the App ID
   from step 1 as its primary. Downloads once, as a `.p8`. Note its **Key
   ID**; the **Team ID** is top right of the portal.
4. **A client secret**, which is where Apple differs from everybody else:
   there is no static secret. It is a JWT signed with the `.p8`, and Apple
   caps its life at **six months**, so it expires and has to be regenerated
   — put a reminder somewhere.

Then Supabase → Authentication → Sign In / Providers → Apple: the **Services
ID** as the client ID, and the JWT as the secret.

`scripts/apple-secret.mjs` generates the JWT. It reads the `.p8` from a path
and never prints it.

**Do not paste the `.p8` into a chat.** It is a real credential and Apple will
not reissue it.

Apple is not optional once Google is offered: App Store Review guideline 4.8
requires Sign in with Apple wherever a third-party sign-in is available, and
this repo has `ios/` in it.

## One person, one account

Somebody who taps Apple on Monday and Google on Tuesday should find their
trips either way — **and so should somebody who used a code on Sunday.**

Three ways in, one account. The code is not a lesser one: it is what every
existing hopper has, so it is the account the other two have to join rather
than the other way round. All five identities on this project today are
`email`, and every one of them must survive somebody tapping Apple once.

Supabase links identities on a **verified** email address. Apple and Google
both supply one, and so does the code — entering it is what verifies the
address, which is the whole mechanism. So the same setting covers all three:
Authentication → Sign In / Providers → *Allow manual/automatic linking*. It
must be on, or the second way in makes a second account and a returning
hopper meets an empty globe with no way back to their own trips.

It is worth proving rather than assuming, and it takes one query. Sign in
all three ways with the same address, then:

```sql
select u.email, count(*) as ways_in, array_agg(i.provider order by i.provider)
from auth.identities i join auth.users u on u.id = i.user_id
group by u.email having count(*) > 1;
```

One row, three providers, one email is what right looks like. Three rows of
one is the setting being off — and the sooner that is found the fewer
stranded accounts there are to merge by hand.

One thing to know about Apple: if somebody chooses **Hide My Email**, the
address is a private relay (`…@privaterelay.appleid.com`) and will not match
their Google one. That is Apple working as designed and there is no way round
it — those are genuinely two different addresses as far as anything can tell.

## Native builds

`signInWithOAuth` redirects. That is right on the web and in the installed
PWA, and it is **not** enough inside the Capacitor wrapper, where the redirect
has to leave the webview, open a system browser, and come back through a deep
link. That work is not done and the buttons should stay off in native builds
until it is.
