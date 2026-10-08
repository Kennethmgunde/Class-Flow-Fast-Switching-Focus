// WAV encoding for CAPT, which expects 16 kHz mono 16-bit PCM WAV.
// Pure functions with no browser APIs, so they can be tested in Node.

export const CAPT_SAMPLE_RATE = 16000

// Encodes mono float samples (-1..1) as a 16-bit PCM WAV file.
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buf)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

export type WavInfo = { sampleRate: number; channels: number; bitsPerSample: number; durationSec: number }

// Reads the format fields back from a WAV header produced by encodeWav.
export function readWavInfo(wav: Uint8Array): WavInfo {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const sampleRate = view.getUint32(24, true)
  const channels = view.getUint16(22, true)
  const bitsPerSample = view.getUint16(34, true)
  const dataBytes = view.getUint32(40, true)
  return { sampleRate, channels, bitsPerSample, durationSec: dataBytes / (sampleRate * channels * (bitsPerSample / 8)) }
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}
