import test from 'node:test';
import assert from 'node:assert/strict';

import { startHttpApi } from '../http-api.mjs';

async function req({ port, token = 'secret', method, pth, body }) {
  const res = await fetch(`http://127.0.0.1:${port}${pth}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function eventually(check, { timeoutMs = 1_500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('eventually_timeout');
}

function settings() {
  return { maxInflightQueries: 4, maxQueriesPerMinute: 100, minTabGapMs: 0, minGlobalGapMs: 0, showTabsByDefault: false };
}

test('run-http-api: delegate returns runId and run status/result follow ChatGPT progress', async (t) => {
  let release = null;
  let ensured = null;
  const controller = {
    runExclusive: async (fn) => await fn(),
    query: async ({ onProgress }) => {
      await onProgress?.({ phase: 'typing_prompt', blocked: false, blockedKind: null });
      await onProgress?.({ phase: 'awaiting_user', blocked: true, blockedKind: 'login', blockedTitle: 'Needs sign-in' });
      await new Promise((resolve) => { release = resolve; });
      await onProgress?.({ phase: 'waiting_for_response', blocked: false, blockedKind: null, blockedTitle: null });
      return { text: 'final answer', codeBlocks: [], meta: { count: 1 } };
    },
    requestStop: async () => ({ ok: true, requested: true, clicked: true })
  };
  const tabs = {
    listTabs: () => [{ id: 't-repo', key: 'repo', vendorId: 'chatgpt', vendorName: 'ChatGPT', url: 'https://chatgpt.com/' }],
    ensureTab: async (args) => { ensured = args; return 't-repo'; },
    createTab: async () => 't-repo',
    closeTab: async () => true,
    getControllerById: () => controller
  };
  const server = await startHttpApi({
    port: 0,
    token: 'secret',
    tabs,
    defaultTabId: 't-repo',
    vendors: [{ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }],
    serverId: 'sid-test',
    stateDir: '/tmp',
    getSettings: async () => settings(),
    getStatus: async () => ({ ok: true })
  });
  t.after(() => server.close());
  const port = server.address().port;

  const delegated = await req({
    port,
    method: 'POST',
    pth: '/runs/delegate',
    body: { provider: 'chatgpt', key: 'repo', prompt: 'do the work' }
  });
  assert.equal(delegated.res.status, 200);
  assert.equal(typeof delegated.data.runId, 'string');
  assert.equal(delegated.data.key, 'repo');
  assert.equal(delegated.data.state, 'queued');

  const runId = delegated.data.runId;
  const login = await eventually(async () => {
    const status = await req({ port, method: 'GET', pth: `/runs/status?runId=${encodeURIComponent(runId)}` });
    return status.data.state === 'needs_login' ? status : null;
  });
  assert.equal(login.res.status, 200);
  if (ensured) {
    assert.equal(ensured.key, 'repo');
    assert.equal(ensured.vendorId, 'chatgpt');
  }

  const earlyResult = await req({ port, method: 'GET', pth: `/runs/result?runId=${encodeURIComponent(runId)}` });
  assert.equal(earlyResult.res.status, 409);
  assert.equal(earlyResult.data.error, 'run_not_finished');

  release?.();
  await eventually(async () => {
    const status = await req({ port, method: 'GET', pth: `/runs/status?runId=${encodeURIComponent(runId)}` });
    return status.data.state === 'completed' ? status : null;
  });

  const result = await req({ port, method: 'GET', pth: `/runs/result?runId=${encodeURIComponent(runId)}` });
  assert.equal(result.res.status, 200);
  assert.equal(result.data.state, 'completed');
  assert.equal(result.data.result.rawResponse, 'final answer');
  assert.equal(result.data.result.completion, null);
  assert.deepEqual(result.data.result.artifacts, []);
  assert.deepEqual(result.data.result.warnings, []);
});

test('run-http-api: stop targets one active runId and records cancelled terminal state', async (t) => {
  let rejectQuery = null;
  let stopCalls = 0;
  const controller = {
    runExclusive: async (fn) => await fn(),
    query: async ({ onProgress }) => {
      await onProgress?.({ phase: 'waiting_for_response', blocked: false, blockedKind: null });
      await new Promise((_, reject) => { rejectQuery = reject; });
    },
    requestStop: async ({ reason }) => {
      stopCalls += 1;
      assert.equal(reason, 'caller_stop');
      const error = new Error('query_aborted');
      error.data = { reason };
      rejectQuery?.(error);
      return { ok: true, requested: true, clicked: true };
    }
  };
  const tabs = {
    listTabs: () => [{ id: 't-stop', key: 'stop-key', vendorId: 'chatgpt', vendorName: 'ChatGPT', url: 'https://chatgpt.com/' }],
    ensureTab: async () => 't-stop',
    createTab: async () => 't-stop',
    closeTab: async () => true,
    getControllerById: () => controller
  };
  const server = await startHttpApi({
    port: 0,
    token: 'secret',
    tabs,
    defaultTabId: 't-stop',
    vendors: [{ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }],
    serverId: 'sid-test',
    stateDir: '/tmp',
    getSettings: async () => settings(),
    getStatus: async () => ({ ok: true })
  });
  t.after(() => server.close());
  const port = server.address().port;

  const delegated = await req({ port, method: 'POST', pth: '/runs/delegate', body: { provider: 'chatgpt', key: 'stop-key', prompt: 'long work' } });
  const runId = delegated.data.runId;
  await eventually(async () => {
    const status = await req({ port, method: 'GET', pth: `/runs/status?runId=${encodeURIComponent(runId)}` });
    return status.data.state === 'working' ? status : null;
  });

  const stopped = await req({ port, method: 'POST', pth: '/runs/stop', body: { runId, reason: 'caller_stop' } });
  assert.equal(stopped.res.status, 200);
  assert.equal(stopped.data.requested, true);
  assert.equal(stopCalls, 1);

  await eventually(async () => {
    const status = await req({ port, method: 'GET', pth: `/runs/status?runId=${encodeURIComponent(runId)}` });
    return status.data.state === 'cancelled' ? status : null;
  });
  const result = await req({ port, method: 'GET', pth: `/runs/result?runId=${encodeURIComponent(runId)}` });
  assert.equal(result.res.status, 200);
  assert.equal(result.data.state, 'cancelled');
  assert.equal(result.data.result, null);
});
