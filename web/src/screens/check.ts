import { Recorder } from '../audio/recorder.ts'
import { readWavInfo } from '../audio/wav.ts'
import { CaptError, evaluate } from '../capt.ts'
import { clearErrors, readErrors } from '../error-log.ts'
import { h } from '../ui/dom.ts'
import { DEMO_CLASS_NAME, removeDemoClasses, seedDemoClass } from '../demo/seed.ts'
import { saveSelectedClass } from '../selected-class.ts'
import type { Store } from '../store.ts'

// Developer check: record a sentence, confirm the WAV format, score it with CAPT.
export function renderCheck(app: HTMLElement, store: Store): void {
  app.innerHTML = `
    <header class="topbar"><h1>Class-Flow</h1><a href="#/setup">Back to setup</a></header>
    <main class="setup">
    <p id="capt-status">Checking CAPT…</p>

    <h2>Recording check</h2>
    <p>Say the sentence, then stop. The take is converted to 16 kHz mono WAV and scored by CAPT.</p>
    <label>Sentence <input id="reference" value="the cat sat on the mat" size="40"></label>
    <p>
      <button id="record">Record</button>
      <button id="stop" disabled>Stop</button>
    </p>
    <audio id="playback" controls hidden></audio>
    <pre id="result"></pre>
    </main>
  `

  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

  // Confirms the whole path works: browser → Go proxy → CAPT demo server.
  async function checkCapt() {
    const status = $<HTMLParagraphElement>('#capt-status')
    try {
      const res = await fetch('/api/capt/version')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      status.textContent = `CAPT connected: ${JSON.stringify(await res.json())}`
    } catch (err) {
      status.textContent = `CAPT unreachable: ${err}`
    }
  }

  const recorder = new Recorder()
  const recordBtn = $<HTMLButtonElement>('#record')
  const stopBtn = $<HTMLButtonElement>('#stop')
  const result = $<HTMLPreElement>('#result')

  recordBtn.onclick = async () => {
    try {
      await recorder.start()
      recordBtn.disabled = true
      stopBtn.disabled = false
      result.textContent = 'Recording…'
    } catch (err) {
      result.textContent = `Microphone unavailable: ${err}`
    }
  }

  stopBtn.onclick = async () => {
    stopBtn.disabled = true
    const wav = await recorder.stop()
    recordBtn.disabled = false

    const playback = $<HTMLAudioElement>('#playback')
    playback.src = URL.createObjectURL(new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
    playback.hidden = false

    const info = readWavInfo(wav)
    const format = `${info.sampleRate} Hz, ${info.channels} channel, ${info.bitsPerSample}-bit, ${info.durationSec.toFixed(2)} s`
    result.textContent = `Format: ${format}\nScoring…`
    try {
      const { score } = await evaluate(wav, $<HTMLInputElement>('#reference').value)
      result.textContent = `Format: ${format}\nCAPT score: ${score.toFixed(3)}`
    } catch (err) {
      result.textContent = err instanceof CaptError && err.kind === 'bad-audio'
        ? `Format: ${format}\nNot sent: ${err.message.replace('not sent to CAPT: ', '')}. Record again, speaking for at least a second.`
        : `Format: ${format}\nCAPT error: ${err}`
    }
  }

  checkCapt()
  app.querySelector('main')!.append(demoControls(store), errorLog())
}

// Recent problems on this tablet: errors and notes behind the friendly messages children saw.
function errorLog(): HTMLElement {
  const errors = readErrors().reverse()
  const section = h('section', { class: 'card' },
    h('h2', {}, 'Recent problems on this tablet'),
    errors.length === 0
      ? h('p', { class: 'muted' }, 'None.')
      : h('ul', { class: 'error-log' },
          errors.map((e) => h('li', {}, h('strong', {}, `${new Date(e.at).toLocaleString()} · ${e.where} · ${e.kind}`), h('br'), e.detail)),
        ),
    errors.length > 0 && h('button', { class: 'ghost', on: { click: () => { clearErrors(); section.replaceWith(errorLog()) } } }, 'Clear'),
  )
  return section
}

// Loads a class of 30 with three weeks of simulated practice, for demos.
function demoControls(store: Store): HTMLElement {
  const status = h('p', { class: 'muted' })
  const run = (label: string, work: () => Promise<string>) => async (e: Event) => {
    const button = e.currentTarget as HTMLButtonElement
    button.disabled = true
    status.textContent = label
    try {
      status.textContent = await work()
    } catch (err) {
      status.textContent = `Failed: ${err}`
    } finally {
      button.disabled = false
    }
  }
  return h('section', { class: 'card' },
    h('h2', {}, 'Demo class'),
    h('p', {}, `“${DEMO_CLASS_NAME}”: 30 children and three weeks of simulated practice, with today’s session open and empty. Includes the five simulated learners and their planted errors.`),
    h('div', { class: 'row' },
      h('button', {
        class: 'primary',
        on: {
          click: run('Loading…', async () => {
            await removeDemoClasses(store)
            const { classRoom } = await seedDemoClass(store)
            saveSelectedClass(classRoom.id)
            return 'Loaded. Open the Teacher view to see it.'
          }),
        },
      }, 'Load demo class'),
      h('button', { class: 'ghost', on: { click: run('Removing…', async () => `Removed ${await removeDemoClasses(store)} demo class(es).`) } }, 'Remove demo class'),
      h('a', { class: 'button ghost', href: '#/teacher' }, 'Teacher view'),
    ),
    status,
  )
}
