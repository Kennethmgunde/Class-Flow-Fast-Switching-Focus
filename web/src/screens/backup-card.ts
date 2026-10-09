// Backup and restore: download everything on this tablet to a file, or
// replace it with a file saved earlier. Shown in setup (including when the
// tablet is empty, so a wipe can be undone) and on the check page.

import { backupFileName, describeCounts, makeBackup, parseBackup, type Backup } from '../backup.ts'
import { saveSelectedClass } from '../selected-class.ts'
import type { Store } from '../store.ts'
import { h } from '../ui/dom.ts'

// Saves a backup file to the device's downloads.
export async function downloadBackup(store: Store): Promise<string> {
  const backup = await makeBackup(store)
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
  const link = h('a', { href: url, download: backupFileName(backup.savedAt) })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return `Saved ${describeCounts({ classes: backup.classes.length, learners: backup.learners.length, sessions: backup.sessions.length, attempts: backup.attempts.length })} to your downloads.`
}

// `onRestored` runs after a restore, to redraw the screen.
export function backupCard(store: Store, onRestored: () => void): HTMLElement {
  const card = h('section', { class: 'card backup' })
  const status = h('p', { class: 'muted', role: 'status' })
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true })

  const draw = (pending?: Backup) => {
    card.replaceChildren(
      h('h2', {}, 'Backup'),
      h('p', {}, 'Save everything on this tablet to a file, to keep it safe or move it to another tablet. The teacher PIN isn’t included.'),
      pending
        ? h('div', { class: 'restore-confirm' },
            h('p', {}, h('strong', {}, `Replace everything on this tablet with the backup from ${new Date(pending.savedAt).toLocaleString()}?`)),
            h('p', {}, `It has ${describeCounts({ classes: pending.classes.length, learners: pending.learners.length, sessions: pending.sessions.length, attempts: pending.attempts.length })}. What’s on the tablet now will be replaced.`),
            h('div', { class: 'row' },
              h('button', { class: 'danger', on: { click: () => void restore(pending) } }, 'Replace with backup'),
              h('button', { class: 'ghost', on: { click: () => { status.textContent = ''; draw() } } }, 'Cancel'),
            ),
          )
        : h('div', { class: 'row' },
            h('button', { class: 'secondary', on: { click: () => void save() } }, 'Download a backup'),
            h('button', { class: 'ghost', on: { click: () => fileInput.click() } }, 'Restore from a backup…'),
          ),
      fileInput,
      status,
    )
  }

  const save = async () => {
    try {
      status.textContent = await downloadBackup(store)
    } catch (err) {
      status.textContent = `Couldn’t save the backup: ${err}`
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      draw(parseBackup(await file.text()))
      status.textContent = ''
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err)
    }
  })

  const restore = async (backup: Backup) => {
    try {
      await store.replaceAll(backup)
      const newest = [...backup.classes].sort((a, b) => a.createdAt - b.createdAt).at(-1)
      saveSelectedClass(newest?.id)
      onRestored()
    } catch (err) {
      status.textContent = `Couldn’t restore: ${err}. Nothing was changed.`
      draw()
    }
  }

  draw()
  return card
}
