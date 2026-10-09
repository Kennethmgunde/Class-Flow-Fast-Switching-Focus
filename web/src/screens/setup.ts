// Teacher setup: create a class, add or remove learners, start or end a session.

import type { ClassRoom, Learner, Session, Store } from '../store.ts'
import { AVATARS, MAX_LEARNERS, checkClassName, checkLearner, nextAvatar } from '../setup-rules.ts'
import { avatarElement } from '../avatars.ts'
import { readSelectedClass as readSaved, saveSelectedClass as save } from '../selected-class.ts'
import { clearErrors } from '../error-log.ts'
import { PIN_LENGTH, isValidPin, type TeacherLock } from '../teacher-lock.ts'
import { describeCounts } from '../backup.ts'
import { backupCard, downloadBackup } from './backup-card.ts'
import { h } from '../ui/dom.ts'

export async function renderSetup(root: HTMLElement, store: Store, lock: TeacherLock): Promise<void> {
  const ui = new SetupScreen(root, store, lock)
  await ui.refresh()
}

class SetupScreen {
  private readonly root: HTMLElement
  private readonly store: Store
  private readonly lock: TeacherLock
  private changingPin = false
  private classes: ClassRoom[] = []
  private current?: ClassRoom
  private learners: Learner[] = []
  private session?: Session
  private turns = 0
  private avatar?: string
  private creatingClass = false
  private confirming?: string // learner id, 'class' or 'wipe', awaiting a delete confirmation
  private wipeSummary = '' // what a wipe would delete, shown in its confirmation

  constructor(root: HTMLElement, store: Store, lock: TeacherLock) {
    this.root = root
    this.store = store
    this.lock = lock
  }

  async refresh(focusName = false): Promise<void> {
    this.classes = await this.store.listClasses()
    const savedId = readSaved()
    this.current = this.classes.find((c) => c.id === (this.current?.id ?? savedId)) ?? this.classes.at(-1)
    if (this.current) {
      this.learners = await this.store.listLearners(this.current.id)
      this.session = await this.store.currentSession(this.current.id)
      this.turns = this.session ? (await this.store.attemptsForSession(this.session.id)).length : 0
      if (!this.avatar || this.learners.some((l) => l.avatar === this.avatar)) {
        this.avatar = nextAvatar(this.learners.map((l) => l.avatar))
      }
    }
    this.render()
    if (focusName) this.root.querySelector<HTMLInputElement>('#learner-name')?.focus()
  }

  private render(): void {
    const showClassForm = this.creatingClass || this.classes.length === 0
    this.root.replaceChildren(
      h('header', { class: 'topbar' },
        h('h1', {}, 'Class-Flow'),
        this.classes.length > 0 && this.classPicker(),
        this.classes.length > 0 && !this.creatingClass &&
          h('button', { class: 'ghost', on: { click: () => { this.creatingClass = true; this.render() } } }, '+ New class'),
        this.learners.length > 0 && !this.creatingClass && h('a', { class: 'button primary', href: '#/teacher' }, 'Teacher view'),
      ),
      h('main', { class: 'setup' },
        showClassForm ? this.classForm() : null,
        this.classes.length === 0 ? backupCard(this.store, () => void this.refresh()) : null,
        this.current && !this.creatingClass
          ? [this.sessionBar(), this.learnerSection(), this.pinSection(), this.privacySection(), backupCard(this.store, () => void this.refresh()), this.dangerZone()]
          : null,
      ),
    )
  }

  private classPicker(): HTMLElement {
    return h('select', {
      class: 'class-picker',
      'aria-label': 'Class',
      on: {
        change: (e) => {
          this.current = this.classes.find((c) => c.id === (e.target as HTMLSelectElement).value)
          save(this.current?.id)
          this.avatar = undefined
          this.confirming = undefined
          void this.refresh()
        },
      },
    }, this.classes.map((c) => h('option', { value: c.id, selected: c.id === this.current?.id }, c.name)))
  }

  private classForm(): HTMLElement {
    const error = h('p', { class: 'error', role: 'alert' })
    const input = h('input', { id: 'class-name', placeholder: 'Class 3A', autocomplete: 'off', maxLength: 40 })
    const form = h('form', {
      class: 'card',
      on: {
        submit: async (e) => {
          e.preventDefault()
          const problem = checkClassName(input.value, this.classes.map((c) => c.name))
          if (problem) return void (error.textContent = problem)
          this.current = await this.store.addClass(input.value.trim())
          save(this.current.id)
          this.creatingClass = false
          this.avatar = undefined
          await this.refresh(true)
        },
      },
    },
      h('h2', {}, this.classes.length === 0 ? 'Set up your class' : 'New class'),
      h('label', { for: 'class-name' }, 'Class name'),
      h('div', { class: 'row' },
        input,
        h('button', { type: 'submit', class: 'primary' }, 'Create class'),
        this.classes.length > 0 &&
          h('button', { type: 'button', class: 'ghost', on: { click: () => { this.creatingClass = false; this.render() } } }, 'Cancel'),
      ),
      error,
    )
    queueMicrotask(() => input.focus())
    return form
  }

