import { useContext, useEffect, useState } from 'react'
import { SheetContext } from '../lib/sheetContext.js'

const NUMS = '0123456789'
const ALPHAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function randomCharFor(target) {
  if (/[0-9]/.test(target)) return NUMS[Math.floor(Math.random() * NUMS.length)]
  if (/[A-Za-z]/.test(target)) return ALPHAS[Math.floor(Math.random() * ALPHAS.length)]
  return target
}

// One split-flap unit: cycles through a few random glyphs with a quick
// rotateX "flick" before landing on the real character.
function FlapChar({ target, delay }) {
  const [display, setDisplay] = useState(/[A-Za-z0-9]/.test(target) ? randomCharFor(target) : target)
  const [spin, setSpin] = useState(false)

  useEffect(() => {
    if (!/[A-Za-z0-9]/.test(target)) {
      setDisplay(target)
      return
    }
    let alive = true
    const timers = []
    const steps = 5 + Math.floor(Math.random() * 3)
    let i = 0

    const tick = () => {
      if (!alive) return
      setSpin(true)
      timers.push(
        setTimeout(() => {
          if (!alive) return
          i += 1
          setDisplay(i >= steps ? target : randomCharFor(target))
          setSpin(false)
          if (i < steps) timers.push(setTimeout(tick, 45))
        }, 85)
      )
    }

    timers.push(setTimeout(tick, delay))
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [target, delay])

  return <span className={`flap-char${spin ? ' spin' : ''}`}>{display}</span>
}

// How long the sheet takes to arrive: transform 0.22s, plus a frame or two
// to be sure it has stopped moving before sixty characters start flicking.
const SHEET_SETTLE_MS = 280

// A "nod to" a physical split-flap departures board: each character flicks
// through a few random glyphs before settling, staggered left to right.
//
// The board always runs. It is the thing people remember about this app, and
// a flourish that only happens somewhere is not a signature, it is a bug with
// good manners.
export default function FlapText({ text, className, groupDelay = 0, stagger = 16 }) {
  // Four flight cards is about sixty flapping characters, each firing six or
  // seven state updates over a second — nine hundred renders landing exactly
  // while a sheet is trying to slide, and reading as SOY → CXU while they do.
  //
  // That used to mean sheets got no board at all. Waiting is enough: hold the
  // plain text while the sheet travels, then let it flap once it has landed,
  // which is what a real board does anyway — sits still, then turns over.
  const inSheet = useContext(SheetContext)
  const [settled, setSettled] = useState(!inSheet)

  useEffect(() => {
    if (settled) return undefined
    const t = setTimeout(() => setSettled(true), SHEET_SETTLE_MS)
    return () => clearTimeout(t)
  }, [settled])

  if (!settled) return <span className={className}>{text}</span>

  return (
    <span className={className}>
      {(text || '').split('').map((ch, i) => (
        <FlapChar key={i} target={ch} delay={groupDelay + i * stagger} />
      ))}
    </span>
  )
}
