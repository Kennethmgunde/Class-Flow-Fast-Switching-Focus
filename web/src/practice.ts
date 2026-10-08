// Rules for a child's practice turn. No DOM code, so they're tested.

import type { Evaluation } from './capt.ts'
import type { Prompt } from './prompts.ts'
import type { Attempt } from './store.ts'

export const PROMPTS_PER_TURN = 3

// A sound scoring below this marks its word for more practice. CAPT's US
// English model scores other accents lower, so this is deliberately lenient.
const WEAK_SOUND = 0.4

// Picks the prompts for a turn: the ones this child has practised least,
// spread across different target sounds, avoiding the previous turn's.
// `random` is injectable so tests are repeatable.
export function choosePrompts(
  prompts: Prompt[],
  history: Attempt[],
  count = PROMPTS_PER_TURN,
  random: () => number = Math.random,
): Prompt[] {
  const timesPractised = new Map<string, number>()
  for (const a of history) if (a.promptId) timesPractised.set(a.promptId, (timesPractised.get(a.promptId) ?? 0) + 1)
  const lastTurn = new Set(history.slice(-count).map((a) => a.promptId))

  // Least practised first, then not done last turn, then random.
  const ranked = prompts
    .map((p) => ({ p, practised: timesPractised.get(p.id) ?? 0, recent: lastTurn.has(p.id) ? 1 : 0, tiebreak: random() }))
    .sort((a, b) => a.practised - b.practised || a.recent - b.recent || a.tiebreak - b.tiebreak)
    .map((r) => r.p)

  // Take prompts whose first focus sound isn't covered yet, then fill up.
  const chosen: Prompt[] = []
  const sounds = new Set<string>()
  for (const p of ranked) {
    if (chosen.length === count) break
    if (!sounds.has(p.focus[0])) {
      chosen.push(p)
      p.focus.forEach((f) => sounds.add(f))
    }
  }
  for (const p of ranked) {
    if (chosen.length === count) break
    if (!chosen.includes(p)) chosen.push(p)
  }
  return chosen
}

// One to three stars. Every attempt earns at least one: it's practice, not a test.
export function stars(score: number): 1 | 2 | 3 {
  if (score >= 0.8) return 3
  if (score >= 0.6) return 2
  return 1
}

// Stars for an attempt: a word still to practise caps it at two, so the
// stars never say "perfect" while a word is highlighted.
export function starsFor(evaluation: Evaluation): 1 | 2 | 3 {
  const n = stars(evaluation.score)
  return n === 3 && wordFeedback(evaluation).some((w) => w.needsPractice) ? 2 : n
}

export type WordFeedback = { text: string; needsPractice: boolean }

// The sentence's words, marking any with a weak sound. Skips the empty
// "words" CAPT sometimes returns for pauses.
export function wordFeedback(evaluation: Evaluation): WordFeedback[] {
  return evaluation.words
    .filter((w) => w.text.trim() !== '' && w.sounds.length > 0)
    .map((w) => ({
      text: w.text,
      needsPractice: w.sounds.some((s) => s.score < WEAK_SOUND || s.kind === 'deletion'),
    }))
}

export function cheer(starCount: 1 | 2 | 3): string {
  return starCount === 3 ? 'Brilliant!' : starCount === 2 ? 'Well done!' : 'Good try!'
}