  private sessionBar(): HTMLElement {
    const s = this.session
    return h('section', { class: `session-bar ${s ? 'running' : ''}` },
      h('div', {},
        h('strong', {}, s ? 'Practice session running' : 'No practice session running'),
        h('p', { class: 'muted' },
          s
            ? `Started at ${time(s.startedAt)} · ${this.turns} ${this.turns === 1 ? 'turn' : 'turns'} so far`
            : this.learners.length === 0
              ? 'Add your learners first, then start a session.'
              : 'Start a session when the class is ready to practise.'),
      ),
      s
        ? h('div', { class: 'row' },
            h('button', { class: 'secondary', on: { click: () => this.act(() => this.store.endSession(s.id)) } }, 'End session'),
            h('a', { class: 'button primary', href: '#/class' }, 'Open class view'),
          )
        : h('button', {
            class: 'primary',
            disabled: this.learners.length === 0,
            on: {
              click: async () => {
                await this.store.startSession(this.current!.id)
                location.hash = '#/class' // hand the tablet to the class
              },
            },
          }, 'Start session'),
    )
  }

  private learnerSection(): HTMLElement {
    return h('section', { class: 'card' },
      h('h2', {}, 'Learners ', h('span', { class: 'muted' }, `${this.learners.length} of ${MAX_LEARNERS}`)),
      this.learners.length === 0
        ? h('p', { class: 'muted' }, 'No learners yet. Add each child’s first name and give them a picture.')
        : h('ul', { class: 'learner-grid' }, this.learners.map((l) => this.learnerTile(l))),
      this.learners.length < MAX_LEARNERS ? this.learnerForm() : h('p', { class: 'muted' }, 'This class is full.'),
    )
  }

  private learnerTile(l: Learner): HTMLElement {
    if (this.confirming === l.id) {
      return h('li', { class: 'tile confirm' },
        h('p', {}, `Remove ${l.name} and all their progress?`),
        h('div', { class: 'row' },
          h('button', { class: 'danger', on: { click: () => this.act(() => this.store.deleteLearner(l.id)) } }, 'Remove'),
          h('button', { class: 'ghost', on: { click: () => { this.confirming = undefined; this.render() } } }, 'Keep'),
        ),
      )
    }
    return h('li', { class: 'tile' },
      avatarElement(l.avatar),
      h('span', { class: 'name' }, l.name),
      h('button', {
        class: 'remove',
        'aria-label': `Remove ${l.name}`,
        on: { click: () => { this.confirming = l.id; this.render() } },
      }, '×'),
    )
  }

  private learnerForm(): HTMLElement {
    const taken = new Set(this.learners.map((l) => l.avatar))
    const error = h('p', { class: 'error', role: 'alert' })
    const input = h('input', { id: 'learner-name', placeholder: 'First name', autocomplete: 'off', maxLength: 20 })

    return h('form', {
      class: 'add-learner',
      on: {
        submit: async (e) => {
          e.preventDefault()
          const avatar = this.avatar ?? ''
          const problem = checkLearner(input.value, avatar, this.learners)
          if (problem) return void (error.textContent = problem)
          await this.store.addLearner(this.current!.id, input.value.trim(), avatar)
          this.avatar = undefined
          await this.refresh(true)
        },
      },
    },
      h('h3', {}, 'Add a learner'),
      h('div', { class: 'row' },
        this.avatar ? avatarElement(this.avatar, 'avatar big') : null,
        input,
        h('button', { type: 'submit', class: 'primary' }, 'Add'),
      ),
      error,
      h('p', { class: 'muted' }, 'Pick a picture the child will recognise as theirs.'),
      h('div', { class: 'avatar-picker', role: 'radiogroup', 'aria-label': 'Picture' },
        AVATARS.map((a, i) => h('button', {
          type: 'button',
          class: `avatar-choice ${a === this.avatar ? 'selected' : ''}`,
          role: 'radio',
          'aria-checked': String(a === this.avatar),
          'aria-label': `Picture ${i + 1}`,
          disabled: taken.has(a),
          on: {
            click: () => {
              this.avatar = a
              const name = input.value
              this.render()
              const again = this.root.querySelector<HTMLInputElement>('#learner-name')!
              again.value = name
              again.focus()
            },
          },
        }, avatarElement(a))),
      ),
    )
  }

