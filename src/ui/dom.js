// Tiny DOM builder. Text is always set via textContent — never innerHTML.

/**
 * @typedef {Node | string | null | undefined | false} Child
 * @typedef {{
 *   class?: string,
 *   text?: string,
 *   attrs?: Record<string, string | number | boolean | null | undefined>,
 *   on?: Record<string, (event: Event) => void>,
 * }} Props
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props} [props]
 * @param {Child[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(props.on ?? {})) {
    el.addEventListener(event, handler);
  }
  append(el, children);
  return el;
}

/**
 * @param {Element} parent
 * @param {Child[]} children
 */
export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child);
  }
}

let counter = 0;
/** Unique DOM id with a readable prefix. @param {string} prefix */
export function uid(prefix) {
  counter += 1;
  return `${prefix}-${counter}`;
}
