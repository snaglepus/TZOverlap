import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lintCss, lintHtml, lintJs, lintTree, readBreakpoints } from '../../scripts/lint-tokens.js';

const opts = { breakpoints: ['40rem', '64rem'] };

describe('lintCss', () => {
  it('accepts token-only CSS', () => {
    const css = `.a { color: var(--color-text); padding: var(--space-2) var(--space-4);
      margin: calc(var(--hairline) * -1); flex: 1; width: 100%; z-index: 1; }
      @media (min-width: 40rem) { .a { gap: var(--space-1); } }`;
    assert.deepEqual(lintCss(css, 'x.css', opts), []);
  });

  it('flags raw colours, lengths and durations', () => {
    const css = `.a { color: #fff; background: rgb(0 0 0); border-color: red;
      padding: 12px; transition: opacity 200ms; margin: -0.5rem; }`;
    const messages = lintCss(css, 'x.css', opts).map((p) => p.message);
    assert.equal(messages.length, 6, messages.join('\n'));
    assert.ok(messages.some((m) => m.includes('hex colour "#fff"')));
    assert.ok(messages.some((m) => m.includes('"12px"')));
    assert.ok(messages.some((m) => m.includes('"200ms"')));
  });

  it('flags undocumented breakpoints and token definitions outside tokens.css', () => {
    const css = `@media (min-width: 37rem) { .a { color: var(--x); } }\n.b { --rogue: 4px; }`;
    const problems = lintCss(css, 'x.css', opts);
    assert.equal(problems.length, 2);
    assert.match(problems[0]?.message ?? '', /37rem/);
    assert.equal(problems[1]?.line, 2);
  });

  it('ignores comments and id selectors that look like hex', () => {
    assert.deepEqual(lintCss('/* #fff 10px */ #add { color: var(--c); }', 'x.css', opts), []);
  });
});

describe('lintJs / lintHtml', () => {
  it('flags inline styles and colour literals but allows custom properties', () => {
    const js = `el.style.color = 'x'; const c = "#ff0000"; const w = '12px';
      el.style.setProperty('--slot-count', String(n));`;
    assert.equal(lintJs(js, 'a.js').length, 3);
  });

  it('flags style attributes and <style> blocks in HTML', () => {
    assert.equal(lintHtml('<div style="color:red"></div><style>a{}</style>', 'a.html').length, 2);
  });
});

describe('repository', () => {
  it('reads breakpoints from tokens.css', () => {
    assert.deepEqual(readBreakpoints(':root { --bp-md: 40rem; --bp-lg: 64rem; }'), [
      '40rem',
      '64rem',
    ]);
  });

  it('src/ has no design-token violations', () => {
    assert.deepEqual(lintTree(), []);
  });
});
