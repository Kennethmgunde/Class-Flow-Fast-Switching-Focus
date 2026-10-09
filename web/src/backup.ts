// Backups: everything on this tablet in one file, so a wipe or a lost tablet
// can be undone. The teacher PIN is never included.

import type { Store, StoreContents } from './store.ts'

const APP = 'class-flow'
const VERSION = 1

export type Backup = { app: typeof APP; version: number; savedAt: number } & StoreContents

export async function makeBackup(store: Store, now = Date.now()): Promise<Backup> {
  return { app: APP, version: VERSION, savedAt: now, ...(await store.exportAll()) }
}

export function backupFileName(savedAt: number): string {
  const d = new Date(savedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `class-flow-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

// Reads a backup file, or throws an error a teacher can understand.
export function parseBackup(text: string): Backup {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t a Class-Flow backup.')
  }
  if (data?.app !== APP) throw new Error('That file isn’t a Class-Flow backup.')
  if (data.version !== VERSION) throw new Error('That backup is from a different version of Class-Flow.')
  for (const key of ['classes', 'learners', 'sessions', 'attempts'] as const) {
    if (!Array.isArray(data[key]) || !data[key].every((x: any) => typeof x?.id === 'string')) {
      throw new Error('That backup file is damaged.')
    }
  }
  return data as Backup
}

export function describeCounts(c: { classes: number; learners: number; sessions: number; attempts: number }): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return [n(c.classes, 'class', 'classes'), n(c.learners, 'learner', 'learners'), n(c.sessions, 'session', 'sessions'), n(c.attempts, 'score', 'scores')].join(', ')
}
