// The Settings sheet: Appearance, Time format, Treat weekends as unavailable and Reset all data. Built from the shared
// components in ./components.js; page styles in src/styles/app.css.

import { button, radioGroup, sheet, switchControl } from './components.js';
import { h, uid } from './dom.js';
import { strings } from './strings.js';

/**
 * @typedef {ReturnType<typeof import('../lib/store.js').createStore>} Store
 * @typedef {ReturnType<typeof import('./theme.js').createTheme>} ThemeController
 * @typedef {ReturnType<typeof import('./components.js').createToaster>} Toaster
 * @typedef {import('./theme.js').ThemeSetting} ThemeSetting
 * @typedef {import('../lib/time-format.js').HourCycleSetting} HourCycleSetting
 */

/** @type {readonly ThemeSetting[]} */
const THEMES = ['system', 'light', 'dark'];
/** @type {readonly HourCycleSetting[]} */
const HOUR_CYCLES = ['auto', 'h12', 'h23'];

/**
 * @param {{ store: Store, theme: ThemeController, toaster: Toaster }} deps
 */
export function settingsSheet({ store, theme, toaster }) {
  const appearance = radioGroup({
    legend: strings.settings.appearance,
    name: 'theme',
    options: THEMES.map((value) => ({ value, label: strings.settings.themes[value] })),
    value: store.getState().settings.theme,
    onChange: (value) => theme.set(value),
  });
  const timeFormat = radioGroup({
    legend: strings.settings.timeFormat,
    name: 'hourCycle',
    options: HOUR_CYCLES.map((value) => ({ value, label: strings.settings.hourCycles[value] })),
    value: store.getState().settings.hourCycle,
    onChange: (hourCycle) => store.updateSettings({ hourCycle }),
  });
  const weekends = switchControl({
    label: strings.settings.weekends,
    checked: store.getState().settings.weekendsUnavailable,
    onChange: (weekendsUnavailable) => store.updateSettings({ weekendsUnavailable }),
  });
  // Follows a reset, the title bar toggle, the T key or another tab's choice.
  store.subscribe((state) => {
    appearance.setValue(state.settings.theme);
    timeFormat.setValue(state.settings.hourCycle);
    weekends.setChecked(state.settings.weekendsUnavailable);
  });

  const resetButton = button({
    label: strings.settings.reset,
    variant: 'secondary',
    onClick: () => showConfirm(),
  });
  const cancelButton = button({
    label: strings.settings.cancel,
    variant: 'ghost',
    onClick: () => {
      hideConfirm();
      resetButton.focus();
    },
  });
  const confirmTextId = uid('reset-confirm');
  const confirmation = h(
    'div',
    {
      class: 'settings__confirm',
      attrs: { role: 'group', 'aria-labelledby': confirmTextId, hidden: true },
    },
    [
      h('p', { text: strings.settings.resetConfirm, attrs: { id: confirmTextId } }),
      h('div', { class: 'settings__actions' }, [
        button({
          label: strings.settings.resetConfirmAction,
          variant: 'secondary',
          onClick: () => {
            store.reset();
            hideConfirm();
            panel.close();
            toaster.show({ message: strings.toasts.resetDone });
          },
        }),
        cancelButton,
      ]),
    ],
  );

  function showConfirm() {
    resetButton.hidden = true;
    confirmation.hidden = false;
    cancelButton.focus();
  }

  function hideConfirm() {
    confirmation.hidden = true;
    resetButton.hidden = false;
  }

  const panel = sheet({
    title: strings.settings.title,
    children: [
      h('div', { class: 'settings' }, [
        appearance.root,
        timeFormat.root,
        h('div', { class: 'settings__section' }, [weekends.root]),
        h('div', { class: 'settings__section' }, [
          h('p', { class: 'settings__help', text: strings.settings.resetHelp }),
          resetButton,
          confirmation,
        ]),
      ]),
    ],
  });
  panel.root.addEventListener('close', hideConfirm);

  return panel;
}
