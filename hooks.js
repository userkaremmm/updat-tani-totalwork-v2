/* ============================================================================
   TOTAL WORK — Shared hooks

   Behaviour that three or more components each need, and that each of them was
   either doing slightly differently or not doing at all: reading storage
   without crashing, counting a number up, and letting the keyboard dismiss
   things the mouse could already dismiss.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'

/* localStorage throws — not returns null — when a browser is in a mode that
   blocks it (Safari private browsing, Firefox with cookies denied, an embedded
   webview). App.jsx read the theme in a useState initializer, so that throw
   happened during the first render, before any error boundary existed to catch
   it: a blank page, with the real cause three frames down the stack. */
export const storage = {
  get(key, fallback = null) {
    try { const value = localStorage.getItem(key); return value ?? fallback } catch { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem(key, value) } catch { /* storage unavailable — the preference just does not persist */ }
  },
  /* A hand-edited or half-written JSON blob must not take the page down with
     it; a bad value is indistinguishable from no value as far as we care. */
  object(key, fallback = {}) {
    try { const parsed = JSON.parse(localStorage.getItem(key) || 'null'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback } catch { return fallback }
  },
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Ease a number towards `value` over 350 ms and return the current position.
 *
 * Honours prefers-reduced-motion by jumping straight to the target. A KPI that
 * counts up is decoration; for a reader who has asked the OS to stop moving
 * things, six simultaneously animating figures are the thing they asked to
 * stop, and the number is the part they came for.
 */
export function useAnimated(value) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) { current.current = value; setShown(value); return }
    const start = performance.now(), origin = current.current
    let frame
    const tick = (now) => {
      const progress = Math.min((now - start) / 350, 1)
      const next = origin + (value - origin) * (1 - (1 - progress) ** 3)
      current.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return shown
}

/**
 * Close a popover on Escape or on a pointer press outside `ref`.
 *
 * The profile menu could only be closed by clicking the avatar again — clicking
 * the page behind it, or pressing Escape, left it hanging over the content.
 */
export function useDismiss(ref, close, active = true) {
  useEffect(() => {
    if (!active) return
    const onKey = (event) => { if (event.key === 'Escape') close() }
    const onPointer = (event) => { if (!ref.current?.contains(event.target)) close() }
    document.addEventListener('keydown', onKey)
    /* pointerdown, not click: a click fires after the press completes, so a
       press that started inside a scrollbar or ended outside the window left
       the menu open. */
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [ref, close, active])
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const EDITABLE = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled])'
/* offsetParent filters out anything hidden — a control inside a collapsed
   section must not become a tab stop the user cannot see. */
const focusables = (node) => [...(node?.querySelectorAll(FOCUSABLE) || [])].filter((element) => element.offsetParent !== null)

/**
 * Make a modal behave like one: Escape closes it, Tab cycles inside it, and
 * focus returns to whatever opened it.
 *
 * Without this, tabbing out of the housing form walked into the dashboard
 * behind the scrim — every control still reachable, still clickable, with no
 * visible indication of where the caret had gone.
 */
export function useModal(ref, close) {
  /* Deliberately two effects. Moving focus is a mount-time action and must not
     depend on `close`: parents pass an inline arrow, so a parent re-render (a
     toast appearing, say) hands down a new function — and with one combined
     effect that re-ran the whole body, yanking the caret back to the first
     field in the middle of typing. */
  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current
    /* The first real input when the dialog is a form, otherwise whatever comes
       first — for the read-only drawer that is its close button. */
    const first = node?.querySelector(EDITABLE) || focusables(node)[0]
    first?.focus()
    return () => {
      /* Only reclaim focus if it is still inside the dialog being torn down — a
         close that happened because the user clicked something else on the page
         should not yank them back. */
      if (opener instanceof HTMLElement && (!document.activeElement || document.activeElement === document.body || node?.contains(document.activeElement))) opener.focus()
    }
  }, [ref])

  useEffect(() => {
    const node = ref.current
    const onKey = (event) => {
      /* stopPropagation: a drawer opened from a page that also listens for
         Escape would otherwise close both at once. */
      if (event.key === 'Escape') { event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const items = focusables(node)
      if (!items.length) return
      const edge = event.shiftKey ? items[0] : items[items.length - 1]
      if (document.activeElement === edge || !node.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? items[items.length - 1] : items[0]).focus()
      }
    }
    node?.addEventListener('keydown', onKey)
    return () => node?.removeEventListener('keydown', onKey)
  }, [ref, close])
}
