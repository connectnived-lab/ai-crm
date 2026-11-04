import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatRequest, extractContent, chatCompletion, LlmError } from '../../src/core/llm.js';

const cfg = { baseUrl: 'https://x.test/v1/', apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }] };

test('buildChatRequest builds the chat-completions url, auth header and body', () => {
  const { url, init } = buildChatRequest(cfg);
  assert.equal(url, 'https://x.test/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(init.body).messages, cfg.messages);
  assert.equal(JSON.parse(init.body).model, 'm');
});

test('buildChatRequest throws a LlmError for each missing piece', () => {
  assert.throws(() => buildChatRequest({ ...cfg, baseUrl: '' }), LlmError);
  assert.throws(() => buildChatRequest({ ...cfg, apiKey: '' }), /Missing API key/);
  assert.throws(() => buildChatRequest({ ...cfg, model: '' }), /Missing model name/);
  assert.throws(() => buildChatRequest({ ...cfg, messages: [] }), /nothing to send/);
  assert.throws(() => buildChatRequest({ ...cfg, messages: null }), /nothing to send/);
});

test('extractContent returns trimmed text and rejects empty or missing content', () => {
  assert.equal(extractContent({ choices: [{ message: { content: '  hello \n' } }] }), 'hello');
  assert.throws(() => extractContent({ choices: [{ message: { content: '   ' } }] }), /without any text/);
  assert.throws(() => extractContent({}), LlmError);
});

test('chatCompletion returns the model text from a mocked endpoint', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) };
  };
  assert.equal(await chatCompletion({ ...cfg, fetchImpl }), 'answer');
  assert.equal(seen.url, 'https://x.test/v1/chat/completions');
});

test('chatCompletion reports network failures', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  await assert.rejects(chatCompletion({ ...cfg, fetchImpl }), /Could not reach the model endpoint \(offline\)/);
});

test('chatCompletion reports HTTP errors with status and trimmed detail', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  await assert.rejects(chatCompletion({ ...cfg, fetchImpl }), (err) => err.status === 401 && /answered 401: bad key/.test(err.message));
});

test('chatCompletion handles an HTTP error whose body cannot be read', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => { throw new Error('gone'); } });
  await assert.rejects(chatCompletion({ ...cfg, fetchImpl }), /answered 503\./);
});

test('chatCompletion reports a non-JSON success body', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(chatCompletion({ ...cfg, fetchImpl }), /did not return JSON/);
});
