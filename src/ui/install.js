// Install guidance: the captured beforeinstallprompt event, the one-time hint
// card, the one-time iOS sheet and the Settings → Install section. Which of
// these apply comes from installGuidance() in ../lib/install.js.

import { button, card, icon, sheet } from './components.js';
import { h } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {import('../lib/install.js').InstallKind} InstallKind
 * @typedef {Event & { prompt: () => unknown }} InstallPromptEvent
 * `beforeinstallprompt` is Chromium-only, so only `prompt()` is relied on.
 */

/**
 * Registers the window listeners at once, so call it before any await.
 * @param {{ store: Store, kind: InstallKind, main: HTMLElement }} deps
 */
export function installController({ store, kind, main }) {
  if (kind === 'none') return { section: null, roots: [], start() {} };

  /** @type {InstallPromptEvent | null} */
  let held = null;
  /** @type {HTMLElement | null} */
  let hint = null;
  /** Set once the hint was acted on this session, so a reset cannot bring it back. */
  let hintDone = false;

  const heading = h('h3', {
    class: 'install__heading',
    text: strings.install.heading,
    attrs: { tabindex: '-1' },
  });
  const settingsButton = button({
    label: strings.install.installApp,
    variant: 'secondary',
    onClick: () => {
      promptInstall();
      heading.focus();
    },
  });
  settingsButton.hidden = true;

  const section = h('div', { class: 'settings__section install' }, [
    heading,
    settingsButton,
    group(strings.install.ios.heading, 'ol', Object.values(strings.install.ios.steps)),
    group(strings.install.android.heading, 'ol', Object.values(strings.install.android.steps)),
    group(strings.install.desktop.heading, 'ul', Object.values(strings.install.desktop.steps)),
  ]);

  function dismissHint() {
    hintDone = true;
    store.updateMeta({ installHintDismissed: true });
    hint?.remove();
    hint = null;
  }

  function drop() {
    held = null;
    settingsButton.hidden = true;
    hint?.remove();
    hint = null;
  }

  function promptInstall() {
    const event = held;
    drop();
    dismissHint();
    try {
      Promise.resolve(event?.prompt()).catch(() => {});
    } catch {
      // The browser may refuse; the Settings steps still apply.
    }
  }

  function showHint() {
    if (hint || hintDone || store.getState().meta.installHintDismissed) return;
    const { root } = card({
      title: strings.install.title,
      children: [
        h('p', { text: strings.install.hintBody }),
        h('div', { class: 'install__actions' }, [
          button({
            label: strings.install.installApp,
            variant: 'secondary',
            onClick: () => {
              promptInstall();
              main.focus();
            },
          }),
          button({
            label: strings.install.notNow,
            variant: 'ghost',
            onClick: () => {
              dismissHint();
              main.focus();
            },
          }),
        ]),
      ],
    });
    hint = root;
    main.prepend(root);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    const candidate = /** @type {Partial<InstallPromptEvent>} */ (event);
    if (typeof candidate.prompt !== 'function') return;
    event.preventDefault();
    held = /** @type {InstallPromptEvent} */ (event);
    settingsButton.hidden = false;
    showHint();
  });
  window.addEventListener('appinstalled', drop);

  const iosSheet =
    kind === 'ios' && !store.getState().meta.installHintDismissed ? iosInstallSheet() : null;
  iosSheet?.root.addEventListener('close', () => {
    store.updateMeta({ installHintDismissed: true });
  });

  return {
    /** @type {HTMLElement | null} the Settings → Install section */
    section,
    /** @type {HTMLElement[]} mount next to the Settings sheet */
    roots: iosSheet ? [iosSheet.root] : [],
    /** Open the iOS sheet, once the roots are in the document. */
    start() {
      iosSheet?.open();
    },
  };
}

function iosInstallSheet() {
  const illustration = icon('share');
  illustration.classList.add('install__illustration');
  return sheet({
    title: strings.install.title,
    children: [
      h('div', { class: 'install' }, [
        illustration,
        h(
          'ol',
          { class: 'install__steps' },
          Object.values(strings.install.ios.steps).map((step) => h('li', { text: step })),
        ),
      ]),
    ],
  });
}

/**
 * @param {string} title
 * @param {'ol' | 'ul'} list
 * @param {string[]} steps
 */
function group(title, list, steps) {
  return h('div', { class: 'install__group' }, [
    h('h4', { class: 'install__group-title', text: title }),
    h(
      list,
      { class: 'install__steps' },
      steps.map((step) => h('li', { text: step })),
    ),
  ]);
}
