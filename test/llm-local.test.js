import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalEndpoint, complete, modelIsInstalled, providerInfo } from '../server/lib/llm.js';

test('local edition accepts loopback Ollama endpoints', () => {
  assert.equal(assertLocalEndpoint('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(assertLocalEndpoint('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(assertLocalEndpoint('http://[::1]:11434'), 'http://[::1]:11434');
});

test('local edition blocks external model endpoints and credentials in URLs', () => {
  assert.throws(() => assertLocalEndpoint('https://api.openai.com/v1'), /заблокировал внешний адрес/);
  assert.throws(() => assertLocalEndpoint('https://generativelanguage.googleapis.com'), /заблокировал внешний адрес/);
  assert.throws(() => assertLocalEndpoint('http://ollama.example.com:11434'), /заблокировал внешний адрес/);
  assert.throws(() => assertLocalEndpoint('http://user:secret@127.0.0.1:11434'), /только локальный адрес и порт/);
});

test('provider cannot be switched to a cloud provider', () => {
  const old = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'gemini';
  try { assert.throws(() => providerInfo(), /работает только локально/); }
  finally { old === undefined ? delete process.env.LLM_PROVIDER : process.env.LLM_PROVIDER = old; }
});

test('model readiness requires the requested Ollama tag', () => {
  assert.equal(modelIsInstalled('qwen2.5:7b', ['qwen2.5:7b']), true);
  assert.equal(modelIsInstalled('qwen2.5:7b', ['qwen2.5:3b']), false);
  assert.equal(modelIsInstalled('qwen2.5', ['qwen2.5:latest']), true);
});

test('Ollama adapter uses native local chat with JSON schema', async () => {
  const oldFetch = globalThis.fetch;
  const oldProvider = process.env.LLM_PROVIDER;
  const oldBase = process.env.OLLAMA_BASE_URL;
  const oldModel = process.env.OLLAMA_MODEL;
  process.env.LLM_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
  process.env.OLLAMA_MODEL = 'test-local:7b';
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, body: JSON.parse(init.body), headers: init.headers };
    return new Response(JSON.stringify({
      model: 'test-local:7b', message: { content: '{"criteria":[]}' },
      prompt_eval_count: 10, eval_count: 4,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await complete({
      system: 'system', user: 'untrusted transcript',
      schema: { type: 'OBJECT', properties: { criteria: { type: 'ARRAY', items: { type: 'OBJECT' } } } },
    });
    assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.body.stream, false);
    assert.equal(request.body.format.type, 'object');
    assert.equal(request.body.options.num_ctx, 8192);
    assert.equal(request.body.messages[1].content, 'untrusted transcript');
    assert.deepEqual(result.usage, { input: 10, output: 4 });
  } finally {
    globalThis.fetch = oldFetch;
    oldProvider === undefined ? delete process.env.LLM_PROVIDER : process.env.LLM_PROVIDER = oldProvider;
    oldBase === undefined ? delete process.env.OLLAMA_BASE_URL : process.env.OLLAMA_BASE_URL = oldBase;
    oldModel === undefined ? delete process.env.OLLAMA_MODEL : process.env.OLLAMA_MODEL = oldModel;
  }
});
