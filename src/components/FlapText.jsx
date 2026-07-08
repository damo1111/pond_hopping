import { useEffect, useState } from 'react'

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

// A "nod to" a physical split-flap departures board: each character flicks
// through a few random glyphs before settling, staggered left to right.
export default function FlapText({ text, className, groupDelay = 0, stagger = 16 }) {
  return (
    <span className={className}>
      {(text || '').split('').map((ch, i) => (
        <FlapChar key={i} target={ch} delay={groupDelay + i * stagger} />
      ))}
    </span>
  )
}
