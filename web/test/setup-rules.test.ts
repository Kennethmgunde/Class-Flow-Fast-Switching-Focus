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
  assert.equal(checkLearner('  Amara ', AVATARS[0], [{ name: 'Chidi', avatar: AVATARS[1] }]), null)
})

test('checkLearner explains each problem', () => {
  const amara = [{ name: 'Amara', avatar: AVATARS[0] }]
  assert.match(checkLearner('   ', AVATARS[1], [])!, /first name/)
  assert.match(checkLearner('Amara Okafor', AVATARS[1], [])!, /First name only/)
  assert.match(checkLearner('A'.repeat(21), AVATARS[1], [])!, /under 20/)
  assert.match(checkLearner('Chidi', AVATARS[0], amara)!, /already has that picture/)
  assert.match(checkLearner('amara', AVATARS[1], amara)!, /already has someone called amara.*amaraB/)
  const full = AVATARS.map((avatar, i) => ({ name: `Child${i}`, avatar }))
  assert.match(checkLearner('Zuri', AVATARS[0], full)!, /up to 36/)
})

test('checkClassName rejects blanks and duplicates, ignoring case', () => {
  assert.equal(checkClassName('Class 3A', []), null)
  assert.match(checkClassName('  ', [])!, /name/)
  assert.match(checkClassName('class 3a', ['Class 3A'])!, /already a class/)
})
