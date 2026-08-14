// Google, opened somewhere we can close again.
//
// Two legs of this happen on Google's own pages: the consent screen, and
// the picker. The picker has to happen there — the Picker API has no
// embeddable widget, and that is the point: we cannot list a library, so
// somebody points at things themselves, in Google's window. One trip out is
// inherent.
//
// The trip *back* is not. Handed to Chrome, the picker ends on Google's own
// dead end — a green tick reading "Done! Continue in the other app or
// device" — and there it stays, because that page has never heard of us.
// Somebody has just finished choosing and the last thing the flow does is
// abandon them in another app.
//
// A Custom Tab is the same page in a sheet the app owns. When our polling
// sees the pick land we close it, and the app is underneath, already
// bringing the photographs in. Google accepts OAuth and the picker in one
// because a Custom Tab is a real browser, not an embedded WebView.
//
// Consent is the same shape of problem. Sent out with location.assign it
// leaves the app entirely, and coming back depends on a custom scheme, a
// registered intent-filter and somebody finding their way home. In a Custom
// Tab it is a sheet over the app, closed the moment the answer arrives.
//
// On the web none of this applies: there is a tab, somebody switches back to
// it, and the wake-on-return notices. So all of this is a no-op there, and
// the link the card renders stays the way in.

async function browser() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor?.isNativePlatform?.()) return null
    const { Browser } = await import('@capacitor/browser')
    return Browser ?? null
  } catch {
    // No plugin in this build, or a platform without it. The card's link
    // still works; it is only the closing that is lost.
    return null
  }
}

/**
 * Open it, where we are able to open it ourselves.
 *
 * Returns whether it was opened, so the caller can tell "a sheet is up" from
 * "the link on the card is the only way through".
 */
export async function openAway(url, { get = browser } = {}) {
  const Browser = await get()
  if (!Browser || !url) return false
  try {
    await Browser.open({ url, presentationStyle: 'fullscreen' })
    return true
  } catch {
    return false
  }
}

/** Put it away. Silent everywhere it does not apply, which is most places. */
export async function closeAway({ get = browser } = {}) {
  const Browser = await get()
  if (!Browser) return false
  try {
    await Browser.close()
    return true
  } catch {
    // Already gone — closed by hand, or never opened. Not worth a word.
    return false
  }
}
