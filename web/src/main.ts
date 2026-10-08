import './style.css'
import { Recorder } from './audio/recorder'
import { readWavInfo } from './audio/wav'
import { evaluate } from './capt'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <h1>Class-Flow</h1>
  <p>Classroom mode for Cobalt CAPT: one tablet, thirty children.</p>
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
    result.textContent = `Format: ${format}\nCAPT error: ${err}`
  }
}

checkCapt()
