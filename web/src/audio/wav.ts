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

export type Loudness = { durationSec: number; peak: number; rms: number }

// Duration and loudness of a 16-bit PCM WAV made by encodeWav, so silent
// or too-short recordings can be caught before they're sent to CAPT.
export function measureWav(wav: Uint8Array): Loudness {
  const info = readWavInfo(wav)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const count = Math.max(0, Math.floor((wav.byteLength - 44) / 2))
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < count; i++) {
    const s = view.getInt16(44 + i * 2, true) / 0x8000
    peak = Math.max(peak, Math.abs(s))
    sumSquares += s * s
  }
  return { durationSec: info.durationSec, peak, rms: count ? Math.sqrt(sumSquares / count) : 0 }
}

// Why a WAV isn't fit to send to CAPT, or null if it is: a well-formed
// 16 kHz mono 16-bit PCM file with real sound in it. Guards every CAPT call,
// so no screen or tool can send an empty, cut-off or malformed file.
export function wavProblem(wav: Uint8Array, minSeconds = 0.3): string | null {
  if (wav.byteLength < 44) return `only ${wav.byteLength} bytes, smaller than a WAV header`
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data') return 'not a plain PCM WAV file'
  if (view.getUint32(4, true) !== wav.byteLength - 8) return 'RIFF length doesn’t match the file size'
  if (view.getUint16(20, true) !== 1) return 'not PCM audio'
  const { sampleRate, channels, bitsPerSample, durationSec } = readWavInfo(wav)
  if (sampleRate !== CAPT_SAMPLE_RATE || channels !== 1 || bitsPerSample !== 16) {
    return `${sampleRate} Hz, ${channels} channel(s), ${bitsPerSample}-bit; CAPT needs 16000 Hz mono 16-bit`
  }
  if (view.getUint32(40, true) !== wav.byteLength - 44) return 'data length doesn’t match the file size'
  if (durationSec === 0) return 'empty: no audio after the header'
  if (durationSec < minSeconds) return `only ${durationSec.toFixed(2)} s of audio`
  if (measureWav(wav).peak === 0) return 'all silence'
  return null
}
