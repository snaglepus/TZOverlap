// Shared UI components — DESIGN.md §6. Styles live in src/styles/components.css.
// Add a component here only together with its DESIGN.md entry.

import { h, uid } from './dom.js';
import { strings } from './strings.js';

/** @typedef {import('./dom.js').Child} Child */

/**
 * Button. `primary` = the one main action in a view; `secondary` = other
 * actions; `ghost` = toolbar / in-row actions.
 * @param {{
 *   label: string,
 *   variant?: 'primary' | 'secondary' | 'ghost',
 *   size?: 'md' | 'sm',
 *   type?: 'button' | 'submit',
 *   ariaLabel?: string,
 *   pressed?: boolean,
 *   disabled?: boolean,
 *   onClick?: (event: Event) => void,
 * }} options
 */
export function button({
  label,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ariaLabel,
  pressed,
  disabled = false,
  onClick,
}) {
  return h('button', {
    class: `btn btn--${variant}${size === 'sm' ? ' btn--sm' : ''}`,
    text: label,
    attrs: {
      type,
      'aria-label': ariaLabel,
      'aria-pressed': pressed === undefined ? undefined : String(pressed),
      disabled,
    },
    on: onClick ? { click: onClick } : {},
  });
}

/**
 * Labelled text input with help text and an error message slot.
 * @param {{
 *   label: string,
 *   name: string,
 *   placeholder?: string,
 *   help?: string,
 *   suggestions?: readonly string[],
 * }} options
 */
export function field({ label, name, placeholder, help, suggestions }) {
  const id = uid(name);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const listId = suggestions?.length ? `${id}-list` : undefined;

  const input = h('input', {
    class: 'input',
    attrs: {
      id,
      name,
      type: 'text',
      placeholder,
      autocomplete: 'off',
      spellcheck: 'false',
      autocapitalize: 'off',
      list: listId,
      'aria-describedby': `${helpId} ${errorId}`,
    },
  });
  const helpEl = h('p', { class: 'field__help', text: help ?? '', attrs: { id: helpId } });
  const errorEl = h('p', { class: 'field__error', attrs: { id: errorId, 'aria-live': 'polite' } });
  const datalist = listId
    ? h(
        'datalist',
        { attrs: { id: listId } },
        (suggestions ?? []).map((value) => h('option', { attrs: { value } })),
      )
    : null;

  const root = h('div', { class: 'field' }, [
    h('label', { class: 'field__label', text: label, attrs: { for: id } }),
    input,
    datalist,
    helpEl,
    errorEl,
  ]);

  return {
    root,
    input,
    /** @param {string | null} message */
    setError(message) {
      errorEl.textContent = message ?? '';
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    },
    /** @param {string} text */
    setHelp(text) {
      helpEl.textContent = text;
    },
  };
}

/**
 * Card: one task or view, with an <h2> title.
 * @param {{ title: string, actions?: Child[], children?: Child[] }} options
 */
export function card({ title, actions = [], children = [] }) {
  const headingId = uid('card-title');
  const body = h('div', { class: 'card__body' }, children);
  const root = h('section', { class: 'card', attrs: { 'aria-labelledby': headingId } }, [
    h('div', { class: 'card__header' }, [
      h('h2', { class: 'card__title', text: title, attrs: { id: headingId } }),
      ...actions,
    ]),
    body,
  ]);
  return { root, body };
}

/**
 * Empty state: valid view with nothing to show yet. Never for failures.
 * @param {{ title: string, body: string, action?: HTMLElement }} options
 */
export function emptyState({ title, body, action }) {
  return h('div', { class: 'empty-state', attrs: { 'data-component': 'empty-state' } }, [
    h('h3', { class: 'empty-state__title', text: title }),
    h('p', { class: 'empty-state__body', text: body }),
    action ? h('div', { class: 'empty-state__action' }, [action]) : null,
  ]);
}

/**
 * Error state: a view or the whole app failed to render.
 * @param {{ title: string, body: string, action?: HTMLElement }} options
 */
export function errorState({ title, body, action }) {
  return h(
    'div',
    { class: 'error-state', attrs: { role: 'alert', 'data-component': 'error-state' } },
    [
      h('h2', { class: 'error-state__title', text: title }),
      h('p', { text: body }),
      action ? h('div', { class: 'error-state__action' }, [action]) : null,
    ],
  );
}

/**
 * App shell: skip link, header with <h1> and actions, <main>, footer.
 * @param {{ title: string, tagline?: string, actions?: Child[], footer?: Child[] }} options
 */
export function appShell({ title, tagline, actions = [], footer = [] }) {
  const main = h('main', { class: 'shell__main', attrs: { id: 'main', tabindex: '-1' } });
  const root = h('div', { class: 'shell' }, [
    h('a', { class: 'shell__skip', text: strings.app.skipLink, attrs: { href: '#main' } }),
    h('header', { class: 'shell__header' }, [
      h('div', { class: 'shell__brand' }, [
        h('h1', { class: 'shell__title', text: title }),
        tagline ? h('p', { class: 'shell__tagline', text: tagline }) : null,
      ]),
      h('div', { class: 'shell__actions' }, actions),
    ]),
    main,
    h('footer', { class: 'shell__footer' }, footer),
  ]);
  return { root, main };
}
