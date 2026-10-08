// Roster state for the child-facing class view. No DOM code, so it's tested.

import type { Attempt, Learner } from './store.ts'

export type RosterTile = { learner: Learner; hadTurn: boolean }

// Learners in roster order, marking who has practised in this session.
export function rosterTiles(learners: Learner[], sessionAttempts: Attempt[]): RosterTile[] {
  const practised = new Set(sessionAttempts.map((a) => a.learnerId))
  return learners.map((learner) => ({ learner, hadTurn: practised.has(learner.id) }))
}
