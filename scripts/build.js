// Production build: bundles and minifies JS/CSS from src/ into BUILD_OUT_DIR (default dist/).
// Output paths mirror src/; index.html, the manifest and icons are copied unchanged.
// The module entries build with code splitting, so the lazily imported city data
// stays in its own file (dist/data/cities.js) instead of being inlined into main.js.
// theme-init.js builds on its own without splitting: it is a classic script and
// must stay self-contained, with no import or export.
// The service worker (sw.js) builds last, as a self-contained classic script:
// its pre-cache list is every other written file and its cache name is a hash of
// those files and the worker source, both generated here into sw-manifest.js.
// The page's build-env.js is replaced so main.js registers ./sw.js.
// Usage: node scripts/build.js [--out dist]

import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
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

/** The service worker entry, relative to src/. Built last, from the rest of the output. */
export const SERVICE_WORKER = 'sw.js';

/** Prefix of every cache the service worker owns. */
export const CACHE_PREFIX = 'tzoverlap-';

/**
 * esbuild plugin: replaces one source module with generated code.
 * @param {string} file absolute path of the module to replace
 * @param {string} contents
 * @returns {import('esbuild').Plugin}
 */
function replaceModule(file, contents) {
  const target = realpathSync(file);
  return {
    name: `replace-${path.basename(file)}`,
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /\.js$/ }, (args) =>
        realpathSync(args.path) === target ? { contents, loader: 'js' } : undefined,
      );
    },
  };
}

/**
 * Cache name and pre-cache list for the files written so far.
 * @param {string} outDir
 * @param {string[]} files written files, relative to outDir
 * @param {string} workerSource text of src/sw.js
 */
async function serviceWorkerManifest(outDir, files, workerSource) {
  const urls = files.map((f) => `./${f.split(path.sep).join('/')}`).sort();
  const hash = createHash('sha256');
  for (const url of urls) {
    hash.update(`${url}\0`);
    hash.update(await readFile(path.join(outDir, url)));
    hash.update('\0');
  }
  hash.update(workerSource);
  return { cacheName: `${CACHE_PREFIX}${hash.digest('hex').slice(0, 12)}`, urls };
}

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
  const buildEnv = replaceModule(
    path.join(srcDir, 'build-env.js'),
    `export const SERVICE_WORKER_URL = ${JSON.stringify(`./${SERVICE_WORKER}`)};`,
  );
  const results = [
    await esbuild.build({
      ...options,
      entryPoints: existing(ENTRY_POINTS),
      splitting: true,
      plugins: [buildEnv],
    }),
  ];
  const classic = existing(CLASSIC_ENTRY_POINTS);
  if (classic.length > 0) results.push(await esbuild.build({ ...options, entryPoints: classic }));

  const icons = (await readdir(path.join(srcDir, 'icons'))).map((f) => `icons/${f}`);
  const copied = [...STATIC_FILES, ...icons];
  await mkdir(path.join(outDir, 'icons'), { recursive: true });
  for (const file of copied) await copyFile(path.join(srcDir, file), path.join(outDir, file));
  /** @param {esbuild.BuildResult[]} list */
  const outputs = (list) =>
    list
      .flatMap((result) => Object.keys(result.metafile?.outputs ?? {}))
      .map((p) => path.relative(outDir, path.resolve(p)));
  const files = [...copied, ...outputs(results)].sort();

  const workerFile = path.join(srcDir, SERVICE_WORKER);
  const { cacheName, urls } = await serviceWorkerManifest(
    outDir,
    files,
    await readFile(workerFile, 'utf8'),
  );
  const swManifest = replaceModule(
    path.join(srcDir, 'sw-manifest.js'),
    `export const CACHE_NAME = ${JSON.stringify(cacheName)};\nexport const PRECACHE_URLS = ${JSON.stringify(urls)};\n`,
  );
  const worker = await esbuild.build({
    ...options,
    entryPoints: [workerFile],
    format: 'iife',
    plugins: [swManifest],
  });
  return [...files, ...outputs([worker])].sort();
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
