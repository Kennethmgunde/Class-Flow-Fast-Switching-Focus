import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Evaluation } from '../src/capt.ts'
import type { Attempt, Learner } from '../src/store.ts'
import { attemptAccuracy, classImprovement, classSoundDifficulties, improvement, turnsThisSession } from '../src/insights.ts'

const learner = (name: string): Learner => ({ id: name.toLowerCase(), classId: 'c', name, avatar: 'kid-01', createdAt: 0 })
const [amara, chidi, kofi, wanjiru, zuri] = ['Amara', 'Chidi', 'Kofi', 'Wanjiru', 'Zuri'].map(learner)
const everyone = [amara, chidi, kofi, wanjiru, zuri]

// An attempt whose single word carries the given phone scores.
let seq = 0
function attempt(who: Learner, sessionId: string, phones: Record<string, number>, at = ++seq): Attempt {
  const evaluation: Evaluation = {
    score: 0.9,
    words: [{
      text: 'word', startMs: 0, durationMs: 1,
      sounds: Object.entries(phones).map(([reference, score]) => ({ reference, score, kind: 'match' as const, heard: [] })),
    }],
  }
  return { id: String(at), learnerId: who.id, classId: 'c', sessionId, referenceText: 'x', at, evaluation }
}

// --- Turns ---

test('turns: who practised this session, and who is still waiting', () => {
  const session = [attempt(chidi, 's', { T: 1 }, 10), attempt(zuri, 's', { T: 1 }, 30), attempt(chidi, 's', { T: 1 }, 20)]
  const turns = turnsThisSession(everyone, session)
  assert.deepEqual(turns.waiting.map((l) => l.name), ['Amara', 'Kofi', 'Wanjiru'])
  assert.deepEqual(turns.practised.map((t) => [t.learner.name, t.attempts]), [['Zuri', 1], ['Chidi', 2]])
})

// --- Sound difficulties ---

// Every child says th (T), sh (S) and v four times. Amara and Chidi struggle
// with th; everything else is good.
function classData(scale = 1): Attempt[] {
  const out: Attempt[] = []
  for (const who of everyone) {
    const th = who === amara || who === chidi ? 0.3 : 0.88
    for (let i = 0; i < 4; i++) out.push(attempt(who, 's1', { T: th * scale, S: 0.9 * scale, v: 0.87 * scale, '@': 0.2 }))
  }
  return out
}

test('the sound the class struggles with is ranked first, with who finds it hard', () => {
  const ranked = classSoundDifficulties(classData(), everyone)
  assert.equal(ranked[0].sound.id, 'th-think')
  assert.equal(ranked[0].sound.label, 'th as in think')
  assert.ok(ranked[0].hard)
  assert.deepEqual(ranked[0].learners.map((l) => l.name).sort(), ['Amara', 'Chidi'])
  assert.ok(ranked.slice(1).every((d) => !d.hard && d.learners.length === 0))
})

test('only target sounds are ranked; other phones like the schwa are ignored', () => {
  const ranked = classSoundDifficulties(classData(), everyone)
  assert.deepEqual(ranked.map((d) => d.sound.id).sort(), ['sh', 'th-think', 'v'])
})

test('lower scores across the board (another accent) give exactly the same result', () => {
  const normal = classSoundDifficulties(classData(1), everyone)
  for (const scale of [0.8, 0.5, 0.3]) {
    const accent = classSoundDifficulties(classData(scale), everyone)
    assert.deepEqual(
      accent.map((d) => [d.sound.id, d.hard, d.learners.map((l) => l.name), d.gap.toFixed(6)]),
      normal.map((d) => [d.sound.id, d.hard, d.learners.map((l) => l.name), d.gap.toFixed(6)]),
    )
  }
})

test('nothing is flagged from too little data', () => {
  const few = [attempt(amara, 's', { T: 0.1, S: 0.9 }), attempt(chidi, 's', { T: 0.1, S: 0.9 })]
  assert.deepEqual(classSoundDifficulties(few, everyone), [])
  assert.deepEqual(classSoundDifficulties([], everyone), [])
})

test("a single bad score doesn't name a child", () => {
  // Kofi slips once on th; everyone else says it twice, fine.
  const data = everyone.flatMap((who) => [
    attempt(who, 's', { T: who === kofi ? 0.2 : 0.9, S: 0.9 }),
    ...(who === kofi ? [] : [attempt(who, 's', { T: 0.9, S: 0.9 })]),
  ])
  const th = classSoundDifficulties(data, everyone).find((d) => d.sound.id === 'th-think')!
  assert.deepEqual(th.learners, [])
})

test('pause words and missed sounds are handled', () => {
  const a = attempt(amara, 's', { T: 0.9 })
  a.evaluation.words.push({ text: '', startMs: 0, durationMs: 0, sounds: [{ reference: 'T', score: 0, kind: 'match', heard: [] }] })
  a.evaluation.words[0].sounds.push({ reference: 'S', score: 0.9, kind: 'deletion', heard: [] })
  assert.equal(attemptAccuracy(a.evaluation), 0.45) // T 0.9 and a missed S, not the pause
})

// --- Improvement ---

function sessions(who: Learner, perSession: Record<string, number>[]): Attempt[] {
  return perSession.flatMap((phones, i) => [attempt(who, `s${i}`, phones, i * 100), attempt(who, `s${i}`, phones, i * 100 + 1)])
}

test('a child whose scores rise across sessions is improving, with the sound that improved most', () => {
  const history = sessions(amara, [{ T: 0.4, S: 0.8 }, { T: 0.5, S: 0.8 }, { T: 0.75, S: 0.82 }, { T: 0.85, S: 0.83 }])
  const result = improvement(amara, history)
  assert.equal(result.trend, 'improving')
  assert.equal(result.sessions, 4)
  assert.ok(result.change > 0.15)
  assert.equal(result.biggestGain?.sound.id, 'th-think')
})

test('the trend is the same at any overall score level (accent)', () => {
  const scaled = (k: number) => sessions(amara, [{ T: 0.4 * k, S: 0.8 * k }, { T: 0.75 * k, S: 0.82 * k }])
  const normal = improvement(amara, scaled(1))
  const accent = improvement(amara, scaled(0.6))
  assert.equal(accent.trend, normal.trend)
  assert.equal(accent.change.toFixed(6), normal.change.toFixed(6))
})

test('steady, needing support, and not enough practice yet', () => {
  assert.equal(improvement(chidi, sessions(chidi, [{ T: 0.8 }, { T: 0.82 }, { T: 0.79 }])).trend, 'steady')
  assert.equal(improvement(kofi, sessions(kofi, [{ T: 0.85 }, { T: 0.7 }, { T: 0.6 }])).trend, 'needs-support')
  assert.equal(improvement(zuri, sessions(zuri, [{ T: 0.2 }])).trend, 'not-enough-practice')
  assert.equal(improvement(wanjiru, []).trend, 'not-enough-practice')
})

test('the class list shows improving children first, biggest gain first', () => {
  const history = [
    ...sessions(amara, [{ T: 0.5 }, { T: 0.7 }]),
    ...sessions(chidi, [{ T: 0.4 }, { T: 0.8 }]),
    ...sessions(kofi, [{ T: 0.8 }, { T: 0.8 }]),
    ...sessions(wanjiru, [{ T: 0.9 }, { T: 0.6 }]),
  ]
  assert.deepEqual(
    classImprovement(everyone, history).map((i) => `${i.learner.name}:${i.trend}`),
    ['Chidi:improving', 'Amara:improving', 'Kofi:steady', 'Wanjiru:needs-support', 'Zuri:not-enough-practice'],
  )
})
