import './style.css'
import { Store } from './store.ts'
import { renderSetup } from './screens/setup.ts'
import { renderCheck } from './screens/check.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
const store = await Store.open()

// Hash routes: #/setup (teacher setup, the default) and #/check (recording check).
async function route(): Promise<void> {
  const path = location.hash.replace(/^#/, '') || '/setup'
  if (path === '/check') renderCheck(app)
  else await renderSetup(app, store)
}

window.addEventListener('hashchange', () => void route())
await route()
