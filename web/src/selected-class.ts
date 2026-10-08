// Which class this tablet is showing, remembered on the device only.

import type { ClassRoom } from './store.ts'

const KEY = 'class-flow:selected-class'

export function readSelectedClass(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function saveSelectedClass(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode): screens fall back to the newest class.
  }
}

// The remembered class, or the newest one if none is remembered.
export function pickClass(classes: ClassRoom[]): ClassRoom | undefined {
  const saved = readSelectedClass()
  return classes.find((c) => c.id === saved) ?? classes.at(-1)
}
