// Synthesizes the five simulated learners saying the test sentences, with
// their planted errors (TRA-809). Output goes to data/generated/learners/,
// which git ignores; rerun this to recreate it.
//
//   node tools/make-test-audio.ts
//
// One VoiceGen request per clip (5 learners × 12 sentences = 60), one at a
// time. Clips are 16 kHz mono 16-bit WAV, ready for CAPT.
//
// Writes manifest.json alongside: for every clip, who, which prompt, the
// sentence they were asked to say, what they actually said, and the planted
// sounds. That's the answer key for TRA-811.

import { mkdirSync, writeFileSync } from 'node:fs'
import { PROMPTS } from '../web/src/prompts.ts'
import { LEARNERS, TEST_PROMPTS, sayAs } from './simulated-learners.ts'
import { synthesizeForCapt } from './voicegen.ts'

const OUT = new URL('../data/generated/learners/', import.meta.url)

export type ManifestEntry = {
  learner: string
  promptId: string
  reference: string // what the child was asked to say
  said: string // what they actually said
  planted: string[]
  file: string // relative to data/generated/learners/
}

const manifest: ManifestEntry[] = []
for (const learner of LEARNERS) {
  mkdirSync(new URL(`${learner.name}/`, OUT), { recursive: true })
  for (const promptId of TEST_PROMPTS) {
    const prompt = PROMPTS.find((p) => p.id === promptId)
    if (!prompt) throw new Error(`unknown prompt ${promptId}`)
    const said = sayAs(learner, prompt.text)
    const wav = await synthesizeForCapt(said, { speaker: learner.speaker, speechRate: learner.speechRate, variation: 0.35 })
    const file = `${learner.name}/${promptId}.wav`
    writeFileSync(new URL(file, OUT), wav)
    manifest.push({ learner: learner.name, promptId, reference: prompt.text, said, planted: learner.planted, file })
    console.log(`${learner.name.padEnd(8)} ${promptId.padEnd(16)} "${said}"`)
    await new Promise((r) => setTimeout(r, 300))
  }
}
writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n')
console.log(`\n${manifest.length} clips in data/generated/learners/`)
