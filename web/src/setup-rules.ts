// Rules for class setup, kept free of DOM code so they can be tested.

import { AVATARS } from './avatars.ts'

export { AVATARS }

export const MAX_LEARNERS = AVATARS.length
export const MAX_NAME_LENGTH = 20

// The first avatar no learner in the class has yet, or undefined when all are taken.
export function nextAvatar(used: Iterable<string>): string | undefined {
  const taken = new Set(used)
  return AVATARS.find((a) => !taken.has(a))
}

// Returns a message for the teacher, or null when the name is fine.
export function checkLearner(
  name: string,
  avatar: string,
  existing: { name: string; avatar: string }[],
): string | null {
  const n = name.trim()
  if (!n) return 'Type the child’s first name.'
  if (n.length > MAX_NAME_LENGTH) return `Keep names under ${MAX_NAME_LENGTH} letters.`
  if (/\s/.test(n)) return 'First name only, please. No surnames, to keep children’s data private.'
  if (existing.length >= MAX_LEARNERS) return `A class can have up to ${MAX_LEARNERS} learners.`
  if (existing.some((l) => l.avatar === avatar)) return 'Another child already has that picture. Pick a different one.'
  if (existing.some((l) => l.name.toLowerCase() === n.toLowerCase())) {
    return `This class already has someone called ${n}. Add an initial to tell them apart, like “${n}B”.`
  }
  return null
}

export function checkClassName(name: string, existing: string[]): string | null {
  const n = name.trim()
  if (!n) return 'Give the class a name, like “Class 3A”.'
  if (n.length > 40) return 'Keep the class name under 40 letters.'
  if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return `There’s already a class called ${n}.`
  return null
}
