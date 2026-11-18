// Node-side configuration for the dev server and build.
// Precedence (highest first): CLI flags > process environment > .env file > defaults.
// The browser app itself has no runtime config: it is static files only.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ port: number, host: string, serveDir: string, buildOutDir: string, rootDir: string }} Config */

export const DEFAULTS = Object.freeze({
  PORT: '5173',
  HOST: '127.0.0.1',
  SERVE_DIR: 'src',
  BUILD_OUT_DIR: 'dist',
});

/**
 * Parse a dotenv-style file. Supports comments, blank lines, `export ` prefixes
 * and single/double-quoted values. No variable expansion.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = /** @type {string} */ (match[1]);
    let value = /** @type {string} */ (match[2]).trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) {
      value = /** @type {string} */ (quoted[2]);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Parse `--key value` and `--key=value` flags.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseFlags(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = /** @type {string} */ (argv[i]);
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Flag ${arg} needs a value`);
      }
      flags[arg.slice(2)] = next;
      i += 1;
    }
  }
  return flags;
}

/**
 * @param {string} value
 * @returns {number}
 */
export function parsePort(value) {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid port "${value}": expected an integer 0-65535`);
  const port = Number(value);
  if (port > 65535) throw new Error(`Invalid port "${value}": expected an integer 0-65535`);
  return port;
}

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, rootDir?: string }} [options]
 * @returns {Config}
 */
export function loadConfig({ argv = [], env = process.env, rootDir = process.cwd() } = {}) {
  const envFile = path.join(rootDir, '.env');
  const fileVars = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, 'utf8')) : {};
  const flags = parseFlags(argv);

  /** @param {keyof typeof DEFAULTS} key @param {string} flag */
  const pick = (key, flag) => flags[flag] ?? env[key] ?? fileVars[key] ?? DEFAULTS[key];

  return {
    port: parsePort(pick('PORT', 'port')),
    host: pick('HOST', 'host'),
    serveDir: path.resolve(rootDir, pick('SERVE_DIR', 'dir')),
    buildOutDir: path.resolve(rootDir, pick('BUILD_OUT_DIR', 'out')),
    rootDir,
  };
}
