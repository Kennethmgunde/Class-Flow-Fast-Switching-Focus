import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { wavProblem, readWavInfo } from '../src/audio/wav.ts'
import { DemoVoice, UNUSABLE_CLIPS, demoPrompts, demoVoiceFor } from '../src/demo/demo-voices.ts'
import { unclearResult } from '../src/problems.ts'
import { DEMO_CLASS_NAME } from '../src/demo/seed.ts'
import { LEARNERS, TEST_PROMPTS } from '../src/demo/simulated-learners.ts'
import { PROMPTS } from '../src/prompts.ts'
import type { ClassRoom, Learner } from '../src/store.ts'

const demoClass: ClassRoom = { id: 'd', name: DEMO_CLASS_NAME, createdAt: 0 }
const realClass: ClassRoom = { id: 'r', name: 'Class 3A', createdAt: 0 }
const child = (name: string, classId = 'd'): Learner => ({ id: name, classId, name, avatar: 'kid-01', createdAt: 0 })

test('only the five simulated learners in the demo class, and only when switched on', () => {
  assert.equal(demoVoiceFor(child('Amara'), demoClass, true)?.name, 'Amara')
  assert.equal(demoVoiceFor(child('Zuri'), demoClass, true)?.name, 'Zuri')
  assert.equal(demoVoiceFor(child('Tunde'), demoClass, true), undefined) // not simulated: microphone
  assert.equal(demoVoiceFor(child('Amara', 'r'), realClass, true), undefined) // a real class: always the microphone
  assert.equal(demoVoiceFor(child('Amara'), demoClass, false), undefined) // switched off
})

test('demo turns only use sentences the simulated learners have usable clips for', () => {
  assert.deepEqual(demoPrompts(PROMPTS, 'Amara').map((p) => p.id).sort(), [...TEST_PROMPTS].sort())
  assert.deepEqual(demoPrompts(PROMPTS, 'Chidi').map((p) => p.id).sort(), TEST_PROMPTS.filter((id) => id !== 'little-lamp').sort())
})

// Uses the CAPT scores saved by tools/check-answer-key.ts, when present.
const SCORES = new URL('../../data/generated/learners/scores.json', import.meta.url)
test('every clip demo mode can play is one CAPT makes out', { skip: !existsSync(SCORES) }, () => {
  for (const s of JSON.parse(readFileSync(SCORES, 'utf8'))) {
    const usable = !UNUSABLE_CLIPS[s.learner]?.includes(s.promptId)
    assert.equal(usable, !unclearResult(s.evaluation), `${s.learner}/${s.promptId} scores ${s.evaluation.score}`)
  }
})

test('every demo voice ships with the app and is fit for CAPT', () => {
  for (const l of LEARNERS) {
    for (const id of TEST_PROMPTS) {
      const file = new URL(`../public/demo-voices/${l.name}/${id}.wav`, import.meta.url)
      assert.ok(existsSync(file), `${l.name}/${id}.wav`)
      const wav = new Uint8Array(readFileSync(file))
      assert.equal(wavProblem(wav), null, `${l.name}/${id}.wav`)
      assert.ok(readWavInfo(wav).durationSec < 8, `${l.name}/${id}.wav fits in one recording`)
    }
  }
})

test('a demo voice plays its clip, ends by itself, and hands the clip over for scoring', async () => {
  const clip = new Uint8Array(readFileSync(new URL('../public/demo-voices/Amara/think-three.wav', import.meta.url)))
  const fetched: string[] = []
  let played = 0
  const real = { fetch: globalThis.fetch, Audio: (globalThis as any).Audio, create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  globalThis.fetch = (async (url: string) => { fetched.push(url); return new Response(clip) }) as typeof fetch
  ;(globalThis as any).Audio = class {
    onended?: () => void
    play() { played++; setTimeout(() => this.onended?.(), 5); return Promise.resolve() }
    pause() {}
  }
  URL.createObjectURL = () => 'blob:x'
  URL.revokeObjectURL = () => {}
  try {
    const voice = new DemoVoice('Amara')
    const ended = new Promise<void>((resolve) => void voice.start('think-three', resolve))
    await ended
    assert.deepEqual(fetched, ['/demo-voices/Amara/think-three.wav'])
    assert.equal(played, 1)
    assert.deepEqual(await voice.stop(), clip)
  } finally {
    globalThis.fetch = real.fetch
    ;(globalThis as any).Audio = real.Audio
    URL.createObjectURL = real.create
    URL.revokeObjectURL = real.revoke
  }
})
