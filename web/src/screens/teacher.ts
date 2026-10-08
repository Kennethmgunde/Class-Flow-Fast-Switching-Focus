// Teacher view: the three things a teacher would act on.
//   1. Who hasn't had a turn this session
//   2. Which sounds the class struggles with, and who finds each one hard
//   3. Who is improving, and who needs support
// Glanceable: no raw scores, except in the "All sounds" detail.

import { avatarElement } from '../avatars.ts'
import { classImprovement, classSoundDifficulties, soundsToWorkOn, turnsThisSession, type Improvement, type SoundDifficulty } from '../insights.ts'
import { pickClass } from '../selected-class.ts'
import type { Learner, Session, Store } from '../store.ts'
import { h } from '../ui/dom.ts'

const TOP_SOUNDS = 3

export async function renderTeacher(root: HTMLElement, store: Store): Promise<void> {
  const current = pickClass(await store.listClasses())
  if (!current) {
    location.hash = '#/setup'
    return
  }
  const learners = await store.listLearners(current.id)
  const sessions = await store.listSessions(current.id)
  const running = sessions.find((s) => !s.endedAt)
  const shown = running ?? sessions.at(-1) // the running session, or the last one
  const history = await store.attemptsForClass(current.id)
  const sessionAttempts = shown ? history.filter((a) => a.sessionId === shown.id) : []

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('h1', {}, 'Teacher view'),
      h('span', { class: 'muted' }, current.name),
      h('span', { class: 'spacer' }),
      running && h('a', { class: 'button ghost small', href: '#/class' }, 'Class view'),
      h('a', { class: 'button ghost small', href: '#/setup' }, 'Setup'),
    ),
    h('main', { class: 'teacher' },
      learners.length === 0
        ? h('section', { class: 'card' }, h('p', {}, 'No learners yet. ', h('a', { href: '#/setup' }, 'Add your class in Setup.')))
        : [
            turnsPanel(learners, sessionAttempts.length ? turnsThisSession(learners, sessionAttempts) : undefined, shown, !!running),
            soundsPanel(classSoundDifficulties(history, learners), history.length),
            improvementPanel(classImprovement(learners, history)),
          ],
    ),
  )
}

function turnsPanel(learners: Learner[], turns: ReturnType<typeof turnsThisSession> | undefined, session: Session | undefined, running: boolean): HTMLElement {
  const waiting = turns?.waiting ?? learners
  const done = learners.length - waiting.length
  const when = !session ? 'No practice session yet' : running ? `This session, since ${time(session.startedAt)}` : `Last session, ${day(session.startedAt)}`
  return h('section', { class: 'card panel' },
    h('h2', {}, 'Waiting for a turn'),
    h('p', { class: 'muted' }, when),
    h('p', { class: 'big-number' }, `${done} of ${learners.length}`, h('span', { class: 'muted' }, ' had a turn')),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${done} of ${learners.length} had a turn` },
      h('span', { style: `width: ${learners.length ? (100 * done) / learners.length : 0}%` }),
    ),
    waiting.length === 0
      ? h('p', { class: 'all-done' }, 'Everyone has had a turn.')
      : h('ul', { class: 'mini-roster' }, waiting.map((l) => h('li', {}, avatarElement(l.avatar, 'avatar small'), h('span', {}, l.name)))),
  )
}

function soundsPanel(difficulties: SoundDifficulty[], attempts: number): HTMLElement {
  const focus = soundsToWorkOn(difficulties, TOP_SOUNDS)
  return h('section', { class: 'card panel' },
    h('h2', {}, 'Sounds to work on'),
    h('p', { class: 'muted' }, `From ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} so far`),
    difficulties.length === 0
      ? h('p', {}, 'Not enough practice yet. Sounds appear here after a few turns.')
      : focus.length === 0
        ? h('p', {}, 'No sound stands out yet. The class is doing evenly.')
        : h('ol', { class: 'sound-list' },
            focus.map((d) => h('li', {},
              h('div', { class: 'sound-name' }, d.sound.label),
              h('p', { class: 'muted' }, d.hard ? 'Hard for the whole class' : `A small group: ${d.learners.length} children`),
              d.learners.length > 0 &&
                h('div', { class: 'who' },
                  h('span', { class: 'muted' }, d.hard ? 'Hardest for:' : 'Who:'),
                  d.learners.map((l) => h('span', { class: 'chip' }, avatarElement(l.avatar, 'avatar tiny'), l.name)),
                ),
            )),
          ),
    difficulties.length > 0 &&
      h('details', { class: 'all-sounds' },
        h('summary', {}, 'All sounds'),
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Sound'), h('th', {}, 'Average'), h('th', {}, 'Times said'))),
          h('tbody', {}, difficulties.map((d) =>
            h('tr', { class: d.hard ? 'hard' : '' }, h('td', {}, d.sound.label), h('td', {}, `${Math.round(d.average * 100)}%`), h('td', {}, String(d.occurrences))),
          )),
        ),
      ),
  )
}

function improvementPanel(all: Improvement[]): HTMLElement {
  const improving = all.filter((i) => i.trend === 'improving')
  const support = all.filter((i) => i.trend === 'needs-support')
  const steady = all.filter((i) => i.trend === 'steady').length
  const tooSoon = all.filter((i) => i.trend === 'not-enough-practice').length
  const row = (i: Improvement) =>
    h('li', {},
      avatarElement(i.learner.avatar, 'avatar small'),
      h('div', {},
        h('strong', {}, i.learner.name),
        i.biggestGain && h('p', { class: 'muted' }, `Better at ${i.biggestGain.sound.label}`),
      ),
      h('span', { class: `trend ${i.trend}` }, i.trend === 'improving' ? `▲ ${pct(i.change)}` : `▼ ${pct(-i.change)}`),
    )
  return h('section', { class: 'card panel' },
    h('h2', {}, 'Who is improving'),
    h('p', { class: 'muted' }, 'Recent sessions compared with earlier ones'),
    improving.length === 0 && support.length === 0
      ? h('p', {}, tooSoon === all.length ? 'Not enough practice yet. Trends appear after two sessions.' : 'No clear changes yet.')
      : [
          improving.length > 0 && h('ul', { class: 'trend-list' }, improving.map(row)),
          support.length > 0 && h('h3', {}, 'May need support'),
          support.length > 0 && h('ul', { class: 'trend-list' }, support.map(row)),
        ],
    h('p', { class: 'muted footnote' },
      [steady && `${steady} steady`, tooSoon && `${tooSoon} without enough practice yet`].filter(Boolean).join(' · '),
    ),
  )
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`
}

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}
