import { useEffect, useRef, useState } from 'react'

/**
 * Install chip + iOS "Add to Home Screen" sheet (app-family blueprint §5,
 * push omitted). Android/Chrome uses beforeinstallprompt; iOS Safari shows
 * a manual instruction sheet. Hidden once running as a standalone PWA.
 */
export default function InstallChip() {
  const [show, setShow] = useState(false)
  const [sheet, setSheet] = useState(false)
  const deferred = useRef(null)

  useEffect(() => {
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    if (standalone) return

    const ua = navigator.userAgent || ''
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua)

    const onPrompt = (e) => {
      e.preventDefault()
      deferred.current = e
      setShow(true)
    }
    const onInstalled = () => {
      deferred.current = null
      setShow(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (isIOS && isSafari) setShow(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const onClick = async () => {
    if (deferred.current) {
      deferred.current.prompt()
      try {
        await deferred.current.userChoice
      } catch {
        /* ignore */
      }
      deferred.current = null
      setShow(false)
      return
    }
    setSheet(true)
  }

  if (!show) return null

  return (
    <>
      <button className="install-chip" onClick={onClick} aria-label="Install app">
        📲
      </button>

      {sheet && (
        <div className="ios-sheet-overlay" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="ios-sheet">
            <div className="ios-sheet-grip" />
            <div className="ios-sheet-title">Add Pond Hopping to your Home Screen</div>
            <div className="ios-sheet-sub">
              Opens full-screen like a normal app — no App Store needed.
            </div>
            <ol className="ios-sheet-steps">
              <li>
                <span className="ios-step-n">1</span>
                <span>Tap the <b>Share</b> button <b>↑</b> at the bottom of Safari</span>
              </li>
              <li>
                <span className="ios-step-n">2</span>
                <span>Scroll down and tap <b>Add to Home Screen</b></span>
              </li>
              <li>
                <span className="ios-step-n">3</span>
                <span>Tap <b>Add</b>, then open it from the new icon</span>
              </li>
            </ol>
            <button className="ios-sheet-done" onClick={() => setSheet(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
