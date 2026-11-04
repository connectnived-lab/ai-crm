// Settings panel: demo/live switch, endpoint, key and model. Stored only in this browser.
import { el, setStatus } from './common.js';
import { loadSettings, saveSettings, clearSettings } from '../core/settings.js';

export function mountSettings({ container, storage = globalThis.localStorage, onChange = () => {} }) {
  let current = loadSettings(storage);
  const status = el('p', { class: 'hint', role: 'status', id: 'cfg-status', 'data-kind': 'info' });
  const demoRadio = el('input', { type: 'radio', name: 'ai-mode', value: 'demo', id: 'mode-demo', checked: current.mode !== 'live' });
  const liveRadio = el('input', { type: 'radio', name: 'ai-mode', value: 'live', id: 'mode-live', checked: current.mode === 'live' });
  const baseUrl = el('input', { type: 'url', id: 'cfg-base', value: current.baseUrl, placeholder: 'https://api.example.com/v1', autocomplete: 'off' });
  const apiKey = el('input', { type: 'password', id: 'cfg-key', value: current.apiKey, placeholder: 'your key', autocomplete: 'off' });
  const model = el('input', { type: 'text', id: 'cfg-model', value: current.model, placeholder: 'model name', autocomplete: 'off' });

  const fill = (s) => {
    baseUrl.value = s.baseUrl;
    apiKey.value = s.apiKey;
    model.value = s.model;
    demoRadio.checked = s.mode !== 'live';
    liveRadio.checked = s.mode === 'live';
  };

  const save = () => {
    const mode = liveRadio.checked ? 'live' : 'demo';
    try {
      current = saveSettings({ mode, baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value }, storage);
      setStatus(status, current.mode === 'live'
        ? 'Saved. Live mode is on: requests go only to the endpoint you entered.'
        : 'Saved. Demo mode works offline with no key.', 'ok');
      onChange(current);
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  };

  const clear = () => {
    current = clearSettings(storage);
    fill(current);
    setStatus(status, 'Cleared. The key is removed from this browser.', 'ok');
    onChange(current);
  };

  const panel = el('div', { class: 'settings-body' }, [
    el('h2', { text: 'Settings' }),
    el('fieldset', { class: 'mode-set' }, [
      el('legend', { text: 'Mode' }),
      el('label', { class: 'radio-row', for: 'mode-demo' }, [demoRadio, ' Demo (offline, no key)']),
      el('label', { class: 'radio-row', for: 'mode-live' }, [liveRadio, ' Live (your OpenAI-compatible endpoint)']),
    ]),
    el('label', { for: 'cfg-base', text: 'API base URL' }), baseUrl,
    el('label', { for: 'cfg-key', text: 'API key' }), apiKey,
    el('label', { for: 'cfg-model', text: 'Model name' }), model,
    el('p', { class: 'hint', text: 'Your key stays in this browser (localStorage). It is never committed, never sent to us, and is sent only to the endpoint above.' }),
    el('div', { class: 'row' }, [
      el('button', { type: 'button', id: 'cfg-save', onclick: save, text: 'Save settings' }),
      el('button', { type: 'button', class: 'ghost', id: 'cfg-clear', onclick: clear, text: 'Clear key' }),
    ]),
    status,
  ]);
  container.append(panel);
  return { getSettings: () => current, refresh: () => fill(current) };
}
