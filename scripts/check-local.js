import { providerInfo } from '../server/lib/llm.js';
import { loadDotEnv } from '../server/lib/store.js';

loadDotEnv();

try {
  const info = providerInfo();
  const res = await fetch(`${info.base}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const names = (data.models || []).map((item) => item.name);
  const wanted = info.model;
  const installed = names.some((name) => name === wanted || name.split(':')[0] === wanted.split(':')[0]);
  console.log(`Privacy: local only (${info.base})`);
  console.log(`Model: ${wanted}`);
  console.log(`Ollama: available; installed models: ${names.join(', ') || 'none'}`);
  if (!installed) {
    console.error(`Model ${wanted} is not installed. Run: ollama pull ${wanted}`);
    process.exitCode = 2;
  } else {
    console.log('Ready: transcripts will be evaluated on this computer.');
  }
} catch (error) {
  console.error(error.message);
  console.error('Start Ollama, then run this check again.');
  process.exitCode = 1;
}
