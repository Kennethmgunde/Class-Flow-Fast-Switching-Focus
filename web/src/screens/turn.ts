// One child's turn. Practice itself arrives in TRA-801; this screen owns
// getting in and out quickly: "Not me" undoes a wrong tap, and "I'm done"
// returns to the roster, where the next child is one tap away.

import { avatarElement } from '../avatars.ts'
import type { Store } from '../store.ts'
import { h } from '../ui/dom.ts'

export async function renderTurn(root: HTMLElement, store: Store, learnerId: string): Promise<void> {
  const learner = await store.getLearner(learnerId)
  if (!learner) {
    location.hash = '#/class'
    return
  }

  root.replaceChildren(
    h('header', { class: 'topbar turn-bar' },
      avatarElement(learner.avatar, 'avatar big'),
      h('h1', {}, `Hi ${learner.name}!`),
      h('a', { class: 'button ghost', href: '#/class' }, 'Not me'),
    ),
    h('main', { class: 'turn' },
      h('section', { class: 'card practice-area', id: 'practice' },
        h('p', { class: 'muted' }, 'Practice sentences will appear here.'),
      ),
      h('a', { class: 'button primary done-button', href: '#/class' }, 'I’m done'),
    ),
  )
}

