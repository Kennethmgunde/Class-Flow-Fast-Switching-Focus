import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanReferenceText } from '../src/capt.ts'
import { PROMPTS } from '../src/prompts.ts'
import { SOUNDS, soundById, soundForPhone } from '../src/sounds.ts'

// Phones CAPT reported for each prompt, saved by tools/check-prompts.ts.
const phones: Record<string, string[][]> = JSON.parse(
  readFileSync(new URL('../src/data/prompt-phones.json', import.meta.url), 'utf8'),
)

test('prompt ids are unique', () => {
  assert.equal(new Set(PROMPTS.map((p) => p.id)).size, PROMPTS.length)
})

test('prompts are short and have nothing CAPT would reject as written', () => {
  for (const p of PROMPTS) {
    assert.equal(cleanReferenceText(p.text), p.text, `${p.id} has punctuation or extra spaces`)
    assert.ok(p.text.split(' ').length <= 7, `${p.id} is too long for a young child`)
    assert.ok(p.focus.length > 0, `${p.id} has no focus sound`)
  }
})

test('every target sound has at least two prompts', () => {
  for (const s of SOUNDS) {
    const count = PROMPTS.filter((p) => p.focus.includes(s.id)).length
    assert.ok(count >= 2, `${s.id} has ${count} prompt(s)`)
  }
})

test('CAPT accepted every prompt and found its focus sounds', () => {
  for (const p of PROMPTS) {
    assert.ok(phones[p.id], `${p.id} hasn't been checked with CAPT; run tools/check-prompts.ts`)
    const heard = new Set(phones[p.id].flat())
    for (const f of p.focus) {
      assert.ok(heard.has(soundById(f).xsampa), `${p.id}: CAPT has no ${soundById(f).xsampa} for ${f}`)
    }
  }
})

test('every sound code is one CAPT really uses', () => {
  const used = new Set(Object.values(phones).flat(2))
  for (const s of SOUNDS) assert.ok(used.has(s.xsampa), `CAPT never reported ${s.xsampa} (${s.id})`)
})

test('soundForPhone maps CAPT phones to teacher labels', () => {
  assert.equal(soundForPhone('T')?.label, 'th as in think')
  assert.equal(soundForPhone('r\\')?.id, 'r')
  assert.equal(soundForPhone('@'), undefined)
})
