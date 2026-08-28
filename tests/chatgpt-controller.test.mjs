import test from 'node:test';
import assert from 'node:assert/strict';

import { ChatGPTController } from '../chatgpt-controller.mjs';
import { chatGptLabelMatches, classifyChatGptModeLabel, observedChatGptMode } from '../chatgpt-mode.mjs';

function readyState() {
  return {
    url: 'https://chatgpt.com/',
    title: 'ChatGPT',
    readyState: 'complete',
    blocked: false,
    promptVisible: true,
    kind: null,
    indicators: {
      hasTurnstile: false,
      hasArkose: false,
      hasVerifyButton: false,
      looks403: false,
      loginLike: false,
      rawPromptVisible: true,
      sendVisible: true
    }
  };
}

test('chatgpt-mode: known mode labels can be embedded in observable model-picker text without arbitrary substring matching', () => {
  assert.equal(classifyChatGptModeLabel('GPT-5.6 · High'), 'high');
  assert.equal(classifyChatGptModeLabel('GPT-5.6 · Extra High'), 'extra_high');
  assert.equal(classifyChatGptModeLabel('GPT-5.6 · Pro Standard'), 'pro_standard');
  assert.equal(chatGptLabelMatches('GPT-5.6 / Extra High', ['extra high', 'extra-high']), true);
  assert.equal(chatGptLabelMatches('highlighted response', ['high']), false);
  assert.deepEqual(observedChatGptMode({ pickerLabel: 'GPT-5.6 Pro', selectedLabels: ['Standard'] }), {
    mode: 'pro_standard', label: 'Pro Standard', source: 'selected_option'
  });
});

test('chatgpt-controller: current mode is a verified no-op using observable ChatGPT picker state', async () => {
  const evaluations = [
    { chatgpt: true, pickerFound: true, pickerLabel: 'High', selectedLabels: [], options: [] }
  ];
  const page = {
    async evaluate() { return evaluations.shift(); }
  };
  const controller = new ChatGPTController({ page, selectors: {} });

  const selection = await controller.selectMode({ mode: 'current' });
  assert.deepEqual(selection, {
    requested: 'current',
    observed: { mode: 'high', label: 'High', source: 'picker' },
    verified: true,
    changed: false
  });
  assert.equal(evaluations.length, 0);
});

test('chatgpt-controller: explicit high mode is selected only from known visible ChatGPT options and verified', async () => {
  const evaluations = [
    { chatgpt: true, pickerFound: true, pickerLabel: 'Medium', selectedLabels: [], options: [] },
    { ok: true, pickerLabel: 'Medium' },
    { chatgpt: true, pickerFound: true, pickerLabel: 'Medium', selectedLabels: [], options: [{ label: 'Medium', selected: true }, { label: 'High', selected: false }] },
    { clicked: true, label: 'High' },
    { chatgpt: true, pickerFound: true, pickerLabel: 'High', selectedLabels: ['High'], options: [] }
  ];
  const page = {
    async evaluate() { return evaluations.shift(); }
  };
  const controller = new ChatGPTController({ page, selectors: {} });

  const selection = await controller.selectMode({ mode: 'high', timeoutMs: 500 });
  assert.deepEqual(selection, {
    requested: 'high',
    observed: { mode: 'high', label: 'High', source: 'selected_option' },
    verified: true,
    changed: true
  });
  assert.equal(evaluations.length, 0);
});

test('chatgpt-controller: unavailable explicit ChatGPT mode fails instead of substituting another option', async () => {
  const evaluations = [
    { chatgpt: true, pickerFound: true, pickerLabel: 'Medium', selectedLabels: [], options: [] },
    { ok: true, pickerLabel: 'Medium' },
    { chatgpt: true, pickerFound: true, pickerLabel: 'Medium', selectedLabels: [], options: [{ label: 'Medium', selected: true }, { label: 'High', selected: false }] }
  ];
  const page = {
    async evaluate() { return evaluations.shift(); }
  };
  const controller = new ChatGPTController({ page, selectors: {} });

  await assert.rejects(
    () => controller.selectMode({ mode: 'extra_high', timeoutMs: 500 }),
    (error) => error?.message === 'chatgpt_mode_unavailable' && error?.data?.requested === 'extra_high'
  );
  assert.equal(evaluations.length, 0);
});

