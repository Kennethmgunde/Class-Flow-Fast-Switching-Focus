import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Store } from '../src/store.ts'
import { seedDemoClass } from '../src/demo/seed.ts'

test('the counts shown before a wipe match what is stored, and a wipe clears them', async () => {
  const store = await Store.open('counts', new IDBFactory())
  const { learners } = await seedDemoClass(store, { now: new Date('2026-10-09T09:00:00').getTime() })
  const counts = await store.counts()
  assert.equal(counts.classes, 1)
  assert.equal(counts.learners, learners.length)
  assert.equal(counts.sessions, 11)
  assert.ok(counts.attempts > 800)
  await store.wipeEverything()
  assert.deepEqual(await store.counts(), { classes: 0, learners: 0, sessions: 0, attempts: 0 })
  store.close()
})
