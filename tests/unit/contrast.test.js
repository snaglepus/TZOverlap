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

/**
 * HSL hue in degrees and HSL saturation (0-1).
 * @param {string} hex
 */
function hsl(hex) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  return { hue: (hue * 60 + 360) % 360, saturation };
}

/**
 * OKLCH chroma of an sRGB hex colour (Björn Ottosson's OKLab matrices).
 * @param {string} hex
 */
function chroma(hex) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
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
  ['--color-danger', '--color-surface-sunken', 3],
  ['--color-border-strong', '--color-surface', 3],
  // The pressed Button's border in the title bar, against the page.
  ['--color-border-strong', '--color-bg', 3],
  ['--color-focus', '--color-bg', 3],
  ['--color-focus', '--color-surface', 3],
  ['--color-focus', '--color-surface-sunken', 3],
  // Text on Best cells, and the inner edge on Everyone Best segments (needs 3:1).
  ['--color-best-ink', '--color-best', 4.5],
  // Best stays distinct from the strongest Good step.
  ['--color-best', '--color-heat-near', 1.2],
  // Good: text on the near, mid and far steps and on the hatch.
  ['--color-heat-ink', '--color-heat-near', 4.5],
  ['--color-heat-ink', '--color-heat-far', 4.5],
  ['--color-heat-ink', '--color-heat-mid', 4.5],
  ['--color-heat-ink', '--color-heat-hatch', 4.5],
  ['--color-unsuitable-ink', '--color-unsuitable', 4.5],
  // Text on weekend Unsuitable cells, and the weekend band on every cell background (3:1).
  ['--color-unsuitable-ink', '--color-weekend', 4.5],
  ['--color-weekend-band', '--color-best', 3],
  ['--color-weekend-band', '--color-heat-near', 3],
  ['--color-weekend-band', '--color-heat-mid', 3],
  ['--color-weekend-band', '--color-heat-far', 3],
  ['--color-weekend-band', '--color-unsuitable', 3],
  ['--color-weekend-band', '--color-weekend', 3],
  // The now line (accent) against every fill it crosses.
  ['--color-accent', '--color-best', 3],
  ['--color-accent', '--color-heat-near', 3],
  ['--color-accent', '--color-heat-mid', 3],
  ['--color-accent', '--color-heat-far', 3],
  ['--color-accent', '--color-unsuitable', 3],
  ['--color-accent', '--color-surface-sunken', 3],
  ['--color-accent', '--color-weekend', 3],
  // Hour labels over the filter's masks (fill and cross-hatch), and the now line above them.
  ['--color-best-ink', '--color-filtered', 4.5],
  ['--color-best-ink', '--color-filtered-pattern', 4.5],
  ['--color-heat-ink', '--color-filtered', 4.5],
  ['--color-heat-ink', '--color-filtered-pattern', 4.5],
  ['--color-unsuitable-ink', '--color-filtered', 4.5],
  ['--color-unsuitable-ink', '--color-filtered-pattern', 4.5],
  ['--color-accent', '--color-filtered', 3],
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

    // The Good hatch: visible on every step, but quieter than the old 1.71:1.
    for (const step of ['--color-heat-near', '--color-heat-mid', '--color-heat-far']) {
      it(`--color-heat-hatch on ${step} is between 1.15:1 and 1.55:1`, () => {
        const ratio = contrast(vars['--color-heat-hatch'] ?? '', vars[step] ?? '');
        assert.ok(ratio >= 1.15 && ratio <= 1.55, `${ratio.toFixed(2)}:1 is out of range`);
      });
    }

    // Red and orange are kept for errors: no heat colour has a hue in 0-60°.
    for (const token of [
      '--color-best',
      '--color-heat-near',
      '--color-heat-mid',
      '--color-heat-far',
      '--color-heat-hatch',
      '--color-heat-ink',
    ]) {
      it(`${token} has no red or orange hue`, () => {
        const hex = vars[token];
        assert.ok(hex, `missing ${token} in ${name} theme`);
        const { hue, saturation } = hsl(hex);
        assert.ok(saturation < 0.1 || hue > 60, `hue ${hue.toFixed(0)}° is in 0-60°`);
      });
    }

    // Loudness follows usefulness: Best > Good near > mid > far >= Unsuitable.
    it('OKLCH chroma falls from Best through the Good steps to Unsuitable', () => {
      const [best = 0, near = 0, mid = 0, far = 0, unsuitable = 0] = [
        '--color-best',
        '--color-heat-near',
        '--color-heat-mid',
        '--color-heat-far',
        '--color-unsuitable',
      ].map((token) => chroma(vars[token] ?? ''));
      assert.ok(
        best > near && near > mid && mid > far && far >= unsuitable,
        `chroma ${[best, near, mid, far, unsuitable].map((c) => c.toFixed(4)).join(', ')}`,
      );
    });
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