test('chatgpt-controller: send falls back to requestSubmit on the active composer before Enter', async () => {
  const events = [];
  let waitForSendChecks = 0;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("form.requestSubmit")) {
        events.push('requestSubmit');
        return true;
      }
      if (js.includes('already_generating')) return { ok: true, requestSubmit: true, host: 'chatgpt.com' };
      if (js.includes('promptLen')) {
        waitForSendChecks += 1;
        return waitForSendChecks >= 2
          ? { stopVisible: false, sendDisabled: true, promptLen: 0 }
          : { stopVisible: false, sendDisabled: false, promptLen: 7 };
      }
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey(key) {
      events.push(`key:${key}`);
    },
    async insertText(text) {
      events.push(`text:${text}`);
    },
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.send({ text: 'agentify', timeoutMs: 5_000 });
  assert.deepEqual(result, { ok: true });
  assert.equal(events.includes('requestSubmit'), true);
  assert.equal(events.includes('key:Enter'), false);
});

test('chatgpt-controller: a newly accepted ChatGPT user turn prevents fallback resubmission', async () => {
  const events = [];
  let turnStateReads = 0;
  let requestSubmitted = false;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 2, assistantCount: 2 }
          : { chatgpt: true, userCount: 3, assistantCount: 2 };
      }
      if (js.includes("form.requestSubmit")) {
        requestSubmitted = true;
        events.push('requestSubmit');
        return true;
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) {
        return requestSubmitted
          ? { stopVisible: false, sendDisabled: true, promptLen: 0 }
          : { stopVisible: false, sendDisabled: false, promptLen: 7 };
      }
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey(key) {
      events.push(`key:${key}`);
    },
    async insertText(text) {
      events.push(`text:${text}`);
    },
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.send({ text: 'agentify', timeoutMs: 5_000 });
  assert.deepEqual(result, { ok: true });
  assert.equal(turnStateReads >= 2, true);
  assert.equal(events.includes('requestSubmit'), false);
  assert.equal(events.includes('key:Enter'), false);
});

test('chatgpt-controller: ChatGPT direct send-button click is attempted before humanized mouse fallback', async () => {
  const events = [];
  let turnStateReads = 0;
  let directClicked = false;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 2, assistantCount: 2 }
          : { chatgpt: true, userCount: directClicked ? 3 : 2, assistantCount: 2 };
      }
      if (js.includes('const exactSend = Array.from(document.querySelectorAll')) {
        directClicked = true;
        events.push('directClick');
        return true;
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) return { stopVisible: false, sendDisabled: false, promptLen: 7 };
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey() {},
    async insertText() {},
    async moveMouse() {},
    async mouseDown() {
      events.push('mouseDown');
    },
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.send({ text: 'agentify', timeoutMs: 5_000 });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, ['mouseDown', 'directClick']);
  assert.equal(events.filter((event) => event === 'mouseDown').length, 1);
});

test('chatgpt-controller: send fails closed when more than one new ChatGPT user turn appears', async () => {
  let turnStateReads = 0;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 2, assistantCount: 2 }
          : { chatgpt: true, userCount: 4, assistantCount: 2 };
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) return { stopVisible: false, sendDisabled: false, promptLen: 7 };
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey() {},
    async insertText() {},
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  await assert.rejects(
    () => controller.send({ text: 'agentify', timeoutMs: 5_000 }),
    (error) => error?.message === 'duplicate_user_turn_detected' && error?.data?.baselineUserCount === 2 && error?.data?.currentUserCount === 4
  );
});

