// Shared UI components — DESIGN.md §6. Styles live in src/styles/components.css.
// Add a component here only together with its DESIGN.md entry.

import { h, uid } from './dom.js';
import { strings } from './strings.js';

/** @typedef {import('./dom.js').Child} Child */

/** @typedef {'alert' | 'gear' | 'grip' | 'location' | 'remove' | 'share'} IconName */

/** SVG path data per icon, on a 24×24 grid. */
const ICONS = /** @type {Record<IconName, string>} */ ({
  // A warning triangle with an exclamation mark.
  alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z',
  // Three horizontal bars: a row's drag handle.
  grip: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z',
  location:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  // A filled circle with a minus bar: delete a row in Edit mode.
  remove: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11H7v-2h10v2z',
  // A tray open at the top with an up arrow (the iOS Share button).
  share:
    'M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z',
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Decorative inline icon in `currentColor`, sized by --icon-size. The control
 * (or the labelled role="img" wrapper) that holds it carries the accessible name.
 * @param {IconName} name
 */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/**
 * Button. `primary` = the one main action in a view; `secondary` = other
 * actions; `ghost` = toolbar / in-row actions. `iconOnly` hides the label
 * visually and uses it as the accessible name.
 * @param {{
 *   label: string,
 *   variant?: 'primary' | 'secondary' | 'ghost',
 *   size?: 'md' | 'sm',
 *   type?: 'button' | 'submit',
 *   ariaLabel?: string,
 *   pressed?: boolean,
 *   disabled?: boolean,
 *   icon?: IconName,
 *   iconOnly?: boolean,
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
  icon: iconName,
  iconOnly = false,
  onClick,
}) {
  return h(
    'button',
    {
      class: `btn btn--${variant}${size === 'sm' ? ' btn--sm' : ''}${iconOnly ? ' btn--icon' : ''}`,
      attrs: {
        type,
        'aria-label': iconOnly ? label : ariaLabel,
        'aria-pressed': pressed === undefined ? undefined : String(pressed),
        disabled,
      },
      on: onClick ? { click: onClick } : {},
    },
    [iconName ? icon(iconName) : null, iconOnly ? null : label],
  );
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
 * Labelled native date input (`<input type="date">`), value "YYYY-MM-DD".
 * The label sits beside the input, so it fits the toolbar.
 * @param {{ label: string, name: string, value: string, min?: string, max?: string }} options
 */
export function dateField({ label, name, value, min, max }) {
  const id = uid(name);
  const input = h('input', {
    class: 'input date-field__input',
    attrs: { id, name, type: 'date', min, max },
  });
  input.value = value;
  const labelEl = h('label', { class: 'date-field__label', text: label, attrs: { for: id } });
  const root = h('div', { class: 'date-field' }, [labelEl, input]);
  return {
    root,
    input,
    /** @param {string} text */
    setLabel(text) {
      labelEl.textContent = text;
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

/** Elements a sheet's focus trap cycles through. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Sheet: a native modal <dialog>. Bottom sheet on phones, centred modal from
 * --bp-md. Esc, a backdrop click, the Close button and close() all close it,
 * and focus returns to the element passed to open().
 * @param {{ title: string, children?: Child[] }} options
 */
export function sheet({ title, children = [] }) {
  const titleId = uid('sheet-title');
  const body = h('div', { class: 'sheet__body' }, children);
  const root = h('dialog', { class: 'sheet', attrs: { 'aria-labelledby': titleId } }, [
    h('div', { class: 'sheet__inner' }, [
      h('div', { class: 'sheet__header' }, [
        h('h2', { class: 'sheet__title', text: title, attrs: { id: titleId } }),
        button({ label: strings.sheet.close, variant: 'ghost', onClick: () => close() }),
      ]),
      body,
    ]),
  ]);

  /** @type {HTMLElement | null} */
  let opener = null;

  const focusables = () =>
    [...root.querySelectorAll(FOCUSABLE)].filter(
      /** @returns {el is HTMLElement} */
      (el) => el instanceof HTMLElement && el.getClientRects().length > 0,
    );

  function close() {
    if (root.open) root.close();
  }

  // The inner wrapper fills the dialog, so only the backdrop targets the dialog itself.
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const outside = !root.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  });
  root.addEventListener('close', () => {
    const target = opener;
    opener = null;
    target?.focus();
  });

  return {
    root,
    body,
    /** @param {HTMLElement} [from] element that gets focus back on close */
    open(from) {
      if (root.open) return;
      opener = from ?? null;
      root.showModal();
      focusables()[0]?.focus();
    },
    close,
  };
}

/**
 * Popover: one non-modal panel (native `popover="auto"`) anchored below or
 * above the element passed to open(), kept inside the viewport and above the
 * phone's fixed bottom toolbar. Esc and a
 * click outside close it; Esc returns focus to the anchor. Fill `body` before
 * opening. The anchor gets `aria-expanded`; give it `aria-controls: root.id`.
 * In the anchor's click handler, close() when isOpenFor(anchor), else open().
 * @param {{ label: string, onClose?: () => void }} options
 */
export function popover({ label, onClose }) {
  const body = h('div', { class: 'popover__body' });
  const root = h(
    'div',
    {
      class: 'popover',
      attrs: { id: uid('popover'), popover: 'auto', role: 'group', 'aria-label': label },
    },
    [body],
  );

  /** @type {HTMLElement | null} */
  let anchor = null;
  /** The anchor of a popover that closed in the current task (light dismiss). */
  /** @type {HTMLElement | null} */
  let justClosed = null;

  const isOpen = () => root.matches(':popover-open');

  function place() {
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const { width, height } = root.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // Above the phone's fixed bottom toolbar, so it never lies over it.
    const toolbar = document.querySelector('.toolbar');
    const vh =
      toolbar && getComputedStyle(toolbar).position === 'fixed'
        ? toolbar.getBoundingClientRect().top
        : document.documentElement.clientHeight;
    const left = Math.max(0, Math.min(a.left, vw - width));
    const below = a.bottom + height <= vh || a.top < height;
    const top = below ? Math.min(a.bottom, Math.max(0, vh - height)) : a.top - height;
    root.style.setProperty('--popover-left', String(Math.round(left)));
    root.style.setProperty('--popover-top', String(Math.round(top)));
  }

  /** @param {Event} event */
  function onKeydown(event) {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape' || !anchor) return;
    const target = anchor;
    close();
    target.focus();
  }

  function close() {
    if (isOpen()) root.hidePopover();
  }

  root.addEventListener('beforetoggle', (event) => {
    if (!(event instanceof ToggleEvent) || event.newState !== 'closed') return;
    anchor?.setAttribute('aria-expanded', 'false');
    justClosed = anchor;
    setTimeout(() => {
      justClosed = null;
    }, 0);
    anchor = null;
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    onClose?.();
  });

  return {
    root,
    body,
    /**
     * Whether the popover is open for `from`, or was until a light dismiss in
     * this same click: the anchor's click handler should then leave it closed.
     * @param {HTMLElement} from
     */
    isOpenFor(from) {
      return anchor === from || justClosed === from;
    },
    /** @param {HTMLElement} from anchor */
    open(from) {
      close();
      anchor = from;
      from.setAttribute('aria-expanded', 'true');
      root.showPopover({ source: from });
      place();
      document.addEventListener('keydown', onKeydown);
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
    },
    close,
  };
}

/** How long a toast stays up, in ms, unless the pointer or focus is on it. */
const TOAST_DURATION_MS = 6000;

/**
 * Toast: one short message at a time in a persistent polite status region.
 * Mount `root` once (the app shell does).
 */
export function createToaster() {
  const root = h('div', {
    class: 'toast-region',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  function dismiss() {
    clearTimeout(timer);
    root.replaceChildren();
  }

  return {
    root,
    /**
     * @param {{
     *   message: string,
     *   action?: { label: string, onClick: () => void },
     *   duration?: number,
     * }} options
     */
    show({ message, action, duration = TOAST_DURATION_MS }) {
      clearTimeout(timer);
      const el = h('div', { class: 'toast' }, [
        h('p', { class: 'toast__message', text: message }),
        action
          ? button({
              label: action.label,
              variant: 'ghost',
              size: 'sm',
              onClick: () => {
                action.onClick();
                dismiss();
              },
            })
          : null,
      ]);
      let hovered = false;
      let focused = false;
      const start = () => {
        if (!el.isConnected) return;
        clearTimeout(timer);
        timer = setTimeout(dismiss, duration);
      };
      el.addEventListener('pointerenter', () => {
        hovered = true;
        clearTimeout(timer);
      });
      el.addEventListener('pointerleave', () => {
        hovered = false;
        if (!focused) start();
      });
      el.addEventListener('focusin', () => {
        focused = true;
        clearTimeout(timer);
      });
      el.addEventListener('focusout', (event) => {
        if (
          event instanceof FocusEvent &&
          el.contains(/** @type {Node | null} */ (event.relatedTarget))
        )
          return;
        focused = false;
        if (!hovered) start();
      });
      root.replaceChildren(el);
      start();
    },
  };
}

/**
 * Banner: a persistent message with one action, in the page flow at the top of
 * <main>. Stays until used; toasts never replace it. Mount `root` once (the
 * app shell does). `message` is a string, or `{ long, short, compact? }`: the
 * short text shows below --bp-md and the long from it. Below --bp-md, a short
 * text taller than two lines as rendered is swapped for `compact`, on show()
 * and on resize. A show() with the label of the button on screen keeps that
 * button (and focus on it) and replaces only the message.
 */
export function createBanner() {
  const root = h('div', {
    class: 'banner',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  /** @type {HTMLElement | null} */
  let messageEl = null;
  /** @type {HTMLElement | null} */
  let actionButton = null;
  /** @type {() => void} */
  let onAction = () => {};
  /** @type {{ el: HTMLElement, short: string, compact: string } | null} */
  let fitting = null;

  /** Restore the short text, then swap in the compact one when it takes over two lines. */
  function fit() {
    if (!fitting) return;
    const { el, short, compact } = fitting;
    el.textContent = short;
    if (el.getClientRects().length === 0) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    if (el.getBoundingClientRect().height > 2 * lineHeight + 1) el.textContent = compact;
  }

  window.addEventListener('resize', fit);

  return {
    root,
    /**
     * @param {{
     *   message: string | { long: string, short: string, compact?: string },
     *   action: { label: string, onClick: () => void },
     * }} options
     */
    show({ message, action }) {
      fitting = null;
      /** @type {(string | Node)[]} */
      let content;
      if (typeof message === 'string') {
        content = [message];
      } else {
        const short = h('span', { class: 'banner__short', text: message.short });
        content = [short, h('span', { class: 'banner__long', text: message.long })];
        if (message.compact !== undefined) {
          fitting = { el: short, short: message.short, compact: message.compact };
        }
      }
      onAction = action.onClick;
      if (messageEl && actionButton?.textContent === action.label && root.contains(actionButton)) {
        messageEl.replaceChildren(...content);
      } else {
        messageEl = h('p', { class: 'banner__message' }, content);
        actionButton = button({
          label: action.label,
          variant: 'secondary',
          size: 'sm',
          onClick: () => onAction(),
        });
        root.replaceChildren(h('div', { class: 'banner__inner' }, [messageEl, actionButton]));
      }
      fit();
    },
    hide() {
      fitting = null;
      messageEl = null;
      actionButton = null;
      root.replaceChildren();
    },
  };
}

/**
 * Radio group: a <fieldset> of native radios, one per option.
 * @template {string} T
 * @param {{
 *   legend: string,
 *   name: string,
 *   options: readonly { value: T, label: string }[],
 *   value: T,
 *   onChange: (value: T) => void,
 * }} options
 */
export function radioGroup({ legend, name, options, value, onChange }) {
  const inputs = options.map((option) =>
    h('input', {
      class: 'radio-group__input',
      attrs: { type: 'radio', name, value: option.value, checked: option.value === value },
    }),
  );
  const root = h('fieldset', { class: 'radio-group' }, [
    h('legend', { class: 'radio-group__legend', text: legend }),
    ...options.map((option, i) =>
      h('label', { class: 'radio-group__option' }, [inputs[i], option.label]),
    ),
  ]);
  root.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    onChange(/** @type {T} */ (input.value));
  });
  return {
    root,
    /** Check the matching radio without firing onChange. @param {T} next */
    setValue(next) {
      for (const input of inputs) input.checked = input.value === next;
    },
  };
}

/**
 * Segmented control: a <fieldset> of native radios drawn as one bordered strip
 * of side-by-side segments. The legend and the radios are visually hidden; each
 * radio sits in its segment's <label>. `keyshortcuts` sets aria-keyshortcuts.
 * @template {string} T
 * @param {{
 *   legend: string,
 *   name: string,
 *   options: readonly { value: T, label: string, keyshortcuts?: string }[],
 *   value: T,
 *   onChange: (value: T) => void,
 * }} options
 */
export function segmentedControl({ legend, name, options, value, onChange }) {
  const inputs = options.map((option) =>
    h('input', {
      class: 'segmented__input visually-hidden',
      attrs: {
        type: 'radio',
        name,
        value: option.value,
        checked: option.value === value,
        'aria-keyshortcuts': option.keyshortcuts,
      },
    }),
  );
  const root = h('fieldset', { class: 'segmented' }, [
    h('legend', { class: 'visually-hidden', text: legend }),
    h(
      'div',
      { class: 'segmented__options' },
      options.map((option, i) =>
        h('label', { class: 'segmented__option' }, [inputs[i], option.label]),
      ),
    ),
  ]);
  root.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    onChange(/** @type {T} */ (input.value));
  });
  return {
    root,
    /** Check the matching radio without firing onChange. @param {T} next */
    setValue(next) {
      for (const input of inputs) input.checked = input.value === next;
    },
  };
}

/**
 * Switch: a native checkbox with role="switch", on or off.
 * @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} options
 */
export function switchControl({ label, checked, onChange }) {
  const input = h('input', {
    class: 'switch__input',
    attrs: { type: 'checkbox', role: 'switch', checked },
    on: { change: () => onChange(input.checked) },
  });
  const root = h('label', { class: 'switch' }, [input, label]);
  return {
    root,
    input,
    /** Set the state without firing onChange. @param {boolean} next */
    setChecked(next) {
      input.checked = next;
    },
  };
}

/**
 * App shell: skip link, title bar with <h1> and a toolbar for the actions,
 * <main> opening with the page's banner region, footer, and the page's one
 * toast region.
 * @param {{ title: string, tagline?: string, actions?: Child[], footer?: Child[] }} options
 */
export function appShell({ title, tagline, actions = [], footer = [] }) {
  const banner = createBanner();
  const main = h('main', { class: 'shell__main', attrs: { id: 'main', tabindex: '-1' } }, [
    banner.root,
  ]);
  const toaster = createToaster();
  const hasToolbar = actions.length > 0;
  const root = h('div', { class: `shell${hasToolbar ? ' shell--toolbar' : ''}` }, [
    h('a', { class: 'shell__skip', text: strings.app.skipLink, attrs: { href: '#main' } }),
    h('header', { class: 'shell__header' }, [
      h('div', { class: 'shell__brand' }, [
        h('h1', { class: 'shell__title', text: title }),
        tagline ? h('p', { class: 'shell__tagline', text: tagline }) : null,
      ]),
      hasToolbar
        ? h(
            'div',
            { class: 'toolbar', attrs: { role: 'group', 'aria-label': strings.app.toolbar } },
            actions,
          )
        : null,
    ]),
    main,
    h('footer', { class: 'shell__footer' }, footer),
    toaster.root,
  ]);
  return { root, main, toaster, banner };
}
