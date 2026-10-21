import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react"
import { stepDropIndex } from "./lib/stepReorder"
interface Motion {
  source: number
  target: number
  offset: number
  space: number
}
type Drag = {
  pointerId: number
  startY: number
  y: number
  scrollY: number
  source: number
  centers: number[]
  space: number
  active: boolean
}
export default function useStepReorder(
  onReorder: (from: number, to: number) => void,
  disabled: boolean,
) {
  const list = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<number | null>(null)
  const latest = useRef(onReorder)
  const [motion, setMotion] = useState<Motion | null>(null)
  const [announcement, setAnnouncement] = useState("")
  useEffect(() => {
    latest.current = onReorder
  }, [onReorder])
  function clear() {
    if (timer.current !== null) clearTimeout(timer.current)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    timer.current = null
    frame.current = null
    drag.current = null
  }
  useEffect(() => {
    if (disabled) {
      clear()
      setMotion(null)
    }
  }, [disabled])
  useEffect(() => () => clear(), [])
  function updateMotion() {
    const current = drag.current
    if (!current?.active) return
    const offset = current.y - current.startY + window.scrollY - current.scrollY
    setMotion({
      source: current.source,
      target: stepDropIndex(current.centers, current.source, offset),
      offset,
      space: current.space,
    })
  }
  function scrollFrame() {
    const current = drag.current
    if (!current?.active) return
    const edge = 96
    const speed =
      current.y < edge
        ? -Math.min(12, (edge - current.y) / 6)
        : current.y > window.innerHeight - edge
          ? Math.min(12, (current.y - window.innerHeight + edge) / 6)
          : 0
    if (speed) window.scrollBy(0, speed)
    updateMotion()
    frame.current = requestAnimationFrame(scrollFrame)
  }
  function start(event: PointerEvent<HTMLButtonElement>, source: number) {
    if (disabled || drag.current || event.button !== 0) return
    const cards = Array.from(
      list.current?.querySelectorAll<HTMLElement>(".wizard-step-card") ?? [],
    )
    if (cards.length < 2) return
    const rects = cards.map((card) => card.getBoundingClientRect())
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      y: event.clientY,
      scrollY: window.scrollY,
      source,
      centers: rects.map((rect) => rect.top + rect.height / 2),
      space: rects[source].height + 24,
      active: false,
    }
    timer.current = setTimeout(() => {
      const current = drag.current
      if (!current) return
      current.active = true
      setAnnouncement(`Step ${source + 1} selected. Drag to move.`)
      updateMotion()
      frame.current = requestAnimationFrame(scrollFrame)
    }, 280)
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    current.y = event.clientY
    if (!current.active && Math.abs(current.y - current.startY) > 10) {
      clear()
      return
    }
    if (current.active) {
      event.preventDefault()
      updateMotion()
    }
  }
  function finish(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (commit && current.active) {
      const target = stepDropIndex(
        current.centers,
        current.source,
        current.y - current.startY + window.scrollY - current.scrollY,
      )
      latest.current(current.source, target)
      setAnnouncement(
        `Step ${current.source + 1} moved to position ${target + 1}.`,
      )
    }
    clear()
    setMotion(null)
  }
  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    count: number,
  ) {
    if (disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const target = Math.max(
      0,
      Math.min(count - 1, index + (event.key === "ArrowUp" ? -1 : 1)),
    )
    latest.current(index, target)
    setAnnouncement(`Step ${index + 1} moved to position ${target + 1}.`)
  }
  function style(index: number) {
    if (!motion) return undefined
    let offset = 0
    if (index === motion.source) offset = motion.offset
    else if (
      motion.target > motion.source &&
      index > motion.source &&
      index <= motion.target
    )
      offset = -motion.space
    else if (
      motion.target < motion.source &&
      index >= motion.target &&
      index < motion.source
    )
      offset = motion.space
    return { transform: `translateY(${offset}px)` }
  }
  return { list, motion, announcement, start, move, finish, keyboard, style }
}
