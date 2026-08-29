import test from 'node:test';
import assert from 'node:assert/strict';

import { startBridgeRuntime } from '../bridge-runtime.mjs';

function fakePresenter() {
  return {
    minimized: false,
    isMinimized() { return this.minimized; },
    async restore() { this.minimized = false; },
    async show() {},
    async focus() {},
    async minimize() { this.minimized = true; },
    isVisible() { return true; }
  };
}

test('bridge-runtime: starts Chrome-CDP provider runtime without Electron lifecycle dependencies', async (t) => {
  const calls = [];
  const presenter = fakePresenter();
  const page = {};
  let disposed = false;
  const browserBackend = {
    async start() { return { kind: 'chrome-cdp', managedProfile: true }; },
    async createSession({ show }) {
      calls.push(['session', show]);
      return { page, presenter, isClosed: () => false, async close() {} };
    },
    async dispose() { disposed = true; },
    setQuitting() {}
  };
  const controller = {
    async getUrl() { return 'https://chatgpt.com/'; },
    async detectChallenge() { return { blocked: false, promptVisible: true, kind: null, indicators: null }; }
  };
  let capturedApi = null;
  const server = {
    listening: true,
    address: () => ({ port: 57546 }),
    close(done) { this.listening = false; done?.(); }
  };
  const written = [];

  const runtime = await startBridgeRuntime({
    stateDir: '/tmp/bridge-runtime-test',
    port: 57546,
    showTabs: true,
    argv: ['node', 'bridge-main.mjs'],
    env: {},
    registerSignals: false,
    dependencies: {
      ensureToken: async () => 'token',
      readSettings: async () => ({ browserBackend: 'electron', chromeDebugPort: 9222, chromeProfileMode: 'isolated', chromeProfileName: 'Default' }),
      loadSelectors: async () => ({}),
      loadVendors: async () => [{ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', status: 'supported' }],
      createBrowserBackend: async (options) => {
        calls.push(['backend', options.kind]);
        return browserBackend;
      },
      createController: () => controller,
      startBridgeHttpApi: async (options) => {
        capturedApi = options;
        return server;
      },
      writeState: async (state) => written.push(state)
    }
  });
  t.after(async () => await runtime.stop());

  assert.deepEqual(calls, [['backend', 'chrome-cdp'], ['session', true]]);
  assert.equal(runtime.browserState.kind, 'chrome-cdp');
  assert.equal(runtime.defaultTabId, runtime.tabs.listTabs()[0].id);
  assert.equal(runtime.tabs.listTabs()[0].key, 'default');
  assert.equal(runtime.tabs.listTabs()[0].protectedTab, true);
  assert.equal(capturedApi.vendors, undefined);
  assert.equal(capturedApi.stateDir, '/tmp/bridge-runtime-test');
  assert.equal(written[0].runtime, 'headless');

  assert.equal(capturedApi.defaultTabId, runtime.defaultTabId);

  await runtime.stop();
  assert.equal(disposed, true);
  assert.equal(server.listening, false);
});
