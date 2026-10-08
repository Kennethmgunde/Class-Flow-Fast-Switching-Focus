// CAPT client. All calls go through the Go proxy at /api/capt, because the
// demo server sends no CORS headers.
//
// Short prompts use REST /evaluate. Longer ones use WebSocket
// /streaming-evaluate: on the demo, REST fails with a 503 once the server
// takes more than 10 seconds, which happens for prompts over about 8 seconds.

import { readWavInfo, toBase64 } from './audio/wav.ts'

export type AlignmentKind = 'match' | 'substitution' | 'deletion' | 'insertion'

export type Hypothesis = { token: string; confidence: number; startMs: number; durationMs: number }

// One sound (phone) in a word. `reference` is the expected sound in X-SAMPA.
export type Sound = { reference: string; score: number; kind: AlignmentKind; heard: Hypothesis[] }

export type Word = { text: string; startMs: number; durationMs: number; sounds: Sound[] }

export type Evaluation = { score: number; words: Word[] }

export type CaptErrorKind =
  | 'out-of-vocabulary' // a word in the reference text isn't in CAPT's lexicon
  | 'timeout' // REST took over 10 s on the demo; retry over WebSocket
  | 'unavailable' // CAPT backend is down ("no healthy upstream")
  | 'no-result' // stream ended without a final result
  | 'server' // any other error from CAPT or the network

export class CaptError extends Error {
  readonly kind: CaptErrorKind
  // For 'out-of-vocabulary': the rejected word, when CAPT names it.
  readonly word?: string

  constructor(kind: CaptErrorKind, message: string, word?: string) {
    super(message)
    this.name = 'CaptError'
    this.kind = kind
    this.word = word
  }
}

export type EvaluateOptions = {
  // Base URL of the Go server. Defaults to the page's own origin.
  baseUrl?: string
  // Prompts longer than this go straight to WebSocket.
  restMaxSeconds?: number
  modelId?: string
}

const DEFAULT_REST_MAX_SECONDS = 6
const WS_CHUNK_BYTES = 8192
const WS_TIMEOUT_MS = 30_000

// CAPT treats punctuation as part of the word ("fox." is out of vocabulary).
export function cleanReferenceText(text: string): string {
  return text.replace(/[^\w' ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ')
}

// Scores a 16 kHz mono WAV against the sentence the speaker was asked to say.
export async function evaluate(wav: Uint8Array, referenceText: string, opts: EvaluateOptions = {}): Promise<Evaluation> {
  const config = {
    model_id: opts.modelId ?? 'en_US-16khz',
    audio_format: { audio_format_headered: 'AUDIO_FORMAT_HEADERED_WAV' },
    reference_text: cleanReferenceText(referenceText),
  }
  if (readWavInfo(wav).durationSec > (opts.restMaxSeconds ?? DEFAULT_REST_MAX_SECONDS)) {
    return evaluateStreaming(wav, config, opts.baseUrl)
  }
  try {
    return await evaluateRest(wav, config, opts.baseUrl)
  } catch (err) {
    if (err instanceof CaptError && err.kind === 'timeout') return evaluateStreaming(wav, config, opts.baseUrl)
    throw err
  }
}

async function evaluateRest(wav: Uint8Array, config: object, baseUrl = ''): Promise<Evaluation> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/capt/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, audio: { data: toBase64(wav) } }),
    })
  } catch (err) {
    throw new CaptError('server', `network error: ${err}`)
  }
  const body = await res.text()
  if (!res.ok) throw httpError(res.status, body)
  return parseEvaluation(JSON.parse(body).evaluation_result)
}

function evaluateStreaming(wav: Uint8Array, config: object, baseUrl?: string): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(streamingUrl(baseUrl))
    let final: Evaluation | undefined
    let failure: CaptError | undefined
    const timer = setTimeout(() => {
      failure = new CaptError('no-result', `no final result after ${WS_TIMEOUT_MS / 1000} s`)
      ws.close()
    }, WS_TIMEOUT_MS)

    ws.onopen = () => {
      ws.send(JSON.stringify({ config }))
      for (let i = 0; i < wav.length; i += WS_CHUNK_BYTES) {
        ws.send(JSON.stringify({ audio: { data: toBase64(wav.subarray(i, i + WS_CHUNK_BYTES)) } }))
      }
      ws.send(JSON.stringify({ audio: { data: '' } })) // end of audio
    }
    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data)
      if (msg.error) {
        failure = classifyMessage(String(msg.error.message ?? JSON.stringify(msg.error)))
        ws.close()
        return
      }
      const result = msg.result?.evaluation_result
      if (result && !result.is_partial) final = parseEvaluation(result)
    }
    // The demo never sends a close frame (code 1006), so any close after a
    // final result counts as a normal end of stream.
    ws.onclose = () => {
      clearTimeout(timer)
      if (final) resolve(final)
      else reject(failure ?? new CaptError('no-result', 'stream closed without a final result'))
    }
    ws.onerror = () => {
      failure ??= new CaptError('server', 'WebSocket error')
    }
  })
}

function streamingUrl(baseUrl?: string): string {
  const base = new URL(baseUrl ?? globalThis.location.origin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = '/api/capt/streaming-evaluate'
  return base.toString()
}

export function httpError(status: number, body: string): CaptError {
  if (status === 503 && body.includes('no healthy upstream')) {
    return new CaptError('unavailable', 'CAPT is down on the demo server (no healthy upstream)')
  }
  if (status === 503) return new CaptError('timeout', `CAPT REST timed out: ${body.slice(0, 200)}`)
  return classifyMessage(`HTTP ${status}: ${body.slice(0, 500)}`)
}

function classifyMessage(message: string): CaptError {
  if (/out of vocabulary/i.test(message)) {
    // The word is quoted, and the quotes may arrive escaped (\"word\").
    const word = message.match(/out of vocabulary word[^"']*["']([^"'\\]+)/i)?.[1]
    return new CaptError('out-of-vocabulary', message, word)
  }
  return new CaptError('server', message)
}

// Converts CAPT's JSON into app types. 64-bit fields such as start_time_ms
// arrive as strings, and "ALIGNMENT_KIND_MATCH" becomes "match".
export function parseEvaluation(raw: any): Evaluation {
  return {
    score: raw.score ?? 0,
    words: (raw.alignments ?? []).map((w: any) => ({
      text: w.text,
      startMs: Number(w.start_time_ms ?? 0),
      durationMs: Number(w.duration_ms ?? 0),
      sounds: (w.tokens ?? []).map((t: any) => ({
        reference: t.reference,
        score: t.score ?? 0,
        kind: String(t.kind ?? 'ALIGNMENT_KIND_MATCH').replace('ALIGNMENT_KIND_', '').toLowerCase() as AlignmentKind,
        heard: (t.hypotheses ?? []).map((h: any) => ({
          token: h.token,
          confidence: h.confidence ?? 0,
          startMs: Number(h.start_time_ms ?? 0),
          durationMs: Number(h.duration_ms ?? 0),
        })),
      })),
    })),
  }
}
