// One child's turn: a few short sentences, each recorded, scored by CAPT
// and answered with friendly feedback (stars and highlighted words, no
// numbers). Every attempt is saved to the child's progress.
//
// Getting in and out stays quick: "Not me" undoes a wrong tap until the
// first recording is saved, and "I'm done" returns to the roster, where the
// next child is one tap away.

import { Recorder } from '../audio/recorder.ts'
import { avatarElement } from '../avatars.ts'
import { DemoVoice, demoPrompts, demoVoiceFor } from '../demo/demo-voices.ts'
import { measureWav } from '../audio/wav.ts'
import { evaluate, type Evaluation } from '../capt.ts'
import { logError, logNote } from '../error-log.ts'
import { cheer, choosePrompts, starsFor, wordFeedback } from '../practice.ts'
import { SKIP_AFTER, describeError, recordingProblem, unclearResult, withRetry, withTimeout, type Problem } from '../problems.ts'
import { PromptPlayer } from '../prompt-audio.ts'
import { PROMPTS, type Prompt } from '../prompts.ts'
import type { Learner, Session, Store } from '../store.ts'
import { h } from '../ui/dom.ts'

const MAX_RECORD_MS = 8000 // CAPT REST handles prompts up to about 8 s
const MIC_LIMIT_MS = 8000 // longest a microphone start or stop may take

// What the screen needs to record and score. Swappable for previews.
export type TurnDeps = {
  // `onEnd` lets a demo voice stop itself when its clip ends.
  recorder: { start(promptId: string, onEnd: () => void): Promise<void>; stop(): Promise<Uint8Array> }
  evaluate: (wav: Uint8Array, referenceText: string) => Promise<Evaluation>
}

export async function renderTurn(root: HTMLElement, store: Store, learnerId: string, deps?: TurnDeps): Promise<void> {
  const learner = await store.getLearner(learnerId)
  const session = learner && (await store.currentSession(learner.classId))
  if (!learner || !session) {
    location.hash = '#/class'
    return
  }
  const demo = demoVoiceFor(learner, (await store.listClasses()).find((c) => c.id === learner.classId))
  const prompts = choosePrompts(demo ? demoPrompts(PROMPTS, demo.name) : PROMPTS, await store.attemptsForLearner(learner.id))
  const recorder = demo ? new DemoVoice(demo.name) : new Recorder()
  new Turn(root, store, learner, session, prompts, deps ?? { recorder, evaluate: (w, t) => evaluate(w, t) }, !!demo).render()
}

type State =
  | { step: 'ready' }
  | { step: 'starting' }
  | { step: 'recording' }
  | { step: 'scoring' }
  | { step: 'feedback'; evaluation: Evaluation }
  | { step: 'error'; problem: Problem }
  | { step: 'finished' }

class Turn {
  private index = 0
  private state: State = { step: 'ready' }
  private saved = 0
  private problemsHere = 0 // problems on the current sentence, to offer a skip
  private readonly player = new PromptPlayer(() => this.render())
  private readAloud = -1 // the last sentence read aloud automatically
  private bestStars: number[] = [] // best result per prompt, for the summary
  private stopTimer?: ReturnType<typeof setTimeout>
  private readonly root: HTMLElement
  private readonly store: Store
  private readonly learner: Learner
  private readonly session: Session
  private readonly prompts: Prompt[]
  private readonly deps: TurnDeps
  private readonly demoVoice: boolean

  constructor(root: HTMLElement, store: Store, learner: Learner, session: Session, prompts: Prompt[], deps: TurnDeps, demoVoice = false) {
    this.root = root
    this.store = store
    this.learner = learner
    this.session = session
    this.prompts = prompts
    this.deps = deps
    this.demoVoice = demoVoice
    // Time the turn (TRA-812): it ends when the child leaves this screen.
    // "Not me", or leaving without recording anything, isn't a turn.
    const startedAt = Date.now()
    window.addEventListener('hashchange', () => {
      if (this.saved === 0) return
      void this.store
        .addTurn({ learnerId: learner.id, sessionId: session.id, startedAt, endedAt: Date.now(), attempts: this.saved })
        .catch((err) => logError('timing', 'turn-not-saved', err))
    }, { once: true })
  }

