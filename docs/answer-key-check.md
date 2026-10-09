# Answer-key check (TRA-811)

The teacher view's sound panel, checked against planted pronunciation errors, with no human rating (quest rule). Five simulated learners (VoiceGen voices, `tools/make-test-audio.ts`) each said the same 12 sentences with their planted errors spelled out ("I tink dere are tree"). The real CAPT scored all 70 clips, and the scores went through the same code the teacher view uses.

**Result: found 6 of 6 planted errors, with 2 false alarms.**

| Learner | Planted | Found | Missed | False alarms |
|---|---|---|---|---|
| Amara | th as in think, th as in this | th as in think, th as in this | – | ee as in sheep, e as in bed |
| Chidi | v as in van | v as in van | – | – |
| Wanjiru | r as in red | r as in red | – | – |
| Kofi | sh as in shoe, ch as in chair | sh as in shoe, ch as in chair | – | – |
| Zuri | – | – | – | – |

Whole-class sounds listed: ee as in sheep.

## The evidence

Each planted sound's average CAPT score for that child, against the other four (number of occurrences in brackets):

| Learner | Sound | This child | Everyone else |
|---|---|---|---|
| Amara | th as in think | 0.25 (4) | 0.60 (16) |
| Amara | th as in this | 0.19 (12) | 0.94 (48) |
| Chidi | v as in van | 0.41 (7) | 0.89 (28) |
| Wanjiru | r as in red | 0.50 (12) | 0.93 (48) |
| Kofi | sh as in shoe | 0.20 (5) | 0.94 (20) |
| Kofi | ch as in chair | 0.54 (4) | 0.93 (16) |

## What's left, and why

The remaining false alarms are knock-ons: Amara's planted "th" turns "the" into "de" and "there" into "dere", and CAPT scores the vowels in those same words low too. Her "de" occurs in many sentences, so the knock-on shows up in several, and it also pulls the class's average for "ee" down enough to list it as a whole-class sound. A real child's mispronunciation would do the same. Removing these would mean special-casing words with a failed sound, which risks tuning the rules to this test, so they're reported as they are.

## What changed along the way

1. **First run** (12 sentences per child, 60 clips): found 6 of 6, but **6 false alarms**, and 3 whole-class sounds nobody planted. Each false alarm came from either a knock-on in a mispronounced word or a single bad recording (CAPT scoring one whole sentence near zero).
2. **Rule:** a child is named for a sound, or a sound marked hard for the whole class, only if it's weak in **at least two different sentences**. One bad recording or one hard sentence isn't a pattern.
3. **Wider test:** two sentences added ("my thumb is thin", "chicken for lunch") so every planted sound occurs in at least two sentences: 70 clips, 10 more CAPT requests. Without them, the new rule would have missed Amara's "th as in think" and Kofi's "ch", because the test, not the rule, was too thin.
4. **Result:** 6 of 6 found, 2 false alarms (the knock-ons above), 1 whole-class sound (the same knock-on).

## How it was run

- CAPT on demo.cobaltspeech.com, 70 requests one at a time, about a second apart (agreed with the demo server's admin).
- CAPT response times: median 927 ms, slowest 1930 ms.
- Rerun: `node tools/make-test-audio.ts` (if the clips are missing), then `node tools/check-answer-key.ts --rescore`.
