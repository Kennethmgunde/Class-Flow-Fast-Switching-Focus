# Demo script

Five learners through one tablet in five minutes, then the teacher view (quest F-9, "Show us"). This is the presenter's guide: what to set up, what to tap, and what to say. The rehearsed run took 1 min 26 s for the five turns (`docs/demo-run.md`), which leaves plenty of time for talking.

## Before the audience arrives (5 minutes)

1. **Start the app** on the laptop that will run the demo:
   ```sh
   cd web && npm run build
   cd ../server && go run .
   ```
2. **Open** http://localhost:8080/#/check in Chrome or Edge. If you've set a teacher PIN, enter it.
3. **Check CAPT:** the top of the page should say **CAPT connected**. If it says "CAPT unreachable", see *If something goes wrong* below.
4. **Load a fresh demo class:** in the **Demo class** box, press **Load demo class**. This also clears any turns from an earlier rehearsal, so the class starts at "0 of 30 had a turn".
5. **Tick Demo voices**, just below.
6. **Turn the sound up.** The audience needs to hear the children.
7. **Practise one turn** if you haven't before, then press **Load demo class** again to reset.
8. Open http://localhost:8080/#/class and leave it on the roster: 30 children's pictures, ready to start.

## The demo (5 minutes)

### 1. The problem (30 s)

> "A classroom in Nairobi or Lagos has thirty children and, if they're lucky, one tablet. Pronunciation practice only works if every child gets a turn, and the teacher can see who needs help. Class-Flow does that: no logins, no typing. A child taps their picture and practises."

### 2. Five children take turns (2 to 3 minutes)

**Amara.** Tap **Amara**.

> "Amara taps her picture. That's the whole login."

The app reads the sentence aloud, for children who can't read yet. Tap the **microphone**. You'll hear Amara say it with her mistake (for example "dis is my moder"; the app picks the sentences), then the stars appear, with her "th" words highlighted.

> "She gets stars, never a score, and the words to practise are highlighted. Amara says 'th' as 't' or 'd', a common pattern for learners here. The stars stay encouraging; the highlighting tells her what to work on."

> "These children are simulated: the quest doesn't allow recording real children, so each one is a synthesized voice with a planted pronunciation mistake. The scoring is real: every sentence goes to Cobalt's CAPT, exactly as a child's recording would."

Each turn is three sentences: after the stars, tap **Next** (or **Finish** after the third), then **I'm done**. You're back on the roster, and Amara's picture has a tick.

> "Done. The tablet goes straight to the next child."

**Chidi, Wanjiru, Kofi**: tap each one, three sentences, **I'm done**. Keep it brisk; a line each is enough:

> "Chidi says 'v' as 'b'. Wanjiru says 'r' as 'l'. Kofi says 'sh' as 's'."

**Zuri** last:

> "Zuri is our control. She says everything correctly. Watch what the teacher view says about her."

If the audience is short on time, you can talk over the turns; each one takes about 15 seconds.

### 3. The teacher view (1 to 2 minutes)

Tap **Teacher** (top right). Enter the PIN if asked.

> "Children can't open this; it's behind the teacher's PIN."

**Waiting for a turn** (left panel):

> "Five of thirty have had a turn, and these are the twenty-five still waiting, so nobody is forgotten. Five turns took about a minute and a half, with about a second to switch between children."

**Sounds to work on** (middle panel):

> "This is where the teacher's time goes. Amara: 'th'. Kofi: 'sh' and 'ch'. Chidi: 'v'. Wanjiru: 'r'. Exactly the mistakes we planted, and nothing else. And Zuri isn't here, because she doesn't need help. The app only points the teacher at children who actually do."

> "We tested this against an answer key: all six planted mistakes found. A child is only named when a sound is weak across at least two different sentences, so one mumbled recording doesn't put a child on the list."

**Who is improving** (right panel):

> "From three weeks of practice: Tunde and Achieng are improving, and Musa may need support. Today's lesson counts once it ends, so a half-finished lesson doesn't move anyone's trend."

### 4. Privacy (20 s)

> "Everything about the children stays on this tablet: names, progress, scores. No accounts, no cloud copies, no exports. Recordings go to CAPT for scoring, without a name, and are never stored."

## Questions people ask

- **"Is the scoring real?"** Yes. Every sentence goes to Cobalt's CAPT on demo.cobaltspeech.com. Only the voices are simulated.
- **"How do you know the teacher view is right?"** Five simulated learners with planted mistakes, scored by the real CAPT: all 6 mistakes found, no child named who shouldn't be (Zuri), and 2 false alarms, both knock-on effects on vowels in Amara's mispronounced words. Details: `docs/answer-key-check.md`.
- **"What about real children?"** Turn **Demo voices** off (or use any class other than the demo class) and the microphone is used. Every real class always uses the microphone.
- **"What if a child taps the wrong picture?"** **Not me** takes them back, until their first sentence is saved.
- **"What if the internet drops?"** The child sees a friendly message ("Ask your teacher"), and the error is logged on the Check screen for the teacher.

## If something goes wrong

| What you see | What to do |
|---|---|
| "CAPT unreachable" on the Check screen, or a child sees "The listening helper is resting" | The demo server's CAPT is down. Check https://demo.cobaltspeech.com in a browser; if it's down there too, wait and try again. Show the teacher view from the demo class's history meanwhile: it works without CAPT. |
| No sound when a child speaks | Turn the laptop's volume up. The demo still works silently: the clip is scored anyway. |
| A child stays on "Checking…" for more than ~10 seconds | CAPT is slow; the app retries once by itself. If it then shows a message, tap **Try again**. |
| The roster says "Ask your teacher to start a practice session" | Press **Load demo class** again on the Check screen (it opens today's session). |
| The teacher view already shows turns from a rehearsal | Press **Load demo class** again: it replaces the demo class with a fresh copy. |
| The teacher view asks for a PIN you don't know | Hold **Forgot PIN?** for 5 seconds. It removes the PIN; no data is lost. |
| The browser asks to use the microphone, or there's no "Demo voice" badge on the turn screen | Demo voices aren't on, or you've opened a child who isn't one of the five. Tap **Not me**, tick **Demo voices** on the Check screen, and use Amara, Chidi, Wanjiru, Kofi and Zuri. |
