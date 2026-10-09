// No empty or malformed audio may ever reach CAPT (the demo server has had
// trouble with such files).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { encodeWav, wavProblem } from '../src/audio/wav.ts'
import { CaptError, evaluate } from '../src/capt.ts'
import { describeError } from '../src/problems.ts'
import { LEARNERS, TEST_PROMPTS } from '../src/demo/simulated-learners.ts'

const speech = (seconds: number, rate = 16000) =>
  encodeWav(Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.3 * Math.sin(i / 8)), rate)

test('a good recording passes', () => {
  assert.equal(wavProblem(speech(1.5)), null)
})

test('each kind of bad file is caught, with a reason', () => {
  // The bug from Oct 8: a paused audio engine captured nothing, giving a
  // header-only WAV.
  assert.match(wavProblem(encodeWav(new Float32Array(0), 16000))!, /empty/)
  assert.match(wavProblem(new Uint8Array(10))!, /smaller than a WAV header/)
  assert.match(wavProblem(new Uint8Array(100))!, /not a plain PCM WAV/)
  assert.match(wavProblem(speech(0.1))!, /only 0.10 s/)
  assert.match(wavProblem(encodeWav(new Float32Array(16000), 16000))!, /silence/)
  assert.match(wavProblem(speech(1, 22050))!, /22050 Hz/)
  const cut = speech(1).slice(0, 20000) // a file cut off mid-transfer
  assert.match(wavProblem(cut)!, /length doesn’t match/)
})

test('evaluate refuses bad audio without making any network request', async () => {
  let requests = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => { requests++; return new Response('{}') }) as typeof fetch
  try {
    const err = await evaluate(encodeWav(new Float32Array(0), 16000), 'the cat sat on the mat', { baseUrl: 'http://x' }).catch((e) => e)
    assert.ok(err instanceof CaptError)
    assert.equal(err.kind, 'bad-audio')
    assert.equal(requests, 0)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('a child sees the usual friendly message, never the technical reason', () => {
  const problem = describeError(new CaptError('bad-audio', 'not sent to CAPT: empty: no audio after the header'))
  assert.equal(problem.message, 'I didn’t hear you. Try again, a bit louder.')
  assert.equal(problem.askTeacher, false)
})

test('every generated test clip would be accepted', { skip: !existsSync(new URL('../../data/generated/learners/', import.meta.url)) }, () => {
  const dir = new URL('../../data/generated/learners/', import.meta.url)
  let count = 0
  for (const learner of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(new URL(`${learner.name}/`, dir))) {
      const wav = new Uint8Array(readFileSync(new URL(`${learner.name}/${f}`, dir)))
      assert.equal(wavProblem(wav), null, `${learner.name}/${f}`)
      count++
    }
  }
  assert.equal(count, LEARNERS.length * TEST_PROMPTS.length)
})
