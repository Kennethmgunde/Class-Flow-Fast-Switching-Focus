# CAPT in the Classroom

*Sales one-pager (TRA-815), as of 2026-10-09*

Class-Flow puts Cobalt CAPT pronunciation practice on one shared tablet for a whole class: a child taps their picture, says a sentence, and gets feedback in seconds, with no logins. In our demo, five children went through one tablet in 1 min 26 s, and the teacher view found all 6 planted pronunciation errors.

## Why schools need it

Many classrooms in Kenya and Nigeria have thirty or more children and one device. Pronunciation practice only works there if:

- every child gets a turn, quickly, without typing a password
- each child's progress is kept separately on the shared device
- the teacher can see, at a glance, which sounds the class struggles with and who needs help

Class-Flow is built around those three needs. It's a prototype (Cobalt quest F-9), running on CAPT's US English model.

## How it works in a lesson

A turn is three short sentences and takes about 16 seconds, then the tablet goes to the next child.

1. The child taps their picture on the class roster. That's the whole login; **Not me** undoes a wrong tap.
2. The app reads the sentence aloud, for children who can't read yet.
3. The child taps the microphone and says it. CAPT scores every sound in the sentence.
4. The child sees one to three stars, never a score, with any words to practise highlighted.
5. After three sentences the child taps **I'm done**, the roster ticks them off, and the next child taps their picture.

## What the teacher gets

One screen, behind a teacher PIN, with the three things a teacher acts on.

| Panel | What it shows | Why it matters |
| --- | --- | --- |
| Waiting for a turn | How many children have had a turn this session, who hasn't, and how long turns and switches took | Nobody is forgotten in a class of thirty |
| Sounds to work on | Sounds the whole class finds hard, and which children to help one-to-one, with their sounds | The teacher's time goes where it's needed |
| Who is improving | Children improving or slipping, sound by sound, from finished sessions | Progress the teacher can show, and early warning for who needs support |

A child is only named for a sound that's weak in at least two different sentences, so one mumbled recording doesn't put a child on the list.

![Teacher view after five turns](images/demo-teacher-view.png)

## Proof: measured, not claimed

Both results come from runs against the real CAPT on demo.cobaltspeech.com. The quest rules ban recording real children, so the learners are five simulated children with synthesized voices and planted pronunciation errors common for English learners in Kenya and Nigeria.

**Speed**, five learners through one tablet (recorded run, 2026-10-09, [details](demo-run.md)):

| Measure | Result |
| --- | --- |
| Five learners, three sentences each | 1 min 26 s |
| Average turn | about 16 s |
| Switching to the next child | about 1.3 s |
| Tap to stars, per sentence | 2.2 to 2.8 s |

The run was scripted at one tap every 1.2 s, so a real class will be slower; the quest's target of five learners in five minutes leaves about 60 s per child.

**Accuracy**, the teacher view against an answer key ([details](answer-key-check.md)):

| Learner | Planted error | Teacher view |
| --- | --- | --- |
| Amara | th said as t or d ("I tink dere are tree") | Found both th sounds |
| Chidi | v said as b | Found |
| Wanjiru | r said as l | Found |
| Kofi | sh said as s, ch said as sh | Found both |
| Zuri | none (the control) | Correctly not named |

All 6 planted errors found. There were 2 false alarms, both vowels in Amara's own mispronounced words (her "de" drags down the vowel next to it), which a real child's mistake would cause too.

## Privacy and deployment

Children's data never leaves the tablet: names (or just a picture), progress and scores stay on the device, with no accounts, cloud copies or exports. Each recording goes to CAPT with the sentence only, no name, and is scored and discarded, never stored.

To run it in a classroom, a school needs:

- one tablet with a modern browser (Chrome or Edge) and a microphone
- an internet connection, for CAPT scoring
- the Class-Flow web app served over HTTPS (browsers block the microphone otherwise), with a small server that forwards scoring requests to CAPT

What to say plainly to customers:

- It's a prototype, tested with simulated voices, not yet with real children in a classroom.
- CAPT's model is US English, which scores other accents lower, so the teacher view compares each child with their classmates rather than with a fixed score.
- Deleting a class, or wiping the tablet, can't be undone: there are no backups, by design.

## See it

The five-minute demo runs on a laptop: five children take turns, then the teacher view. Ask Kenneth Gunde for a live run.

- [Demo script](demo-script.md): what to tap and say, and common questions
- [Demo run](demo-run.md): the recorded run, with timings and screenshots
- [Answer-key check](answer-key-check.md): how accuracy was measured
- [Code and setup](../README.md)
