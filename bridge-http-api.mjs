import crypto from 'node:crypto';
import http from 'node:http';

import { normalizeChatGptMode } from './chatgpt-mode.mjs';
import { parseCompletionContract } from './completion-contract.mjs';
import { createRunRegistry } from './run-registry.mjs';
import { RUN_OUTPUT_LIMITS, storeRunOutputs } from './run-output-cache.mjs';

function isLoopback(address) {
  const value = String(address || '');
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function authOk(request, token) {
  const provided = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const expected = String(token || '').trim();
  if (!provided || !expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function readJson(request, { maxBytes = 500_000 } = {}) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid_json');
  }
}

function boundedTimeout(value, fallback = 10 * 60_000) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, 30 * 60_000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runStateForProgress(patch) {
  const blockedKind = String(patch?.blockedKind || '').trim();
  const phase = String(patch?.phase || '').trim();
  if (patch?.blocked && blockedKind === 'login') return 'needs_login';
  if (patch?.blocked && blockedKind === 'captcha') return 'needs_captcha';
  if (blockedKind === 'tool_confirmation' || phase === 'awaiting_tool_confirmation') return 'needs_tool_confirmation';
  if (phase === 'waiting_for_response' || phase === 'working') return 'working';
  if (['waiting_for_ready', 'typing_prompt', 'sending_prompt'].includes(phase)) return 'sending';
  return null;
}

function errorResponse(error) {
  const message = String(error?.message || error);
  if (message === 'body_too_large') return [413, { error: message }];
  if (
    message === 'invalid_json' || message === 'missing_prompt' || message === 'prompt_too_large' ||
    message === 'invalid_chatgpt_mode' || message === 'invalid_provider' || message === 'invalid_bridge_tab' ||
    message === 'invalid_output_policy'
  ) {
    return [400, { error: message, data: error?.data || null }];
  }
  if (message === 'run_not_finished') return [409, { error: message, data: error?.data || null }];
  if (message === 'run_not_found') return [404, { error: message, data: error?.data || null }];
  if (message === 'run_queue_full') return [429, { error: message, data: error?.data || null }];
  if (message === 'chatgpt_mode_unavailable' || message === 'chatgpt_mode_verification_failed') {
    return [409, { error: message, data: error?.data || null }];
  }
  return [500, { error: 'internal_error' }];
}

function defaultTabSummary(tabs, defaultTabId) {
  return tabs.listTabs().filter((tab) => tab.id === defaultTabId && tab.key === 'default' && tab.protectedTab);
}

export function startBridgeHttpApi({
  host = '127.0.0.1',
  port,
  token,
  tabs,
  defaultTabId,
  serverId,
  stateDir,
  governor = {},
  onShutdown
} = {}) {
  const runs = createRunRegistry({ provider: 'chatgpt', maxQueuedPerKey: governor.maxQueuedPerKey });
  const maxQueriesPerMinute = Math.max(1, Math.min(600, Math.floor(Number(governor.maxQueriesPerMinute) || 12)));
  const configuredRunGap = Number(governor.minRunGapMs);
  const minRunGapMs = Math.max(0, Math.min(60_000, Number.isFinite(configuredRunGap) ? Math.floor(configuredRunGap) : 1_200));
  const recentRunStarts = [];
  let lastRunStartedAt = 0;
  const waitForRunBudget = async (isStopRequested) => {
    while (true) {
      if (isStopRequested?.()) throw new Error('query_aborted');
      const now = Date.now();
      while (recentRunStarts.length && recentRunStarts[0] <= now - 60_000) recentRunStarts.shift();
      const gapWait = Math.max(0, minRunGapMs - (now - lastRunStartedAt));
      const qpmWait = recentRunStarts.length >= maxQueriesPerMinute
        ? Math.max(0, recentRunStarts[0] + 60_000 - now)
        : 0;
      const waitMs = Math.max(gapWait, qpmWait);
      if (waitMs <= 0) {
        lastRunStartedAt = now;
        recentRunStarts.push(now);
        return;
      }
      await sleep(Math.min(waitMs, 250));
    }
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (!isLoopback(request.socket?.remoteAddress)) return sendJson(response, 403, { error: 'forbidden' });
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname === '/health' && request.method === 'GET') {
        return sendJson(response, 200, { ok: true, serverId: serverId || null });
      }
      if (!authOk(request, token)) return sendJson(response, 401, { error: 'unauthorized' });

      if (url.pathname === '/status' && request.method === 'GET') {
        const controller = tabs.getControllerById(defaultTabId);
        const [urlValue, challenge] = await Promise.all([
          controller.getUrl(),
          controller.detectChallenge()
        ]);
        return sendJson(response, 200, {
          ok: true,
          tabId: defaultTabId,
          url: urlValue,
          blocked: !!challenge?.blocked,
          promptVisible: !!challenge?.promptVisible,
          kind: challenge?.kind || null,
          indicators: challenge?.indicators || null,
          tabs: defaultTabSummary(tabs, defaultTabId)
        });
      }

      if (url.pathname === '/runs/status' && request.method === 'GET') {
        return sendJson(response, 200, runs.status({ runId: url.searchParams.get('runId') || '' }));
      }

      if (url.pathname === '/runs/result' && request.method === 'GET') {
        return sendJson(response, 200, runs.result({ runId: url.searchParams.get('runId') || '' }));
      }

      if (url.pathname === '/runs/stop' && request.method === 'POST') {
        const body = await readJson(request);
        return sendJson(response, 200, await runs.stop({
          runId: String(body.runId || '').trim(),
          reason: String(body.reason || 'user_stop').trim() || 'user_stop'
        }));
      }

      if (url.pathname === '/runs/delegate' && request.method === 'POST') {
        const body = await readJson(request);
        const provider = String(body.provider || 'chatgpt').trim().toLowerCase() || 'chatgpt';
        const key = String(body.key || 'default').trim() || 'default';
        const prompt = String(body.prompt || '');
        if (provider !== 'chatgpt') throw new Error('invalid_provider');
        if (key !== 'default') throw new Error('invalid_bridge_tab');
        if (!prompt.trim()) throw new Error('missing_prompt');
        if (prompt.length > 200_000) throw new Error('prompt_too_large');
        const mode = normalizeChatGptMode(body.mode ?? 'current');
        const outputPolicy = String(body.outputPolicy || 'none').trim().toLowerCase() || 'none';
        if (!['none', 'capture'].includes(outputPolicy)) {
          const error = new Error('invalid_output_policy');
          error.data = { outputPolicy, allowed: ['none', 'capture'] };
          throw error;
        }
        const timeoutMs = boundedTimeout(body.timeoutMs);
        const delegated = runs.delegate({
          provider,
          key,
          execute: async ({ runId, setState, setStopHandler, isStopRequested }) => {
            const controller = tabs.getControllerById(defaultTabId);
            await setStopHandler(async ({ reason }) => await controller.requestStop({ reason }));
            await waitForRunBudget(isStopRequested);
            const onProgress = (patch) => {
              const nextState = runStateForProgress(patch);
              if (nextState) setState(nextState);
            };
            setState('sending');
            if (typeof controller.ensureReady === 'function') {
              await controller.ensureReady({ timeoutMs, onProgress });
            }
            const selection = await controller.selectMode({ mode, timeoutMs: Math.min(timeoutMs, 5_000) });
            const response = await controller.query({
              prompt,
              attachments: [],
              timeoutMs,
              onProgress
            });
            const rawResponse = String(response?.text || '');
            const parsedCompletion = parseCompletionContract(rawResponse);
            let storedOutputs = { artifacts: [], warnings: [] };
            if (outputPolicy === 'capture') {
              const assistantTurnIndex = response?.meta?.assistantTurnIndex;
              let captured = { items: [], warnings: ['artifact_capture_unavailable'] };
              if (typeof controller.captureAssistantOutputs === 'function' && Number.isInteger(assistantTurnIndex)) {
                try {
                  captured = await controller.captureAssistantOutputs({
                    assistantTurnIndex,
                    maxItems: RUN_OUTPUT_LIMITS.maxItems,
                    maxBytesPerItem: RUN_OUTPUT_LIMITS.maxBytesPerItem,
                    maxAggregateBytes: RUN_OUTPUT_LIMITS.maxAggregateBytes
                  });
                } catch {
                  captured = { items: [], warnings: ['artifact_capture_failed'] };
                }
              }
              if (!stateDir) {
                storedOutputs = { artifacts: [], warnings: ['artifact_cache_unavailable'] };
              } else {
                try {
                  storedOutputs = await storeRunOutputs({ stateDir, runId, captured, limits: RUN_OUTPUT_LIMITS });
                } catch {
                  storedOutputs = { artifacts: [], warnings: ['artifact_cache_failed'] };
                }
              }
            }
            return {
              rawResponse,
              completion: parsedCompletion.completion,
              selection,
              artifacts: storedOutputs.artifacts,
              warnings: [...new Set([...parsedCompletion.warnings, ...(storedOutputs.warnings || [])])]
            };
          }
        });
        return sendJson(response, 200, delegated);
      }

      if (url.pathname === '/shutdown' && request.method === 'POST') {
        sendJson(response, 200, { ok: true });
        setImmediate(() => {
          void Promise.resolve().then(() => onShutdown?.()).catch(() => {});
        });
        return;
      }

      return sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      const [status, body] = errorResponse(error);
      return sendJson(response, status, body);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
