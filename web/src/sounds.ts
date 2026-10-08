// Target sounds and how to name them for a teacher.
//
// CAPT scores each sound (phone) in X-SAMPA notation, as used by its
// en_US model. The codes below were confirmed against real CAPT output by
// tools/check-prompts.ts; note the English r is `r\` (approximant), not `r`.
//
// These are sounds English learners in Kenya and Nigeria often find hard:
// "th" said as t, d, s, z or f; v and f or b swapped; l and r confused;
// p and f swapped (some Hausa speakers); sh and s; ch and j; vowel pairs
// like ship/sheep and cat/bed.

export type SoundId =
  | 'th-think' | 'th-this' | 'v' | 'f' | 'p' | 'l' | 'r'
  | 'sh' | 'ch' | 'j' | 'z' | 'ee' | 'i' | 'a' | 'e'

export type Sound = {
  id: SoundId
  xsampa: string // the phone code CAPT reports
  label: string // what a teacher sees
  example: string // a word with the sound
}

export const SOUNDS: Sound[] = [
  { id: 'th-think', xsampa: 'T', label: 'th as in think', example: 'think' },
  { id: 'th-this', xsampa: 'D', label: 'th as in this', example: 'this' },
  { id: 'v', xsampa: 'v', label: 'v as in van', example: 'van' },
  { id: 'f', xsampa: 'f', label: 'f as in fish', example: 'fish' },
  { id: 'p', xsampa: 'p', label: 'p as in pen', example: 'pen' },
  { id: 'l', xsampa: 'l', label: 'l as in lamp', example: 'lamp' },
  { id: 'r', xsampa: 'r\\', label: 'r as in red', example: 'red' },
  { id: 'sh', xsampa: 'S', label: 'sh as in shoe', example: 'shoe' },
  { id: 'ch', xsampa: 'tS', label: 'ch as in chair', example: 'chair' },
  { id: 'j', xsampa: 'dZ', label: 'j as in jump', example: 'jump' },
  { id: 'z', xsampa: 'z', label: 'z as in zoo', example: 'zoo' },
  { id: 'ee', xsampa: 'i', label: 'ee as in sheep', example: 'sheep' },
  { id: 'i', xsampa: 'I', label: 'i as in ship', example: 'ship' },
  { id: 'a', xsampa: '{', label: 'a as in cat', example: 'cat' },
  { id: 'e', xsampa: 'E', label: 'e as in bed', example: 'bed' },
]

const BY_XSAMPA = new Map(SOUNDS.map((s) => [s.xsampa, s]))
const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]))

export function soundById(id: SoundId): Sound {
  return BY_ID.get(id)!
}

// The target sound for a phone code CAPT reported, if it's one we teach.
export function soundForPhone(xsampa: string): Sound | undefined {
  return BY_XSAMPA.get(xsampa)
}
