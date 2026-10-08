import './style.css'
import { Store } from './store.ts'
import { renderSetup } from './screens/setup.ts'
import { renderRoster } from './screens/roster.ts'
import { renderTurn } from './screens/turn.ts'
import { renderCheck } from './screens/check.ts'
import { renderTeacher } from './screens/teacher.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
const store = await Store.open()

// Hash routes:
//   #/setup       teacher setup (the default)
//   #/class       child-facing roster
//   #/turn/<id>   one child's turn
//   #/teacher     teacher view: turns, sounds, improvement
//   #/check       recording check
async function route(): Promise<void> {
  const path = location.hash.replace(/^#/, '') || '/setup'
  const turn = path.match(/^\/turn\/([0-9a-f]+)$/)
  window.scrollTo(0, 0)
  if (turn) await renderTurn(app, store, turn[1])
  else if (path === '/class') await renderRoster(app, store)
  else if (path === '/teacher') await renderTeacher(app, store)
  else if (path === '/check') renderCheck(app, store)
  else await renderSetup(app, store)
}

window.addEventListener('hashchange', () => void route())
await route()
