import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Store } from '../src/store.ts'
import { DEMO_CLASS_NAME, removeDemoClasses, seedDemoClass } from '../src/demo/seed.ts'
import { childrenToHelp, classImprovement, classSoundDifficulties, soundsToWorkOn } from '../src/insights.ts'

const NOW = new Date('2026-10-14T09:00:00').getTime()

async function demo() {
  const store = await Store.open('demo', new IDBFactory())
  const { classRoom, learners } = await seedDemoClass(store, { now: NOW })
  const history = await store.attemptsForClass(classRoom.id)
  return { store, classRoom, learners, history }
}

test('the demo class has 30 children, four past sessions and an empty session today', async () => {
  const { store, classRoom, learners, history } = await demo()
  assert.equal(learners.length, 30)
  const sessions = await store.listSessions(classRoom.id)
  assert.equal(sessions.length, 5)
  assert.ok(sessions.slice(0, 4).every((s) => s.endedAt))
  const today = await store.currentSession(classRoom.id)
  assert.equal(today?.startedAt, NOW)
  assert.equal((await store.attemptsForSession(today!.id)).length, 0)
  assert.ok(history.length > 300 && history.every((a) => a.at < NOW))
  store.close()
})

test('the teacher view finds every planted error, and only those', async () => {
  const { learners, history, store } = await demo()
  const difficulties = classSoundDifficulties(history, learners)
  const help = childrenToHelp(difficulties, soundsToWorkOn(difficulties))
  // Every child the teacher view points at, with their sounds.
  const flagged = Object.fromEntries([
    ...soundsToWorkOn(difficulties).flatMap((d) => d.learners.map((l) => [l.name, [d.sound.id]] as const)),
    ...help.map((c) => [c.learner.name, c.sounds.map((s) => s.id)] as const),
  ].map(([name, sounds]) => [name, [...sounds].sort()]))
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
