// A demo class with two weeks of practice history (TRA-810), so the teacher
// view has something real to show in a five-minute demo: sounds to work on,
// who is improving, who may need support.
//
// The history is simulated, never recorded (quest rule). Attempts have the
// shape of real CAPT results: each sentence's words carry the phones CAPT
// reported for it (data/prompt-phones.json), with scores drawn from each
// child's profile:
// - the five simulated learners keep their planted errors (Amara th, Chidi v,
//   Wanjiru r, Kofi sh and ch; Zuri none), the same ones as their test audio
// - Tunde and Achieng improve session by session; Musa slips
// - everyone else is steady
// A fixed seed makes the class identical every time it's loaded.

import type { Evaluation } from '../capt.ts'
import phones from '../data/prompt-phones.json' with { type: 'json' }
import { AVATARS } from '../avatars.ts'
import { choosePrompts, PROMPTS_PER_TURN } from '../practice.ts'
import { PROMPTS, type Prompt } from '../prompts.ts'
import { soundById } from '../sounds.ts'
import type { Attempt, ClassRoom, Learner, Store } from '../store.ts'
import { LEARNERS } from './simulated-learners.ts'

export const DEMO_CLASS_NAME = 'Class 3A (demo)'

const NAMES = [
  'Amara', 'Chidi', 'Wanjiru', 'Kofi', 'Zuri', 'Tunde', 'Achieng', 'Musa', 'Ngozi', 'Baraka',
  'Imani', 'Emeka', 'Fatima', 'Kamau', 'Adaeze', 'Otieno', 'Halima', 'Juma', 'Chiamaka', 'Kiprop',
  'Nkechi', 'Ibrahim', 'Akinyi', 'Segun', 'Wairimu', 'Yusuf', 'Ifeoma', 'Mwangi', 'Aisha', 'Obinna',
]
const IMPROVING: Record<string, number> = { Tunde: 0.045, Achieng: 0.04, Musa: -0.045 } // change per session
const PAST_SESSIONS_DAYS_AGO = [13, 10, 6, 3]
const ATTENDANCE = 0.9
const DAY = 86_400_000

export type DemoOptions = {
  now?: number
  seed?: number
  openToday?: boolean // start today's session, empty, ready for the live demo
}

export async function seedDemoClass(store: Store, opts: DemoOptions = {}): Promise<{ classRoom: ClassRoom; learners: Learner[] }> {
  const now = opts.now ?? Date.now()
  const random = seededRandom(opts.seed ?? 2026)
  const classRoom = await store.addClass(DEMO_CLASS_NAME, now - 14 * DAY)
  const learners: Learner[] = []
  for (const [i, name] of NAMES.entries()) {
    learners.push(await store.addLearner(classRoom.id, name, AVATARS[(i * 7) % AVATARS.length], now - 14 * DAY))
  }

  // Each child's level: around 0.85, with a little spread between children.
  const base = new Map(learners.map((l) => [l.id, 0.8 + random() * 0.1]))
  const planted = new Map(LEARNERS.map((l) => [l.name, new Set(l.planted.map((s) => soundById(s).xsampa))]))
  const history = new Map<string, Attempt[]>(learners.map((l) => [l.id, []]))

  for (const [k, daysAgo] of PAST_SESSIONS_DAYS_AGO.entries()) {
    const start = atTen(now - daysAgo * DAY)
    const session = await store.startSession(classRoom.id, start)
    let clock = start
    for (const learner of learners) {
      if (random() > ATTENDANCE) continue
      const level = base.get(learner.id)! + (IMPROVING[learner.name] ?? 0) * (k - (PAST_SESSIONS_DAYS_AGO.length - 1) / 2)
      const weak = planted.get(learner.name) ?? new Set<string>()
      for (const prompt of choosePrompts(PROMPTS, history.get(learner.id)!, PROMPTS_PER_TURN, random)) {
        clock += 15_000 + random() * 20_000
        const attempt = await store.addAttempt({
          learnerId: learner.id,
          sessionId: session.id,
          promptId: prompt.id,
          referenceText: prompt.text,
          evaluation: simulatedEvaluation(prompt, level, weak, random),
          at: clock,
        })
        history.get(learner.id)!.push(attempt)
      }
    }
    await store.endSession(session.id, clock + 60_000)
  }
  if (opts.openToday ?? true) await store.startSession(classRoom.id, now)
  return { classRoom, learners }
}

// Deletes every demo class, with its learners and history.
export async function removeDemoClasses(store: Store): Promise<number> {
  const demos = (await store.listClasses()).filter((c) => c.name === DEMO_CLASS_NAME)
  for (const c of demos) await store.deleteClass(c.id)
  return demos.length
}

// A CAPT-shaped result for one sentence: CAPT's phones for it, scored around
// the child's level, with planted sounds scored low.
function simulatedEvaluation(prompt: Prompt, level: number, weak: Set<string>, random: () => number): Evaluation {
  const texts = prompt.text.split(' ')
  const words = (phones as Record<string, string[][]>)[prompt.id]
    .filter((p) => p.some(Boolean)) // skip CAPT's pause "words"
    .map((p, i) => ({
      text: texts[i] ?? '',
      startMs: i * 300,
      durationMs: 280,
      sounds: p.map((reference) => {
        const score = weak.has(reference) ? 0.22 + (random() - 0.5) * 0.3 : level + (random() - 0.5) * 0.12
        return { reference, score: clamp(score), kind: 'match' as const, heard: [] }
      }),
    }))
  const all = words.flatMap((w) => w.sounds.map((s) => s.score))
  return { score: all.reduce((a, b) => a + b, 0) / all.length, words }
}

function atTen(ms: number): number {
  const d = new Date(ms)
  d.setHours(10, 0, 0, 0)
  return d.getTime()
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
