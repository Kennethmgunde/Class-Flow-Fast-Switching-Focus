import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPT_SAMPLE_RATE, encodeWav, readWavInfo, toBase64 } from '../src/audio/wav.ts'

test('encodeWav writes a 16 kHz mono 16-bit PCM header', () => {
  const wav = encodeWav(new Float32Array(CAPT_SAMPLE_RATE), CAPT_SAMPLE_RATE)
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(wav.subarray(8, 12)), 'WAVE')
  assert.equal(wav.length, 44 + CAPT_SAMPLE_RATE * 2)
  assert.deepEqual(readWavInfo(wav), { sampleRate: 16000, channels: 1, bitsPerSample: 16, durationSec: 1 })
})

test('encodeWav clips out-of-range samples to the int16 range', () => {
  const wav = encodeWav(new Float32Array([2, -2, 0.5]), CAPT_SAMPLE_RATE)
  const view = new DataView(wav.buffer)
  assert.equal(view.getInt16(44, true), 32767)
  assert.equal(view.getInt16(46, true), -32768)
  assert.equal(view.getInt16(48, true), Math.trunc(0.5 * 0x7fff))
})

test('toBase64 round-trips large buffers', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
  assert.deepEqual(Uint8Array.from(Buffer.from(toBase64(bytes), 'base64')), bytes)
})
