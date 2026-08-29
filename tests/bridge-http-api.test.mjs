import test from 'node:test';
import assert from 'node:assert/strict';

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
    method: 'POST', token, body: { provider: 'chatgpt', key: 'not-default', prompt: 'x' }
  });
  assert.equal(invalidTab.status, 400);
  assert.equal(invalidTab.body.error, 'invalid_bridge_tab');

  const delegated = await request(port, '/runs/delegate', {
    method: 'POST', token, body: { provider: 'chatgpt', key: 'default', prompt: 'x', mode: 'current' }
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
  assert.equal(result.body.result.rawResponse, 'response:x');
  assert.equal(result.body.result.selection.verified, true);
});
