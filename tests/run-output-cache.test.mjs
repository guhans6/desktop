import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { cleanupRunOutputCache, storeRunOutputs } from '../run-output-cache.mjs';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00]);

test('run-output-cache: stores sanitized exact-run artifacts with hashes and private permissions', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-run-cache-'));
  const stored = await storeRunOutputs({
    stateDir,
    runId: 'run_test-1234',
    captured: { items: [{ kind: 'image', name: '../bad:name.png', mime: 'image/png', dataBase64: png.toString('base64') }], warnings: [] }
  });
  assert.equal(stored.artifacts.length, 1);
  const artifact = stored.artifacts[0];
  assert.equal(artifact.name.includes('..'), false);
  assert.equal(artifact.name.includes(':'), false);
  assert.equal(artifact.sha256, crypto.createHash('sha256').update(png).digest('hex'));
  assert.equal(artifact.size, png.length);
  assert.equal(artifact.path.startsWith(path.join(stateDir, 'run-output-cache', 'run_test-1234')), true);
  assert.equal('source' in artifact, false);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(stored.dir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(artifact.path)).mode & 0o777, 0o600);
  }
});

test('run-output-cache: enforces server-side size and MIME limits and cleans expired run directories', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-run-cache-limits-'));
  const root = await cleanupRunOutputCache({ stateDir, now: 10_000, ttlMs: 1_000 });
  const oldDir = path.join(root, 'old-run-123');
  await fs.mkdir(oldDir, { recursive: true });
  await fs.utimes(oldDir, new Date(0), new Date(0));
  const result = await storeRunOutputs({
    stateDir,
    runId: 'run_limit-1234',
    now: 10_000,
    limits: { maxItems: 2, maxBytesPerItem: 16, maxAggregateBytes: 16, ttlMs: 1_000 },
    captured: {
      items: [
        { kind: 'file', name: 'error.html', mime: 'text/html', dataBase64: Buffer.from('<html>').toString('base64') },
        { kind: 'image', name: 'bad.png', mime: 'image/png', dataBase64: Buffer.from('not-png').toString('base64') },
        { kind: 'file', name: 'large.txt', mime: 'text/plain', dataBase64: Buffer.alloc(32, 1).toString('base64') }
      ],
      warnings: []
    }
  });
  assert.deepEqual(result.artifacts, []);
  assert.equal(result.warnings.includes('artifact_count_limit'), true);
  assert.equal(result.warnings.includes('artifact_mime_invalid'), true);
  await assert.rejects(() => fs.stat(oldDir), (error) => error?.code === 'ENOENT');
});
