# Push notifications — what's built, and what's left to you

The code is done. Two artefacts have to come out of dashboards, and until
they exist push silently does nothing (deliberately — no crashes, no
errors, imports still work exactly as now).

## 1. Vercel environment variables

| Name | Value |
|---|---|
| `PUSH_SECRET` | `8bc51b9938ade909c7fdbada82cc3c08d74736f687a396b0` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | the **same** service-account JSON you already generated for Firebase App Distribution — paste the whole file |

`PUSH_SECRET` was generated inside the database; it's what lets the server
fetch a person's device tokens without a service-role key. Rotate it by
updating both `app_config` and Vercel together.

## 2. `google-services.json` (Android)

Firebase console → Project settings → General → your Android app
(`app.eend.pond`) → **Download google-services.json**, and commit it to:

```
android/app/google-services.json
```

Without it the Android build has no FCM configuration and no token is ever
issued. It contains no secrets — it's designed to ship inside the APK.

## 3. iOS, when you get to it

Apple Developer → Keys → **+** → enable **Apple Push Notifications service
(APNs)** → download the `.p8` (once only — Apple won't show it again).
Then Firebase console → Project settings → **Cloud Messaging** → iOS app →
upload it with its Key ID and your Team ID.

Also add the **Push Notifications** capability in Xcode for the App target.

## How it behaves

- Registration happens on every signed-in launch, because FCM tokens rotate
  and a stale one silently stops delivering.
- Tokens live in `push_tokens`, one row per device. There is deliberately
  **no SELECT policy** — the app never lists tokens, so a leaked anon key
  can't enumerate anyone's devices.
- Dead tokens (uninstalls, rotations) are pruned automatically when FCM
  rejects them.
- Web builds no-op. Browser push needs a service worker and VAPID keys —
  a different mechanism entirely, and the people who want to be told
  "a booking arrived" are the ones with the app installed.
- A failed push never affects the import. It's sent after the row is
  stored, inside its own catch.