  render(): void {
    const finished = this.state.step === 'finished'
    // Read each new sentence aloud once, for children who can't read yet.
    if (this.state.step === 'ready' && this.readAloud !== this.index) {
      this.readAloud = this.index
      queueMicrotask(() => void this.player.play(this.prompts[this.index].id))
      const next = this.prompts[this.index + 1]
      if (next) this.player.preload(next.id)
    }
    this.root.replaceChildren(
      h('header', { class: 'topbar turn-bar' },
        avatarElement(this.learner.avatar, 'avatar big'),
        h('h1', {}, `Hi ${this.learner.name}!`),
        this.demoVoice && h('span', { class: 'demo-badge', title: 'This child speaks with a simulated voice, not the microphone' }, 'Demo voice'),
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
      (s.step === 'ready' || s.step === 'feedback' || s.step === 'error') && this.listenButton(prompt),
      this.controls(),
    )
  }

  private listenButton(prompt: Prompt): HTMLElement {
    const playing = this.player.playing
    return h('button', {
      class: `listen ${playing ? 'playing' : ''}`,
      'aria-label': playing ? 'Stop playing the sentence' : 'Hear the sentence',
      on: { click: () => (playing ? this.player.stop() : void this.player.play(prompt.id)) },
    }, speakerIcon(), playing ? 'Playing…' : 'Hear it')
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
      case 'starting':
        return h('div', { class: 'controls' },
          h('button', { class: 'mic', disabled: true, 'aria-label': 'Getting ready' }, micIcon()),
          h('p', { class: 'hint' }, 'Getting the microphone ready…'),
        )
      case 'recording':
        return h('div', { class: 'controls' },
          h('button', { class: 'mic recording', 'aria-label': 'Stop recording', on: { click: () => this.stopRecording() } }, stopIcon()),
          h('p', { class: 'hint' }, this.demoVoice ? 'Playing the demo voice…' : 'Listening… tap when you’ve finished.'),
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
      case 'error': {
        const canSkip = this.problemsHere >= SKIP_AFTER
        return h('div', { class: `controls problem ${s.problem.askTeacher ? 'ask-teacher' : ''}`, role: 'alert' },
          h('p', { class: 'cheer' }, s.problem.message),
          h('div', { class: 'row center' },
            h('button', { class: 'primary', on: { click: () => this.set({ step: 'ready' }) } }, 'Try again'),
            canSkip && h('button', { class: 'secondary', on: { click: () => this.next() } }, 'Skip this one'),
          ),
        )
      }
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
    if (this.state.step !== 'ready') return
    this.player.stop() // so the microphone doesn't pick up the clip
    this.set({ step: 'starting' })
    try {
      await withTimeout(this.deps.recorder.start(this.prompts[this.index].id, () => void this.stopRecording()), MIC_LIMIT_MS, 'starting the microphone')
    } catch (err) {
      const problem = describeError(err, navigator.onLine)
      logError('microphone', problem.kind, err)
      return this.fail(problem)
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
      const wav = await withTimeout(this.deps.recorder.stop(), MIC_LIMIT_MS, 'stopping the microphone')
      // Silent or too-short takes never reach CAPT.
      const sound = measureWav(wav)
      const tooQuiet = recordingProblem(sound)
      if (tooQuiet) {
        logNote('recording', tooQuiet.kind, `${sound.durationSec.toFixed(2)} s, peak ${sound.peak.toFixed(3)}, rms ${sound.rms.toFixed(4)}`)
        return this.fail(tooQuiet)
      }

      // One quiet retry if CAPT is busy or the network blips.
      const evaluation = await withRetry(() => this.deps.evaluate(wav, prompt.text))
      const unclear = unclearResult(evaluation)
      if (unclear) {
        logNote('scoring', unclear.kind, `score ${evaluation.score.toFixed(3)} for "${prompt.text}"`)
        return this.fail(unclear) // not saved: noise, not practice
      }

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
      // Friendly words for the child; the real error goes to the log.
      const problem = describeError(err, navigator.onLine)
      logError('scoring', problem.kind, err)
      this.fail(problem)
    }
  }

  private fail(problem: Problem): void {
    this.problemsHere++
    this.set({ step: 'error', problem })
  }

  private next(): void {
    if (this.index === this.prompts.length - 1) return this.set({ step: 'finished' })
    this.index++
    this.problemsHere = 0
    this.set({ step: 'ready' })
  }

  private set(state: State): void {
    this.state = state
    this.render()
  }
}

function micIcon(): SVGElement {
  return svg('<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/>')
}

function speakerIcon(): SVGElement {
  return svg('<path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54Z"/>')
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
