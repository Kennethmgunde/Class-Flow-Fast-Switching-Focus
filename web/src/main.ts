import './style.css'
import { Store } from './store.ts'
import { TeacherLock } from './teacher-lock.ts'
import { renderSetup } from './screens/setup.ts'
import { renderRoster } from './screens/roster.ts'
import { renderTurn } from './screens/turn.ts'
import { renderCheck } from './screens/check.ts'
import { renderTeacher } from './screens/teacher.ts'
import { renderPinPad } from './screens/pin.ts'

const app = document.querySelector<HTMLDivElement>('#app')!
const store = await Store.open()
const lock = new TeacherLock()

// Hash routes:
//   #/setup       teacher setup (the default)          teacher, behind the PIN
//   #/teacher     teacher view: turns, sounds, trends   teacher, behind the PIN
//   #/check       recording check, demo class, log      teacher, behind the PIN
//   #/class       child-facing roster
//   #/turn/<id>   one child's turn
async function route(): Promise<void> {
  const path = location.hash.replace(/^#/, '') || '/setup'
  const turn = path.match(/^\/turn\/([0-9a-f]+)$/)
  window.scrollTo(0, 0)

  // Children's screens: handing the tablet to a child locks the teacher's.
  if (turn || path === '/class') {
    lock.lock()
    return turn ? renderTurn(app, store, turn[1]) : renderRoster(app, store)
  }

  if (!lock.isOpen()) return renderPinPad(app, lock, () => void route())
  if (path === '/teacher') await renderTeacher(app, store)
  else if (path === '/check') renderCheck(app, store)
  else await renderSetup(app, store, lock)
}

window.addEventListener('hashchange', () => void route())
await route()
