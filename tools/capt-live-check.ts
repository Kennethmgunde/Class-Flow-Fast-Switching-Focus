// Live check of the CAPT client against the demo server, through the Go proxy.
// Sends a handful of requests, one at a time; don't loop it or run it in CI
// (the demo server is shared).
//
//   cd server && go run .          # in another terminal
//   node tools/capt-live-check.ts  # from the repo root
//
// Saves the parsed results to web/test/fixtures/ for offline tests.

import { mkdirSync, writeFileSync } from 'node:fs'
import { CaptError, evaluate } from '../web/src/capt.ts'
import { synthesizeForCapt } from './voicegen.ts'

const BASE = process.env.CAPT_PROXY ?? 'http://127.0.0.1:8080'
const FIXTURES = new URL('../web/test/fixtures/', import.meta.url)

const LONG =
  'the little brown dog ran across the green field and jumped over the old wooden fence ' +
  'before it stopped to drink some cold water from the river near the big tree'

const cases = [
  { name: 'cat-rest', say: 'the cat sat on the mat', ref: 'the cat sat on the mat' },
  // Planted error: "fat" said for "cat". CAPT should flag the /k/.
  { name: 'fat-for-cat-rest', say: 'the fat sat on the mat', ref: 'the cat sat on the mat' },
  // Over the REST limit, so the client must use WebSocket.
  { name: 'long-websocket', say: LONG, ref: LONG },
]

mkdirSync(FIXTURES, { recursive: true })
let failed = false

for (const c of cases) {
  const wav = await synthesizeForCapt(c.say, { speaker: 'LTTS_2300' })
  const seconds = (wav.length - 44) / 32000
  const start = Date.now()
  try {
    const result = await evaluate(wav, c.ref, { baseUrl: BASE })
    const firstWord = result.words[1]
    console.log(
      `${c.name.padEnd(18)} ${seconds.toFixed(1)} s audio, ${Date.now() - start} ms, score ${result.score.toFixed(3)}, ` +
        `"${firstWord.text}": ${firstWord.sounds.map((s) => `${s.reference}=${s.score.toFixed(2)}${s.kind === 'match' ? '' : `(${s.kind})`}`).join(' ')}`,
    )
    writeFileSync(new URL(`${c.name}.json`, FIXTURES), JSON.stringify(result, null, 2) + '\n')
  } catch (err) {
    failed = true
    console.log(`${c.name.padEnd(18)} FAILED: ${err instanceof CaptError ? `${err.kind}: ${err.message}` : err}`)
  }
}

// Out-of-vocabulary: a name CAPT's lexicon doesn't know.
try {
  await evaluate(await synthesizeForCapt('hello Ogbonna'), 'hello Ogbonna', { baseUrl: BASE })
  failed = true
  console.log('oov                FAILED: expected an out-of-vocabulary error')
} catch (err) {
  const ok = err instanceof CaptError && err.kind === 'out-of-vocabulary'
  failed ||= !ok
  console.log(`oov                ${ok ? `ok, rejected word: ${err.word ?? '(not named)'}` : `FAILED: ${err}`}`)
}

process.exit(failed ? 1 : 0)
