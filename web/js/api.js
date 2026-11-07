// All server calls go through here. To run inside Dynamics 365, point BASE at
// the hosted evaluation service (or replace with Xrm.WebApi calls).
export const BASE = window.CQA_API_BASE || '';

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
  audioUrl: (group, id) => `${BASE}/api/groups/${enc(group)}/conversations/${enc(id)}/audio`,
};

export const enc = encodeURIComponent;
