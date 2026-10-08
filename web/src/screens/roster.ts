// Child-facing class view: big pictures, one tap to start a turn. No logins.

import { avatarElement } from '../avatars.ts'
import { rosterTiles } from '../roster.ts'
import { pickClass } from '../selected-class.ts'
import type { Store } from '../store.ts'
import { h } from '../ui/dom.ts'

export async function renderRoster(root: HTMLElement, store: Store): Promise<void> {
  const current = pickClass(await store.listClasses())
  const session = current && (await store.currentSession(current.id))

  // Children can't start practising until the teacher has set up and started a session.
  if (!current || !session) {
    root.replaceChildren(
      h('main', { class: 'roster-empty' },
        h('h1', {}, current ? 'Practice hasn’t started yet' : 'No class set up yet'),
        h('p', { class: 'muted' }, current ? 'Ask your teacher to start a practice session.' : 'A teacher needs to set up the class first.'),
        h('a', { class: 'button primary', href: '#/setup' }, 'Teacher setup'),
      ),
    )
    return
  }

  const learners = await store.listLearners(current.id)
  const tiles = rosterTiles(learners, await store.attemptsForSession(session.id))
  const done = tiles.filter((t) => t.hadTurn).length

  root.replaceChildren(
    h('header', { class: 'topbar roster-bar' },
      h('h1', {}, 'Who’s next?'),
      h('span', { class: 'muted' }, `${current.name} · ${done} of ${tiles.length} had a turn`),
      h('a', { class: 'button ghost small', href: '#/teacher' }, 'Teacher'),
    ),
    h('main', { class: 'roster' },
      h('ul', { class: 'roster-grid' },
        tiles.map(({ learner, hadTurn }) =>
          h('li', {},
            h('a', {
              class: `roster-tile ${hadTurn ? 'done' : ''}`,
              href: `#/turn/${learner.id}`,
              'aria-label': `${learner.name}${hadTurn ? ', had a turn' : ''}`,
            },
              avatarElement(learner.avatar, 'avatar roster-avatar'),
              h('span', { class: 'name' }, learner.name),
              hadTurn && h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
            ),
          ),
        ),
      ),
    ),
  )
}