test('chatgpt-controller: query waits for the assistant turn following the newly accepted ChatGPT user turn', async () => {
  let turnStateReads = 0;
  let responsePolls = 0;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 1, assistantCount: 1 }
          : { chatgpt: true, userCount: 2, assistantCount: responsePolls >= 5 ? 2 : 1 };
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) {
        return { stopVisible: false, sendDisabled: false, promptLen: 7 };
      }
      if (js.includes('hasContinue')) {
        responsePolls += 1;
        const hasNewAssistant = responsePolls >= 5;
        return {
          stop: false,
          sendEnabled: true,
          txt: hasNewAssistant ? 'new answer' : 'old answer',
          count: hasNewAssistant ? 2 : 1,
          usedFallback: false,
          hasError: false,
          hasContinue: false,
          hasRegenerate: hasNewAssistant,
          correlated: hasNewAssistant,
          hasTurnActions: hasNewAssistant
        };
      }
      if (js.includes('codeBlocks')) return { codeBlocks: [] };
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey() {},
    async insertText() {},
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.query({ prompt: 'agentify', timeoutMs: 8_000 });
  assert.equal(result.text, 'new answer');
  assert.equal(result.meta.count, 2);
  assert.equal(responsePolls >= 5, true);
});

test('chatgpt-controller: query does not finalize a transient correlated ChatGPT assistant state', async () => {
  let turnStateReads = 0;
  let responsePolls = 0;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 1, assistantCount: 0 }
          : { chatgpt: true, userCount: 2, assistantCount: responsePolls > 0 ? 1 : 0 };
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) return { stopVisible: false, sendDisabled: false, promptLen: 7 };
      if (js.includes('hasContinue')) {
        responsePolls += 1;
        const finalized = responsePolls >= 5;
        return {
          stop: false,
          sendEnabled: true,
          txt: finalized ? 'final answer' : 'Thinking...',
          count: 1,
          correlated: true,
          usedFallback: false,
          hasError: false,
          hasContinue: false,
          hasRegenerate: finalized,
          hasTurnActions: finalized
        };
      }
      if (js.includes('codeBlocks')) return { codeBlocks: [] };
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey() {},
    async insertText() {},
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.query({ prompt: 'agentify', timeoutMs: 8_000 });
  assert.equal(result.text, 'final answer');
  assert.equal(responsePolls >= 5, true);
});

test('chatgpt-controller: query waits for finished-turn actions before finalizing normal-looking ChatGPT text', async () => {
  let turnStateReads = 0;
  let responsePolls = 0;

  const page = {
    async navigate() {},
    async evaluate(js) {
      if (js.includes('const hasTurnstile')) return readyState();
      if (js.includes('missing_prompt_textarea')) return { ok: true, rect: { x: 10, y: 10, w: 200, h: 40 } };
      if (js.includes("userCount: document.querySelectorAll")) {
        turnStateReads += 1;
        return turnStateReads === 1
          ? { chatgpt: true, userCount: 1, assistantCount: 0 }
          : { chatgpt: true, userCount: 2, assistantCount: responsePolls > 0 ? 1 : 0 };
      }
      if (js.includes('already_generating')) {
        return { ok: true, rect: { x: 300, y: 300, w: 40, h: 40 }, requestSubmit: true, host: 'chatgpt.com' };
      }
      if (js.includes('promptLen')) return { stopVisible: false, sendDisabled: false, promptLen: 7 };
      if (js.includes('hasContinue')) {
        responsePolls += 1;
        const finalized = responsePolls >= 5;
        return {
          stop: false,
          sendEnabled: true,
          txt: finalized ? 'complete answer' : 'partial answer that looks complete',
          count: 1,
          correlated: true,
          usedFallback: false,
          hasError: false,
          hasContinue: false,
          hasRegenerate: finalized,
          hasTurnActions: finalized
        };
      }
      if (js.includes('codeBlocks')) return { codeBlocks: [] };
      throw new Error(`unexpected_eval:${js.slice(0, 80)}`);
    },
    async getUrl() {
      return 'https://chatgpt.com/';
    },
    async sendKey() {},
    async insertText() {},
    async moveMouse() {},
    async mouseDown() {},
    async mouseUp() {},
    async setFileInputFiles() {}
  };

  const controller = new ChatGPTController({
    page,
    selectors: {
      promptTextarea: '#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
      stopButton: 'button[data-testid="stop-button"]',
      assistantMessage: '[data-message-author-role="assistant"]'
    }
  });

  const result = await controller.query({ prompt: 'agentify', timeoutMs: 8_000 });
  assert.equal(result.text, 'complete answer');
  assert.equal(responsePolls >= 5, true);
});
