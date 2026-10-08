import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { PROMPTS } from '../src/prompts.ts'
import { measureWav, readWavInfo } from '../src/audio/wav.ts'

const dir = new URL('../public/prompts/', import.meta.url)

test('every prompt has a spoken clip, and no clip is left over', () => {
  for (const p of PROMPTS) {
    assert.ok(existsSync(new URL(`${p.id}.wav`, dir)), `no clip for ${p.id}; run tools/make-prompt-audio.ts`)
  }
  assert.equal(readdirSync(dir).length, PROMPTS.length)
})

test('clips are short, audible and equally loud', () => {
  for (const p of PROMPTS) {
    const wav = new Uint8Array(readFileSync(new URL(`${p.id}.wav`, dir)))
    const info = readWavInfo(wav)
    const sound = measureWav(wav)
    assert.equal(info.channels, 1)
    assert.ok(sound.durationSec > 0.8 && sound.durationSec < 4, `${p.id}: ${sound.durationSec.toFixed(2)} s`)
    assert.ok(Math.abs(sound.peak - 0.9) < 0.02, `${p.id}: peak ${sound.peak.toFixed(2)}`)
  }
})
