import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <h1>Class-Flow</h1>
  <p>Classroom mode for Cobalt CAPT: one tablet, thirty children.</p>
  <p id="capt-status">Checking CAPT…</p>
`

// Confirms the whole path works: browser → Go proxy → CAPT demo server.
async function checkCapt() {
  const status = document.querySelector<HTMLParagraphElement>('#capt-status')!
  try {
    const res = await fetch('/api/capt/version')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    status.textContent = `CAPT connected: ${JSON.stringify(await res.json())}`
  } catch (err) {
    status.textContent = `CAPT unreachable: ${err}`
  }
}

checkCapt()
