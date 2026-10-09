// Demo voices (TRA-813): for the "Show us" run, the five simulated learners
// in the demo class speak with their synthesized clips instead of the
// microphone, so the run is the same every time and the planted errors are
// what CAPT hears. Tapping the microphone plays the child's clip aloud (the
// audience hears "I tink dere are tree"), then that clip goes to the real
// CAPT, exactly as a recording would.
//
// Only the demo class's simulated learners are affected, and only when the
// teacher turns demo voices on (Check screen). Everyone else, and every real
// class, always uses the microphone. Clips ship with the app in
// public/demo-voices/ (copied there by tools/make-test-audio.ts).

import type { Prompt } from '../prompts.ts'
import type { ClassRoom, Learner } from '../store.ts'
import { DEMO_CLASS_NAME } from './seed.ts'
import { LEARNERS, TEST_PROMPTS, type SimulatedLearner } from './simulated-learners.ts'

const KEY = 'class-flow:demo-voices'

export function demoVoicesOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setDemoVoices(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'on')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode): demo voices stay off.
  }
}

// The simulated learner this child is, when their turn should use a demo
// voice: demo voices on, the demo class, and one of the five names.
export function demoVoiceFor(learner: Learner, classRoom: ClassRoom | undefined, on = demoVoicesOn()): SimulatedLearner | undefined {
  if (!on || classRoom?.name !== DEMO_CLASS_NAME) return undefined
  return LEARNERS.find((l) => l.name === learner.name)
}

// Clips the synthesizer got wrong, so CAPT can't make out the sentence at
// all; replaying one would leave the child stuck on "Try again". Chidi's
// "a little lamp is lit" scores 0.04 (docs/answer-key-check.md).
export const UNUSABLE_CLIPS: Record<string, string[]> = { Chidi: ['little-lamp'] }

// The sentences this simulated learner has a usable clip for.
export function demoPrompts(prompts: Prompt[], name: string): Prompt[] {
  return prompts.filter((p) => TEST_PROMPTS.includes(p.id) && !UNUSABLE_CLIPS[name]?.includes(p.id))
}

export function demoClipUrl(name: string, promptId: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}demo-voices/${name}/${promptId}.wav`
}

// Stands in for the microphone: start() plays the clip, and calls `onEnd`
// when it has finished, as a child tapping stop would; stop() hands back the
// clip for scoring.
export class DemoVoice {
  private readonly name: string
  private clip?: Uint8Array
  private audio?: HTMLAudioElement
  private url?: string

  constructor(name: string) {
    this.name = name
  }

  async start(promptId: string, onEnd?: () => void): Promise<void> {
    const res = await fetch(demoClipUrl(this.name, promptId))
    if (!res.ok) throw new Error(`demo voice missing: ${this.name}/${promptId}.wav (HTTP ${res.status})`)
    this.clip = new Uint8Array(await res.arrayBuffer())
    this.url = URL.createObjectURL(new Blob([this.clip as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
    this.audio = new Audio(this.url)
    this.audio.onended = () => onEnd?.()
    // If the browser won't play it aloud, score it anyway after a moment.
    await this.audio.play().catch(() => setTimeout(() => onEnd?.(), 1500))
  }

  async stop(): Promise<Uint8Array> {
    this.audio?.pause()
    if (this.url) URL.revokeObjectURL(this.url)
    const clip = this.clip
    this.clip = this.audio = this.url = undefined
    if (!clip) throw new Error('demo voice stopped before it started')
    return clip
  }
}
