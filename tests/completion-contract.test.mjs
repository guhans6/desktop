import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCompletionContract } from '../completion-contract.mjs';

test('completion-contract: parses only the final versioned v1 block after ordinary prose', () => {
  const result = parseCompletionContract(`I finished the requested update and checked that the relevant tests pass.\n\nWEB_LLM_BRIDGE_COMPLETION_V1\n{"bridge_status":"completed","summary":"Updated the requested behavior.","verification":["Relevant tests passed"],"remaining":[],"needs_human":false}\nEND_WEB_LLM_BRIDGE_COMPLETION_V1\n`);
  assert.deepEqual(result, {
    completion: {
      version: 1,
      bridge_status: 'completed',
      summary: 'Updated the requested behavior.',
      verification: ['Relevant tests passed'],
      remaining: [],
      needs_human: false
    },
    warnings: []
  });
});

test('completion-contract: absent optional metadata is a normal response', () => {
  assert.deepEqual(parseCompletionContract('I finished the summary you asked for.'), {
    completion: null,
    warnings: []
  });
});

test('completion-contract: malformed or non-final blocks are invalid without discarding response semantics', () => {
  assert.deepEqual(parseCompletionContract('WEB_LLM_BRIDGE_COMPLETION_V1\n{bad json}\nEND_WEB_LLM_BRIDGE_COMPLETION_V1'), {
    completion: null,
    warnings: ['completion_contract_invalid']
  });
  assert.deepEqual(parseCompletionContract('WEB_LLM_BRIDGE_COMPLETION_V1\n{"bridge_status":"completed"}\nEND_WEB_LLM_BRIDGE_COMPLETION_V1\nafter'), {
    completion: null,
    warnings: ['completion_contract_invalid']
  });
  assert.deepEqual(parseCompletionContract('WEB_LLM_BRIDGE_COMPLETION_V1\n{"bridge_status":"unknown"}\nEND_WEB_LLM_BRIDGE_COMPLETION_V1'), {
    completion: null,
    warnings: ['completion_contract_invalid']
  });
});
