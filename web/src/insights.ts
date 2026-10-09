// What the teacher view shows: who hasn't had a turn, which sounds the class
// finds hard, and who is improving. Plain calculations over stored attempts,
// with no DOM code, so they're tested.
//
// Lessons from real CAPT output shape the rules:
// - Use per-sound scores. A wrong sound barely moves the overall score.
// - Single scores are noisy, so nothing is flagged from one attempt.
// - CAPT's US English model scores other accents lower across the board, so
//   sounds are ranked against the class's own average, not fixed pass marks.

import { SOUNDS, soundForPhone, type Sound, type SoundId } from './sounds.ts'
import type { Attempt, Learner, Session } from './store.ts'

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
// A child is named, or a sound marked hard for the class, only if it's weak
// in at least this many different sentences: one bad recording, one hard
// sentence, or one mispronounced word dragging down its neighbours isn't a
// pattern. (Found checking against the answer key, TRA-811.)
const MIN_WEAK_SENTENCES = 2
// A sound is "hard" for the class when its average sits 10% below the
// class's average over all target sounds.
const HARD_GAP = 0.1
// A child finds a sound hard when they score 20% below the class's average
// for that sound: clearly worse than classmates, not just a hard sound.
const LEARNER_GAP = 0.2
// A sound a few children share is worth a small-group lesson.
const MIN_GROUP = 2
const WEAK = 0.5

export type SoundDifficulty = {
  sound: Sound
  occurrences: number
  average: number // mean CAPT score for this sound, 0 to 1
  gap: number // share below the class's average over all target sounds (0.25 = 25% below)
  weakShare: number // share of occurrences scoring under 0.5 or missed
  hard: boolean // hard for the whole class
  learners: Learner[] // children who find this sound hard, weakest first
}

// `sentence` tells repeats of the same sentence apart from different ones.
type Occurrence = { learnerId: string; sound: SoundId; score: number; sentence: string }

