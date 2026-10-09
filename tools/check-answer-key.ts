// Checks the teacher view against the planted-error answer key (TRA-811).
//
// The 60 synthesized clips (tools/make-test-audio.ts) are scored by the real
// CAPT, then fed to the same code the teacher view uses. The teacher view
// should name each simulated child for exactly their planted sounds:
// found, missed, and false alarms are counted against the answer key. No
// human rating is involved (quest rule); the planted errors are the key.
//
//   cd server && go run .               # in another terminal
//   node tools/check-answer-key.ts      # scores (once), then reports
//   node tools/check-answer-key.ts --rescore
//
// Scoring sends one CAPT request per clip not yet scored, one at a time,
// about a second apart, and stops at the first error. Scores are saved to
// data/generated/learners/scores.json, so later runs only score new clips
// and redo the report. The report goes to docs/answer-key-check.md.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CaptError, evaluate, type Evaluation } from '../web/src/capt.ts'
import { LEARNERS } from '../web/src/demo/simulated-learners.ts'
import { childrenToHelp, classSoundDifficulties, soundsToWorkOn } from '../web/src/insights.ts'
import { soundById, type SoundId } from '../web/src/sounds.ts'
import type { Attempt, Learner } from '../web/src/store.ts'
import type { ManifestEntry } from './make-test-audio.ts'

const BASE = process.env.CAPT_PROXY ?? 'http://127.0.0.1:8080'
const DIR = new URL('../data/generated/learners/', import.meta.url)
const SCORES = new URL('scores.json', DIR)
const REPORT = new URL('../docs/answer-key-check.md', import.meta.url)

type Scored = ManifestEntry & { evaluation: Evaluation; ms: number }

const manifest: ManifestEntry[] = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'))

// 1. Score every clip with CAPT, reusing saved scores for clips already done.
const saved: Scored[] = existsSync(SCORES) && !process.argv.includes('--rescore') ? JSON.parse(readFileSync(SCORES, 'utf8')) : []
const scored: Scored[] = []
for (const [i, m] of manifest.entries()) {
  const done = saved.find((s) => s.file === m.file && s.said === m.said)
  if (done) {
    scored.push(done)
    continue
  }
  const wav = new Uint8Array(readFileSync(new URL(m.file, DIR)))
  const start = Date.now()
  try {
    const evaluation = await evaluate(wav, m.reference, { baseUrl: BASE })
    scored.push({ ...m, evaluation, ms: Date.now() - start })
    console.log(`${String(i + 1).padStart(2)}/${manifest.length} ${m.learner.padEnd(8)} ${m.promptId.padEnd(16)} ${evaluation.score.toFixed(2)}  ${Date.now() - start} ms`)
  } catch (err) {
    writeFileSync(SCORES, JSON.stringify(scored, null, 1) + '\n') // keep what's done
    console.log(`Stopped at ${m.file}: ${err instanceof CaptError ? `${err.kind}: ${err.message}` : err}`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 1000))
}
console.log(`${scored.length} clips scored (${scored.length - saved.filter((s) => scored.includes(s)).length} new requests).`)
writeFileSync(SCORES, JSON.stringify(scored, null, 1) + '\n')

// 2. Feed the scores to the teacher view's own code, as a class of five.
const learners: Learner[] = LEARNERS.map((l, i) => ({ id: l.name, classId: 'test', name: l.name, avatar: `kid-0${i + 1}`, createdAt: 0 }))
const attempts: Attempt[] = scored.map((s, i) => ({
  id: String(i), learnerId: s.learner, classId: 'test', sessionId: 'test', referenceText: s.reference, promptId: s.promptId, at: i, evaluation: s.evaluation,
}))
const difficulties = classSoundDifficulties(attempts, learners)
const listed = soundsToWorkOn(difficulties)
const flagged = new Map<string, Set<SoundId>>(learners.map((l) => [l.name, new Set()]))
for (const d of listed) for (const l of d.learners) flagged.get(l.name)!.add(d.sound.id)
for (const c of childrenToHelp(difficulties, listed)) for (const s of c.sounds) flagged.get(c.learner.name)!.add(s.id)
const wholeClass = listed.filter((d) => d.hard).map((d) => d.sound.label)

