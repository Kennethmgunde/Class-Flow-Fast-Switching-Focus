import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROMPTS } from '../src/prompts.ts'
import { SOUNDS, soundById } from '../src/sounds.ts'
import { LEARNERS, TEST_PROMPTS, sayAs } from '../../tools/simulated-learners.ts'

// Phones CAPT reported for each prompt, saved by tools/check-prompts.ts.
const phones: Record<string, string[][]> = JSON.parse(
  readFileSync(new URL('fixtures/prompt-phones.json', import.meta.url), 'utf8'),
)

// The words of a prompt, paired with the phones CAPT found in each.
function wordsWithPhones(promptId: string): { word: string; phones: string[] }[] {
  const words = PROMPTS.find((p) => p.id === promptId)!.text.split(' ')
  // CAPT's pause "words" carry no real phones (an empty list, or ['']).
  return phones[promptId].filter((p) => p.some(Boolean)).map((p, i) => ({ word: words[i], phones: p }))
}

test('every test prompt exists', () => {
  for (const id of TEST_PROMPTS) assert.ok(PROMPTS.some((p) => p.id === id), id)
})

test('each learner has a different voice', () => {
  assert.equal(new Set(LEARNERS.map((l) => l.speaker)).size, LEARNERS.length)
})

test('the control learner says every sentence correctly', () => {
  const zuri = LEARNERS.find((l) => l.planted.length === 0)!
  for (const id of TEST_PROMPTS) {
    const text = PROMPTS.find((p) => p.id === id)!.text
    assert.equal(sayAs(zuri, text), text)
  }
})

// The answer key only holds if each changed word really contains a planted
// sound, and each planted sound is changed often enough to be found.
test('every changed word contains one of the learner’s planted sounds', () => {
  for (const learner of LEARNERS) {
    const planted = new Set(learner.planted.map((s) => soundById(s).xsampa))
    for (const id of TEST_PROMPTS) {
      for (const { word, phones: ps } of wordsWithPhones(id)) {
        if (sayAs(learner, word) === word) continue
        assert.ok(ps.some((p) => planted.has(p)), `${learner.name} changes "${word}" in ${id}, which has none of ${[...planted]}`)
      }
    }
  }
})

test('each planted sound is changed at least twice in the test sentences', () => {
  for (const learner of LEARNERS) {
    for (const sound of learner.planted) {
      const code = soundById(sound).xsampa
      let changed = 0
      for (const id of TEST_PROMPTS) {
        for (const { word, phones: ps } of wordsWithPhones(id)) {
          if (ps.includes(code) && sayAs(learner, word) !== word) changed++
        }
      }
      assert.ok(changed >= 2, `${learner.name}: ${sound} changed ${changed} time(s)`)
    }
  }
})

test('planted sounds are target sounds the teacher view knows', () => {
  const ids = new Set(SOUNDS.map((s) => s.id))
  for (const l of LEARNERS) for (const s of l.planted) assert.ok(ids.has(s))
})
