// A PIN that keeps children out of the teacher's screens (setup, teacher
// view, check page). It's a classroom lock, not a security boundary: the PIN
// is stored hashed on this tablet only, and holding "Forgot PIN?" for a few
// seconds removes it without touching any data.
//
// With no PIN set, nothing is locked. Once unlocked, the teacher's screens
// stay open until the tablet goes back to the class view (handing it to a
// child) or 30 minutes pass.

const PIN_KEY = 'class-flow:teacher-pin'
const UNLOCK_KEY = 'class-flow:teacher-unlocked-until'
const FAILS_KEY = 'class-flow:teacher-pin-fails'

export const PIN_LENGTH = 4
export const UNLOCK_MINUTES = 30
export const MAX_TRIES = 5
export const LOCKOUT_SECONDS = 30

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export class TeacherLock {
  private readonly saved: KeyValue // survives reloads (the PIN)
  private readonly session: KeyValue // this browser tab only (unlocked state, wrong tries)
  private readonly now: () => number

  constructor(saved: KeyValue = safe(() => localStorage), session: KeyValue = safe(() => sessionStorage), now = Date.now) {
    this.saved = saved
    this.session = session
    this.now = now
  }

  hasPin(): boolean {
    return this.saved.getItem(PIN_KEY) !== null
  }

  setPin(pin: string): void {
    if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`)
    const salt = Math.random().toString(36).slice(2, 10)
    this.saved.setItem(PIN_KEY, JSON.stringify({ salt, hash: hash(salt + pin) }))
    this.unlock() // the teacher who just set it is already in
  }

  removePin(): void {
    this.saved.removeItem(PIN_KEY)
    this.session.removeItem(FAILS_KEY)
  }

  // Whether the teacher's screens can open without asking for the PIN.
  isOpen(): boolean {
    if (!this.hasPin()) return true
    return Number(this.session.getItem(UNLOCK_KEY) ?? 0) > this.now()
  }

  lock(): void {
    this.session.removeItem(UNLOCK_KEY)
  }

  // Seconds until another try is allowed after too many wrong ones, or 0.
  waitSeconds(): number {
    const { count, at } = this.fails()
    if (count < MAX_TRIES) return 0
    return Math.max(0, Math.ceil((at + LOCKOUT_SECONDS * 1000 - this.now()) / 1000))
  }

  // Checks a PIN; on success the teacher's screens open.
  tryPin(pin: string): 'ok' | 'wrong' | 'wait' {
    if (this.waitSeconds() > 0) return 'wait'
    const stored = this.saved.getItem(PIN_KEY)
    if (!stored) return 'ok'
    const { salt, hash: expected } = JSON.parse(stored) as { salt: string; hash: string }
    if (hash(salt + pin) === expected) {
      this.session.removeItem(FAILS_KEY)
      this.unlock()
      return 'ok'
    }
    const { count } = this.fails()
    // After a lockout has passed, wrong tries count from one again.
    this.session.setItem(FAILS_KEY, JSON.stringify({ count: count >= MAX_TRIES ? 1 : count + 1, at: this.now() }))
    return this.waitSeconds() > 0 ? 'wait' : 'wrong'
  }

  private unlock(): void {
    this.session.setItem(UNLOCK_KEY, String(this.now() + UNLOCK_MINUTES * 60_000))
  }

  private fails(): { count: number; at: number } {
    try {
      return JSON.parse(this.session.getItem(FAILS_KEY) ?? '{"count":0,"at":0}')
    } catch {
      return { count: 0, at: 0 }
    }
  }
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

// FNV-1a. Enough to avoid storing the PIN as plain text; not cryptographic.
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

// Storage can be blocked (private mode); then fall back to memory, so the
// lock still works for this visit.
function safe(get: () => Storage): KeyValue {
  try {
    const s = get()
    s.getItem('probe')
    return s
  } catch {
    const m = new Map<string, string>()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
  }
}
