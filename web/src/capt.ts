// Minimal CAPT REST call, through the Go proxy at /api/capt.
// The full client (WebSocket, typed results, error handling) is TRA-795.

import { toBase64 } from './audio/wav'

// CAPT treats punctuation as part of the word ("fox." is out of vocabulary).
export function cleanReferenceText(text: string): string {
  return text.replace(/[^\w' ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ')
}

export async function evaluate(wav: Uint8Array, referenceText: string): Promise<{ score: number }> {
  const res = await fetch('/api/capt/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        model_id: 'en_US-16khz',
        audio_format: { audio_format_headered: 'AUDIO_FORMAT_HEADERED_WAV' },
        reference_text: cleanReferenceText(referenceText),
      },
      audio: { data: toBase64(wav) },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()).evaluation_result
}
