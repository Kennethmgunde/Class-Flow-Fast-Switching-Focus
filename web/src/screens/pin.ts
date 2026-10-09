// The PIN pad shown before a teacher's screen when a PIN is set.

import { MAX_TRIES, PIN_LENGTH, type TeacherLock } from '../teacher-lock.ts'
import { h } from '../ui/dom.ts'

const FORGOT_HOLD_MS = 5000

// `onOpen` runs once the right PIN is entered.
export function renderPinPad(root: HTMLElement, lock: TeacherLock, onOpen: () => void): void {
  let entered = ''
  let message = 'Enter the teacher PIN'

  const draw = () => {
    const wait = lock.waitSeconds()
    root.replaceChildren(
      h('main', { class: 'pin-screen' },
        h('h1', {}, 'Teachers only'),
        h('p', { class: `pin-message ${message.startsWith('Wrong') ? 'wrong' : ''}`, role: 'status' },
          wait > 0 ? `Too many tries. Wait ${wait} seconds.` : message),
        h('div', { class: 'pin-dots', 'aria-hidden': 'true' },
          Array.from({ length: PIN_LENGTH }, (_, i) => h('span', { class: i < entered.length ? 'filled' : '' })),
        ),
        h('div', { class: 'pin-pad' },
          ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digitKey),
          h('a', { class: 'button ghost pin-key', href: '#/class', 'aria-label': 'Back to the class' }, 'Back'),
          digitKey('0'),
          h('button', { class: 'ghost pin-key', 'aria-label': 'Delete', disabled: wait > 0, on: { click: () => { entered = entered.slice(0, -1); draw() } } }, '⌫'),
        ),
        forgotButton(),
      ),
    )
    if (wait > 0) setTimeout(() => { if (root.querySelector('.pin-screen')) draw() }, 1000)
  }

  const digitKey = (d: string) =>
    h('button', { class: 'pin-key', disabled: lock.waitSeconds() > 0, on: { click: () => press(d) } }, d)

  const press = (d: string) => {
    if (entered.length >= PIN_LENGTH) return
    entered += d
    if (entered.length < PIN_LENGTH) return draw()
    const result = lock.tryPin(entered)
    entered = ''
    if (result === 'ok') return onOpen()
    message = result === 'wrong' ? `Wrong PIN. Try again (${MAX_TRIES} tries before a short wait).` : message
    draw()
  }

  // Hold for a few seconds to remove the PIN. Deliberately slow, and keeps all data.
  const forgotButton = () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = (e: Event) => {
      e.preventDefault()
      const b = e.currentTarget as HTMLElement
      b.classList.add('holding')
      timer = setTimeout(() => { lock.removePin(); onOpen() }, FORGOT_HOLD_MS)
    }
    const stop = (e: Event) => {
      clearTimeout(timer)
      ;(e.currentTarget as HTMLElement).classList.remove('holding')
    }
    return h('button', {
      class: 'link forgot',
      on: { pointerdown: start, pointerup: stop, pointerleave: stop, pointercancel: stop },
    }, 'Forgot PIN? Hold here for 5 seconds to remove it.')
  }

  draw()
}
