import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encodeWav, measureWav } from '../src/audio/wav.ts'
import { CaptError, type Evaluation } from '../src/capt.ts'
import { describeError, isTransient, recordingProblem, unclearResult, withRetry } from '../src/problems.ts'

const tone = (seconds: number, amplitude: number) =>
  encodeWav(Float32Array.from({ length: Math.round(16000 * seconds) }, (_, i) => amplitude * Math.sin(i / 8)), 16000)

test('measureWav reports duration and loudness', () => {
  const m = measureWav(tone(1, 0.5))
  assert.ok(Math.abs(m.durationSec - 1) < 0.001)
  assert.ok(m.peak > 0.49 && m.peak < 0.51)
  assert.ok(m.rms > 0.3 && m.rms < 0.4)
})

test('silent and too-short recordings are caught before CAPT', () => {
  assert.equal(recordingProblem(measureWav(tone(2, 0)))?.kind, 'silent')
  assert.equal(recordingProblem(measureWav(tone(2, 0.005)))?.kind, 'silent')
  assert.equal(recordingProblem(measureWav(tone(0.3, 0.5)))?.kind, 'too-short')
  assert.equal(recordingProblem(measureWav(tone(2, 0.3))), undefined)
})

test('a result where CAPT heard almost nothing is flagged as unclear', () => {
  const real: Evaluation = JSON.parse(readFileSync(new URL('fixtures/fat-for-cat-rest.json', import.meta.url), 'utf8'))
  assert.equal(unclearResult(real), undefined)
  assert.equal(unclearResult({ score: 0.03, words: [] })?.kind, 'unclear')
})

test('errors become messages a child can act on', () => {
  const blocked = describeError(new DOMException('denied', 'NotAllowedError'))
  assert.equal(blocked.kind, 'mic-blocked')
  assert.ok(blocked.askTeacher)
  assert.equal(describeError(new DOMException('none', 'NotFoundError')).kind, 'no-mic')
  assert.equal(describeError(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')")).kind, 'insecure-page')
  assert.equal(describeError(new CaptError('unavailable', 'down')).kind, 'capt-down')
  assert.equal(describeError(new TypeError('Failed to fetch'), false).kind, 'offline')
  const other = describeError(new Error('weird'))
  assert.equal(other.kind, 'unknown')
  assert.equal(other.askTeacher, false)
  // No technical words reach the child.
  for (const p of [blocked, other]) assert.doesNotMatch(p.message, /error|HTTP|CAPT|undefined/i)
})

test('only busy-server and network errors are retried', () => {
  assert.ok(isTransient(new CaptError('server', 'HTTP 502')))
  assert.ok(isTransient(new CaptError('timeout', 'slow')))
  assert.ok(isTransient(new TypeError('Failed to fetch')))
  assert.ok(!isTransient(new CaptError('unavailable', 'down')))
  assert.ok(!isTransient(new CaptError('out-of-vocabulary', 'oov')))
})

test('withRetry retries a transient failure once, then succeeds', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    if (++calls === 1) throw new CaptError('server', 'blip')
    return 'ok'
  }, { wait: async () => {} })
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('withRetry gives up after one retry, and never retries a down server', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new CaptError('server', 'blip') }, { wait: async () => {} }))
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new CaptError('unavailable', 'down') }, { wait: async () => {} }))
  assert.equal(calls, 1)
})
