// What can go wrong during a turn, and what to tell the child. No DOM code,
// so it's tested. Messages are short and kind; when a grown-up has to fix
// something, the message says to ask the teacher.

import type { Evaluation } from './capt.ts'
import { CaptError } from './capt.ts'
import type { Loudness } from './audio/wav.ts'

export type Problem = {
  kind:
    | 'too-short' | 'silent' | 'unclear'
    | 'mic-blocked' | 'no-mic' | 'insecure-page' | 'mic-stuck'
    | 'offline' | 'capt-down' | 'unknown'
  message: string // for the child
  askTeacher: boolean // a grown-up needs to fix it
}

const MIN_SECONDS = 0.6
const SILENT_PEAK = 0.02
const SILENT_RMS = 0.004
const UNCLEAR_SCORE = 0.1

// A problem with the recording itself, caught before calling CAPT.
export function recordingProblem(sound: Loudness): Problem | undefined {
  if (sound.durationSec < MIN_SECONDS) {
    return { kind: 'too-short', message: 'That was very quick! Tap, say the whole sentence, then tap again.', askTeacher: false }
  }
  if (sound.peak < SILENT_PEAK || sound.rms < SILENT_RMS) {
    return { kind: 'silent', message: 'I didn’t hear you. Try again, a bit louder.', askTeacher: false }
  }
  return undefined
}

// CAPT answered, but heard almost nothing of the sentence: noise or a
// different sentence. Not saved, so it doesn't skew the teacher view.
export function unclearResult(evaluation: Evaluation): Problem | undefined {
  if (evaluation.score >= UNCLEAR_SCORE) return undefined
  return { kind: 'unclear', message: 'I couldn’t hear the words clearly. Let’s try again.', askTeacher: false }
}

// Turns any thrown error into something a child can act on.
export function describeError(err: unknown, online = true): Problem {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { kind: 'mic-blocked', message: 'The microphone is switched off. Ask your teacher for help.', askTeacher: true }
  }
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return { kind: 'no-mic', message: 'I can’t find a microphone. Ask your teacher for help.', askTeacher: true }
  }
  if (err instanceof TypeError && /mediaDevices|getUserMedia/.test(err.message)) {
    // Browsers hide the microphone on plain http pages other than localhost.
    return { kind: 'insecure-page', message: 'The microphone isn’t allowed here. Ask your teacher for help.', askTeacher: true }
  }
  if (err instanceof TimeoutError && /microphone/.test(err.message)) {
    return { kind: 'mic-stuck', message: 'The microphone didn’t start. Ask your teacher for help.', askTeacher: true }
  }
  if (!online) {
    return { kind: 'offline', message: 'We’re not connected to the internet. Ask your teacher.', askTeacher: true }
  }
  if (err instanceof CaptError && err.kind === 'unavailable') {
    return { kind: 'capt-down', message: 'The listening helper is resting. Ask your teacher.', askTeacher: true }
  }
  return { kind: 'unknown', message: 'Oops, let’s try that again.', askTeacher: false }
}

export class TimeoutError extends Error {
  constructor(what: string) {
    super(`${what} took too long`)
    this.name = 'TimeoutError'
  }
}

// Rejects if `promise` hasn't settled within `ms`, so the screen never freezes.
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(what)), ms) })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

// Errors worth one quiet retry before bothering the child: a busy or
// briefly unreachable server. Not a down server, and not a bad request.
export function isTransient(err: unknown): boolean {
  if (err instanceof CaptError) return err.kind === 'server' || err.kind === 'timeout' || err.kind === 'no-result'
  return err instanceof TypeError // fetch network failure
}

export async function withRetry<T>(
  run: () => Promise<T>,
  { retries = 1, delayMs = 1500, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) throw err
      await wait(delayMs)
    }
  }
}

// After this many problems on one sentence, offer to skip it.
export const SKIP_AFTER = 2
