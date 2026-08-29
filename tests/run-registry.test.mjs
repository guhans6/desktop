import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunRegistry } from '../run-registry.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function eventually(check, { timeoutMs = 1_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('eventually_timeout');
}

test('run-registry: v1 rejects non-ChatGPT providers', () => {
  const registry = createRunRegistry();
  assert.throws(
    () => registry.delegate({ provider: 'claude', key: 'repo', execute: async () => ({}) }),
    (error) => error?.message === 'invalid_provider' && error?.data?.provider === 'claude'
  );
});

test('run-registry: bounds queued runs per key', () => {
  const registry = createRunRegistry({ maxQueuedPerKey: 2, schedule: () => {} });
  registry.delegate({ key: 'bounded', execute: async () => ({}) });
  registry.delegate({ key: 'bounded', execute: async () => ({}) });
  assert.throws(
    () => registry.delegate({ key: 'bounded', execute: async () => ({}) }),
    (error) => error?.message === 'run_queue_full' && error?.data?.maxQueuedPerKey === 2
  );
});

test('run-registry: same-key runs serialize while different keys can run concurrently', async () => {
  const registry = createRunRegistry();
  const firstGate = deferred();
  const secondGate = deferred();
  const otherGate = deferred();
  const started = [];

  const first = registry.delegate({
    key: 'chat-a',
    execute: async ({ setState }) => {
      started.push('first');
      setState('working');
      await firstGate.promise;
      return { rawResponse: 'first done' };
    }
  });
  const second = registry.delegate({
    key: 'chat-a',
    execute: async ({ setState }) => {
      started.push('second');
      setState('working');
      await secondGate.promise;
      return { rawResponse: 'second done' };
    }
  });
  const other = registry.delegate({
    key: 'chat-b',
    execute: async ({ setState }) => {
      started.push('other');
      setState('working');
      await otherGate.promise;
      return { rawResponse: 'other done' };
    }
  });

  await eventually(() => registry.status({ runId: first.runId }).state === 'working');
  await eventually(() => registry.status({ runId: other.runId }).state === 'working');
  assert.equal(registry.status({ runId: second.runId }).state, 'queued');
  assert.deepEqual(new Set(started), new Set(['first', 'other']));

  firstGate.resolve();
  await eventually(() => registry.status({ runId: first.runId }).state === 'completed');
  await eventually(() => registry.status({ runId: second.runId }).state === 'working');
  assert.deepEqual(started, ['first', 'other', 'second']);

  secondGate.resolve();
  otherGate.resolve();
  await eventually(() => registry.status({ runId: second.runId }).state === 'completed');
  await eventually(() => registry.status({ runId: other.runId }).state === 'completed');
});

test('run-registry: result is terminal and preserves executor output', async () => {
  const registry = createRunRegistry();
  const gate = deferred();
  const run = registry.delegate({
    key: 'result-key',
    execute: async ({ setState }) => {
      setState('needs_tool_confirmation');
      await gate.promise;
      setState('working');
      return { rawResponse: 'done', completion: { version: 1 } };
    }
  });

  await eventually(() => registry.status({ runId: run.runId }).state === 'needs_tool_confirmation');
  assert.throws(() => registry.result({ runId: run.runId }), /run_not_finished/);

  gate.resolve();
  await eventually(() => registry.status({ runId: run.runId }).state === 'completed');
  const result = registry.result({ runId: run.runId });
  assert.equal(result.state, 'completed');
  assert.deepEqual(result.result, { rawResponse: 'done', completion: { version: 1 } });
  assert.equal(result.error, null);
});

test('run-registry: stopping an active run invokes its run-scoped stop handler and cancels the result', async () => {
  const registry = createRunRegistry();
  const stopped = deferred();
  const run = registry.delegate({
    key: 'active-stop',
    execute: async ({ setState, setStopHandler }) => {
      setState('working');
      await setStopHandler(async ({ reason }) => {
        assert.equal(reason, 'caller_cancelled');
        stopped.resolve();
      });
      await stopped.promise;
      const error = new Error('query_aborted');
      throw error;
    }
  });

  await eventually(() => registry.status({ runId: run.runId }).state === 'working');
  const stop = await registry.stop({ runId: run.runId, reason: 'caller_cancelled' });
  assert.equal(stop.requested, true);
  await eventually(() => registry.status({ runId: run.runId }).state === 'cancelled');
  assert.equal(registry.result({ runId: run.runId }).state, 'cancelled');
});

test('run-registry: stopping a queued run cancels it without starting its executor', async () => {
  const registry = createRunRegistry();
  const firstGate = deferred();
  let queuedStarted = false;

  const first = registry.delegate({
    key: 'queued-stop',
    execute: async ({ setState }) => {
      setState('working');
      await firstGate.promise;
      return { rawResponse: 'first' };
    }
  });
  const queued = registry.delegate({
    key: 'queued-stop',
    execute: async () => {
      queuedStarted = true;
      return { rawResponse: 'should not run' };
    }
  });

  await eventually(() => registry.status({ runId: first.runId }).state === 'working');
  assert.equal(registry.status({ runId: queued.runId }).state, 'queued');
  await registry.stop({ runId: queued.runId });
  assert.equal(registry.status({ runId: queued.runId }).state, 'cancelled');

  firstGate.resolve();
  await eventually(() => registry.status({ runId: first.runId }).state === 'completed');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queuedStarted, false);
});
