const START = 'WEB_LLM_BRIDGE_COMPLETION_V1';
const END = 'END_WEB_LLM_BRIDGE_COMPLETION_V1';
const STATUSES = new Set(['completed', 'blocked', 'needs_input', 'failed']);

function validStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateCompletion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!STATUSES.has(value.bridge_status)) return false;
  if (value.summary != null && typeof value.summary !== 'string') return false;
  if (value.verification != null && !validStringArray(value.verification)) return false;
  if (value.remaining != null && !validStringArray(value.remaining)) return false;
  if (value.needs_human != null && typeof value.needs_human !== 'boolean') return false;
  return true;
}

export function parseCompletionContract(rawResponse) {
  const text = String(rawResponse || '');
  const lines = text.split(/\r?\n/);
  const startLines = [];
  const endLines = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === START) startLines.push(i);
    if (line === END) endLines.push(i);
  }
  if (startLines.length === 0 && endLines.length === 0) {
    return { completion: null, warnings: ['completion_contract_missing'] };
  }
  const startLine = startLines[startLines.length - 1];
  const endLine = endLines.find((index) => index > startLine);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine <= startLine) {
    return { completion: null, warnings: ['completion_contract_invalid'] };
  }
  if (lines.slice(endLine + 1).some((line) => line.trim())) {
    return { completion: null, warnings: ['completion_contract_invalid'] };
  }
  const jsonText = lines.slice(startLine + 1, endLine).join('\n').trim();
  if (!jsonText) return { completion: null, warnings: ['completion_contract_invalid'] };
  try {
    const parsed = JSON.parse(jsonText);
    if (!validateCompletion(parsed)) {
      return { completion: null, warnings: ['completion_contract_invalid'] };
    }
    return { completion: { version: 1, ...parsed }, warnings: [] };
  } catch {
    return { completion: null, warnings: ['completion_contract_invalid'] };
  }
}

export const COMPLETION_CONTRACT_V1 = Object.freeze({ start: START, end: END });
