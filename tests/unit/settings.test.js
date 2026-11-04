import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBaseUrl, normalizeSettings, isLive, loadSettings, saveSettings, clearSettings, SETTINGS_KEY,
} from '../../src/core/settings.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('validateBaseUrl accepts https and localhost http', () => {
  assert.equal(validateBaseUrl('https://api.example.com/v1'), null);
  assert.equal(validateBaseUrl('http://localhost:8080/v1'), null);
  assert.equal(validateBaseUrl('http://127.0.0.1:1234'), null);
});

test('validateBaseUrl rejects empty, malformed and remote plain-http urls', () => {
  assert.match(validateBaseUrl(''), /Add the API base URL/);
  assert.match(validateBaseUrl('   '), /Add the API base URL/);
  assert.match(validateBaseUrl('not a url'), /not a valid web address/);
  assert.match(validateBaseUrl('http://example.com/v1'), /must start with https/);
  assert.match(validateBaseUrl('ftp://example.com'), /must start with https/);
});

test('normalizeSettings trims values, strips trailing slashes and forces unknown modes to demo', () => {
  const s = normalizeSettings({ mode: 'weird', baseUrl: ' https://x.test/v1/// ', apiKey: ' k ', model: ' m ' });
  assert.deepEqual(s, { mode: 'demo', baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm' });
  assert.equal(normalizeSettings().mode, 'demo');
  assert.equal(normalizeSettings(null).model, '');
});

test('isLive needs live mode plus a valid url, key and model', () => {
  const ok = { mode: 'live', baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm' };
  assert.equal(isLive(ok), true);
  assert.equal(isLive({ ...ok, mode: 'demo' }), false);
  assert.equal(isLive({ ...ok, apiKey: '' }), false);
  assert.equal(isLive({ ...ok, model: '' }), false);
  assert.equal(isLive({ ...ok, baseUrl: 'http://remote.test' }), false);
});

test('loadSettings returns defaults for empty, missing or corrupt storage', () => {
  assert.deepEqual(loadSettings(memStorage()).mode, 'demo');
  assert.deepEqual(loadSettings(null).mode, 'demo');
  const bad = memStorage();
  bad.setItem(SETTINGS_KEY, '{not json');
  assert.equal(loadSettings(bad).mode, 'demo');
});

test('saveSettings persists a valid live config and round-trips through loadSettings', () => {
  const st = memStorage();
  const saved = saveSettings({ mode: 'live', baseUrl: 'https://x.test/v1/', apiKey: 'k', model: 'm' }, st);
  assert.equal(saved.baseUrl, 'https://x.test/v1');
  assert.deepEqual(loadSettings(st), saved);
});

test('saveSettings rejects an incomplete live config with a clear message', () => {
  const st = memStorage();
  assert.throws(() => saveSettings({ mode: 'live', baseUrl: '', apiKey: 'k', model: 'm' }, st), /Add the API base URL/);
  assert.throws(() => saveSettings({ mode: 'live', baseUrl: 'https://x.test', apiKey: '', model: 'm' }, st), /Add the API key/);
  assert.throws(() => saveSettings({ mode: 'live', baseUrl: 'https://x.test', apiKey: 'k', model: '' }, st), /Add the model name/);
  assert.equal(st._m.size, 0);
});

test('saveSettings in demo mode needs no key and fails without storage', () => {
  const st = memStorage();
  assert.equal(saveSettings({ mode: 'demo' }, st).mode, 'demo');
  assert.throws(() => saveSettings({ mode: 'demo' }, null), /does not allow saving/);
});

test('clearSettings removes the stored key and returns defaults', () => {
  const st = memStorage();
  saveSettings({ mode: 'live', baseUrl: 'https://x.test', apiKey: 'k', model: 'm' }, st);
  assert.equal(clearSettings(st).mode, 'demo');
  assert.equal(st._m.has(SETTINGS_KEY), false);
  assert.equal(clearSettings(null).model, '');
});
