// Zero-dependency static file server for development and previewing builds.
// Usage: node scripts/serve.js [--port 5173] [--host 127.0.0.1] [--dir src]

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.js';

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

// Mirrors the CSP meta tag in index.html: the app may only load its own files.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Resolve a URL path to a file inside root, or null if it escapes root.
 * @param {string} root
 * @param {string} urlPath
 */
export function resolveSafePath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const target = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/**
 * @param {{ root: string }} options
 * @returns {http.Server}
 */
export function createStaticServer({ root }) {
  const absRoot = path.resolve(root);
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let file = resolveSafePath(absRoot, req.url ?? '/');
    if (!file) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
      return;
    }
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = path.join(file, 'index.html');
        info = await stat(file);
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
}

/**
 * @param {{ port: number, host: string, root: string }} options
 * @returns {Promise<{ server: http.Server, url: string }>}
 */
export function startServer({ port, host, root }) {
  const server = createStaticServer({ root });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ server, url: `http://${host}:${actualPort}/` });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const config = loadConfig({ argv: process.argv.slice(2) });
    const { server, url } = await startServer({
      port: config.port,
      host: config.host,
      root: config.serveDir,
    });
    console.log(`TZ Overlap serving ${path.relative(process.cwd(), config.serveDir) || '.'} at ${url}`);
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
