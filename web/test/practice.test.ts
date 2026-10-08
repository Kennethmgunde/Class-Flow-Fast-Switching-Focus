import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROMPTS } from '../src/prompts.ts'
import { choosePrompts, stars, starsFor, wordFeedback } from '../src/practice.ts'
import type { Evaluation } from '../src/capt.ts'
import type { Attempt } from '../src/store.ts'

const fixture = (name: string): Evaluation =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

// A repeatable "random" sequence.
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

const attempt = (promptId: string, at: number): Attempt => ({
  id: String(at), learnerId: 'l', classId: 'c', sessionId: 's', referenceText: '', promptId, at,
  evaluation: { score: 1, words: [] },
})

test('a turn has three prompts, each focused on a different sound', () => {
  const chosen = choosePrompts(PROMPTS, [], 3, seeded(1))
  assert.equal(chosen.length, 3)
  assert.equal(new Set(chosen.map((p) => p.focus[0])).size, 3)
})

test('prompts the child has practised least come first', () => {
  // Every prompt practised once, except two never practised.
  const fresh = ['cat-mat', 'wash-dish']
  const history = PROMPTS.filter((p) => !fresh.includes(p.id)).map((p, i) => attempt(p.id, i))
  const chosen = choosePrompts(PROMPTS, history, 3, seeded(2)).map((p) => p.id)
  assert.ok(fresh.every((id) => chosen.includes(id)), `expected ${fresh} in ${chosen}`)
})

test("the previous turn's prompts aren't repeated straight away", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const first = choosePrompts(PROMPTS, [], 3, seeded(seed))
    const history = first.map((p, i) => attempt(p.id, i))
    const second = choosePrompts(PROMPTS, history, 3, seeded(seed + 100))
    assert.ok(second.every((p) => !first.includes(p)))
  }
})

test('stars are generous and never zero', () => {
  assert.equal(stars(0.95), 3)
  assert.equal(stars(0.8), 3)
  assert.equal(stars(0.7), 2)
  assert.equal(stars(0.1), 1)
  assert.equal(stars(0), 1)
})

test('word feedback marks the word with the planted error', () => {
  const words = wordFeedback(fixture('fat-for-cat-rest'))
  assert.deepEqual(words.map((w) => w.text), ['the', 'cat', 'sat', 'on', 'the', 'mat'])
  assert.deepEqual(words.filter((w) => w.needsPractice).map((w) => w.text), ['cat'])
})

test('word feedback skips the empty words CAPT returns for pauses', () => {
  const evaluation: Evaluation = {
    score: 0.9,
    words: [
      { text: 'big', startMs: 0, durationMs: 1, sounds: [{ reference: 'b', score: 0.9, kind: 'match', heard: [] }] },
      { text: '', startMs: 1, durationMs: 1, sounds: [] },
    ],
  }
  assert.deepEqual(wordFeedback(evaluation), [{ text: 'big', needsPractice: false }])
})

test('a highlighted word caps the stars at two', () => {
  const planted = fixture('fat-for-cat-rest')
  assert.equal(stars(planted.score), 3) // high overall score...
  assert.equal(starsFor(planted), 2) // ...but "cat" needs practice
  assert.equal(starsFor(fixture('cat-rest')), 3)
})
