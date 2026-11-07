// Organisers' API adapter: fetches GET ?group_id=..., caches raw responses,
// and resolves call recordings. Runs server-side, so the browser never hits CORS.
import { normalizeRecord } from '../../shared/normalize.js';
import { p, readJson, writeJson, safeId, httpError } from './store.js';

function apiUrl(groupId) {
  const base = process.env.CQA_API_URL;
  if (!base) throw httpError(500, 'CQA_API_URL is not set (see README → Setup)');
  const u = new URL(base);
  u.searchParams.set('group_id', groupId);
  return u.toString();
}

const cachePath = (g) => p('cache', `${safeId(g)}.json`);

/** Fetch a dataset group from the API and cache the raw response on disk. */
export async function fetchGroup(groupId, { attempts = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(apiUrl(groupId), { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      const body = await res.json();
      if (!body.isSuccess) throw new Error(`API error: ${body.error || 'isSuccess=false'}`);
      if (!Array.isArray(body?.data?.records)) throw new Error('API response has no data.records');
      const cached = { fetched_at: new Date().toISOString(), group_id: groupId, response: body };
      writeJson(cachePath(groupId), cached);
      return cached;
    } catch (e) {
      lastErr = e;
      if (e.status) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw httpError(502, `Could not fetch group ${groupId}: ${lastErr?.message}`);
}

/** Cached group, fetching on first use. `refresh` forces a re-fetch. */
export async function getGroup(groupId, { refresh = false } = {}) {
  const cached = !refresh && readJson(cachePath(groupId));
  return cached || fetchGroup(groupId);
}

/** Normalised records of a group. */
export async function getConversations(groupId, opts) {
  const g = await getGroup(groupId, opts);
  return g.response.data.records.map(normalizeRecord);
}

export async function getConversation(groupId, conversationId) {
  const all = await getConversations(groupId);
  const c = all.find((r) => r.conversation_id === conversationId);
  if (!c) throw httpError(404, `conversation ${conversationId} not found in ${groupId}`);
  return c;
}

/** Locally cached group ids (for the UI's group picker). */
export async function listCachedGroups() {
  const fs = await import('node:fs');
  try {
    return fs.readdirSync(p('cache')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

// --- audio -----------------------------------------------------------------
// audio_url returns an HTML player page whose <source src> is a signed blob URL
// valid for ~1 hour. We extract it on demand and redirect the <audio> element.
const audioCache = new Map(); // audio_url → { src, until }

export function extractAudioSrc(html) {
  const m = /<source[^>]*\ssrc="([^"]+)"/i.exec(html) || /<audio[^>]*\ssrc="([^"]+)"/i.exec(html);
  if (!m) return null;
  return m[1].replace(/&amp;/g, '&');
}

export async function resolveAudio(audioUrl) {
  const hit = audioCache.get(audioUrl);
  if (hit && hit.until > Date.now()) return hit.src;
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw httpError(502, `audio page HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  // If the organisers ever switch to serving audio directly, just pass the URL through.
  if (type.startsWith('audio/')) return audioUrl;
  const src = extractAudioSrc(await res.text());
  if (!src) throw httpError(502, 'no audio source in player page');
  audioCache.set(audioUrl, { src, until: Date.now() + 45 * 60_000 });
  return src;
}
