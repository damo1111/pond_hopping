// A readout of what the sheet's drag actually received, on the device it
// actually failed on.
//
// The handle stayed broken through three attempts because every test I could
// run passed. Desktop Chromium and Android's WebView disagree about which
// events a downward drag produces and whether they can be cancelled, and no
// amount of reasoning from here settles that — only the phone knows. So the
// phone can say.
//
// Off unless switched on from Account, stored in localStorage so it survives
// the reload, and it records nothing and costs nothing while off.

const KEY = 'pond:gesturedebug'
const listeners = new Set()
let log = []

export function isOn() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function toggle() {
  try {
    const next = isOn() ? '0' : '1'
    localStorage.setItem(KEY, next)
    if (next === '0') log = []
    emit()
    return next === '1'
  } catch {
    return false
  }
}

// One line per event, newest last, capped — a drag is a few dozen events and
// the point is the shape of them, not every frame.
export function record(line) {
  if (!isOn()) return
  log = [...log.slice(-11), line]
  emit()
}

export function clear() {
  log = []
  emit()
}

export function read() {
  return log
}

function emit() {
  for (const fn of listeners) fn()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
