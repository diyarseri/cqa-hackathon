// All server calls go through here. To run inside Dynamics 365, point BASE at
// the hosted evaluation service (or replace with Xrm.WebApi calls).
export const BASE = window.CQA_API_BASE || '';

export function apiUrl(path = '') {
  const value = String(path);
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value;

  const base = String(BASE).replace(/\/+$/, '');
  if (!value) return base;
  if (!base) return value.startsWith('/') ? value : `/${value}`;
  return `${base}/${value.replace(/^\/+/, '')}`;
}

export class ApiError extends Error {
  constructor(message, { status = null, statusText = '', data = null, url = '', cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.url = url;
    if (cause) this.cause = cause;
  }
}

function errorMessage(data, res) {
  const detail = data?.error ?? data?.detail ?? data?.message;
  if (typeof detail === 'string' && detail) return detail;
  if (detail && typeof detail.message === 'string') return detail.message;
  return `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
}

async function req(method, path, body) {
  const url = apiUrl(path);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(cause?.message || 'Network request failed', { url, cause });
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text }; }
  }
  if (!res.ok) {
    throw new ApiError(errorMessage(data, res), {
      status: res.status,
      statusText: res.statusText,
      data,
      url,
    });
  }
  return data;
}

export const api = {
  url: apiUrl,
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
  audioUrl: (group, id) => apiUrl(`/api/groups/${enc(group)}/conversations/${enc(id)}/audio`),
};

export const enc = encodeURIComponent;
