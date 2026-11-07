// CQA prototype server. Run: npm start  →  http://localhost:8080
import path from 'node:path';
import { Router } from './http.js';
import { loadDotEnv, PROJECT_ROOT, httpError } from './lib/store.js';
import * as ds from './lib/datasource.js';
import * as cl from './lib/checklists.js';

loadDotEnv();
const app = new Router();

// ---- Step 1: data -----------------------------------------------------------
app.get('/api/groups', async () => ({ groups: await ds.listCachedGroups() }));

app.post('/api/groups/:group/fetch', async ({ params }) => {
  const g = await ds.fetchGroup(params.group);
  return { group_id: params.group, fetched_at: g.fetched_at, total: g.response.data.records.length };
});

app.get('/api/groups/:group/conversations', async ({ params, query }) => {
  const list = await ds.getConversations(params.group, { refresh: query.get('refresh') === '1' });
  return list.map((c) => ({
    conversation_id: c.conversation_id,
    channel: c.channel,
    language: c.language,
    has_audio: !!c.audio_url,
    messages: c.messages.length,
    duration_sec: c.messages.at(-1)?.offset_sec ?? null,
  }));
});

app.get('/api/groups/:group/conversations/:id', ({ params }) =>
  ds.getConversation(params.group, params.id),
);

// Redirects the <audio> element to a fresh signed recording URL.
app.get('/api/groups/:group/conversations/:id/audio', async ({ params, res }) => {
  const c = await ds.getConversation(params.group, params.id);
  if (!c.audio_url) throw httpError(404, 'this conversation has no recording');
  const src = await ds.resolveAudio(c.audio_url);
  res.writeHead(302, { location: src, 'cache-control': 'no-store' });
  res.end();
});

// ---- Step 2: checklists (every save is a new immutable version) ---------------
cl.seedDefault();
app.get('/api/checklists', ({ query }) => cl.list({ includeDeleted: query.get('deleted') === '1' }));
app.post('/api/checklists', ({ body }) => cl.create(body));
app.get('/api/checklists/:id', ({ params, query }) => cl.get(params.id, query.get('version')));
app.put('/api/checklists/:id', ({ params, body }) => cl.update(params.id, body));
app.delete('/api/checklists/:id', ({ params }) => cl.remove(params.id));
app.get('/api/checklists/:id/versions', ({ params }) => cl.history(params.id));

// ---- static UI ----------------------------------------------------------------
app.static('/shared/', path.join(PROJECT_ROOT, 'shared')); // pure modules shared with the browser
app.static('/', path.join(PROJECT_ROOT, 'web'));

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host).then(() => console.log(`CQA running on http://${host}:${port}`));
