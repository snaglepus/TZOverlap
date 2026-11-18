// Enforces DESIGN.md §2: raw colours, lengths and durations may only appear in
// src/styles/tokens.css. Everything else must use var(--token).
// Usage: node scripts/lint-tokens.js   (exits 1 on any problem; never writes)

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
export const TOKENS_FILE = path.join(SRC, 'styles', 'tokens.css');

const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const HEX = /#[0-9a-f]{3,8}\b/i;
const NAMED_COLOR =
  /\b(?:black|white|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|maroon|navy|teal|olive|lime|aqua|fuchsia|cyan|magenta|brown|gold|indigo|violet|crimson|coral|salmon|tomato|khaki|beige|ivory|lavender|turquoise|tan)\b/i;
const LENGTH =
  /(?<![\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ch|ex|vh|vw|dvh|svh|lvh|vmin|vmax|pt|pc|cm|mm|in|ms|s)\b/i;

/** @typedef {{ file: string, line: number, message: string }} Problem */

/**
 * @param {string} text
 * @param {number} index
 */
function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Replace comments with spaces (keeps line numbers). @param {string} css */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Breakpoints declared in tokens.css as --bp-*: e.g. ["40rem", "64rem"].
 * @param {string} tokensCss
 */
export function readBreakpoints(tokensCss) {
  return [...tokensCss.matchAll(/--bp-[\w-]+\s*:\s*([^;]+);/g)].map((m) =>
    /** @type {string} */ (m[1]).trim(),
  );
}

/**
 * @param {string} source
 * @param {string} file
 * @param {{ breakpoints: string[] }} options
 * @returns {Problem[]}
 */
export function lintCss(source, file, { breakpoints }) {
  /** @type {Problem[]} */
  const problems = [];
  const css = stripCssComments(source);

  for (const m of css.matchAll(/@media([^{]+)\{/g)) {
    for (const len of /** @type {string} */ (m[1]).match(new RegExp(LENGTH, 'gi')) ?? []) {
      if (!breakpoints.includes(len)) {
        problems.push({
          file,
          line: lineAt(css, m.index),
          message: `@media uses ${len}; allowed breakpoints are ${breakpoints.join(', ')}`,
        });
      }
    }
  }

  for (const m of css.matchAll(/([-\w]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const prop = /** @type {string} */ (m[1]);
    const value = /** @type {string} */ (m[2]);
    const line = lineAt(css, m.index);
    if (prop.startsWith('--')) {
      problems.push({ file, line, message: `define token ${prop} in tokens.css, not here` });
      continue;
    }
    const bare = value.replace(/var\([^)]*\)/g, '');
    for (const [re, what] of /** @type {const} */ ([
      [HEX, 'hex colour'],
      [COLOR_FN, 'colour function'],
      [NAMED_COLOR, 'named colour'],
      [LENGTH, 'raw length/duration'],
    ])) {
      const hit = bare.match(re);
      if (hit)
        problems.push({ file, line, message: `${what} "${hit[0]}" in ${prop}; use a token` });
    }
  }
  return problems;
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {Problem[]}
 */
export function lintJs(source, file) {
  /** @type {Problem[]} */
  const problems = [];
  const checks = /** @type {const} */ ([
    [/['"`][^'"`\n]*#[0-9a-f]{3,8}\b[^'"`\n]*['"`]/gi, 'hex colour in a string'],
    [/['"`][^'"`\n]*\b(?:rgba?|hsla?|oklch)\([^'"`\n]*['"`]/gi, 'colour function in a string'],
    [/['"`]-?(?:\d*\.)?\d+(?:px|rem|em|vh|vw|ms)['"`]/gi, 'raw size in a string'],
    [/\.style\.(?!setProperty\(\s*['"`]--)/g, 'inline style; use a class'],
    [/\bstyle\s*:/g, 'inline style attribute; use a class'],
    [/setAttribute\(\s*['"`]style['"`]/g, 'inline style attribute; use a class'],
  ]);
  for (const [re, message] of checks) {
    for (const m of source.matchAll(re))
      problems.push({ file, line: lineAt(source, m.index), message });
  }
  return problems;
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {Problem[]}
 */
export function lintHtml(source, file) {
  /** @type {Problem[]} */
  const problems = [];
  for (const m of source.matchAll(/<style\b|\sstyle\s*=/gi)) {
    problems.push({
      file,
      line: lineAt(source, m.index),
      message: 'inline styles; use tokens + classes',
    });
  }
  return problems;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** @returns {Problem[]} */
export function lintTree(srcDir = SRC, tokensFile = TOKENS_FILE) {
  const breakpoints = readBreakpoints(readFileSync(tokensFile, 'utf8'));
  return walk(srcDir).flatMap((file) => {
    if (file === tokensFile) return [];
    const rel = path.relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.css')) return lintCss(text, rel, { breakpoints });
    if (file.endsWith('.js')) return lintJs(text, rel);
    if (file.endsWith('.html')) return lintHtml(text, rel);
    return [];
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const problems = lintTree();
  for (const p of problems) console.error(`${p.file}:${p.line}  ${p.message}`);
  if (problems.length) {
    console.error(`\n✖ ${problems.length} design-token problem(s). See DESIGN.md §2.`);
    process.exit(1);
  }
  console.log('✔ design tokens: no hard-coded colours, sizes or durations outside tokens.css');
}
