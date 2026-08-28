import crypto from 'node:crypto';

const RUN_STATES = new Set([
  'queued',
  'sending',
  'working',
  'needs_login',
  'needs_captcha',
  'needs_tool_confirmation',
  'completed',
  'failed',
  'cancelled'
]);

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);

function runError(code, data = null) {
  const error = new Error(code);
  error.data = data;
  return error;
}

function serializeError(error) {
  return {
    message: String(error?.message || error || 'run_failed'),
    data: error?.data ?? null
  };
}

function publicRun(run) {
  return {
    runId: run.runId,
    provider: run.provider,
    key: run.key,
    state: run.state,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    updatedAt: run.updatedAt,
    stopRequested: run.stopRequested,
    stopRequestedAt: run.stopRequestedAt
  };
}

export class RunRegistry {
  constructor({ idFactory = () => crypto.randomUUID(), now = () => Date.now(), schedule = queueMicrotask } = {}) {
    this.idFactory = idFactory;
    this.now = now;
    this.schedule = schedule;
    this.runs = new Map();
    this.queues = new Map();
    this.activeKeys = new Set();
  }

  delegate({ provider = 'chatgpt', key, execute } = {}) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider !== 'chatgpt') throw runError('invalid_provider', { provider });
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) throw runError('missing_key');
    if (normalizedKey.length > 240) throw runError('key_too_large');
    if (typeof execute !== 'function') throw runError('missing_run_executor');

    const now = this.now();
    const run = {
      runId: this.idFactory(),
      provider: normalizedProvider,
      key: normalizedKey,
      state: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
      stopRequested: false,
      stopRequestedAt: null,
      stopReason: null,
      result: null,
      error: null,
      execute,
      stopHandler: null,
      stopHandlerInvoked: false
    };

    this.runs.set(run.runId, run);
    const queue = this.queues.get(normalizedKey) || [];
    queue.push(run.runId);
    this.queues.set(normalizedKey, queue);
    this.#scheduleDrain(normalizedKey);
    return publicRun(run);
  }

  status({ runId } = {}) {
    return publicRun(this.#requireRun(runId));
  }

  result({ runId } = {}) {
    const run = this.#requireRun(runId);
    if (!TERMINAL_STATES.has(run.state)) throw runError('run_not_finished', { runId: run.runId, state: run.state });
    return {
      ...publicRun(run),
      result: run.result,
      error: run.error
    };
  }

  async stop({ runId, reason = 'user_stop' } = {}) {
    const run = this.#requireRun(runId);
    if (TERMINAL_STATES.has(run.state)) {
      return { ...publicRun(run), requested: false };
    }

    if (!run.stopRequested) {
      run.stopRequested = true;
      run.stopRequestedAt = this.now();
      run.stopReason = String(reason || 'user_stop');
      run.updatedAt = run.stopRequestedAt;
    }

    if (run.state === 'queued') {
      this.#finish(run, 'cancelled');
      this.#scheduleDrain(run.key);
      return { ...publicRun(run), requested: true };
    }

    await this.#invokeStopHandler(run);
    return { ...publicRun(run), requested: true };
  }

  #requireRun(runId) {
    const id = String(runId || '').trim();
    if (!id) throw runError('missing_runId');
    const run = this.runs.get(id);
    if (!run) throw runError('run_not_found', { runId: id });
    return run;
  }

  #scheduleDrain(key) {
    this.schedule(() => {
      void this.#drain(key);
    });
  }

  async #drain(key) {
    if (this.activeKeys.has(key)) return;
    const queue = this.queues.get(key);
    if (!queue?.length) return;

    let run = null;
    while (queue.length > 0 && !run) {
      const candidate = this.runs.get(queue.shift());
      if (candidate && candidate.state === 'queued') run = candidate;
    }
    if (queue.length === 0) this.queues.delete(key);
    if (!run) return;

    this.activeKeys.add(key);
    const startedAt = this.now();
    run.state = 'sending';
    run.startedAt = startedAt;
    run.updatedAt = startedAt;

    const setState = (state, patch = null) => {
      if (TERMINAL_STATES.has(run.state)) return publicRun(run);
      const next = String(state || '').trim();
      if (!RUN_STATES.has(next) || TERMINAL_STATES.has(next) || next === 'queued') {
        throw runError('invalid_run_state', { state: next });
      }
      run.state = next;
      run.updatedAt = this.now();
      if (patch && typeof patch === 'object') Object.assign(run, patch);
      return publicRun(run);
    };

    const setStopHandler = async (handler) => {
      if (handler != null && typeof handler !== 'function') throw runError('invalid_stop_handler');
      run.stopHandler = handler || null;
      if (run.stopRequested) await this.#invokeStopHandler(run);
    };

    try {
      const result = await run.execute({
        runId: run.runId,
        key: run.key,
        provider: run.provider,
        setState,
        setStopHandler,
        isStopRequested: () => run.stopRequested,
        stopReason: () => run.stopReason
      });
      if (run.stopRequested) this.#finish(run, 'cancelled');
      else this.#finish(run, 'completed', { result });
    } catch (error) {
      if (run.stopRequested || String(error?.message || '') === 'query_aborted') {
        this.#finish(run, 'cancelled');
      } else {
        this.#finish(run, 'failed', { error: serializeError(error) });
      }
    } finally {
      this.activeKeys.delete(key);
      this.#scheduleDrain(key);
    }
  }

  async #invokeStopHandler(run) {
    if (!run.stopHandler || run.stopHandlerInvoked) return;
    run.stopHandlerInvoked = true;
    try {
      await run.stopHandler({ runId: run.runId, reason: run.stopReason || 'user_stop' });
    } catch (error) {
      run.error = serializeError(error);
      run.updatedAt = this.now();
    }
  }

  #finish(run, state, patch = null) {
    if (TERMINAL_STATES.has(run.state)) return;
    const finishedAt = this.now();
    run.state = state;
    run.finishedAt = finishedAt;
    run.updatedAt = finishedAt;
    if (patch && typeof patch === 'object') Object.assign(run, patch);
  }
}

export function createRunRegistry(options) {
  return new RunRegistry(options);
}
