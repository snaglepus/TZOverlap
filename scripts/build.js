// Production build: bundles and minifies JS/CSS from src/ into BUILD_OUT_DIR (default dist/).
// Output paths mirror src/; index.html, the manifest and icons are copied unchanged.
// The module entries build with code splitting, so the lazily imported city data
// stays in its own file (dist/data/cities.js) instead of being inlined into main.js.
// theme-init.js builds on its own without splitting: it is a classic script and
// must stay self-contained, with no import or export.
// Usage: node scripts/build.js [--out dist]

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { loadConfig } from '../config/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Entry points relative to src/, built with code splitting. Missing ones are skipped. */
export const ENTRY_POINTS = ['main.js', 'data/cities.js', 'styles/main.css'];

/** Classic-script entry points relative to src/, each built self-contained. Missing ones are skipped. */
export const CLASSIC_ENTRY_POINTS = ['theme-init.js'];

/** Files copied unchanged, relative to src/. Every file in src/icons/ is copied too. */
export const STATIC_FILES = ['index.html', 'manifest.webmanifest'];

/**
 * @param {{ srcDir?: string, outDir: string }} options
 * @returns {Promise<string[]>} files written, relative to outDir
 */
export async function build({ srcDir = path.join(ROOT, 'src'), outDir }) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  /** @param {string[]} list */
  const existing = (list) => list.map((p) => path.join(srcDir, p)).filter((p) => existsSync(p));
  /** @type {import('esbuild').BuildOptions} */
  const options = {
    outbase: srcDir,
    outdir: outDir,
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2022', 'chrome110', 'firefox115', 'safari16'],
    legalComments: 'none',
    metafile: true,
    logLevel: 'silent',
  };
  const results = [
    await esbuild.build({ ...options, entryPoints: existing(ENTRY_POINTS), splitting: true }),
  ];
  const classic = existing(CLASSIC_ENTRY_POINTS);
  if (classic.length > 0) results.push(await esbuild.build({ ...options, entryPoints: classic }));

  const icons = (await readdir(path.join(srcDir, 'icons'))).map((f) => `icons/${f}`);
  const copied = [...STATIC_FILES, ...icons];
  await mkdir(path.join(outDir, 'icons'), { recursive: true });
  for (const file of copied) await copyFile(path.join(srcDir, file), path.join(outDir, file));
  const written = results
    .flatMap((result) => Object.keys(result.metafile?.outputs ?? {}))
    .map((p) => path.relative(outDir, path.resolve(p)));
  return [...copied, ...written].sort();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const config = loadConfig({ argv: process.argv.slice(2), rootDir: ROOT });
    const files = await build({ outDir: config.buildOutDir });
    console.log(`Built ${files.length} files into ${path.relative(ROOT, config.buildOutDir)}/:`);
    for (const f of files) console.log(`  ${f}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
