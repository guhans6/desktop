import crypto from 'node:crypto';
import http from 'node:http';

import { normalizeChatGptMode } from './chatgpt-mode.mjs';
import { createRunRegistry } from './run-registry.mjs';

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

function errorResponse(error) {
  const message = String(error?.message || error);
  if (message === 'body_too_large') return [413, { error: message }];
  if (
    message === 'invalid_json' || message === 'missing_prompt' || message === 'prompt_too_large' ||
    message === 'invalid_chatgpt_mode' || message === 'invalid_provider' || message === 'invalid_bridge_tab'
  ) {
    return [400, { error: message, data: error?.data || null }];
  }
  if (message === 'run_not_finished') return [409, { error: message, data: error?.data || null }];
  if (message === 'run_not_found') return [404, { error: message, data: error?.data || null }];
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
  onShutdown
} = {}) {
  const runs = createRunRegistry({ provider: 'chatgpt' });

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
          controller.getUrl().catch(() => ''),
          controller.detectChallenge().catch(() => null)
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
        const timeoutMs = boundedTimeout(body.timeoutMs);
        const delegated = runs.delegate({
          provider,
          key,
          execute: async ({ setState, setStopHandler }) => {
            const controller = tabs.getControllerById(defaultTabId);
            await setStopHandler(async ({ reason }) => await controller.requestStop({ reason }));
            setState('sending');
            const selection = await controller.selectMode({ mode, timeoutMs: Math.min(timeoutMs, 5_000) });
            const response = await controller.query({
              prompt,
              attachments: [],
              timeoutMs,
              onProgress: ({ phase }) => {
                if (phase === 'waiting_for_response') setState('working');
              }
            });
            return {
              rawResponse: String(response?.text || ''),
              completion: null,
              selection,
              artifacts: [],
              warnings: []
            };
          }
        });
        return sendJson(response, 200, delegated);
      }

      if (url.pathname === '/shutdown' && request.method === 'POST') {
        await onShutdown?.();
        return sendJson(response, 200, { ok: true });
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
