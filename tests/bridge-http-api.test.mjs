import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startBridgeHttpApi } from '../bridge-http-api.mjs';

async function request(port, path, { method = 'GET', token = null, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}

test('bridge HTTP API is ChatGPT-default-only and rejects inherited desktop routes', async (t) => {
  const token = 'bridge-test-token';
  let releaseQuery;
  const queryStarted = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { return { blocked: false, promptVisible: true, kind: null, indicators: null }; },
    async requestStop() { return { ok: true, requested: true, clicked: false }; },
    async selectMode({ mode }) { return { requested: mode, observed: { mode: 'medium', label: 'Medium', source: 'picker' }, verified: true, changed: false }; },
    async query({ prompt }) {
      await queryStarted;
      return { text: `response:${prompt}` };
    }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = {
    getControllerById(id) {
      assert.equal(id, defaultTab.id);
      return controller;
    },
    listTabs() { return [defaultTab, { id: 'other', key: 'other', protectedTab: false }]; }
  };
  const server = await startBridgeHttpApi({ port: 0, token, tabs, defaultTabId: defaultTab.id, serverId: 'sid' });
  t.after(() => server.close());
  const port = server.address().port;

  const health = await request(port, '/health');
  assert.deepEqual(health, { status: 200, body: { ok: true, serverId: 'sid' } });

  const status = await request(port, '/status', { token });
  assert.equal(status.status, 200);
  assert.equal(status.body.promptVisible, true);
  assert.deepEqual(status.body.tabs, [defaultTab]);

  for (const route of ['/navigate', '/read-page', '/tabs/create', '/query', '/bundles/save', '/artifacts/list', '/watch-folders/list']) {
    const result = await request(port, route, { method: 'POST', token, body: {} });
    assert.equal(result.status, 404, route);
  }

  const invalidTab = await request(port, '/runs/delegate', {
    method: 'POST', token, body: { provider: 'chatgpt', key: 'not-default', prompt: 'Please summarize the current bridge status.' }
  });
  assert.equal(invalidTab.status, 400);
  assert.equal(invalidTab.body.error, 'invalid_bridge_tab');

  const invalidOutputPolicy = await request(port, '/runs/delegate', {
    method: 'POST', token, body: { provider: 'chatgpt', key: 'default', prompt: 'Please summarize the current bridge status.', outputPolicy: 'path' }
  });
  assert.equal(invalidOutputPolicy.status, 400);
  assert.equal(invalidOutputPolicy.body.error, 'invalid_output_policy');

  const delegated = await request(port, '/runs/delegate', {
    method: 'POST', token, body: { provider: 'chatgpt', key: 'default', prompt: 'Please summarize the current bridge status.', mode: 'current' }
  });
  assert.equal(delegated.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlyResult = await request(port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
  assert.equal(earlyResult.status, 409);
  assert.equal(earlyResult.body.error, 'run_not_finished');
  releaseQuery();
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = await request(port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
    if (result.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(result.status, 200);
  assert.equal(result.body.state, 'completed');
  assert.equal(result.body.result.rawResponse, 'response:Please summarize the current bridge status.');
  assert.equal(result.body.result.completion, null);
  assert.deepEqual(result.body.result.warnings, []);
  assert.equal(result.body.result.selection.verified, true);
});

test('bridge HTTP API fails closed when provider readiness cannot be inspected', async (t) => {
  const token = 'bridge-status-failure-token';
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { throw new Error('provider_inspection_failed'); }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = { getControllerById: () => controller, listTabs: () => [defaultTab] };
  const server = await startBridgeHttpApi({ port: 0, token, tabs, defaultTabId: defaultTab.id });
  t.after(() => server.close());

  const status = await request(server.address().port, '/status', { token });
  assert.deepEqual(status, { status: 500, body: { error: 'internal_error' } });
});

test('bridge HTTP API reports manual login handoff while readiness is blocked', async (t) => {
  const token = 'bridge-login-handoff-token';
  let releaseReady;
  const ready = new Promise((resolve) => { releaseReady = resolve; });
  const controller = {
    async getUrl() { return 'https://chatgpt.com/auth/login'; },
    async detectChallenge() { return { blocked: true, promptVisible: false, kind: 'login', indicators: {} }; },
    async requestStop() { return { ok: true }; },
    async ensureReady({ onProgress }) {
      onProgress({ phase: 'awaiting_user', blocked: true, blockedKind: 'login' });
      await ready;
    },
    async selectMode({ mode }) { return { requested: mode, observed: { mode: 'high', label: 'High', source: 'picker' }, verified: true, changed: false }; },
    async query() { return { text: 'Ready after sign-in.' }; }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = { getControllerById: () => controller, listTabs: () => [defaultTab] };
  const server = await startBridgeHttpApi({ port: 0, token, tabs, defaultTabId: defaultTab.id, governor: { minRunGapMs: 0 } });
  t.after(() => server.close());

  const delegated = await request(server.address().port, '/runs/delegate', {
    method: 'POST', token, body: { prompt: 'Please summarize the current bridge status.' }
  });
  let status;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    status = await request(server.address().port, `/runs/status?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
    if (status.body.state === 'needs_login') break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(status.body.state, 'needs_login');

  releaseReady();
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = await request(server.address().port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
    if (result.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(result.body.state, 'completed');
});

test('bridge HTTP API preserves a conservative gap between provider runs', async (t) => {
  const token = 'bridge-pacing-token';
  const startedAt = [];
  const controller = {
    async requestStop() { return { ok: true }; },
    async selectMode({ mode }) { return { requested: mode, observed: { mode: 'high', label: 'High', source: 'picker' }, verified: true, changed: false }; },
    async query() { startedAt.push(Date.now()); return { text: 'Done.' }; }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = { getControllerById: () => controller, listTabs: () => [defaultTab] };
  const server = await startBridgeHttpApi({
    port: 0,
    token,
    tabs,
    defaultTabId: defaultTab.id,
    governor: { minRunGapMs: 40, maxQueriesPerMinute: 100 }
  });
  t.after(() => server.close());

  for (let index = 0; index < 2; index += 1) {
    const delegated = await request(server.address().port, '/runs/delegate', {
      method: 'POST', token, body: { prompt: `Please summarize bridge run ${index + 1}.` }
    });
    let result;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      result = await request(server.address().port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
      if (result.status === 200) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(result.body.state, 'completed');
  }
  assert.equal(startedAt.length, 2);
  assert.ok(startedAt[1] - startedAt[0] >= 35, startedAt.join(','));
});

test('bridge HTTP API preserves final completion metadata and caches only exact-turn provider outputs', async (t) => {
  const token = 'bridge-output-token';
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-http-api-output-'));
  t.after(async () => await fs.rm(stateDir, { recursive: true, force: true }));
  const rawResponse = [
    'The requested output is ready.',
    '',
    'WEB_LLM_BRIDGE_COMPLETION_V1',
    '{"bridge_status":"completed","summary":"Created the requested text note.","verification":["HTTP integration fixture"],"remaining":[],"needs_human":false}',
    'END_WEB_LLM_BRIDGE_COMPLETION_V1'
  ].join('\n');
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { return { blocked: false, promptVisible: true, kind: null, indicators: null }; },
    async requestStop() { return { ok: true }; },
    async selectMode({ mode }) { return { requested: mode, observed: { mode: 'medium', label: 'Medium', source: 'picker' }, verified: true, changed: false }; },
    async query() { return { text: rawResponse, meta: { assistantTurnIndex: 4 } }; },
    async captureAssistantOutputs(options) {
      assert.deepEqual(options, {
        assistantTurnIndex: 4,
        maxItems: 8,
        maxBytesPerItem: 8 * 1024 * 1024,
        maxAggregateBytes: 20 * 1024 * 1024
      });
      return {
        items: [{ kind: 'file', name: '../provider-output.txt', mime: 'text/plain', dataBase64: Buffer.from('exact-turn').toString('base64') }],
        warnings: []
      };
    }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = {
    getControllerById() { return controller; },
    listTabs() { return [defaultTab]; }
  };
  const server = await startBridgeHttpApi({ port: 0, token, tabs, defaultTabId: defaultTab.id, stateDir });
  t.after(() => server.close());
  const port = server.address().port;

  const delegated = await request(port, '/runs/delegate', {
    method: 'POST', token, body: { provider: 'chatgpt', key: 'default', prompt: 'Please create a small text note and attach it to your reply.', outputPolicy: 'capture' }
  });
  assert.equal(delegated.status, 200);
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = await request(port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
    if (result.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(result.status, 200);
  assert.equal(result.body.result.rawResponse, rawResponse);
  assert.deepEqual(result.body.result.completion, {
    version: 1,
    bridge_status: 'completed',
    summary: 'Created the requested text note.',
    verification: ['HTTP integration fixture'],
    remaining: [],
    needs_human: false
  });
  assert.deepEqual(result.body.result.warnings, []);
  assert.equal(result.body.result.artifacts.length, 1);
  const [artifact] = result.body.result.artifacts;
  assert.equal(artifact.name, 'provider-output.txt');
  assert.equal(artifact.path.startsWith(path.join(stateDir, 'run-output-cache', delegated.body.runId)), true);
  assert.equal(await fs.readFile(artifact.path, 'utf8'), 'exact-turn');
});

test('bridge HTTP API retains a completed response when optional provider-output capture fails', async (t) => {
  const token = 'bridge-capture-failure-token';
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-http-api-capture-failure-'));
  t.after(async () => await fs.rm(stateDir, { recursive: true, force: true }));
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { return { blocked: false, promptVisible: true, kind: null, indicators: null }; },
    async requestStop() { return { ok: true }; },
    async selectMode({ mode }) { return { requested: mode, observed: { mode: 'medium', label: 'Medium', source: 'picker' }, verified: true, changed: false }; },
    async query() { return { text: 'I finished the request.', meta: { assistantTurnIndex: 2 } }; },
    async captureAssistantOutputs() { throw new Error('download_failed'); }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = { getControllerById: () => controller, listTabs: () => [defaultTab] };
  const server = await startBridgeHttpApi({ port: 0, token, tabs, defaultTabId: defaultTab.id, stateDir });
  t.after(() => server.close());
  const delegated = await request(server.address().port, '/runs/delegate', {
    method: 'POST', token, body: { prompt: 'Please create a small text note and attach it to your reply.', outputPolicy: 'capture' }
  });
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = await request(server.address().port, `/runs/result?runId=${encodeURIComponent(delegated.body.runId)}`, { token });
    if (result.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(result.status, 200);
  assert.equal(result.body.state, 'completed');
  assert.equal(result.body.result.rawResponse, 'I finished the request.');
  assert.deepEqual(result.body.result.artifacts, []);
  assert.deepEqual(result.body.result.warnings, ['artifact_capture_failed']);
});

test('bridge HTTP API acknowledges shutdown before closing the active request', async () => {
  const token = 'bridge-shutdown-token';
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { return { blocked: false, promptVisible: true, kind: null, indicators: null }; }
  };
  const defaultTab = { id: 'default-tab', key: 'default', protectedTab: true, vendorId: 'chatgpt', vendorName: 'ChatGPT' };
  const tabs = { getControllerById: () => controller, listTabs: () => [defaultTab] };
  let server;
  let shutdownCalled = false;
  server = await startBridgeHttpApi({
    port: 0,
    token,
    tabs,
    defaultTabId: defaultTab.id,
    onShutdown: async () => {
      shutdownCalled = true;
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const result = await request(server.address().port, '/shutdown', { method: 'POST', token, body: {} });
  assert.deepEqual(result, { status: 200, body: { ok: true } });
  for (let attempt = 0; attempt < 20 && !shutdownCalled; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(shutdownCalled, true);
  assert.equal(server.listening, false);
});
