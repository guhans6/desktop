export const CHATGPT_MODES = Object.freeze([
  'current',
  'instant',
  'medium',
  'high',
  'extra_high',
  'pro',
  'pro_standard',
  'pro_extended'
]);

const MODE_SET = new Set(CHATGPT_MODES);

const MODE_LABELS = Object.freeze({
  current: [],
  instant: ['instant'],
  medium: ['medium'],
  high: ['high'],
  extra_high: ['extra high', 'extra-high'],
  pro: ['pro'],
  pro_standard: ['pro standard'],
  pro_extended: ['pro extended']
});

const PRO_SUBMODE_LABELS = Object.freeze({
  pro_standard: ['standard'],
  pro_extended: ['extended']
});

function cleanLabel(value) {
  return String(value || '')
    .replace(/[–—]/g, '-')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeChatGptMode(value = 'current') {
  const mode = String(value == null ? 'current' : value).trim().toLowerCase() || 'current';
  if (!MODE_SET.has(mode)) {
    const error = new Error('invalid_chatgpt_mode');
    error.data = { mode, allowed: [...CHATGPT_MODES] };
    throw error;
  }
  return mode;
}

export function chatGptModeLabels(mode, { submenu = false } = {}) {
  const normalized = normalizeChatGptMode(mode);
  if (submenu) return [...(PRO_SUBMODE_LABELS[normalized] || [])];
  return [...(MODE_LABELS[normalized] || [])];
}

export function chatGptLabelMatches(value, candidates = []) {
  const label = cleanLabel(value);
  if (!label) return false;
  for (const item of Array.isArray(candidates) ? candidates : []) {
    const candidate = cleanLabel(item);
    if (!candidate) continue;
    if (candidate === label) return true;
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`(?:^|[\\s(/-])${escaped}(?:$|[\\s)/-])`, 'i');
    if (boundary.test(label)) return true;
  }
  return false;
}

export function classifyChatGptModeLabel(value) {
  const label = cleanLabel(value);
  if (!label) return null;
  // Account/profile controls can include the account's subscription tier
  // (for example, "Guhan Pro, open profile menu"). They are not evidence of
  // the model picker or its selected mode.
  if (/open profile menu|accounts-profile-button/.test(label)) return null;
  const ordered = ['pro_standard', 'pro_extended', 'extra_high', 'instant', 'medium', 'high', 'pro'];
  for (const mode of ordered) {
    const labels = MODE_LABELS[mode] || [];
    if (chatGptLabelMatches(label, labels)) return mode;
  }
  return null;
}

export function observedChatGptMode(snapshot = {}) {
  const selected = Array.isArray(snapshot?.selectedLabels) ? snapshot.selectedLabels : [];
  const pickerLabel = String(snapshot?.pickerLabel || '').trim();
  const pickerMode = classifyChatGptModeLabel(pickerLabel);
  const selectedHasPro = selected.some((label) => classifyChatGptModeLabel(label) === 'pro');
  const selectedHasStandard = selected.some((label) => chatGptLabelMatches(label, ['standard']));
  const selectedHasExtended = selected.some((label) => chatGptLabelMatches(label, ['extended']));
  if ((selectedHasPro || pickerMode === 'pro') && selectedHasStandard) {
    return { mode: 'pro_standard', label: 'Pro Standard', source: 'selected_option' };
  }
  if ((selectedHasPro || pickerMode === 'pro') && selectedHasExtended) {
    return { mode: 'pro_extended', label: 'Pro Extended', source: 'selected_option' };
  }
  for (const label of selected) {
    const mode = classifyChatGptModeLabel(label);
    if (mode) return { mode, label: String(label || '').trim() || null, source: 'selected_option' };
  }
  if (pickerMode) return { mode: pickerMode, label: pickerLabel, source: 'picker' };
  return { mode: null, label: pickerLabel || null, source: pickerLabel ? 'picker' : null };
}

export function chatGptModeVerified(requestedMode, snapshot = {}) {
  const requested = normalizeChatGptMode(requestedMode);
  if (requested === 'current') return true;
  return observedChatGptMode(snapshot).mode === requested;
}
