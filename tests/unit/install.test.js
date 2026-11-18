import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installGuidance } from '../../src/lib/install.js';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

/**
 * @param {string} userAgent
 * @param {Partial<Parameters<typeof installGuidance>[0]>} [rest]
 */
const env = (userAgent, rest = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  displayModeStandalone: false,
  navigatorStandalone: false,
  ...rest,
});

/** @type {[string, ReturnType<typeof env>, string][]} */
const CASES = [
  ['iPhone Safari', env(UA.iphone, { maxTouchPoints: 5 }), 'ios'],
  ['iPad desktop-class UA with touch', env(UA.ipadDesktop, { maxTouchPoints: 5 }), 'ios'],
  ['Android Chrome', env(UA.android, { maxTouchPoints: 5 }), 'android'],
  ['desktop Chrome on Windows', env(UA.windowsChrome), 'desktop'],
  ['macOS Safari', env(UA.macSafari, { maxTouchPoints: 0 }), 'mac-safari'],
];

describe('installGuidance', () => {
  for (const [name, input, expected] of CASES) {
    it(`gives ${expected} for ${name}`, () => {
      assert.equal(installGuidance(input), expected);
    });
  }

  it('gives other for desktop Firefox', () => {
    assert.equal(installGuidance(env(UA.firefox)), 'other');
  });

  it('gives other for Firefox on a Mac', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0';
    assert.equal(installGuidance(env(ua)), 'other');
  });

  it('gives desktop for Chrome and Edge on a Mac', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    assert.equal(installGuidance(env(chrome)), 'desktop');
    assert.equal(installGuidance(env(`${chrome} Edg/126.0.0.0`)), 'desktop');
  });

  it('gives ios for an iPod', () => {
    assert.equal(installGuidance(env(UA.iphone.replace('iPhone', 'iPod'))), 'ios');
  });

  it('gives none when display-mode is standalone', () => {
    for (const [name, input] of CASES) {
      assert.equal(installGuidance({ ...input, displayModeStandalone: true }), 'none', name);
    }
  });

  it('gives none when navigator.standalone is true', () => {
    for (const [name, input] of CASES) {
      assert.equal(installGuidance({ ...input, navigatorStandalone: true }), 'none', name);
    }
  });
});
