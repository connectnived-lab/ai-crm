// Settings: stored only in this browser (localStorage). Pure logic, no DOM.
export const SETTINGS_KEY = 'nived-ai-app-settings';
export const DEFAULT_SETTINGS = Object.freeze({ mode: 'demo', baseUrl: '', apiKey: '', model: '' });

export function validateBaseUrl(url) {
  const value = String(url ?? '').trim();
  if (!value) return 'Add the API base URL (for example https://api.example.com/v1).';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return 'The API base URL is not a valid web address.';
  }
  if (parsed.protocol === 'https:') return null;
  if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
  return 'The API base URL must start with https:// (http:// is allowed only for localhost).';
}

export function normalizeSettings(raw = {}) {
  return {
    mode: raw && raw.mode === 'live' ? 'live' : 'demo',
    baseUrl: String(raw?.baseUrl ?? '').trim().replace(/\/+$/, ''),
    apiKey: String(raw?.apiKey ?? '').trim(),
    model: String(raw?.model ?? '').trim(),
  };
}

export function isLive(settings) {
  const s = normalizeSettings(settings);
  return s.mode === 'live' && validateBaseUrl(s.baseUrl) === null && s.apiKey !== '' && s.model !== '';
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage ? storage.getItem(SETTINGS_KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  const s = normalizeSettings(settings);
  if (s.mode === 'live') {
    const problem = validateBaseUrl(s.baseUrl) || (s.apiKey ? null : 'Add the API key.') || (s.model ? null : 'Add the model name.');
    if (problem) throw new Error(problem);
  }
  if (!storage) throw new Error('This browser does not allow saving settings.');
  storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  return s;
}

export function clearSettings(storage = globalThis.localStorage) {
  if (storage) storage.removeItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS };
}
