// Production build: bundles and minifies JS/CSS from src/ into BUILD_OUT_DIR (default dist/).
// Output paths mirror src/; index.html, the manifest and icons are copied unchanged.
// Usage: node scripts/build.js [--out dist]

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { loadConfig } from '../config/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Entry points relative to src/. Missing ones are skipped. */
export const ENTRY_POINTS = ['main.js', 'theme-init.js', 'styles/main.css'];

/** Files copied unchanged, relative to src/. Every file in src/icons/ is copied too. */
export const STATIC_FILES = ['index.html', 'manifest.webmanifest'];

/**
 * @param {{ srcDir?: string, outDir: string }} options
 * @returns {Promise<string[]>} files written, relative to outDir
 */
export async function build({ srcDir = path.join(ROOT, 'src'), outDir }) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const entries = ENTRY_POINTS.map((p) => path.join(srcDir, p)).filter((p) => existsSync(p));
  const result = await esbuild.build({
    entryPoints: entries,
    outbase: srcDir,
    outdir: outDir,
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2022', 'chrome110', 'firefox115', 'safari16'],
    legalComments: 'none',
    metafile: true,
    logLevel: 'silent',
  });

  const icons = (await readdir(path.join(srcDir, 'icons'))).map((f) => `icons/${f}`);
  const copied = [...STATIC_FILES, ...icons];
  await mkdir(path.join(outDir, 'icons'), { recursive: true });
  for (const file of copied) await copyFile(path.join(srcDir, file), path.join(outDir, file));
  const written = Object.keys(result.metafile.outputs).map((p) =>
    path.relative(outDir, path.resolve(p)),
  );
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
