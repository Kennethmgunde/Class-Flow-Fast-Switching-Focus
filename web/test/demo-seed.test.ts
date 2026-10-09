import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Store } from '../src/store.ts'
import { DEMO_CLASS_NAME, removeDemoClasses, seedDemoClass } from '../src/demo/seed.ts'
import { childrenToHelp, classImprovement, classSoundDifficulties, finishedSessionsOnly, soundsToWorkOn } from '../src/insights.ts'

const NOW = new Date('2026-10-14T09:00:00').getTime()

async function demo() {
  const store = await Store.open('demo', new IDBFactory())
  const { classRoom, learners } = await seedDemoClass(store, { now: NOW })
  const history = await store.attemptsForClass(classRoom.id)
  return { store, classRoom, learners, history }
}

test('the demo class has 30 children, ten past sessions and an empty session today', async () => {
  const { store, classRoom, learners, history } = await demo()
  assert.equal(learners.length, 30)
  const sessions = await store.listSessions(classRoom.id)
  assert.equal(sessions.length, 11)
  assert.ok(sessions.slice(0, 10).every((s) => s.endedAt))
  const today = await store.currentSession(classRoom.id)
  assert.equal(today?.startedAt, NOW)
  assert.equal((await store.attemptsForSession(today!.id)).length, 0)
  assert.ok(history.length > 800 && history.every((a) => a.at < NOW))
  store.close()
})

test('the teacher view finds every planted error, and only those', async () => {
  const { learners, history, store } = await demo()
  const difficulties = classSoundDifficulties(history, learners)
  const help = childrenToHelp(difficulties, soundsToWorkOn(difficulties))
  // Every child the teacher view points at, with their sounds.
  const flagged: Record<string, string[]> = {}
  const add = (name: string, sound: string) => { flagged[name] = [...new Set([...(flagged[name] ?? []), sound])].sort() }
  for (const d of soundsToWorkOn(difficulties)) for (const l of d.learners) add(l.name, d.sound.id)
  for (const c of help) for (const s of c.sounds) add(c.learner.name, s.id)
  assert.deepEqual(flagged, {
    Amara: ['th-think', 'th-this'],
    Chidi: ['v'],
    Kofi: ['ch', 'sh'],
    Wanjiru: ['r'],
  })
  store.close()
})

test('Tunde and Achieng are improving, Musa may need support, everyone else is steady', async () => {
  const { learners, history, store } = await demo()
  const trends = classImprovement(learners, history)
  const by = (t: string) => trends.filter((i) => i.trend === t).map((i) => i.learner.name).sort()
  assert.deepEqual(by('improving'), ['Achieng', 'Tunde'])
  assert.deepEqual(by('needs-support'), ['Musa'])
  assert.equal(by('steady').length, 27)
  store.close()
})

test('live turns during the demo don’t move anyone’s trend until the session ends', async () => {
  const { store, classRoom, learners } = await demo()
  const trends = async () => {
    const all = await store.attemptsForClass(classRoom.id)
    return classImprovement(learners, finishedSessionsOnly(all, await store.listSessions(classRoom.id))).map((i) => [i.learner.name, i.trend])
  }
  const before = await trends()
  // Amara has a perfect turn today, far above her history.
  const amara = learners.find((l) => l.name === 'Amara')!
  const today = (await store.currentSession(classRoom.id))!
  const past = (await store.attemptsForLearner(amara.id)).slice(0, 3)
  for (const a of past) {
    const words = a.evaluation.words.map((w) => ({ ...w, sounds: w.sounds.map((s) => ({ ...s, score: 1 })) }))
    await store.addAttempt({ learnerId: amara.id, sessionId: today.id, promptId: a.promptId, referenceText: a.referenceText, evaluation: { score: 1, words } })
  }
  assert.deepEqual(await trends(), before)
  // Once the session ends, it counts.
  await store.endSession(today.id, NOW + 3_600_000)
  assert.notDeepEqual(await trends(), before)
  store.close()
})

test('the demo class is the same every time, and can be removed', async () => {
  const a = await demo()
  const b = await demo()
  assert.deepEqual(a.history.map((x) => [x.promptId, x.at, x.evaluation.score]), b.history.map((x) => [x.promptId, x.at, x.evaluation.score]))
  await a.store.addClass('Class 4B')
  assert.equal(await removeDemoClasses(a.store), 1)
  assert.deepEqual((await a.store.listClasses()).map((c) => c.name), ['Class 4B'])
  assert.ok(!(await a.store.listClasses()).some((c) => c.name === DEMO_CLASS_NAME))
  a.store.close()
  b.store.close()
})
