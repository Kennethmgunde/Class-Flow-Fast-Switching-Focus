import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Store } from '../src/store.ts'
import { seedDemoClass } from '../src/demo/seed.ts'
import { backupFileName, describeCounts, makeBackup, parseBackup } from '../src/backup.ts'

const NOW = new Date('2026-10-09T09:00:00').getTime()

test('a backup restores everything exactly after a wipe', async () => {
  const store = await Store.open('backup', new IDBFactory())
  await seedDemoClass(store, { now: NOW })
  const before = await store.exportAll()

  // Through a file and back, as the teacher would.
  const file = JSON.stringify(await makeBackup(store, NOW))
  await store.wipeEverything()
  assert.deepEqual(await store.counts(), { classes: 0, learners: 0, sessions: 0, attempts: 0 })

  await store.replaceAll(parseBackup(file))
  const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
  const after = await store.exportAll()
  for (const key of ['classes', 'learners', 'sessions', 'attempts'] as const) {
    assert.deepEqual(sortById(after[key]), sortById(before[key]), key)
  }
  store.close()
})

test('restoring replaces what is on the tablet, not adds to it', async () => {
  const store = await Store.open('replace', new IDBFactory())
  await store.addClass('Old class')
  const backup = { ...(await makeBackup(store)), classes: [{ id: 'new', name: 'From backup', createdAt: 1 }] }
  await store.replaceAll(backup)
  assert.deepEqual((await store.listClasses()).map((c) => c.name), ['From backup'])
  store.close()
})

test('the counts shown before a wipe match what is stored', async () => {
  const store = await Store.open('counts', new IDBFactory())
  const { learners } = await seedDemoClass(store, { now: NOW })
  const counts = await store.counts()
  assert.equal(counts.classes, 1)
  assert.equal(counts.learners, learners.length)
  assert.equal(counts.sessions, 5)
  assert.ok(counts.attempts > 300)
  assert.equal(describeCounts({ classes: 1, learners: 1, sessions: 2, attempts: 3 }), '1 class, 1 learner, 2 sessions, 3 scores')
  store.close()
})

test('a backup has no teacher PIN in it', async () => {
  const store = await Store.open('nopin', new IDBFactory())
  await store.addClass('Class 3A')
  const text = JSON.stringify(await makeBackup(store))
  assert.doesNotMatch(text, /pin/i)
  store.close()
})

test('files that aren’t backups are refused with a plain message', () => {
  assert.throws(() => parseBackup('not json'), /isn’t a Class-Flow backup/)
  assert.throws(() => parseBackup('{"app":"something-else"}'), /isn’t a Class-Flow backup/)
  assert.throws(() => parseBackup('{"app":"class-flow","version":99}'), /different version/)
  assert.throws(() => parseBackup('{"app":"class-flow","version":1,"classes":[{}],"learners":[],"sessions":[],"attempts":[]}'), /damaged/)
})

test('backup files are named by date and time', () => {
  assert.equal(backupFileName(new Date('2026-10-09T08:05:00').getTime()), 'class-flow-backup-2026-10-09-0805.json')
})
