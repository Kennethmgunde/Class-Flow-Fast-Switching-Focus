import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATARS, MAX_LEARNERS, checkClassName, checkLearner, nextAvatar } from '../src/setup-rules.ts'

test('there is a distinct avatar for every learner in a full class of thirty', () => {
  assert.ok(MAX_LEARNERS >= 30)
  assert.equal(new Set(AVATARS).size, AVATARS.length)
})

test('nextAvatar skips avatars already taken', () => {
  assert.equal(nextAvatar([]), AVATARS[0])
  assert.equal(nextAvatar([AVATARS[0], AVATARS[2]]), AVATARS[1])
  assert.equal(nextAvatar(AVATARS), undefined)
})

test('checkLearner accepts a first name with a free avatar', () => {
  assert.equal(checkLearner('  Amara ', '🦁', [{ name: 'Chidi', avatar: '🐘' }]), null)
})

test('checkLearner explains each problem', () => {
  const amara = [{ name: 'Amara', avatar: '🦁' }]
  assert.match(checkLearner('   ', '🐘', [])!, /first name/)
  assert.match(checkLearner('Amara Okafor', '🐘', [])!, /First name only/)
  assert.match(checkLearner('A'.repeat(21), '🐘', [])!, /under 20/)
  assert.match(checkLearner('Chidi', '🦁', amara)!, /already has that animal/)
  assert.match(checkLearner('amara', '🐘', amara)!, /already has someone called amara.*amaraB/)
  const full = AVATARS.map((avatar, i) => ({ name: `Child${i}`, avatar }))
  assert.match(checkLearner('Zuri', '🦁', full)!, /up to 36/)
})

test('checkClassName rejects blanks and duplicates, ignoring case', () => {
  assert.equal(checkClassName('Class 3A', []), null)
  assert.match(checkClassName('  ', [])!, /name/)
  assert.match(checkClassName('class 3a', ['Class 3A'])!, /already a class/)
})
