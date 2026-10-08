// Synthesizes speech with Cobalt VoiceGen and converts it for CAPT.
//
// VoiceGen returns 22.05 kHz mono 32-bit float WAV; CAPT needs 16 kHz mono
// 16-bit. Used to build synthesized test audio (TRA-809) and prompt clips
// (TRA-797). The quest rules ban human recordings, so all test speech comes
// from here.

import { CAPT_SAMPLE_RATE, encodeWav } from '../web/src/audio/wav.ts'

const VOICEGEN = 'https://demo.cobaltspeech.com/voicegen/api/voicegen/v1'

export const SPEAKERS = [
  'cobalt_steve', 'LTTS_8797', 'LTTS_2300', 'LTTS_8123',
  'LTTS_5789', 'LTTS_4137', 'LTTS_251', 'LTTS_8555',
] as const

export type SynthOptions = {
  speaker?: string
  speechRate?: number // 0.25 to 4, 1 is normal
  variation?: number // 0 to 0.5
}

// Returns CAPT-ready 16 kHz mono 16-bit WAV.
export async function synthesizeForCapt(text: string, opts: SynthOptions = {}): Promise<Uint8Array> {
  const params = new URLSearchParams({
    'text.text': text,
    'config.model_id': 'en_US',
    'config.speaker_id': opts.speaker ?? SPEAKERS[0],
    'config.speech_rate': String(opts.speechRate ?? 1),
    'config.variation_scale': String(opts.variation ?? 0.3),
    'config.audio_format.codec': 'AUDIO_CODEC_WAV',
  })
  const res = await fetch(`${VOICEGEN}/streaming-synthesize?${params}`)
  if (!res.ok) throw new Error(`VoiceGen HTTP ${res.status}: ${await res.text()}`)
  const { sampleRate, samples } = readFloatWav(new Uint8Array(await res.arrayBuffer()))
  return encodeWav(resample(samples, sampleRate, CAPT_SAMPLE_RATE), CAPT_SAMPLE_RATE)
}

// Reads a mono 32-bit float WAV, VoiceGen's output format.
export function readFloatWav(wav: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const format = view.getUint16(20, true)
  const bits = view.getUint16(34, true)
  if (format !== 3 || bits !== 32) throw new Error(`expected 32-bit float WAV, got format ${format}, ${bits}-bit`)
  const sampleRate = view.getUint32(24, true)

  let offset = 12
  while (offset + 8 <= wav.length && ascii(wav, offset) !== 'data') offset += 8 + view.getUint32(offset + 4, true)
  if (offset + 8 > wav.length) throw new Error('no data chunk in WAV')
  // Streamed WAVs carry a placeholder data length, so read to the end of the file.
  const count = Math.floor((wav.length - offset - 8) / 4)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = view.getFloat32(offset + 8 + i * 4, true)
  return { sampleRate, samples }
}

// Windowed-sinc resampler with a low-pass at the lower of the two Nyquist rates.
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x
  const ratio = from / to
  const cutoff = Math.min(1, to / from)
  const half = 16 // filter half-width, in zero crossings
  const y = new Float32Array(Math.floor(x.length / ratio))
  for (let j = 0; j < y.length; j++) {
    const center = j * ratio
    let acc = 0
    for (let i = Math.ceil(center - half / cutoff); i <= Math.floor(center + half / cutoff); i++) {
      if (i < 0 || i >= x.length) continue
      const t = (i - center) * cutoff
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      const window = 0.5 + 0.5 * Math.cos((Math.PI * t) / half)
      acc += x[i] * sinc * window * cutoff
    }
    y[j] = acc
  }
  return y
}

function ascii(b: Uint8Array, offset: number): string {
  return String.fromCharCode(b[offset], b[offset + 1], b[offset + 2], b[offset + 3])
}
