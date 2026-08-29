#!/usr/bin/env node
import { startBridgeRuntime } from './bridge-runtime.mjs';
import { defaultStateDir, writeState } from './state.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

const stateDir = argValue('--state-dir') || defaultStateDir();
const port = argValue('--port') || process.env.AGENTIFY_DESKTOP_PORT || 0;
const showTabs = process.argv.includes('--show-tabs') || process.env.AGENTIFY_DESKTOP_SHOW_TABS === 'true';

startBridgeRuntime({ stateDir, port, showTabs }).catch(async (error) => {
  await writeState(
    {
      ok: false,
      error: error?.message || String(error),
      data: error?.data || null,
      startedAt: new Date().toISOString(),
      runtime: 'headless'
    },
    stateDir
  ).catch(() => {});
  console.error('web-llm-bridge fatal:', error);
  process.exit(1);
});
