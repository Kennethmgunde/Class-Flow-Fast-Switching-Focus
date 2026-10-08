// Checks the promises in the teacher's "What's stored on this tablet" note.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { Store } from '../src/store.ts'
import { evaluate, type Evaluation } from '../src/capt.ts'
import { encodeWav } from '../src/audio/wav.ts'

const evaluation: Evaluation = JSON.parse(readFileSync(new URL('fixtures/cat-rest.json', import.meta.url), 'utf8'))

test('a recording is sent to CAPT with no name or id, only the audio and the sentence', async () => {
  let sent: any
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ evaluation_result: { score: 0.9, alignments: [] } }))
  }) as typeof fetch
  try {
    await evaluate(encodeWav(new Float32Array(16000), 16000), 'the cat sat on the mat', { baseUrl: 'http://x' })
  } finally {
    globalThis.fetch = realFetch
  }
  assert.deepEqual(Object.keys(sent).sort(), ['audio', 'config'])
  assert.deepEqual(Object.keys(sent.config).sort(), ['audio_format', 'model_id', 'reference_text'])
  assert.deepEqual(Object.keys(sent.audio), ['data'])
})

test('a saved attempt keeps scores, not the recording', async () => {
  const store = await Store.open('privacy', new IDBFactory())
  const c = await store.addClass('Class 3A')
  const amara = await store.addLearner(c.id, 'Amara', 'kid-01')
  const s = await store.startSession(c.id)
  await store.addAttempt({ learnerId: amara.id, sessionId: s.id, referenceText: 'the cat sat on the mat', evaluation })
  const [saved] = await store.attemptsForLearner(amara.id)
  assert.deepEqual(Object.keys(saved).sort(), ['at', 'classId', 'evaluation', 'id', 'learnerId', 'referenceText', 'sessionId'])
  assert.doesNotMatch(JSON.stringify(saved), /RIFF|UklGR/) // no WAV, raw or base64
  store.close()
})

test('wiping everything leaves no class, learner, session or attempt', async () => {
  const store = await Store.open('wipe', new IDBFactory())
  for (const name of ['Class 3A', 'Class 3B']) {
    const c = await store.addClass(name)
    const l = await store.addLearner(c.id, 'Amara', 'kid-01')
    const s = await store.startSession(c.id)
    await store.addAttempt({ learnerId: l.id, sessionId: s.id, referenceText: 'x', evaluation })
  }
  const classes = await store.listClasses()
  await store.wipeEverything()
  assert.deepEqual(await store.listClasses(), [])
  for (const c of classes) {
    assert.deepEqual(await store.listLearners(c.id), [])
    assert.deepEqual(await store.listSessions(c.id), [])
    assert.deepEqual(await store.attemptsForClass(c.id), [])
  }
  store.close()
})
