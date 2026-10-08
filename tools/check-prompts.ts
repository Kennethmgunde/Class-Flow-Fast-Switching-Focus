// Checks every prompt against CAPT on the demo server, through the Go proxy:
// CAPT accepts every word, the spoken prompt is short, and each focus sound
// really appears in CAPT's phones for that sentence. Speech comes from
// VoiceGen (the quest rules ban human recordings).
//
// Sends two requests per prompt (VoiceGen, then CAPT), one at a time.
// Run it after editing prompts, not in a loop:
//
//   cd server && go run .          # in another terminal
//   node tools/check-prompts.ts    # from the repo root
//
// Writes the phones CAPT used for each prompt to
// web/src/data/prompt-phones.json, which the unit tests check and the demo
// class is built from.

import { writeFileSync } from 'node:fs'
import { CaptError, evaluate } from '../web/src/capt.ts'
import { PROMPTS } from '../web/src/prompts.ts'
import { soundById } from '../web/src/sounds.ts'
import { synthesizeForCapt } from './voicegen.ts'

const BASE = process.env.CAPT_PROXY ?? 'http://127.0.0.1:8080'
const MAX_SECONDS = 4
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

const phones: Record<string, string[][]> = {}
const problems: string[] = []

for (const p of PROMPTS) {
  const wav = await synthesizeForCapt(p.text, { speaker: 'cobalt_steve', variation: 0 })
  const seconds = (wav.length - 44) / 32000
  try {
    const result = await evaluate(wav, p.text, { baseUrl: BASE })
    phones[p.id] = result.words.map((w) => w.sounds.map((s) => s.reference))
    const all = new Set(phones[p.id].flat())
    const missing = p.focus.filter((f) => !all.has(soundById(f).xsampa))
    if (missing.length) problems.push(`${p.id}: focus not found: ${missing.map((f) => `${f} (${soundById(f).xsampa})`).join(', ')}`)
    if (seconds > MAX_SECONDS) problems.push(`${p.id}: ${seconds.toFixed(1)} s spoken, over ${MAX_SECONDS} s`)
    console.log(
      `${p.id.padEnd(16)} ${seconds.toFixed(1)}s  score ${result.score.toFixed(2)}  ${missing.length ? 'MISSING ' + missing.join(',') : 'ok'}  ` +
        result.words.map((w) => `${w.text}[${w.sounds.map((s) => s.reference).join(' ')}]`).join(' '),
    )
  } catch (err) {
    const msg = err instanceof CaptError ? `${err.kind}${err.word ? ` (${err.word})` : ''}: ${err.message}` : String(err)
    problems.push(`${p.id}: ${msg}`)
    console.log(`${p.id.padEnd(16)} FAILED ${msg}`)
  }
  await pause(300)
}

writeFileSync(new URL('../web/src/data/prompt-phones.json', import.meta.url), JSON.stringify(phones, null, 2) + '\n')
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : `\nAll ${PROMPTS.length} prompts ok.`)
process.exit(problems.length ? 1 : 0)
