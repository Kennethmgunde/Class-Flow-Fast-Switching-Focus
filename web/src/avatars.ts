// Illustrated child avatars, drawn as SVG so they work offline and carry no
// licensing questions. Each of the 36 pairs a different skin tone and
// hairstyle (6 × 6), with its own shirt and background colour, so children
// who can't read their name can still spot their picture.

export const AVATARS = Array.from({ length: 36 }, (_, i) => `kid-${String(i + 1).padStart(2, '0')}`)

const SKIN = ['#4a2c1d', '#6b4126', '#8d5a3b', '#b07a52', '#d1a07a', '#f0caa5']
const HAIR = ['#141110', '#2a1a12', '#3b2416', '#5c3a22', '#141110', '#6e4423']
const STYLES = ['afro', 'puffs', 'braids', 'bun', 'crop', 'wrap'] as const
// Background and shirt colours, spread so neighbouring avatars differ.
const BG = ['#f6d6a8', '#cfe6d8', '#d7e3f5', '#f3cfd6', '#e5dcf4', '#fbe6a2', '#cdeceb', '#f5d9c2', '#dde8c4', '#e9d3ea', '#c9dcef', '#f1e1c6']
const SHIRT = ['#2f7f6f', '#d1603d', '#3d6fb6', '#c2417a', '#7b55b3', '#d9a21f', '#23849c', '#b5562f', '#5f8b2f', '#9c4f9b', '#2d5f9a', '#c27b25']
const WRAP = ['#d1603d', '#3d6fb6', '#d9a21f', '#2f7f6f', '#c2417a', '#7b55b3']

export function isAvatar(key: string): boolean {
  return AVATARS.includes(key)
}

// SVG markup for an avatar key. Keys come only from AVATARS, never from user input.
export function avatarSvg(key: string): string {
  const i = AVATARS.indexOf(key)
  if (i < 0) return ''
  const skin = SKIN[i % 6]
  const style = STYLES[Math.floor(i / 6)]
  const hair = HAIR[(i * 5) % 6]
  const bg = BG[(i * 7) % 12]
  const shirt = SHIRT[(i * 5 + 3) % 12]
  const wrap = WRAP[(i * 7) % 6]
  const [back, front] = hairLayers(style, hair, wrap)

  // Everything is clipped to the background circle.
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><clipPath id="clip-${key}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
<g clip-path="url(#clip-${key})">
<circle cx="50" cy="50" r="50" fill="${bg}"/>
${back}
<path d="M14 100 Q16 74 50 72 Q84 74 86 100Z" fill="${shirt}"/>
<rect x="43" y="62" width="14" height="12" rx="5" fill="${skin}"/>
<circle cx="29" cy="47" r="5" fill="${skin}"/><circle cx="71" cy="47" r="5" fill="${skin}"/>
<circle cx="50" cy="46" r="22" fill="${skin}"/>
${front}
<circle cx="42" cy="48" r="2.6" fill="#1d1a19"/><circle cx="58" cy="48" r="2.6" fill="#1d1a19"/>
<circle cx="38" cy="55" r="3.4" fill="#e8737a" opacity="0.28"/><circle cx="62" cy="55" r="3.4" fill="#e8737a" opacity="0.28"/>
<path d="M43 56 Q50 62 57 56" fill="none" stroke="#1d1a19" stroke-width="2.4" stroke-linecap="round"/>
</g>
</svg>`
}

// Hair drawn behind the head, and hair or headwear drawn over it.
function hairLayers(style: (typeof STYLES)[number], hair: string, wrap: string): [string, string] {
  const cap = `<path d="M28 46 Q27 22 50 21 Q73 22 72 46 Q66 31 50 31 Q34 31 28 46Z" fill="${hair}"/>`
  switch (style) {
    case 'afro':
      return [
        `<circle cx="50" cy="38" r="33" fill="${hair}"/><circle cx="24" cy="50" r="12" fill="${hair}"/><circle cx="76" cy="50" r="12" fill="${hair}"/>`,
        `<path d="M27 46 Q25 18 50 17 Q75 18 73 46 Q67 30 50 30 Q33 30 27 46Z" fill="${hair}"/>`,
      ]
    case 'puffs':
      return [`<circle cx="27" cy="24" r="11" fill="${hair}"/><circle cx="73" cy="24" r="11" fill="${hair}"/>`, cap]
    case 'braids':
      return [
        `<rect x="22" y="38" width="9" height="36" rx="4.5" fill="${hair}"/><rect x="69" y="38" width="9" height="36" rx="4.5" fill="${hair}"/>`,
        cap,
      ]
    case 'bun':
      return [`<circle cx="50" cy="19" r="10" fill="${hair}"/>`, cap]
    case 'crop':
      return ['', `<path d="M29 42 Q29 24 50 24 Q71 24 71 42 Q64 33 50 33 Q36 33 29 42Z" fill="${hair}"/>`]
    case 'wrap':
      return [
        '',
        `<path d="M26 44 Q24 17 50 16 Q76 17 74 44 Q66 32 50 32 Q34 32 26 44Z" fill="${wrap}"/>` +
          `<circle cx="64" cy="20" r="7" fill="${wrap}"/><path d="M30 36 Q50 26 70 36" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2.5"/>`,
      ]
  }
}

// An element showing the avatar. Anything that isn't a known key (for
// example data saved before avatars were pictures) is shown as plain text.
export function avatarElement(key: string, className = 'avatar'): HTMLElement {
  const el = document.createElement('span')
  el.className = className
  if (isAvatar(key)) el.innerHTML = avatarSvg(key)
  else el.textContent = key
  return el
}
