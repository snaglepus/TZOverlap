// Generates the app/home-screen PNG icons in src/icons/ from the light accent tokens.
// Two overlapping rings (overlapping time zones) in --color-on-accent on --color-accent.
// Run by hand after changing those tokens: node scripts/make-icons.js (never run by checks or build)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/**
 * @typedef {{
 *   file: string,
 *   size: number,
 *   maskable: boolean,
 *   colours: { background: string, mark: string },
 *   scanlines: Buffer,
 * }} Icon
 * `file` is relative to src/. `scanlines` holds, per row, filter byte 0 then one
 * palette index per pixel (0 = background, 1 = mark), before compression.
 */

/** Ring geometry as fractions of the icon size. Maskable keeps the mark inside radius 0.4. */
const GEOMETRY = {
  any: { offset: 0.13, radius: 0.23, stroke: 0.07 },
  maskable: { offset: 0.11, radius: 0.2, stroke: 0.06 },
};

const ICONS = /** @type {const} */ ([
  { file: 'icons/icon-192.png', size: 192, maskable: false },
  { file: 'icons/icon-512.png', size: 512, maskable: false },
  { file: 'icons/icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icons/icon-maskable-512.png', size: 512, maskable: true },
  { file: 'icons/apple-touch-icon.png', size: 180, maskable: false },
]);

/**
 * A hex colour token from the first `:root {` block.
 * @param {string} css
 * @param {string} name
 */
function lightToken(css, name) {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('tokens.css has no :root block');
  const value = new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(root[1] ?? '');
  if (!value) throw new Error(`tokens.css :root has no hex ${name}`);
  return /** @type {string} */ (value[1]).toLowerCase();
}

/**
 * @param {number} size
 * @param {{ offset: number, radius: number, stroke: number }} geometry
 */
function rings(size, { offset, radius, stroke }) {
  const c = size / 2;
  const [d, r, half] = [offset * size, radius * size, (stroke * size) / 2];
  const rowBytes = size + 1;
  const out = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [px, py] = [x + 0.5 - c, y + 0.5 - c];
      const onRing = [-d, d].some((cx) => Math.abs(Math.hypot(px - cx, py) - r) <= half);
      if (onRing) out[y * rowBytes + 1 + x] = 1;
    }
  }
  return out;
}

/**
 * The five icons, described but not written.
 * @param {string} tokensCss contents of src/styles/tokens.css
 * @returns {Icon[]}
 */
export function makeIcons(tokensCss) {
  const colours = {
    background: lightToken(tokensCss, '--color-accent'),
    mark: lightToken(tokensCss, '--color-on-accent'),
  };
  return ICONS.map(({ file, size, maskable }) => ({
    file,
    size,
    maskable,
    colours,
    scanlines: rings(size, maskable ? GEOMETRY.maskable : GEOMETRY.any),
  }));
}

/**
 * @param {string} type
 * @param {Buffer} data
 */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Square 8-bit indexed-colour PNG (colour type 3) with one IDAT.
 * @param {{ size: number, palette: string[], scanlines: Buffer }} image
 * @returns {Buffer}
 */
export function encodePng({ size, palette, scanlines }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const plte = Buffer.from(
    palette.flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const icons = makeIcons(readFileSync(path.join(SRC, 'styles', 'tokens.css'), 'utf8'));
  mkdirSync(path.join(SRC, 'icons'), { recursive: true });
  for (const { file, size, colours, scanlines } of icons) {
    const png = encodePng({ size, palette: [colours.background, colours.mark], scanlines });
    writeFileSync(path.join(SRC, file), png);
    console.log(`  src/${file} (${png.length} B)`);
  }
}
