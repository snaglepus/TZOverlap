import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig, parseEnvFile, parseFlags } from '../../config/env.js';

describe('parseEnvFile', () => {
  it('reads keys, ignores comments, strips quotes and inline comments', () => {
    const vars = parseEnvFile('# c\nPORT=8080\nexport HOST="0.0.0.0"\nSERVE_DIR=dist # preview\n\nbad line\n');
    assert.deepEqual(vars, { PORT: '8080', HOST: '0.0.0.0', SERVE_DIR: 'dist' });
  });
});

describe('parseFlags', () => {
  it('supports both --k v and --k=v', () => {
    assert.deepEqual(parseFlags(['--port', '9000', '--host=::1']), { port: '9000', host: '::1' });
  });

  it('rejects a flag with no value', () => {
    assert.throws(() => parseFlags(['--port']), /needs a value/);
  });
});

describe('loadConfig', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'tzo-config-'));
  writeFileSync(path.join(rootDir, '.env'), 'PORT=7000\nHOST=0.0.0.0\n');

  it('applies flag > env > .env > default precedence', () => {
    assert.equal(loadConfig({ rootDir, env: {} }).port, 7000);
    assert.equal(loadConfig({ rootDir, env: { PORT: '7100' } }).port, 7100);
    assert.equal(loadConfig({ rootDir, env: { PORT: '7100' }, argv: ['--port', '7200'] }).port, 7200);
    assert.equal(loadConfig({ rootDir, env: {} }).host, '0.0.0.0');
    assert.equal(loadConfig({ rootDir, env: {} }).serveDir, path.join(rootDir, 'src'));
  });

  it('rejects invalid ports', () => {
    assert.throws(() => loadConfig({ rootDir, env: { PORT: '70000' } }), /Invalid port/);
    assert.throws(() => loadConfig({ rootDir, env: { PORT: 'http' } }), /Invalid port/);
  });
});
