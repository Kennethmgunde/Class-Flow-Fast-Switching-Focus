// Practice prompts. Short sentences a primary child can say in a breath,
// built from everyday words, each focused on one or two target sounds.
//
// Rules (CAPT rejects anything else): dictionary words only, no names, no
// punctuation, and well under 8 seconds spoken. tools/check-prompts.ts runs
// every prompt through CAPT and confirms the focus sounds are really there.

import type { SoundId } from './sounds.ts'

export type Prompt = {
  id: string
  text: string
  focus: SoundId[]
}

export const PROMPTS: Prompt[] = [
  { id: 'think-three', text: 'I think there are three', focus: ['th-think', 'th-this'] },
  { id: 'thank-you', text: 'thank you for the bath', focus: ['th-think'] },
  { id: 'thin-thumb', text: 'my thumb is thin', focus: ['th-think'] },
  { id: 'this-mother', text: 'this is my mother', focus: ['th-this'] },
  { id: 'they-there', text: 'they are over there', focus: ['th-this', 'v'] },

  { id: 'very-good', text: 'very good voice', focus: ['v'] },
  { id: 'seven-vans', text: 'seven vans in the village', focus: ['v', 'th-this'] },
  { id: 'five-fish', text: 'five fish for my father', focus: ['f', 'th-this'] },
  { id: 'funny-frog', text: 'a funny frog on a leaf', focus: ['f', 'l'] },

  { id: 'happy-puppy', text: 'the puppy is happy', focus: ['p'] },
  { id: 'pen-paper', text: 'put the pen on the paper', focus: ['p'] },

  { id: 'little-lamp', text: 'a little lamp is lit', focus: ['l'] },
  { id: 'lorry-yellow', text: 'the lorry is yellow', focus: ['l', 'r'] },
  { id: 'red-rabbit', text: 'the red rabbit runs', focus: ['r'] },
  { id: 'rain-roof', text: 'rain on the roof', focus: ['r'] },

  { id: 'she-shoes', text: 'she has new shoes', focus: ['sh', 'z'] },
  { id: 'wash-dish', text: 'wash the dish', focus: ['sh'] },
  { id: 'children-chairs', text: 'the children sit on chairs', focus: ['ch'] },
  { id: 'chicken-lunch', text: 'chicken for lunch', focus: ['ch'] },
  { id: 'jump-jungle', text: 'just jump in the jungle', focus: ['j'] },
  { id: 'orange-juice', text: 'orange juice in a jug', focus: ['j'] },
  { id: 'zebra-zoo', text: 'the zebra is at the zoo', focus: ['z'] },
  { id: 'busy-bees', text: 'the bees are busy', focus: ['z', 'ee'] },

  { id: 'sheep-ship', text: 'the sheep is on the ship', focus: ['ee', 'i', 'sh'] },
  { id: 'sit-seat', text: 'sit in your seat', focus: ['i', 'ee'] },
  { id: 'fish-swim', text: 'big fish swim', focus: ['i'] },
  { id: 'cat-mat', text: 'the cat sat on the mat', focus: ['a'] },
  { id: 'black-bag', text: 'a black bag', focus: ['a'] },
  { id: 'red-bed', text: 'ten red beds', focus: ['e', 'r'] },
  { id: 'egg-desk', text: 'an egg on the desk', focus: ['e'] },
]
