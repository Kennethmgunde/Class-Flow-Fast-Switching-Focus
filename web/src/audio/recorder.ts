// Microphone capture that produces CAPT-ready audio (16 kHz mono 16-bit WAV).
//
// The mic is captured at the browser's native rate (usually 44.1 or 48 kHz)
// and resampled afterwards with OfflineAudioContext. Opening an AudioContext
// at 16 kHz directly fails in Firefox when a mic stream is connected to it.

import { CAPT_SAMPLE_RATE, encodeWav } from './wav.ts'

// Copies each block of mic samples to the main thread.
const WORKLET_SOURCE = `
registerProcessor('capture', class extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
})`

export class Recorder {
  private ctx?: AudioContext
  private stream?: MediaStream
  private chunks: Float32Array[] = []

  async start(): Promise<void> {
    this.chunks = []
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    this.ctx = new AudioContext()
    // Chrome can create the context paused if the permission prompt outlasted
    // the tap that started recording; a paused context records nothing.
    await this.ctx.resume()
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }))
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    const source = this.ctx.createMediaStreamSource(this.stream)
    const capture = new AudioWorkletNode(this.ctx, 'capture')
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => this.chunks.push(e.data)
    source.connect(capture)
  }

  // Stops recording and returns the take as 16 kHz mono 16-bit WAV.
  async stop(): Promise<Uint8Array> {
    const ctx = this.ctx
    if (!ctx) throw new Error('recorder not started')
    this.stream?.getTracks().forEach((t) => t.stop())
    await ctx.close()
    this.ctx = undefined

    const native = concat(this.chunks)
    const resampled = await resample(native, ctx.sampleRate, CAPT_SAMPLE_RATE)
    return encodeWav(resampled, CAPT_SAMPLE_RATE)
  }
}

async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (samples.length === 0 || from === to) return samples
  const length = Math.ceil((samples.length * to) / from)
  const offline = new OfflineAudioContext(1, length, to)
  const buffer = offline.createBuffer(1, samples.length, from)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0)
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