// Every target-sound score in the attempts. Other phones, and the empty
// "words" CAPT returns for pauses, are ignored.
export function soundOccurrences(attempts: Attempt[]): Occurrence[] {
  const out: Occurrence[] = []
  for (const a of attempts) {
    for (const w of a.evaluation.words) {
      if (!w.text.trim()) continue
      for (const s of w.sounds) {
        const sound = soundForPhone(s.reference)
        if (sound) out.push({ learnerId: a.learnerId, sound: sound.id, score: s.kind === 'deletion' ? 0 : s.score, sentence: a.promptId ?? a.referenceText })
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

  const result: SoundDifficulty[] = []
  for (const sound of SOUNDS) {
    const these = occurrences.filter((o) => o.sound === sound.id)
    if (these.length < MIN_CLASS_OCCURRENCES) continue
    const average = mean(these.map((o) => o.score))
    const weakShare = these.filter((o) => o.score < WEAK).length / these.length

    const strugglers: { learner: Learner; gap: number }[] = []
    for (const l of learners) {
      const mine = these.filter((o) => o.learnerId === l.id)
      if (mine.length < MIN_LEARNER_OCCURRENCES) continue
      const gap = relativeGap(average, mean(mine.map((o) => o.score)))
      const weakSentences = new Set(mine.filter((o) => relativeGap(average, o.score) >= LEARNER_GAP).map((o) => o.sentence))
      if (gap >= LEARNER_GAP && weakSentences.size >= MIN_WEAK_SENTENCES) strugglers.push({ learner: l, gap })
    }
    strugglers.sort((a, b) => b.gap - a.gap)

    const gap = relativeGap(classAverage, average)
    // Same rule as for children: hard for the class only if it's weak in at
    // least two different sentences, so one hard sentence isn't a pattern.
    const bySentence = new Map<string, number[]>()
    for (const o of these) bySentence.set(o.sentence, [...(bySentence.get(o.sentence) ?? []), o.score])
    const weakClassSentences = [...bySentence.values()].filter((xs) => relativeGap(classAverage, mean(xs)) >= HARD_GAP).length
    result.push({
      sound,
      occurrences: these.length,
      average,
      gap,
      weakShare,
      hard: gap >= HARD_GAP && weakClassSentences >= MIN_WEAK_SENTENCES,
      learners: strugglers.map((s) => s.learner),
    })
  }
  return result.sort((a, b) => b.gap - a.gap)
}

// The sounds worth the teacher's attention: hard for the whole class
// (hardest first), then sounds a small group finds hard (biggest group first).
export function soundsToWorkOn(difficulties: SoundDifficulty[], limit = 3): SoundDifficulty[] {
  const whole = difficulties.filter((d) => d.hard).sort((a, b) => b.gap - a.gap)
  const group = difficulties
    .filter((d) => !d.hard && d.learners.length >= MIN_GROUP)
    .sort((a, b) => b.learners.length - a.learners.length || b.gap - a.gap)
  return [...whole, ...group].slice(0, limit)
}

export type ChildHelp = { learner: Learner; sounds: Sound[] }

// Children who find a sound hard that isn't already listed as a class or
// group sound: one-to-one help. Without this, a sound only one child finds
// hard would never reach the teacher.
export function childrenToHelp(difficulties: SoundDifficulty[], listed: SoundDifficulty[]): ChildHelp[] {
  const shown = new Set(listed.map((d) => d.sound.id))
  const byChild = new Map<string, ChildHelp>()
  for (const d of difficulties) {
    if (shown.has(d.sound.id)) continue
    for (const l of d.learners) {
      const entry = byChild.get(l.id) ?? { learner: l, sounds: [] }
      entry.sounds.push(d.sound)
      byChild.set(l.id, entry)
    }
  }
  return [...byChild.values()].sort((a, b) => b.sounds.length - a.sounds.length || a.learner.name.localeCompare(b.learner.name))
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

// Change between two sets of attempts, compared sound by sound: each
// phone's recent average against its own earlier average, weighted by how
// often it was said. Comparing like with like means the change doesn't
// depend on which sentences the child happened to get, and being relative it
// doesn't depend on accent either. Undefined when no phone occurs in both.
export function soundBySoundChange(earlier: Attempt[], recent: Attempt[]): number | undefined {
  const before = phoneScores(earlier)
  const after = phoneScores(recent)
  let weighted = 0
  let weight = 0
  for (const [phone, b] of before) {
    const a = after.get(phone)
    if (!a) continue
    const n = Math.min(a.length, b.length)
    weighted += n * relativeChange(mean(b), mean(a))
    weight += n
  }
  return weight ? weighted / weight : undefined
}

// Every phone's scores in the attempts, skipping pause words. A missed
// sound scores 0.
export function phoneScores(attempts: Attempt[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const a of attempts) {
    for (const w of a.evaluation.words) {
      if (!w.text.trim()) continue
      for (const s of w.sounds) {
        if (!s.reference) continue
        out.set(s.reference, [...(out.get(s.reference) ?? []), s.kind === 'deletion' ? 0 : s.score])
      }
    }
  }
  return out
}

// Only attempts from sessions that have ended. Trends use these, so a lesson
// in progress, where some children have had their turn and others haven't,
// doesn't move anyone's trend until it's over. One short turn is a different
// mix of sentences from the past ones, and CAPT's scores depend on the words
// (TRA-813).
export function finishedSessionsOnly(history: Attempt[], sessions: Session[]): Attempt[] {
  const ended = new Set(sessions.filter((s) => s.endedAt).map((s) => s.id))
  return history.filter((a) => ended.has(a.sessionId))
}

export function improvement(learner: Learner, history: Attempt[]): Improvement {
  const sessions = groupBySession(history.filter((a) => a.learnerId === learner.id))
  if (sessions.length < 2) return { learner, trend: 'not-enough-practice', change: 0, sessions: sessions.length }

  // Compare the earlier half of the sessions with the later half.
  const half = Math.floor(sessions.length / 2)
  const early = sessions.slice(0, half).flat()
  const recent = sessions.slice(sessions.length - half).flat()
  const change = soundBySoundChange(early, recent)
  if (change === undefined) return { learner, trend: 'not-enough-practice', change: 0, sessions: sessions.length }
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
