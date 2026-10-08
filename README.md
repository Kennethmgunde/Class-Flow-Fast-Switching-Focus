# Class-Flow

Classroom mode for Cobalt CAPT: one shared tablet, thirty children.

Children practise pronunciation on a single shared device with no logins. A child taps their picture, hears a prompt, says it, and gets instant feedback from [Cobalt CAPT](https://demo.cobaltspeech.com/capt/). Each child's progress is kept separately.

The teacher view shows the three things a teacher would act on:

1. **Which sounds the class struggles with**, aggregated from CAPT's per-sound scores.
2. **Who hasn't had a turn** this session.
3. **Who is improving**, based on each child's score trend.

This is quest **F-9** from CoW 26.3. The goal is to show five learners going through one device in five minutes, then the teacher view.

## Architecture

```
Browser (tablet)  ──►  server/ (CAPT proxy)  ──►  demo.cobaltspeech.com/capt
   web/                  keeps CAPT calls
   UI, recording,        server-side
   on-device storage
```

The browser can't call CAPT directly, because the demo server sends no CORS headers. `server/` forwards scoring requests and serves the web app.

| Folder    | Contents                                                     |
|-----------|--------------------------------------------------------------|
| `web/`    | The tablet web app: roster, practice flow, teacher view      |
| `server/` | CAPT proxy (REST `/evaluate` and WebSocket `/streaming-evaluate`) |
| `tools/`  | VoiceGen speech synthesis (`voicegen.ts`), prompt clips (`make-prompt-audio.ts`), simulated learners and their test audio (`simulated-learners.ts`, `make-test-audio.ts`), prompt and live CAPT checks |
| `docs/`   | Demo script, measurements, sales one-pager                   |

## Stack

- **web/**: TypeScript with [Vite](https://vite.dev), no framework yet. Node.js 24 LTS.
- **server/**: Go 1.27, standard library only. It serves the built web app and forwards `/api/capt/*` to CAPT, including WebSocket upgrades.

## Running it

Development, with live reload (two terminals):

```sh
# Terminal 1: Go server (CAPT proxy) on :8080
cd server && go run .

# Terminal 2: Vite dev server on :5173, forwards /api to :8080
cd web && npm install && npm run dev
```

Open http://localhost:5173. The page should say **CAPT connected**.

Single server, as for the demo:

```sh
cd web && npm run build
cd ../server && go run .     # serves web/dist and the proxy on :8080
```

Server flags: `-addr` (default `:8080`), `-capt` (CAPT base URL), `-web` (built web app directory).

Tests: `cd web && npm test`. These run offline, using CAPT responses saved in `web/test/fixtures/`.

Live CAPT check, which sends a few requests to the shared demo server through the Go proxy (run it occasionally, not in a loop):

```sh
cd server && go run .               # terminal 1
node tools/capt-live-check.ts       # terminal 2, from the repo root
```

It synthesizes speech with VoiceGen, checks REST, WebSocket, a planted error and an out-of-vocabulary word, and refreshes the fixtures.

### Microphone and HTTPS

Browsers only allow the microphone on `https://` pages or `localhost`. Opening the app on a tablet at `http://<laptop-ip>:8080` blocks the mic. For the tablet demo, serve over HTTPS or use a tunnel.

## Audio

The mic is captured at the browser's native rate (usually 44.1 or 48 kHz) and resampled to 16 kHz mono 16-bit WAV with `OfflineAudioContext` (`web/src/audio/`). Opening an `AudioContext` at 16 kHz directly fails in Firefox when a mic stream is connected to it.

## CAPT notes

- REST `POST /capt/api/capt/v1/evaluate` for prompts under about 8 seconds. Longer prompts return a 503, so use WebSocket `/capt/api/capt/v1/streaming-evaluate` for those.
- Audio must be 16 kHz mono 16-bit WAV.
- Reference text must be dictionary words with no punctuation. Names and rare words fail as out-of-vocabulary (HTTP 500).
- The demo server is shared. Don't load-test it or run automated suites against it without agreeing with the Cobalt team first.

## Data and privacy

- No human recordings: test audio is synthesized (quest rule).
- Learners are stored by first name or avatar only, on the device.
- Storage is IndexedDB in the browser (`web/src/store.ts`): classes, learners, sessions and attempts, with each attempt holding CAPT's per-word and per-sound scores. Nothing is sent to a server except the audio CAPT scores.
- Deleting a learner or a class also deletes their attempts.

## Project tracking

Linear project: [Class-Flow & Fast Switching Focus](https://linear.app/cobaltspeech/project/class-flow-and-fast-switching-focus-013a65a45f13) (tasks TRA-792 to TRA-815).

Branch names follow Linear's format, for example `kgunde/tra-795-capt-client-integration-rest-websocket`.
