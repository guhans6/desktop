import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const RUN_OUTPUT_LIMITS = Object.freeze({
  maxItems: 8,
  maxBytesPerItem: 8 * 1024 * 1024,
  maxAggregateBytes: 20 * 1024 * 1024,
  ttlMs: 24 * 60 * 60 * 1000
});

function safeRunId(runId) {
  const value = String(runId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new Error('invalid_run_cache_id');
  return value;
}

function normalizeMime(value) {
  return String(value || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
}

function extensionForMime(mime) {
  const map = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
    'application/pdf': '.pdf', 'application/zip': '.zip', 'application/json': '.json', 'text/csv': '.csv',
    'text/plain': '.txt', 'text/markdown': '.md'
  };
  return map[mime] || '.bin';
}

function sanitizeName(value, { index, mime } = {}) {
  let name = path.basename(String(value || '').trim())
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  if (!name) name = `artifact-${String(index + 1).padStart(2, '0')}${extensionForMime(mime)}`;
  if (!path.extname(name)) name += extensionForMime(mime);
  return name;
}

function sniffMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03,0x05,0x07].includes(buffer[2]) && [0x04,0x06,0x08].includes(buffer[3])) return 'application/zip';
  return null;
}

function mimeLooksValid({ mime, kind, buffer }) {
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return false;
  if (kind === 'image' && !mime.startsWith('image/')) return false;
  const sniffed = sniffMime(buffer);
  const strict = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/zip']);
  if (strict.has(mime) && sniffed !== mime) return false;
  return true;
}

async function ensurePrivateDir(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.chmod(dir, 0o700).catch(() => {});
}

export async function cleanupRunOutputCache({ stateDir, now = Date.now(), ttlMs = RUN_OUTPUT_LIMITS.ttlMs } = {}) {
  const root = path.join(path.resolve(String(stateDir || '.')), 'run-output-cache');
  await ensurePrivateDir(root);
  const cutoff = Number(now) - Math.max(1, Number(ttlMs) || RUN_OUTPUT_LIMITS.ttlMs);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    const stat = await fs.lstat(target).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) continue;
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
  }
  return root;
}

async function writeUnique(runDir, baseName, buffer) {
  const parsed = path.parse(baseName);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const name = suffix === 0 ? baseName : `${parsed.name}-${suffix}${parsed.ext}`;
    const filePath = path.join(runDir, name);
    let handle = null;
    try {
      handle = await fs.open(filePath, 'wx', 0o600);
      await handle.writeFile(buffer);
      await handle.close();
      if (process.platform !== 'win32') await fs.chmod(filePath, 0o600).catch(() => {});
      return { name, filePath };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('artifact_name_collision_limit');
}

export async function storeRunOutputs({
  stateDir,
  runId,
  captured,
  now = Date.now(),
  limits = RUN_OUTPUT_LIMITS
} = {}) {
  const id = safeRunId(runId);
  const maxItems = Math.max(1, Math.min(RUN_OUTPUT_LIMITS.maxItems, Number(limits?.maxItems) || RUN_OUTPUT_LIMITS.maxItems));
  const maxBytesPerItem = Math.max(1, Math.min(RUN_OUTPUT_LIMITS.maxBytesPerItem, Number(limits?.maxBytesPerItem) || RUN_OUTPUT_LIMITS.maxBytesPerItem));
  const maxAggregateBytes = Math.max(maxBytesPerItem, Math.min(RUN_OUTPUT_LIMITS.maxAggregateBytes, Number(limits?.maxAggregateBytes) || RUN_OUTPUT_LIMITS.maxAggregateBytes));
  const root = await cleanupRunOutputCache({ stateDir, now, ttlMs: limits?.ttlMs || RUN_OUTPUT_LIMITS.ttlMs });
  const runDir = path.join(root, id);
  await ensurePrivateDir(runDir);
  const warnings = new Set(Array.isArray(captured?.warnings) ? captured.warnings.map(String) : []);
  const candidates = Array.isArray(captured?.items) ? captured.items : [];
  if (candidates.length > maxItems) warnings.add('artifact_count_limit');
  const artifacts = [];
  let aggregateBytes = 0;

  for (let index = 0; index < candidates.length && artifacts.length < maxItems; index += 1) {
    const item = candidates[index] || {};
    const raw = String(item.dataBase64 || '');
    if (!raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
      warnings.add('artifact_invalid_base64');
      continue;
    }
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length <= 0) continue;
    if (buffer.length > maxBytesPerItem) {
      warnings.add('artifact_per_file_limit');
      continue;
    }
    if (aggregateBytes + buffer.length > maxAggregateBytes) {
      warnings.add('artifact_aggregate_limit');
      break;
    }
    const mime = normalizeMime(item.mime);
    const kind = item.kind === 'image' ? 'image' : 'file';
    if (!mimeLooksValid({ mime, kind, buffer })) {
      warnings.add('artifact_mime_invalid');
      continue;
    }
    const baseName = sanitizeName(item.name, { index, mime });
    const { name, filePath } = await writeUnique(runDir, baseName, buffer);
    aggregateBytes += buffer.length;
    artifacts.push({
      kind,
      name,
      path: filePath,
      mime,
      size: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    });
  }
  return { artifacts, warnings: [...warnings], dir: runDir };
}
