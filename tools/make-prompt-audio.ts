// Generates a spoken clip for every prompt with Cobalt VoiceGen, so children
// who can't read yet can hear the sentence (TRA-797). The clips ship with
// the app in web/public/prompts/, so playback never depends on the demo
// server during class.
//
// Uses Cobalt's own voice at a slightly slower pace, with no variation, the
// same voice tools/check-prompts.ts confirmed CAPT understands. One VoiceGen
// request per prompt, one at a time. Rerun after adding or changing prompts:
//
//   node tools/make-prompt-audio.ts            # only missing clips
//   node tools/make-prompt-audio.ts --all      # regenerate every clip

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { PROMPTS } from '../web/src/prompts.ts'
import { synthesizeForPlayback } from './voicegen.ts'

export const VOICE = { speaker: 'cobalt_steve', speechRate: 0.85, variation: 0 }

const dir = new URL('../web/public/prompts/', import.meta.url)
mkdirSync(dir, { recursive: true })
const all = process.argv.includes('--all')

for (const p of PROMPTS) {
  const file = new URL(`${p.id}.wav`, dir)
  if (!all && existsSync(file)) continue
  const wav = await synthesizeForPlayback(p.text, VOICE)
  writeFileSync(file, wav)
  console.log(`${p.id.padEnd(16)} ${(wav.length / 1024).toFixed(0)} KB  "${p.text}"`)
  await new Promise((r) => setTimeout(r, 300))
}

// Remove clips for prompts that no longer exist.
const ids = new Set(PROMPTS.map((p) => `${p.id}.wav`))
for (const f of readdirSync(dir)) if (!ids.has(f)) rmSync(new URL(f, dir))
