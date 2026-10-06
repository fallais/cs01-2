/** Tiny element helper: h('div', { class: 'x' }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children);
  return el;
}

const DOUBLE_CLICK_MS = 350;

/**
 * Calls `onDouble` on a double click or double tap. Built from `click` timing
 * because Chrome does not fire `dblclick` on range inputs, and mobile browsers
 * do not reliably fire it on form controls either.
 */
export function onDoubleActivate(el: HTMLElement, onDouble: () => void): void {
  let last = -Infinity;
  el.addEventListener('click', (e) => {
    if (e.detail === 0) return; // synthetic click from the keyboard
    if (e.timeStamp - last < DOUBLE_CLICK_MS) {
      last = -Infinity;
      onDouble();
    } else {
      last = e.timeStamp;
    }
  });
}
