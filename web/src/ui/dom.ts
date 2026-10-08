// A tiny element builder, so screens can be written without a framework.

type Child = Node | string | false | null | undefined
type Props = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> }

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'on') {
      for (const [event, fn] of Object.entries(value as NonNullable<Props['on']>)) el.addEventListener(event, fn)
    } else if (key === 'class') {
      el.className = String(value)
    } else if (value === false || value == null) {
      continue
    } else if (key in el) {
      ;(el as any)[key] = value
    } else {
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  for (const child of children.flat()) {
    if (child === false || child == null) continue
    el.append(child)
  }
  return el
}
