// One child's turn: a few short sentences, each recorded, scored by CAPT
// and answered with friendly feedback (stars and highlighted words, no
// numbers). Every attempt is saved to the child's progress.
//
// Getting in and out stays quick: "Not me" undoes a wrong tap until the
// first recording is saved, and "I'm done" returns to the roster, where the
// next child is one tap away.

import { Recorder } from '../audio/recorder.ts'
import { avatarElement } from '../avatars.ts'
import { CaptError, evaluate, type Evaluation } from '../capt.ts'
import { cheer, choosePrompts, starsFor, wordFeedback } from '../practice.ts'
import { PROMPTS, type Prompt } from '../prompts.ts'
import type { Learner, Session, Store } from '../store.ts'
import { h } from '../ui/dom.ts'

const MAX_RECORD_MS = 8000 // CAPT REST handles prompts up to about 8 s

// What the screen needs to record and score. Swappable for previews.
export type TurnDeps = {
  recorder: { start(): Promise<void>; stop(): Promise<Uint8Array> }
  evaluate: (wav: Uint8Array, referenceText: string) => Promise<Evaluation>
}

export async function renderTurn(root: HTMLElement, store: Store, learnerId: string, deps?: TurnDeps): Promise<void> {
  const learner = await store.getLearner(learnerId)
  const session = learner && (await store.currentSession(learner.classId))
  if (!learner || !session) {
    location.hash = '#/class'
    return
  }
  const prompts = choosePrompts(PROMPTS, await store.attemptsForLearner(learner.id))
  new Turn(root, store, learner, session, prompts, deps ?? { recorder: new Recorder(), evaluate: (w, t) => evaluate(w, t) }).render()
}

type State =
  | { step: 'ready' }
  | { step: 'recording' }
  | { step: 'scoring' }
  | { step: 'feedback'; evaluation: Evaluation }
  | { step: 'error'; message: string }
  | { step: 'finished' }

class Turn {
  private index = 0
  private state: State = { step: 'ready' }
  private saved = 0
  private bestStars: number[] = [] // best result per prompt, for the summary
  private stopTimer?: ReturnType<typeof setTimeout>
  private readonly root: HTMLElement
  private readonly store: Store
  private readonly learner: Learner
  private readonly session: Session
  private readonly prompts: Prompt[]
  private readonly deps: TurnDeps

  constructor(root: HTMLElement, store: Store, learner: Learner, session: Session, prompts: Prompt[], deps: TurnDeps) {
    this.root = root
    this.store = store
    this.learner = learner
    this.session = session
    this.prompts = prompts
    this.deps = deps
  }

  render(): void {
    const finished = this.state.step === 'finished'
    this.root.replaceChildren(
      h('header', { class: 'topbar turn-bar' },
        avatarElement(this.learner.avatar, 'avatar big'),
        h('h1', {}, `Hi ${this.learner.name}!`),
        this.saved === 0 && h('a', { class: 'button ghost', href: '#/class' }, 'Not me'),
      ),
      h('main', { class: 'turn' },
        finished ? this.summary() : this.practice(),
        !finished && h('a', { class: 'button ghost done-button', href: '#/class' }, 'I’m done'),
      ),
    )
  }

  private practice(): HTMLElement {
    const prompt = this.prompts[this.index]
    const s = this.state
    return h('section', { class: 'card practice-area' },
      h('div', { class: 'progress-dots', 'aria-label': `Sentence ${this.index + 1} of ${this.prompts.length}` },
        this.prompts.map((_, i) => h('span', { class: `dot ${i < this.index ? 'done' : i === this.index ? 'current' : ''}` })),
      ),
      h('p', { class: 'say-this' }, 'Say this:'),
      s.step === 'feedback' ? this.sentenceWithFeedback(s.evaluation) : h('p', { class: 'sentence' }, prompt.text),
      this.controls(),
    )
  }

  private sentenceWithFeedback(evaluation: Evaluation): HTMLElement {
    return h('p', { class: 'sentence' },
      wordFeedback(evaluation).map((w) => h('span', { class: `word ${w.needsPractice ? 'practise' : 'good'}` }, w.text)),
    )
  }