// 3. Compare with the answer key.
let found = 0, missed = 0, falseAlarms = 0
const rows: string[] = []
for (const l of LEARNERS) {
  const got = flagged.get(l.name)!
  const hit = l.planted.filter((s) => got.has(s))
  const miss = l.planted.filter((s) => !got.has(s))
  const extra = [...got].filter((s) => !l.planted.includes(s))
  found += hit.length; missed += miss.length; falseAlarms += extra.length
  const label = (ids: SoundId[]) => ids.map((s) => soundById(s).label).join(', ') || '–'
  rows.push(`| ${l.name} | ${label(l.planted)} | ${label(hit)} | ${label(miss)} | ${label(extra)} |`)
}
const planted = found + missed

// Per planted sound: the child's average CAPT score for it against everyone else's.
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const detail: string[] = []
for (const l of LEARNERS) {
  for (const s of l.planted) {
    const code = soundById(s).xsampa
    const scoresFor = (who: (name: string) => boolean) =>
      scored.filter((x) => who(x.learner)).flatMap((x) => x.evaluation.words.filter((w) => w.text.trim()).flatMap((w) => w.sounds.filter((p) => p.reference === code).map((p) => (p.kind === 'deletion' ? 0 : p.score))))
    const mine = scoresFor((n) => n === l.name)
    const others = scoresFor((n) => n !== l.name)
    detail.push(`| ${l.name} | ${soundById(s).label} | ${avg(mine).toFixed(2)} (${mine.length}) | ${avg(others).toFixed(2)} (${others.length}) |`)
  }
}

const times = scored.map((s) => s.ms)
const report = `# Answer-key check (TRA-811)

The teacher view's sound panel, checked against planted pronunciation errors, with no human rating (quest rule). Five simulated learners (VoiceGen voices, \`tools/make-test-audio.ts\`) each said the same 12 sentences with their planted errors spelled out ("I tink dere are tree"). The real CAPT scored all ${scored.length} clips, and the scores went through the same code the teacher view uses.

**Result: found ${found} of ${planted} planted errors, with ${falseAlarms} false alarm${falseAlarms === 1 ? '' : 's'}.**

| Learner | Planted | Found | Missed | False alarms |
|---|---|---|---|---|
${rows.join('\n')}

Whole-class sounds listed: ${wholeClass.length ? wholeClass.join(', ') : 'none'}.

## The evidence

Each planted sound's average CAPT score for that child, against the other four (number of occurrences in brackets):

| Learner | Sound | This child | Everyone else |
|---|---|---|---|
${detail.join('\n')}

## What's left, and why

The remaining false alarms are knock-ons: Amara's planted "th" turns "the" into "de" and "there" into "dere", and CAPT scores the vowels in those same words low too. Her "de" occurs in many sentences, so the knock-on shows up in several, and it also pulls the class's average for "ee" down enough to list it as a whole-class sound. A real child's mispronunciation would do the same. Removing these would mean special-casing words with a failed sound, which risks tuning the rules to this test, so they're reported as they are.

## What changed along the way

1. **First run** (12 sentences per child, 60 clips): found 6 of 6, but **6 false alarms**, and 3 whole-class sounds nobody planted. Each false alarm came from either a knock-on in a mispronounced word or a single bad recording (CAPT scoring one whole sentence near zero).
2. **Rule:** a child is named for a sound, or a sound marked hard for the whole class, only if it's weak in **at least two different sentences**. One bad recording or one hard sentence isn't a pattern.
3. **Wider test:** two sentences added ("my thumb is thin", "chicken for lunch") so every planted sound occurs in at least two sentences: 70 clips, 10 more CAPT requests. Without them, the new rule would have missed Amara's "th as in think" and Kofi's "ch", because the test, not the rule, was too thin.
4. **Result:** 6 of 6 found, 2 false alarms (the knock-ons above), 1 whole-class sound (the same knock-on).

## How it was run

- CAPT on demo.cobaltspeech.com, ${scored.length} requests one at a time, about a second apart (agreed with the demo server's admin).
- CAPT response times: median ${[...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]} ms, slowest ${Math.max(...times)} ms.
- Rerun: \`node tools/make-test-audio.ts\` (if the clips are missing), then \`node tools/check-answer-key.ts --rescore\`.
`
writeFileSync(REPORT, report)
console.log(`\nFound ${found} of ${planted} planted errors, ${falseAlarms} false alarm(s). Report: docs/answer-key-check.md`)
