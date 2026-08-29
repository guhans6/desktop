import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createBrowserBackend,
  resolveChromeDebugPort,
  resolveChromeExecutablePath,
  resolveChromeProfileMode,
  resolveChromeProfileName
} from './browser-backend.mjs';
import { ChatGPTController } from './chatgpt-controller.mjs';
import { startBridgeHttpApi } from './bridge-http-api.mjs';
import { TabManager } from './tab-manager.mjs';
import { defaultStateDir, ensureToken, readSettings, writeState } from './state.mjs';
import { cleanupRuntimeResources, createGracefulShutdown, registerShutdownSignals } from './shutdown.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSelectors(stateDir) {
  const defaults = JSON.parse(await fs.readFile(path.join(__dirname, 'selectors.json'), 'utf8'));
  const overridePath = path.join(stateDir, 'selectors.override.json');
  try {
    const override = JSON.parse(await fs.readFile(overridePath, 'utf8'));
    if (!override || typeof override !== 'object') return defaults;
    const cleaned = {};
    for (const [key, value] of Object.entries(override)) {
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
      if (typeof value !== 'string' || !value.trim()) continue;
      cleaned[key] = value.trim();
    }
    return { ...defaults, ...cleaned };
  } catch {
    return defaults;
  }
}

async function loadVendors() {
  const raw = await fs.readFile(path.join(__dirname, 'vendors.json'), 'utf8');
  const parsed = JSON.parse(raw || '{}');
  const vendors = Array.isArray(parsed?.vendors) ? parsed.vendors : [];
  return vendors.flatMap((vendor) => {
    if (!vendor || typeof vendor !== 'object') return [];
    const id = String(vendor.id || '').trim();
    const name = String(vendor.name || '').trim();
    const url = String(vendor.url || '').trim();
    const status = String(vendor.status || 'planned').trim();
    return id && name && url ? [{ id, name, url, status }] : [];
  });
}

function positivePort(value) {
  const port = Math.floor(Number(value));
  return Number.isFinite(port) && port >= 0 && port <= 65535 ? port : 0;
}

export async function startBridgeRuntime({
  stateDir = defaultStateDir(),
  port = process.env.AGENTIFY_DESKTOP_PORT || 0,
  showTabs = process.env.AGENTIFY_DESKTOP_SHOW_TABS === 'true',
  argv = process.argv,
  env = process.env,
  registerSignals = true,
  dependencies = {}
} = {}) {
  const ensureTokenImpl = dependencies.ensureToken || ensureToken;
  const readSettingsImpl = dependencies.readSettings || readSettings;
  const loadSelectorsImpl = dependencies.loadSelectors || loadSelectors;
  const loadVendorsImpl = dependencies.loadVendors || loadVendors;
  const createBrowserBackendImpl = dependencies.createBrowserBackend || createBrowserBackend;
  const createController = dependencies.createController || ((options) => new ChatGPTController(options));
  const createTabManager = dependencies.createTabManager || ((options) => new TabManager(options));
  const startBridgeHttpApiImpl = dependencies.startBridgeHttpApi || startBridgeHttpApi;
  const writeStateImpl = dependencies.writeState || writeState;

  let browserBackend = null;
  let server = null;
  let unregisterSignals = null;
  let tabs = null;
  let shutdown = null;

  try {
    const token = await ensureTokenImpl(stateDir);
    const selectors = await loadSelectorsImpl(stateDir);
    const vendors = await loadVendorsImpl();
    const settings = await readSettingsImpl(stateDir);
    const serverId = crypto.randomUUID();

    browserBackend = await createBrowserBackendImpl({
      kind: 'chrome-cdp',
      stateDir,
      userAgent: null,
      onChanged: () => {},
      chromeExecutablePath: resolveChromeExecutablePath({ argv, env, settings }),
      chromeDebugPort: resolveChromeDebugPort({ argv, env, settings }),
      chromeProfileMode: resolveChromeProfileMode({ argv, env, settings }),
      chromeProfileName: resolveChromeProfileName({ argv, env, settings })
    });
    const browserState = await browserBackend.start();

    tabs = createTabManager({
      browserBackend,
      maxTabs: Number(env.AGENTIFY_DESKTOP_MAX_TABS || 12),
      onNeedsAttention: async () => {},
      onChanged: () => {},
      createController: async ({ tabId, page }) => {
        const controller = createController({
          page,
          selectors,
          stateDir,
          onBlocked: async (status) => await tabs.needsAttention(tabId, status),
          onUnblocked: async () => await tabs.resolvedAttention(tabId)
        });
        controller.serverId = serverId;
        return controller;
      }
    });

    const defaultVendor =
      vendors.find((vendor) => vendor.id === 'chatgpt') ||
      { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', status: 'supported' };
    const defaultTabId = await tabs.createTab({
      key: 'default',
      name: 'default',
      url: defaultVendor.url,
      show: !!showTabs,
      protectedTab: true,
      vendorId: defaultVendor.id,
      vendorName: defaultVendor.name
    });

    const stop = async () => {
      if (!shutdown) return;
      await shutdown.cleanup();
    };

    let selectedPort = positivePort(port);
    const tries = selectedPort === 0 ? 1 : 20;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        server = await startBridgeHttpApiImpl({
          port: selectedPort,
          token,
          tabs,
          defaultTabId,
          serverId,
          onShutdown: stop
        });
        selectedPort = server.address().port;
        break;
      } catch (error) {
        if (error?.code === 'EADDRINUSE' && selectedPort > 0) {
          selectedPort += 1;
          continue;
        }
        throw error;
      }
    }
    if (!server) throw new Error('http_api_start_failed');

    shutdown = createGracefulShutdown({
      closeServer: (done) => {
        try {
          if (!server?.listening) return done?.();
          server.close(() => done?.());
        } catch {
          done?.();
        }
      },
      disposeBrowserBackend: async () => await browserBackend.dispose?.(),
      setTabsQuitting: () => tabs.setQuitting(true),
      markQuitting: () => {},
      quitApp: () => {}
    });

    if (registerSignals) {
      unregisterSignals = registerShutdownSignals({ requestQuit: shutdown.requestQuit });
    }

    await writeStateImpl(
      { ok: true, port: selectedPort, pid: process.pid, serverId, startedAt: new Date().toISOString(), runtime: 'headless' },
      stateDir
    );

    return {
      stateDir,
      port: selectedPort,
      serverId,
      browserState,
      browserBackend,
      tabs,
      defaultTabId,
      server,
      stop: async () => {
        unregisterSignals?.();
        unregisterSignals = null;
        await shutdown.cleanup();
      }
    };
  } catch (error) {
    unregisterSignals?.();
    await cleanupRuntimeResources({
      closeServer: (done) => {
        try {
          if (!server?.listening) return done?.();
          server.close(() => done?.());
        } catch {
          done?.();
        }
      },
      disposeBrowserBackend: async () => await browserBackend?.dispose?.()
    });
    throw error;
  }
}
