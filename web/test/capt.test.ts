import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CaptError, cleanReferenceText, httpError, parseEvaluation, type Evaluation } from '../src/capt.ts'

// Parsed results saved from the live demo server by tools/capt-live-check.ts.
const fixture = (name: string): Evaluation =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

test('cleanReferenceText strips punctuation CAPT would treat as part of a word', () => {
  assert.equal(cleanReferenceText('  The cat, sat "on" the mat.  '), 'The cat sat on the mat')
  assert.equal(cleanReferenceText("Quilter's gospel."), "Quilter's gospel")
})

test('parseEvaluation converts string times and alignment kinds', () => {
  const result = parseEvaluation({
    is_partial: false,
    score: 0.97,
    alignments: [{
      text: 'IT', start_time_ms: '510', duration_ms: '155',
      tokens: [
        { kind: 'ALIGNMENT_KIND_MATCH', reference: 'I', score: 0.92, hypotheses: [{ token: 'I', confidence: 0.86, start_time_ms: '510', duration_ms: '103' }] },
        { kind: 'ALIGNMENT_KIND_DELETION', reference: 't', score: 0 },
      ],
    }],
  })
  assert.deepEqual(result, {
    score: 0.97,
    words: [{
      text: 'IT', startMs: 510, durationMs: 155,
      sounds: [
        { reference: 'I', score: 0.92, kind: 'match', heard: [{ token: 'I', confidence: 0.86, startMs: 510, durationMs: 103 }] },
        { reference: 't', score: 0, kind: 'deletion', heard: [] },
      ],
    }],
  })
})

test('a planted error shows in the sound score, barely in the overall score', () => {
  const clean = fixture('cat-rest')
  const planted = fixture('fat-for-cat-rest')
  const k = (e: Evaluation) => e.words[1].sounds[0]
  assert.equal(k(clean).reference, 'k')
  assert.ok(k(clean).score > 0.9)
  assert.equal(k(planted).kind, 'deletion')
  assert.ok(k(planted).score < 0.1)
  // Why the teacher view must use per-sound scores (TRA-804).
  assert.ok(clean.score - planted.score < 0.2)
})

test('httpError tells a down server from a slow one', () => {
  assert.equal(httpError(503, 'no healthy upstream').kind, 'unavailable')
  assert.equal(httpError(503, 'upstream connect error or disconnect/reset before headers. reset reason: connection termination').kind, 'timeout')
})

test('httpError reports out-of-vocabulary words', () => {
  const err = httpError(500, '{"code":2,"message":"out of vocabulary word \\"Ogbonna\\""}')
  assert.ok(err instanceof CaptError)
  assert.equal(err.kind, 'out-of-vocabulary')
  assert.equal(err.word, 'Ogbonna')
  assert.equal(httpError(500, 'out of vocabulary word "gospel."').word, 'gospel.')
})
