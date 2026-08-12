import { useState } from 'react'
import { track } from '../lib/analytics.js'
import SheetGrip from './SheetGrip.jsx'

// Handing Pond Hopping to an assistant, one step at a time.
//
// This was a row in a list that copied a URL to the clipboard and said
// nothing else. David, 12 August: "no instructions. not intuitive at all.
// could be step phased." Quite. A connector URL on its own is a string with
// a key in it — you have to already know what MCP is, that your assistant
// supports it, where in that assistant's settings it lives, and what to say
// once it is there. Four pieces of knowledge, none of them in the app.
//
// So: four steps, one at a time, and the one that matters — what to actually
// ask for — has the words ready to copy, because "now ask it to do something"
// is where people stop.

/** Where the connector setting lives, per assistant. Named rather than
 *  screenshotted: these menus move, and a wrong screenshot is worse than a
 *  sentence that is only nearly right. */
const ASSISTANTS = [
  { id: 'claude', name: 'Claude', where: 'Settings → Connectors → Add custom connector' },
  { id: 'chatgpt', name: 'ChatGPT', where: 'Settings → Connectors → Add' },
  { id: 'gemini', name: 'Gemini', where: 'Extensions → Manage → Add' },
]

/** The three things worth asking for first, in the order they pay off. */
const ASKS = [
  {
    id: 'inbox',
    say: 'Go through my email for flight and hotel confirmations, and add any trips that are missing from Pond Hopping.',
    why: 'The big one. Years of travel, out of an inbox you already have.',
  },
  {
    id: 'gaps',
    say: 'Look at my Pond Hopping trips and tell me which ones are missing flights or dates.',
    why: 'Finds the holes without adding anything.',
  },
  {
    id: 'stats',
    say: 'How far have I flown, and how many countries?',
    why: 'A quick check that it is connected and can see your log.',
  },
]

export default function ConnectAI({ url, onClose }) {
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(null)

  async function copy(what, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      track('ai_copied', { what })
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* a browser that won't copy still shows the text to select by hand */
    }
  }

  const go = (n) => {
    setStep(n)
    track('ai_step', { step: n })
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet ai-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        <div className="ai-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`ai-dot${n === step ? ' on' : ''}${n < step ? ' done' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="ios-sheet-title">Let your AI do it</div>
            <div className="ios-sheet-sub">
              Claude, ChatGPT or Gemini can read your inbox and put the trips in for you. It
              already has your email. We never need it.
            </div>
            <ul className="ai-can">
              <li>Find bookings you forgot you had</li>
              <li>Build the trips out of them</li>
              <li>Tell you what is missing</li>
            </ul>
            <button className="ios-sheet-done" onClick={() => go(1)}>
              Set it up
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="ios-sheet-title">Copy this</div>
            <div className="ios-sheet-sub">
              Your own connector address. Treat it like a password — anyone holding it can read
              and add to your log.
            </div>
            <button className="ai-url" onClick={() => copy('url', url)}>
              <span className="ai-url-text">{url}</span>
              <span className="ai-url-do">{copied === 'url' ? 'Copied' : 'Copy'}</span>
            </button>
            <button className="ios-sheet-done" onClick={() => go(2)}>
              Copied it
            </button>
            <button className="account-btn ghost" onClick={() => go(0)}>
              Back
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="ios-sheet-title">Paste it in</div>
            <div className="ios-sheet-sub">
              Wherever your assistant keeps its connectors. Call it Pond Hopping.
            </div>
            <div className="ai-wheres">
              {ASSISTANTS.map((a) => (
                <div key={a.id} className="ai-where">
                  <span className="ai-where-name">{a.name}</span>
                  <span className="ai-where-path">{a.where}</span>
                </div>
              ))}
            </div>
            <div className="ai-note">
              Menus move. If none of those match, look for anything called connectors, tools or
              MCP.
            </div>
            <button className="ios-sheet-done" onClick={() => go(3)}>
              Added it
            </button>
            <button className="account-btn ghost" onClick={() => go(1)}>
              Back
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="ios-sheet-title">Now ask it</div>
            <div className="ios-sheet-sub">
              This is the step people stop at. Here are the words — tap one to copy it.
            </div>
            <div className="ai-asks">
              {ASKS.map((a) => (
                <button key={a.id} className="ai-ask" onClick={() => copy(a.id, a.say)}>
                  <span className="ai-ask-say">&ldquo;{a.say}&rdquo;</span>
                  <span className="ai-ask-why">{copied === a.id ? 'Copied' : a.why}</span>
                </button>
              ))}
            </div>
            <div className="ai-note">
              Anything it adds turns up in your trips, and you can change or delete the lot.
            </div>
            <button className="ios-sheet-done" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
