// The selection bar at the end of the timelines card: the selected date and
// home time range, the rating in words and a clear button. Hidden while
// nothing is selected.

import { button } from './components.js';
import { h } from './dom.js';
import { strings } from './strings.js';

/**
 * @param {{ onClear: () => void }} options
 */
export function selectionBar({ onClear }) {
  const when = h('span', { class: 'selection-bar__when' });
  const rating = h('span', { class: 'selection-bar__rating' });
  const root = h(
    'div',
    { class: 'selection-bar', attrs: { role: 'group', 'aria-label': strings.selection.barLabel } },
    [
      when,
      h('span', {
        class: 'selection-bar__separator',
        text: strings.selection.separator,
        attrs: { 'aria-hidden': 'true' },
      }),
      rating,
      button({
        label: strings.selection.clearLabel,
        ariaLabel: strings.selection.clear,
        variant: 'ghost',
        size: 'sm',
        onClick: onClear,
      }),
    ],
  );
  root.hidden = true;
  return {
    root,
    /** @param {{ when: string, rating: string }} summary */
    show(summary) {
      when.textContent = summary.when;
      rating.textContent = summary.rating;
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
  };
}
