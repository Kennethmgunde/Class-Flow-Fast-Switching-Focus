// The last few real errors, kept on this device for the teacher or a
// developer (shown on #/check). Children only ever see friendly messages.

const KEY = 'class-flow:error-log'
const MAX = 50

export type LoggedError = { at: number; where: string; kind: string; detail: string }

export function logError(where: string, kind: string, err: unknown): void {
  console.error(`[${where}] ${kind}`, err)
  const entry: LoggedError = { at: Date.now(), where, kind, detail: describe(err) }
  try {
    const log = readErrors()
    log.push(entry)
    localStorage.setItem(KEY, JSON.stringify(log.slice(-MAX)))
  } catch {
    // Storage unavailable: the console still has it.
  }
}

export function readErrors(): LoggedError[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 500)
  return String(err).slice(0, 500)
}
