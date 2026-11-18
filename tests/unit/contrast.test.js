// WCAG AA contrast for every colour-token pairing the UI uses, in both themes,
// read straight from src/styles/tokens.css. DESIGN.md §8.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

/**
 * Colour tokens declared in the first block whose selector matches `selector`.
 * @param {RegExp} selector
 * @returns {Record<string, string>}
 */
function block(selector) {
  const match = new RegExp(selector.source + String.raw`\s*\{([^}]*)\}`).exec(css);
  assert.ok(match, `no block for ${selector}`);
  /** @type {Record<string, string>} */
  const vars = {};
  for (const m of (match[1] ?? '').matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    vars[/** @type {string} */ (m[1])] = /** @type {string} */ (m[2]).toLowerCase();
  }
  return vars;
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** @param {string} a @param {string} b */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** [foreground, background, minimum ratio] */
const PAIRS = /** @type {const} */ ([
  ['--color-text', '--color-bg', 4.5],
  ['--color-text', '--color-surface', 4.5],
  ['--color-text', '--color-surface-sunken', 4.5],
  ['--color-text', '--color-danger-surface', 4.5],
  ['--color-text-muted', '--color-bg', 4.5],
  ['--color-text-muted', '--color-surface', 4.5],
  ['--color-text-muted', '--color-surface-sunken', 4.5],
  ['--color-on-accent', '--color-accent', 4.5],
  ['--color-on-accent', '--color-accent-hover', 4.5],
  ['--color-accent', '--color-surface', 4.5],
  ['--color-danger', '--color-surface', 4.5],
  ['--color-danger', '--color-danger-surface', 4.5],
  ['--color-border-strong', '--color-surface', 3],
  // The pressed Button's border in the title bar, against the page.
  ['--color-border-strong', '--color-bg', 3],
  ['--color-focus', '--color-bg', 3],
  ['--color-focus', '--color-surface', 3],
  ['--color-focus', '--color-surface-sunken', 3],
  // Text on Best cells, and the inner edge on Everyone Best segments (needs 3:1).
  ['--color-best-ink', '--color-best', 4.5],
  // Good: greenest step, reddest step, the no-color-mix middle step and the hatch.
  ['--color-heat-ink', '--color-heat-near', 4.5],
  ['--color-heat-ink', '--color-heat-far', 4.5],
  ['--color-heat-ink', '--color-heat-mid', 4.5],
  ['--color-heat-ink', '--color-heat-hatch', 4.5],
  ['--color-unsuitable-ink', '--color-unsuitable', 4.5],
]);

const themes = {
  light: block(/:root/),
  dark: block(/:root\[data-theme='dark'\]/),
};

describe('contrast helper', () => {
  it('matches known WCAG ratios', () => {
    assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
    assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
  });
});

for (const [name, vars] of Object.entries(themes)) {
  describe(`${name} theme`, () => {
    for (const [fg, bg, min] of PAIRS) {
      it(`${fg} on ${bg} >= ${min}:1`, () => {
        const a = vars[fg];
        const b = vars[bg];
        assert.ok(a && b, `missing ${!a ? fg : bg} in ${name} theme`);
        const ratio = contrast(a, b);
        assert.ok(ratio >= min, `${ratio.toFixed(2)}:1 is below ${min}:1`);
      });
    }
  });
}

describe('theme consistency', () => {
  it('dark theme overrides every light colour token', () => {
    assert.deepEqual(Object.keys(themes.dark).sort(), Object.keys(themes.light).sort());
  });

  it('the prefers-color-scheme fallback matches the explicit dark theme', () => {
    assert.deepEqual(block(/:root:not\(\[data-theme\]\)/), themes.dark);
  });
});
