// Five simulated learners with planted pronunciation errors, and the answer
// key that goes with them (TRA-809). The quest rules ban human recordings, so
// test speech is synthesized with VoiceGen from text where the planted error
// is spelled out: Amara says "I tink dere are tree" for "I think there are
// three". CAPT scores it against the real sentence, so the planted sounds
// should come out weak, and the teacher view should name exactly these
// children for exactly these sounds (checked in TRA-811).
//
// Each pattern is a common one for English learners in Kenya and Nigeria, and
// applies to every sentence that child says, as a real child's would.

import type { SoundId } from '../sounds.ts'

export type SimulatedLearner = {
  name: string
  speaker: string // VoiceGen voice
  speechRate: number
  planted: SoundId[] // the answer key: sounds this child gets wrong
  says: Record<string, string> // how this child says each affected word
}

export const LEARNERS: SimulatedLearner[] = [
  {
    name: 'Amara',
    speaker: 'LTTS_8797',
    speechRate: 0.95,
    planted: ['th-think', 'th-this'], // th said as t or d
    says: {
      think: 'tink', three: 'tree', thank: 'tank', thin: 'tin', thumb: 'tumb', bath: 'bat',
      the: 'de', this: 'dis', there: 'dere', they: 'dey', mother: 'moder', father: 'fader',
    },
  },
  {
    name: 'Chidi',
    speaker: 'LTTS_2300',
    speechRate: 1.0,
    planted: ['v'], // v said as b
    says: { very: 'bery', voice: 'boice', seven: 'seben', vans: 'bans', village: 'billage', five: 'fibe', over: 'ober' },
  },
  {
    name: 'Wanjiru',
    speaker: 'LTTS_8123',
    speechRate: 0.92,
    planted: ['r'], // r said as l
    says: { red: 'led', rabbit: 'labbit', runs: 'luns', rain: 'lain', roof: 'loof', lorry: 'lolly', three: 'thlee' },
  },
  {
    name: 'Kofi',
    speaker: 'LTTS_5789',
    speechRate: 1.05,
    planted: ['sh', 'ch'], // sh said as s, ch said as sh
    says: {
      she: 'see', shoes: 'soos', wash: 'was', dish: 'dis', sheep: 'seep', ship: 'sip',
      children: 'shildren', chairs: 'shairs', chicken: 'shicken', lunch: 'lunsh',
    },
  },
  {
    name: 'Zuri',
    speaker: 'LTTS_4137',
    speechRate: 0.98,
    planted: [], // the control: says everything correctly
    says: {},
  },
]

// The sentences every simulated learner says: three for each planted
// pattern, so each planted sound occurs at least twice per child.
export const TEST_PROMPTS = [
  'think-three', 'this-mother', 'they-there',
  'very-good', 'seven-vans', 'five-fish',
  'red-rabbit', 'little-lamp', 'lorry-yellow',
  'she-shoes', 'sheep-ship', 'children-chairs',
]

// The sentence as this learner says it.
export function sayAs(learner: SimulatedLearner, text: string): string {
  return text.split(' ').map((w) => learner.says[w] ?? w).join(' ')
}
