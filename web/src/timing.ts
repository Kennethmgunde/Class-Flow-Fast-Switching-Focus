// How long turns and switches take in a session (TRA-812), so the demo can
// say "five learners in X minutes" from measurements, not estimates.
//
// A switch is the gap between one child handing back and the next child's
// turn opening: the "fast switching" the quest is about. Gaps longer than a
// couple of minutes are breaks, not switches, and are left out.

import type { Turn } from './store.ts'

export const BREAK_MS = 2 * 60_000

export type SessionTiming = {
  turns: number
  totalMs: number // first turn's start to last turn's end
  averageTurnMs: number
  averageSwitchMs?: number // undefined with fewer than two turns
  longestSwitchMs?: number
}

export function sessionTiming(turns: Turn[]): SessionTiming | undefined {
  if (turns.length === 0) return undefined
  const sorted = [...turns].sort((a, b) => a.startedAt - b.startedAt)
  const switches: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].startedAt - sorted[i - 1].endedAt
    if (gap >= 0 && gap <= BREAK_MS) switches.push(gap)
  }
  return {
    turns: sorted.length,
    totalMs: Math.max(...sorted.map((t) => t.endedAt)) - sorted[0].startedAt,
    averageTurnMs: mean(sorted.map((t) => t.endedAt - t.startedAt)),
    averageSwitchMs: switches.length ? mean(switches) : undefined,
    longestSwitchMs: switches.length ? Math.max(...switches) : undefined,
  }
}

// "4 min 12 s", "52 s", "3.5 s": short and readable for a teacher.
export function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${s % 60} s`
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