  private controls(): HTMLElement {
    const s = this.state
    switch (s.step) {
      case 'ready':
        return h('div', { class: 'controls' },
          h('button', { class: 'mic', 'aria-label': 'Start recording', on: { click: () => this.startRecording() } }, micIcon()),
          h('p', { class: 'hint' }, 'Tap the microphone, then say the sentence.'),
        )
      case 'recording':
        return h('div', { class: 'controls' },
          h('button', { class: 'mic recording', 'aria-label': 'Stop recording', on: { click: () => this.stopRecording() } }, stopIcon()),
          h('p', { class: 'hint' }, 'Listening… tap when you’ve finished.'),
        )
      case 'scoring':
        return h('div', { class: 'controls' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'hint' }, 'Checking…'))
      case 'feedback': {
        const n = starsFor(s.evaluation)
        const last = this.index === this.prompts.length - 1
        const practise = wordFeedback(s.evaluation).filter((w) => w.needsPractice).map((w) => w.text)
        return h('div', { class: 'controls' },
          h('p', { class: 'stars', 'aria-label': `${n} of 3 stars` }, '★'.repeat(n), h('span', { class: 'empty' }, '★'.repeat(3 - n))),
          h('p', { class: 'cheer' }, cheer(n)),
          practise.length > 0 && h('p', { class: 'hint' }, `Try saying “${practise.join('”, “')}” carefully.`),
          h('div', { class: 'row center' },
            h('button', { class: 'secondary', on: { click: () => this.set({ step: 'ready' }) } }, 'Try again'),
            h('button', { class: 'primary', on: { click: () => this.next() } }, last ? 'Finish' : 'Next'),
          ),
        )
      }
      case 'error':
        return h('div', { class: 'controls' },
          h('p', { class: 'cheer' }, s.message),
          h('button', { class: 'primary', on: { click: () => this.set({ step: 'ready' }) } }, 'Try again'),
        )
      case 'finished':
        return h('div')
    }
  }

  private summary(): HTMLElement {
    const total = this.bestStars.reduce((a, b) => a + b, 0)
    return h('section', { class: 'card practice-area summary' },
      h('p', { class: 'stars' }, '★'.repeat(total)),
      h('h2', {}, `Well done, ${this.learner.name}!`),
      h('p', { class: 'hint' }, 'Give the tablet to the next friend.'),
      h('a', { class: 'button primary done-button', href: '#/class' }, 'I’m done'),
    )
  }

  private async startRecording(): Promise<void> {
    try {
      await this.deps.recorder.start()
    } catch (err) {
      console.error('microphone unavailable', err)
      this.set({ step: 'error', message: 'The microphone isn’t working. Ask your teacher for help.' })
      return
    }
    this.set({ step: 'recording' })
    this.stopTimer = setTimeout(() => void this.stopRecording(), MAX_RECORD_MS)
  }

  private async stopRecording(): Promise<void> {
    if (this.state.step !== 'recording') return
    clearTimeout(this.stopTimer)
    this.set({ step: 'scoring' })
    const prompt = this.prompts[this.index]
    try {
      const wav = await this.deps.recorder.stop()
      const evaluation = await this.deps.evaluate(wav, prompt.text)
      await this.store.addAttempt({
        learnerId: this.learner.id,
        sessionId: this.session.id,
        promptId: prompt.id,
        referenceText: prompt.text,
        evaluation,
      })
      this.saved++
      this.bestStars[this.index] = Math.max(this.bestStars[this.index] ?? 0, starsFor(evaluation))
      this.set({ step: 'feedback', evaluation })
    } catch (err) {
      // Friendly words for the child; the real error goes to the console.
      console.error('scoring failed', err)
      this.set({ step: 'error', message: friendlyError(err) })
    }
  }

  private next(): void {
    if (this.index === this.prompts.length - 1) return this.set({ step: 'finished' })
    this.index++
    this.set({ step: 'ready' })
  }

  private set(state: State): void {
    this.state = state
    this.render()
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof CaptError && err.kind === 'unavailable') return 'The listening helper is resting. Ask your teacher.'
  return 'Oops, let’s try that again.'
}

function micIcon(): SVGElement {
  return svg('<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/>')
}

function stopIcon(): SVGElement {
  return svg('<rect x="6" y="6" width="12" height="12" rx="2"/>')
}

function svg(body: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', '0 0 24 24')
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = body
  return el
}
