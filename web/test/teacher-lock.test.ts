import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCKOUT_SECONDS, MAX_TRIES, TeacherLock, UNLOCK_MINUTES, isValidPin } from '../src/teacher-lock.ts'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

// A lock with a controllable clock. `session` is per browser tab.
function setup() {
  let t = 1_000_000
  const saved = memory()
  const session = memory()
  const lock = new TeacherLock(saved, session, () => t)
  return { lock, saved, session, advance: (ms: number) => (t += ms) }
}

test('with no PIN, the teacher screens are open', () => {
  const { lock } = setup()
  assert.equal(lock.hasPin(), false)
  assert.equal(lock.isOpen(), true)
  lock.lock()
  assert.equal(lock.isOpen(), true)
})

test('setting a PIN keeps the teacher in; going to the class view locks', () => {
  const { lock } = setup()
  lock.setPin('2468')
  assert.equal(lock.isOpen(), true)
  lock.lock()
  assert.equal(lock.isOpen(), false)
  assert.equal(lock.tryPin('1111'), 'wrong')
  assert.equal(lock.isOpen(), false)
  assert.equal(lock.tryPin('2468'), 'ok')
  assert.equal(lock.isOpen(), true)
})

test(`the teacher screens lock themselves after ${UNLOCK_MINUTES} minutes`, () => {
  const { lock, advance } = setup()
  lock.setPin('2468')
  advance(UNLOCK_MINUTES * 60_000 - 1)
  assert.equal(lock.isOpen(), true)
  advance(2)
  assert.equal(lock.isOpen(), false)
})

test(`after ${MAX_TRIES} wrong tries, guessing pauses for ${LOCKOUT_SECONDS} seconds`, () => {
  const { lock, advance } = setup()
  lock.setPin('2468')
  lock.lock()
  for (let i = 1; i < MAX_TRIES; i++) assert.equal(lock.tryPin('0000'), 'wrong')
  assert.equal(lock.tryPin('0000'), 'wait')
  assert.equal(lock.tryPin('2468'), 'wait') // even the right PIN waits
  assert.equal(lock.waitSeconds(), LOCKOUT_SECONDS)
  advance(LOCKOUT_SECONDS * 1000)
  assert.equal(lock.tryPin('2468'), 'ok')
})

test('the PIN is not stored as plain text, and removing it keeps nothing behind', () => {
  const { lock, saved } = setup()
  lock.setPin('2468')
  const stored = [...saved.m.values()].join()
  assert.doesNotMatch(stored, /2468/)
  lock.removePin()
  assert.equal(lock.hasPin(), false)
  assert.equal(lock.isOpen(), true)
})

test('only four digits make a PIN', () => {
  assert.ok(isValidPin('0123'))
  for (const bad of ['123', '12345', 'abcd', '12 4', '']) assert.ok(!isValidPin(bad), bad)
  assert.throws(() => setup().lock.setPin('12'))
})
