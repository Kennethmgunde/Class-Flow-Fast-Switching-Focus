// What the teacher view shows: who hasn't had a turn, which sounds the class
// finds hard, and who is improving. Plain calculations over stored attempts,
// with no DOM code, so they're tested.
//
// Lessons from real CAPT output shape the rules:
// - Use per-sound scores. A wrong sound barely moves the overall score.
// - Single scores are noisy, so nothing is flagged from one attempt.
// - CAPT's US English model scores other accents lower across the board, so
//   sounds are ranked against the class's own average, not fixed pass marks.

import type { Evaluation } from './capt.ts'
import { SOUNDS, soundForPhone, type Sound, type SoundId } from './sounds.ts'
import type { Attempt, Learner } from './store.ts'

// --- Turns (TRA-803) ---------------------------------------------------------

export type TurnStatus = { learner: Learner; attempts: number; lastAt?: number }

export type Turns = {
  practised: TurnStatus[] // most recent first
  waiting: Learner[] // haven't had a turn this session, alphabetical
}

export function turnsThisSession(learners: Learner[], sessionAttempts: Attempt[]): Turns {
  const byLearner = new Map<string, Attempt[]>()
  for (const a of sessionAttempts) byLearner.set(a.learnerId, [...(byLearner.get(a.learnerId) ?? []), a])
  const practised: TurnStatus[] = []
  const waiting: Learner[] = []
  for (const learner of learners) {
    const mine = byLearner.get(learner.id)
    if (mine) practised.push({ learner, attempts: mine.length, lastAt: Math.max(...mine.map((a) => a.at)) })
    else waiting.push(learner)
  }
  practised.sort((a, b) => b.lastAt! - a.lastAt!)
  waiting.sort((a, b) => a.name.localeCompare(b.name))
  return { practised, waiting }
}

// --- Sound difficulties (TRA-804) ---------------------------------------------

// A sound needs this many scored occurrences (class-wide) before it's ranked,
// and a child needs this many before they're named as finding it hard.
const MIN_CLASS_OCCURRENCES = 4
const MIN_LEARNER_OCCURRENCES = 2
// Gaps are relative, "this share below the average", so an accent that
// lowers every score by the same factor changes nothing.
// A sound is "hard" for the class when its average sits 10% below the
// class's average over all target sounds.
const HARD_GAP = 0.1
// A child finds a sound hard when it scores 20% below their own average.
const LEARNER_GAP = 0.2
const WEAK = 0.5

export type SoundDifficulty = {
  sound: Sound
  occurrences: number
  average: number // mean CAPT score for this sound, 0 to 1
  gap: number // share below the class's average over all target sounds (0.25 = 25% below)
  weakShare: number // share of occurrences scoring under 0.5 or missed
  hard: boolean
  learners: Learner[] // children who find this sound hard, weakest first
}

type Occurrence = { learnerId: string; sound: SoundId; score: number }

// Every target-sound score in the attempts. Other phones, and the empty
// "words" CAPT returns for pauses, are ignored.
export function soundOccurrences(attempts: Attempt[]): Occurrence[] {
  const out: Occurrence[] = []
  for (const a of attempts) {
    for (const w of a.evaluation.words) {
      if (!w.text.trim()) continue
      for (const s of w.sounds) {
        const sound = soundForPhone(s.reference)
        if (sound) out.push({ learnerId: a.learnerId, sound: sound.id, score: s.kind === 'deletion' ? 0 : s.score })
      }
    }
  }
  return out
}

// Target sounds ranked hardest first, with the children who find each hard.
export function classSoundDifficulties(attempts: Attempt[], learners: Learner[]): SoundDifficulty[] {
  const occurrences = soundOccurrences(attempts)
  if (occurrences.length === 0) return []
  const classAverage = mean(occurrences.map((o) => o.score))
  const learnerAverage = new Map<string, number>()
  for (const l of learners) {
    const mine = occurrences.filter((o) => o.learnerId === l.id).map((o) => o.score)
    if (mine.length) learnerAverage.set(l.id, mean(mine))
  }

  const result: SoundDifficulty[] = []
  for (const sound of SOUNDS) {
    const these = occurrences.filter((o) => o.sound === sound.id)
    if (these.length < MIN_CLASS_OCCURRENCES) continue
    const average = mean(these.map((o) => o.score))
    const weakShare = these.filter((o) => o.score < WEAK).length / these.length

    const strugglers: { learner: Learner; gap: number }[] = []
    for (const l of learners) {
      const mine = these.filter((o) => o.learnerId === l.id).map((o) => o.score)
      if (mine.length < MIN_LEARNER_OCCURRENCES) continue
      const gap = relativeGap(learnerAverage.get(l.id)!, mean(mine))
      if (gap >= LEARNER_GAP) strugglers.push({ learner: l, gap })
    }
    strugglers.sort((a, b) => b.gap - a.gap)

    const gap = relativeGap(classAverage, average)
    result.push({
      sound,
      occurrences: these.length,
      average,
      gap,
      weakShare,
      hard: gap >= HARD_GAP,
      learners: strugglers.map((s) => s.learner),
    })
  }
  return result.sort((a, b) => b.gap - a.gap)
}

