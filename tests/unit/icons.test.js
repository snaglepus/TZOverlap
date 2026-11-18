// The committed app icons match scripts/make-icons.js and the accent tokens, maskable
// marks stay in the safe zone, and theme colours match --color-bg in both themes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { crc32, inflateSync } from 'node:zlib';
import { encodePng, makeIcons } from '../../scripts/make-icons.js';

const SRC = new URL('../../src/', import.meta.url);
const css = readFileSync(new URL('styles/tokens.css', SRC), 'utf8');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A hex colour token from the first block whose selector matches `selector`.
 * @param {RegExp} selector
 * @param {string} name
 */
function token(selector, name) {
  const match = new RegExp(selector.source + String.raw`\s*\{([^}]*)\}`).exec(css);
  const value = new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(match?.[1] ?? '');
  assert.ok(value, `no ${name} for ${selector}`);
  return /** @type {string} */ (value[1]).toLowerCase();
}

/**
 * Chunks of a PNG, checking each CRC.
 * @param {Buffer} png
 * @returns {{ type: string, data: Buffer }[]}
 */
function chunks(png) {
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  const out = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    assert.equal(png.readUInt32BE(at + 8 + length), crc32(png.subarray(at + 4, at + 8 + length)));
    out.push({ type, data });
    at += 12 + length;
  }
  return out;
}

/** @param {Buffer} rgb */
function hexes(rgb) {
  const out = [];
  for (let i = 0; i < rgb.length; i += 3) {
    out.push('#' + rgb.subarray(i, i + 3).toString('hex'));
  }
  return out;
}

const icons = makeIcons(css);

describe('app icons', () => {
  it('describes the five icons', () => {
    assert.deepEqual(
      icons.map(({ file, size }) => [file, size]),
      [
        ['icons/icon-192.png', 192],
        ['icons/icon-512.png', 512],
        ['icons/icon-maskable-192.png', 192],
        ['icons/icon-maskable-512.png', 512],
        ['icons/apple-touch-icon.png', 180],
      ],
    );
  });

  for (const icon of icons) {
    it(`${icon.file} matches the generator and the accent tokens`, () => {
      const parsed = chunks(readFileSync(new URL(icon.file, SRC)));
      assert.deepEqual(
        parsed.map((c) => c.type),
        ['IHDR', 'PLTE', 'IDAT', 'IEND'],
      );
      const ihdr = /** @type {Buffer} */ (parsed[0]?.data);
      assert.equal(ihdr.readUInt32BE(0), icon.size);
      assert.equal(ihdr.readUInt32BE(4), icon.size);
      assert.equal(ihdr[8], 8, 'bit depth');
      assert.equal(ihdr[9], 3, 'colour type: indexed');
      assert.deepEqual(hexes(/** @type {Buffer} */ (parsed[1]?.data)), [
        icon.colours.background,
        icon.colours.mark,
      ]);
      assert.ok(inflateSync(/** @type {Buffer} */ (parsed[2]?.data)).equals(icon.scanlines));
    });
  }

  it('uses --color-accent for the background and --color-on-accent for the mark', () => {
    for (const { colours } of icons) {
      assert.deepEqual(colours, {
        background: token(/:root/, '--color-accent'),
        mark: token(/:root/, '--color-on-accent'),
      });
    }
  });

  for (const icon of icons.filter((i) => i.maskable)) {
    it(`${icon.file} keeps every mark pixel within the maskable safe zone`, () => {
      const { size, scanlines } = icon;
      let marks = 0;
      for (let y = 0; y < size; y++) {
        assert.equal(scanlines[y * (size + 1)], 0, 'filter byte');
        for (let x = 0; x < size; x++) {
          if (scanlines[y * (size + 1) + 1 + x] !== 1) continue;
          marks++;
          const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
          assert.ok(r <= 0.4 * size, `mark pixel (${x}, ${y}) is ${r} from centre`);
        }
      }
      assert.ok(marks > 0);
    });
  }

  it('encodes a valid PNG that round-trips', () => {
    const scanlines = Buffer.from([0, 0, 1, 0, 1, 0]);
    const png = encodePng({ size: 2, palette: ['#000000', '#ffffff'], scanlines });
    const parsed = chunks(png);
    assert.deepEqual(
      parsed.map((c) => c.type),
      ['IHDR', 'PLTE', 'IDAT', 'IEND'],
    );
    assert.deepEqual(hexes(/** @type {Buffer} */ (parsed[1]?.data)), ['#000000', '#ffffff']);
    assert.ok(inflateSync(/** @type {Buffer} */ (parsed[2]?.data)).equals(scanlines));
  });
});

describe('theme colours', () => {
  const light = token(/:root/, '--color-bg');
  const dark = token(/:root\[data-theme='dark'\]/, '--color-bg');

  it('manifest theme_color and background_color are the light --color-bg', () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', SRC), 'utf8'));
    assert.equal(manifest.theme_color, light);
    assert.equal(manifest.background_color, light);
  });

  it('theme-color metas are the light and dark --color-bg', () => {
    const html = readFileSync(new URL('index.html', SRC), 'utf8');
    /** @param {string} scheme */
    const meta = (scheme) =>
      new RegExp(
        `<meta name="theme-color" media="\\(prefers-color-scheme: ${scheme}\\)" content="([^"]+)"`,
      ).exec(html)?.[1];
    assert.equal(meta('light'), light);
    assert.equal(meta('dark'), dark);
  });
});
