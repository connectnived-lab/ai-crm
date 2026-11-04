// Minimal OpenAI-compatible chat-completions client. No SDK, no vendor names.
// fetchImpl is injectable so tests and the e2e run can mock the endpoint.
export class LlmError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export function buildChatRequest({ baseUrl, apiKey, model, messages, temperature = 0.2 }) {
  if (!baseUrl) throw new LlmError('Missing API base URL. Open Settings to add one.');
  if (!apiKey) throw new LlmError('Missing API key. Open Settings to add one.');
  if (!model) throw new LlmError('Missing model name. Open Settings to add one.');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LlmError('There is nothing to send to the model yet.');
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature }),
    },
  };
}

export function extractContent(json) {
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new LlmError('The model answered without any text.');
  }
  return text.trim();
}

export async function chatCompletion({ fetchImpl = globalThis.fetch, ...config }) {
  const { url, init } = buildChatRequest(config);
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new LlmError(`Could not reach the model endpoint (${err.message}).`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 160);
    } catch {
      detail = '';
    }
    throw new LlmError(`The model endpoint answered ${res.status}${detail ? `: ${detail}` : '.'}`, { status: res.status });
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new LlmError('The model endpoint did not return JSON.');
  }
  return extractContent(json);
}
