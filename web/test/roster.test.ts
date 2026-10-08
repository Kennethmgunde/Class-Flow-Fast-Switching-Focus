import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { rosterTiles } from '../src/roster.ts'
import { Store } from '../src/store.ts'
import type { Evaluation } from '../src/capt.ts'

const evaluation: Evaluation = JSON.parse(readFileSync(new URL('fixtures/cat-rest.json', import.meta.url), 'utf8'))

test('the roster marks only children who practised in this session', async () => {
  const store = await Store.open('roster', new IDBFactory())
  const c = await store.addClass('Class 3A')
  const amara = await store.addLearner(c.id, 'Amara', 'kid-01')
  const chidi = await store.addLearner(c.id, 'Chidi', 'kid-02')
  const zuri = await store.addLearner(c.id, 'Zuri', 'kid-03')

  // Chidi practised in an earlier session, which doesn't count today.
  const earlier = await store.startSession(c.id, 1000)
  await store.addAttempt({ learnerId: chidi.id, sessionId: earlier.id, referenceText: 'x', evaluation })
  const today = await store.startSession(c.id, 2000)
  await store.addAttempt({ learnerId: amara.id, sessionId: today.id, referenceText: 'x', evaluation })
  await store.addAttempt({ learnerId: amara.id, sessionId: today.id, referenceText: 'y', evaluation })

  const tiles = rosterTiles(await store.listLearners(c.id), await store.attemptsForSession(today.id))
  assert.deepEqual(tiles.map((t) => [t.learner.name, t.hadTurn]), [['Amara', true], ['Chidi', false], ['Zuri', false]])
  assert.equal((await store.getLearner(zuri.id))?.name, 'Zuri')
  assert.equal(await store.getLearner('missing'), undefined)
  store.close()
})