// --- Improvement (TRA-805) ----------------------------------------------------

// Rise in a child's average sound score, early sessions to recent ones,
// that counts as real rather than noise: 7% on their own earlier level.
// Relative, like the sound gaps, so an accent doesn't change it.
const IMPROVING = 0.07

export type Trend = 'improving' | 'steady' | 'needs-support' | 'not-enough-practice'

export type Improvement = {
  learner: Learner
  trend: Trend
  change: number // recent average vs early average, as a share (0.2 = 20% higher)
  sessions: number
  biggestGain?: { sound: Sound; change: number } // the sound that improved most
}

// One number per attempt: the average of its target-sound scores, falling
// back to every sound if a sentence has no target sounds.
export function attemptAccuracy(evaluation: Evaluation): number {
  const all = evaluation.words.filter((w) => w.text.trim()).flatMap((w) => w.sounds)
  const target = all.filter((s) => soundForPhone(s.reference))
  const use = target.length ? target : all
  return use.length ? mean(use.map((s) => (s.kind === 'deletion' ? 0 : s.score))) : 0
}

export function improvement(learner: Learner, history: Attempt[]): Improvement {
  const sessions = groupBySession(history.filter((a) => a.learnerId === learner.id))
  if (sessions.length < 2) return { learner, trend: 'not-enough-practice', change: 0, sessions: sessions.length }

  // Compare the earlier half of the sessions with the later half.
  const half = Math.floor(sessions.length / 2)
  const early = sessions.slice(0, half).flat()
  const recent = sessions.slice(sessions.length - half).flat()
  const change = relativeChange(mean(early.map((a) => attemptAccuracy(a.evaluation))), mean(recent.map((a) => attemptAccuracy(a.evaluation))))
  const trend: Trend = change >= IMPROVING ? 'improving' : change <= -IMPROVING ? 'needs-support' : 'steady'

  return { learner, trend, change, sessions: sessions.length, biggestGain: biggestGain(early, recent) }
}

// Every learner's trend: improving first (biggest gain first), then steady,
// then those who need support, then those without enough practice yet.
export function classImprovement(learners: Learner[], history: Attempt[]): Improvement[] {
  const order: Record<Trend, number> = { improving: 0, steady: 1, 'needs-support': 2, 'not-enough-practice': 3 }
  return learners
    .map((l) => improvement(l, history))
    .sort((a, b) => order[a.trend] - order[b.trend] || b.change - a.change)
}

function biggestGain(early: Attempt[], recent: Attempt[]): Improvement['biggestGain'] {
  const before = soundOccurrences(early)
  const after = soundOccurrences(recent)
  let best: Improvement['biggestGain']
  for (const sound of SOUNDS) {
    const b = before.filter((o) => o.sound === sound.id).map((o) => o.score)
    const a = after.filter((o) => o.sound === sound.id).map((o) => o.score)
    if (b.length < MIN_LEARNER_OCCURRENCES || a.length < MIN_LEARNER_OCCURRENCES) continue
    const change = relativeChange(mean(b), mean(a))
    if (change >= IMPROVING && (!best || change > best.change)) best = { sound, change }
  }
  return best
}

// Attempts grouped by session, oldest session first.
function groupBySession(attempts: Attempt[]): Attempt[][] {
  const bySession = new Map<string, Attempt[]>()
  for (const a of [...attempts].sort((x, y) => x.at - y.at)) {
    bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a])
  }
  return [...bySession.values()]
}

function relativeChange(before: number, after: number): number {
  return before > 0 ? (after - before) / before : 0
}

// How far `value` sits below `average`, as a share of the average.
function relativeGap(average: number, value: number): number {
  return average > 0 ? (average - value) / average : 0
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
