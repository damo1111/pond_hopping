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

Google OAuth is **already wired** — `src/lib/google.js` uses
`signInWithOAuth` to connect Gmail and Calendar, so the client ID and the
Supabase provider are already configured. Signing in reuses that provider and
deliberately asks for **no scopes**: connecting an inbox is a different act
from getting in, and asking for Gmail at the front door puts a consent screen
the size of a legal notice in front of somebody who only wanted to sign in.

Nothing to set up. Add `google` to `VITE_WAYS_IN`.

### Apple

Not yet configured. Needs, in the Apple Developer console:

1. An **App ID** with *Sign in with Apple* enabled.
2. A **Services ID** — this is the client ID Supabase wants.
3. A **key** for Sign in with Apple (a `.p8`), plus its Key ID and your Team ID.
4. The return URL registered against the Services ID:
   `https://qslksdgxoibzrisywvqk.supabase.co/auth/v1/callback`

Then Supabase → Authentication → Sign In / Providers → Apple: Services ID as
the client ID, and the secret built from the key, Key ID and Team ID.

**Do not paste the `.p8` into a chat.** It is a real credential and Apple will
not reissue it.

Apple is not optional once Google is offered: App Store Review guideline 4.8
requires Sign in with Apple wherever a third-party sign-in is available, and
this repo has `ios/` in it.

## One person, one account

Somebody who taps Apple on Monday and Google on Tuesday should find their
trips either way.

Supabase links identities on a **verified** email address, which both Apple
and Google supply. The setting is in Authentication → Sign In / Providers →
*Allow manual/automatic linking*; it must be on, or the second provider makes
a second account and a returning hopper meets an empty globe with no way back
to their own trips.

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
