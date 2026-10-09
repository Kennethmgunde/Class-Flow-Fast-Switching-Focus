import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Store, type Turn } from '../src/store.ts'
import { BREAK_MS, formatDuration, sessionTiming } from '../src/timing.ts'

const turn = (startedAt: number, endedAt: number): Turn =>
  ({ id: String(startedAt), learnerId: 'l', classId: 'c', sessionId: 's', startedAt, endedAt, attempts: 3 })

test('five turns: total time, average turn and average switch', () => {
  // Five 50-second turns, with 3, 4, 5 and 4 seconds to switch.
  const starts = [0, 53_000, 107_000, 162_000, 216_000]
  const timing = sessionTiming(starts.map((s) => turn(s, s + 50_000)))!
  assert.equal(timing.turns, 5)
  assert.equal(timing.totalMs, 266_000)
  assert.equal(timing.averageTurnMs, 50_000)
  assert.equal(timing.averageSwitchMs, 4_000)
  assert.equal(timing.longestSwitchMs, 5_000)
  assert.equal(formatDuration(timing.totalMs), '4 min 26 s')
})

test('a break is not counted as a switch', () => {
  const timing = sessionTiming([turn(0, 50_000), turn(53_000, 100_000), turn(100_000 + BREAK_MS + 1, 100_000 + BREAK_MS + 40_000)])!
  assert.equal(timing.averageSwitchMs, 3_000)
})

test('one turn has no switch, and no turns has no timing', () => {
  assert.equal(sessionTiming([turn(0, 40_000)])!.averageSwitchMs, undefined)
  assert.equal(sessionTiming([]), undefined)
})

test('durations read naturally', () => {
  assert.equal(formatDuration(3_240), '3.2 s')
  assert.equal(formatDuration(52_400), '52 s')
  assert.equal(formatDuration(252_000), '4 min 12 s')
})

test('turns are stored per session, and go with their learner, class, or a wipe', async () => {
  const store = await Store.open('turns', new IDBFactory())
  const c = await store.addClass('Class 3A')
  const amara = await store.addLearner(c.id, 'Amara', 'kid-01')
  const chidi = await store.addLearner(c.id, 'Chidi', 'kid-02')
  const s = await store.startSession(c.id)
  await store.addTurn({ learnerId: amara.id, sessionId: s.id, startedAt: 2000, endedAt: 3000, attempts: 3 })
  await store.addTurn({ learnerId: chidi.id, sessionId: s.id, startedAt: 1000, endedAt: 1500, attempts: 2 })
  assert.deepEqual((await store.turnsForSession(s.id)).map((t) => t.attempts), [2, 3]) // oldest first

  await store.deleteLearner(amara.id)
  assert.equal((await store.turnsForSession(s.id)).length, 1)
  await store.deleteClass(c.id)
  assert.equal((await store.turnsForSession(s.id)).length, 0)

  const c2 = await store.addClass('Class 3B')
  const l = await store.addLearner(c2.id, 'Zuri', 'kid-03')
  const s2 = await store.startSession(c2.id)
  await store.addTurn({ learnerId: l.id, sessionId: s2.id, startedAt: 1, endedAt: 2, attempts: 1 })
  await store.wipeEverything()
  assert.equal((await store.turnsForSession(s2.id)).length, 0)
  store.close()
})

test('upgrading a tablet from the first version keeps its data', async () => {
  const factory = new IDBFactory()
  // Build a version-1 database by hand, as tablets have it today.
  await new Promise<void>((resolve, reject) => {
    const req = factory.open('upgrade', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('classes', { keyPath: 'id' }).add({ id: 'c1', name: 'Class 3A (demo)', createdAt: 1 })
      db.createObjectStore('learners', { keyPath: 'id' }).createIndex('classId', 'classId')
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('classId', 'classId')
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      for (const index of ['learnerId', 'classId', 'sessionId']) attempts.createIndex(index, index)
    }
    req.onsuccess = () => { req.result.close(); resolve() }
    req.onerror = () => reject(req.error)
  })

  const store = await Store.open('upgrade', factory)
  assert.deepEqual((await store.listClasses()).map((c) => c.name), ['Class 3A (demo)'])
  assert.deepEqual(await store.turnsForSession('any'), []) // the new store exists
  store.close()
})