  // TRA-807: a PIN keeps children out of setup, the teacher view and checks.
  private pinSection(): HTMLElement {
    const hasPin = this.lock.hasPin()
    if (hasPin && !this.changingPin) {
      return h('section', { class: 'card' },
        h('h2', {}, 'Teacher PIN'),
        h('p', {}, 'On. Children need the PIN to open setup or the teacher view. Going to the class view locks them again.'),
        h('div', { class: 'row' },
          h('button', { class: 'secondary', on: { click: () => { this.changingPin = true; this.render() } } }, 'Change PIN'),
          h('button', { class: 'ghost', on: { click: () => { this.lock.removePin(); this.render() } } }, 'Remove PIN'),
        ),
      )
    }
    const error = h('p', { class: 'error', role: 'alert' })
    const pinInput = (id: string, label: string) =>
      h('input', { id, type: 'password', inputMode: 'numeric', autocomplete: 'off', maxLength: PIN_LENGTH, placeholder: label, 'aria-label': label })
    const first = pinInput('pin-1', `${PIN_LENGTH}-digit PIN`)
    const again = pinInput('pin-2', 'Type it again')
    return h('form', {
      class: 'card',
      on: {
        submit: (e) => {
          e.preventDefault()
          if (!isValidPin(first.value)) return void (error.textContent = `Use ${PIN_LENGTH} digits.`)
          if (first.value !== again.value) return void (error.textContent = 'The two PINs don’t match.')
          this.lock.setPin(first.value)
          this.changingPin = false
          this.render()
        },
      },
    },
      h('h2', {}, hasPin ? 'Change the teacher PIN' : 'Teacher PIN'),
      h('p', {}, hasPin ? 'Choose a new PIN.' : 'Set a PIN so children can’t open setup or the teacher view.'),
      h('div', { class: 'row' },
        first,
        again,
        h('button', { type: 'submit', class: 'primary' }, 'Save PIN'),
        hasPin && h('button', { type: 'button', class: 'ghost', on: { click: () => { this.changingPin = false; this.render() } } }, 'Cancel'),
      ),
      error,
    )
  }

  // TRA-808: what's kept, where, and how to remove it.
  private privacySection(): HTMLElement {
    return h('section', { class: 'card privacy' },
      h('h2', {}, 'What’s stored on this tablet'),
      h('ul', {},
        h('li', {}, 'Each child’s first name and picture. No surnames or other details.'),
        h('li', {}, 'Each attempt’s sentence, time and pronunciation scores.'),
        h('li', {}, 'Recordings are not kept. Each one is sent to Cobalt CAPT for scoring, without the child’s name, then discarded.'),
        h('li', {}, 'Everything stays in this browser on this tablet: no accounts, no copies elsewhere.'),
      ),
      h('p', { class: 'muted' }, 'Removing a learner or deleting a class also deletes their progress. To clear the tablet completely, use “Wipe everything” below; download a backup first if you might want it back.'),
    )
  }

  private dangerZone(): HTMLElement {
    const c = this.current!
    if (this.confirming === 'wipe') {
      // Typing WIPE makes this a deliberate act, not a stray tap.
      const typed = h('input', { id: 'wipe-confirm', autocomplete: 'off', placeholder: 'Type WIPE', 'aria-label': 'Type WIPE to confirm' })
      const wipe = h('button', {
        class: 'danger',
        disabled: true,
        on: {
          click: () => this.act(async () => {
            await this.store.wipeEverything()
            this.lock.removePin()
            clearErrors()
            save(undefined)
            this.current = undefined
          }),
        },
      }, 'Wipe everything')
      typed.addEventListener('input', () => { wipe.disabled = typed.value.trim().toUpperCase() !== 'WIPE' })
      const backupStatus = h('p', { class: 'muted', role: 'status' })
      return h('section', { class: 'card wipe-confirm' },
        h('h2', {}, 'Wipe everything on this tablet?'),
        h('p', {}, h('strong', {}, `This deletes ${this.wipeSummary}`), ', and the teacher PIN. It can’t be undone without a backup.'),
        h('div', { class: 'row' },
          h('button', { class: 'secondary', on: { click: async () => { backupStatus.textContent = await downloadBackup(this.store) } } }, 'Download a backup first'),
        ),
        backupStatus,
        h('div', { class: 'row' },
          typed,
          wipe,
          h('button', { class: 'ghost', on: { click: () => { this.confirming = undefined; this.render() } } }, 'Cancel'),
        ),
      )
    }
    return h('section', { class: 'danger-zone' },
      this.confirming !== 'class' &&
        h('button', {
          class: 'ghost danger-text',
          on: {
            click: async () => {
              this.wipeSummary = describeCounts(await this.store.counts())
              this.confirming = 'wipe'
              this.render()
            },
          },
        }, 'Wipe everything on this tablet…'),
      this.confirming === 'class'
        ? h('div', { class: 'row' },
            h('p', {}, `Delete ${c.name}, its ${this.learners.length} learners and all their progress? This can’t be undone.`),
            h('button', {
              class: 'danger',
              on: {
                click: () => this.act(async () => {
                  await this.store.deleteClass(c.id)
                  this.current = undefined
                  save(undefined)
                }),
              },
            }, 'Delete class'),
            h('button', { class: 'ghost', on: { click: () => { this.confirming = undefined; this.render() } } }, 'Cancel'),
          )
        : h('button', { class: 'ghost danger-text', on: { click: () => { this.confirming = 'class'; this.render() } } }, `Delete ${c.name}…`),
    )
  }

  // Runs a store change, then redraws with fresh data.
  private async act(change: () => Promise<unknown>): Promise<void> {
    await change()
    this.confirming = undefined
    await this.refresh()
  }
}

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

