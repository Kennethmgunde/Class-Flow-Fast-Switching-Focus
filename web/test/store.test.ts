import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { Store } from '../src/store.ts'
import type { Evaluation } from '../src/capt.ts'

const evaluation: Evaluation = JSON.parse(readFileSync(new URL('fixtures/cat-rest.json', import.meta.url), 'utf8'))

// Each test gets its own empty database.
const fresh = () => Store.open('test', new IDBFactory())

test('learners are listed per class, alphabetically', async () => {
  const store = await fresh()
  const a = await store.addClass('Class 3A', 1)
  const b = await store.addClass('Class 3B', 2)
  await store.addLearner(a.id, 'Wanjiru', 'kid-03', 10)
  await store.addLearner(b.id, 'Chidi', 'kid-02', 11)
  await store.addLearner(a.id, '  Amara ', 'kid-01', 12)

  assert.deepEqual((await store.listLearners(a.id)).map((l) => l.name), ['Amara', 'Wanjiru'])
  assert.deepEqual((await store.listLearners(b.id)).map((l) => l.name), ['Chidi'])
  assert.deepEqual((await store.listClasses()).map((c) => c.name), ['Class 3A', 'Class 3B'])
  store.close()
})

test("each child's attempts are kept separate and in time order", async () => {
  const store = await fresh()
  const c = await store.addClass('Class 3A')
  const amara = await store.addLearner(c.id, 'Amara', 'kid-01')
  const chidi = await store.addLearner(c.id, 'Chidi', 'kid-02')
  const s = await store.startSession(c.id)

  await store.addAttempt({ learnerId: amara.id, sessionId: s.id, referenceText: 'the cat sat on the mat', evaluation, at: 300 })
  await store.addAttempt({ learnerId: chidi.id, sessionId: s.id, referenceText: 'the cat sat on the mat', evaluation, at: 200 })
  await store.addAttempt({ learnerId: amara.id, sessionId: s.id, referenceText: 'a big red bus', evaluation, at: 100 })

  const mine = await store.attemptsForLearner(amara.id)
  assert.deepEqual(mine.map((a) => a.at), [100, 300])
  assert.ok(mine.every((a) => a.learnerId === amara.id && a.classId === c.id))
  assert.equal(mine[1].evaluation.words[1].sounds[0].reference, 'k')
  assert.equal((await store.attemptsForSession(s.id)).length, 3)
  assert.equal((await store.attemptsForClass(c.id)).length, 3)
  store.close()
})

test('starting a session ends the one still open', async () => {
  const store = await fresh()
  const c = await store.addClass('Class 3A')
  const first = await store.startSession(c.id, 1000)
  const second = await store.startSession(c.id, 2000)

  const sessions = await store.listSessions(c.id)
  assert.deepEqual(sessions.map((s) => [s.id, s.endedAt]), [[first.id, 2000], [second.id, undefined]])
  assert.equal((await store.currentSession(c.id))?.id, second.id)

  await store.endSession(second.id, 3000)
  assert.equal(await store.currentSession(c.id), undefined)
  store.close()
})

test('deleting a learner deletes only their attempts', async () => {
  const store = await fresh()
  const c = await store.addClass('Class 3A')
  const amara = await store.addLearner(c.id, 'Amara', 'kid-01')
  const chidi = await store.addLearner(c.id, 'Chidi', 'kid-02')
  const s = await store.startSession(c.id)
  await store.addAttempt({ learnerId: amara.id, sessionId: s.id, referenceText: 'x', evaluation })
  await store.addAttempt({ learnerId: chidi.id, sessionId: s.id, referenceText: 'x', evaluation })

  await store.deleteLearner(amara.id)
  assert.deepEqual((await store.listLearners(c.id)).map((l) => l.name), ['Chidi'])
  assert.equal((await store.attemptsForLearner(amara.id)).length, 0)
  assert.equal((await store.attemptsForLearner(chidi.id)).length, 1)
  store.close()
})

test('deleting a class wipes its learners, sessions and attempts, and nothing else', async () => {
  const store = await fresh()
  const a = await store.addClass('Class 3A')
  const b = await store.addClass('Class 3B')
  for (const c of [a, b]) {
    const l = await store.addLearner(c.id, 'Amara', 'kid-01')
    const s = await store.startSession(c.id)
    await store.addAttempt({ learnerId: l.id, sessionId: s.id, referenceText: 'x', evaluation })
  }

  await store.deleteClass(a.id)
  assert.deepEqual((await store.listClasses()).map((c) => c.name), ['Class 3B'])
  assert.equal((await store.listLearners(a.id)).length, 0)
  assert.equal((await store.listSessions(a.id)).length, 0)
  assert.equal((await store.attemptsForClass(a.id)).length, 0)
  assert.equal((await store.attemptsForClass(b.id)).length, 1)
  store.close()
})

test('attempts for an unknown learner are rejected', async () => {
  const store = await fresh()
  await assert.rejects(
    store.addAttempt({ learnerId: 'nobody', sessionId: 's', referenceText: 'x', evaluation }),
    /unknown learner/,
  )
  store.close()
})

test('data survives closing and reopening the database', async () => {
  const factory = new IDBFactory()
  const first = await Store.open('persist', factory)
  const c = await first.addClass('Class 3A')
  await first.addLearner(c.id, 'Amara', 'kid-01')
  first.close()

  const second = await Store.open('persist', factory)
  assert.deepEqual((await second.listLearners(c.id)).map((l) => l.name), ['Amara'])
  second.close()
})
