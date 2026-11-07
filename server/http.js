// Minimal router + static file server on node:http (zero dependencies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export class Router {
  constructor() {
    this.routes = [];
    this.statics = [];
  }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }
  static(urlPrefix, dir) {
    this.statics.push({ urlPrefix, dir: path.resolve(dir) });
    return this;
  }

  listen(port, host = '127.0.0.1') {
    const server = http.createServer((req, res) => this.handle(req, res));
    return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      for (const r of this.routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : undefined;
        const out = await r.handler({ req, res, params, query: url.searchParams, body });
        if (res.writableEnded || out === undefined) return;
        return sendJson(res, 200, out);
      }
      if (req.method === 'GET' && this.serveStatic(url.pathname, res)) return;
      sendJson(res, 404, { error: `not found: ${req.method} ${url.pathname}` });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) sendJson(res, status, { error: e.message });
      else res.end();
    }
  }

  serveStatic(pathname, res) {
    for (const s of this.statics) {
      if (!pathname.startsWith(s.urlPrefix)) continue;
      let rel = pathname.slice(s.urlPrefix.length) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(s.dir, '.' + path.sep + decodeURIComponent(rel));
      if (!file.startsWith(s.dir)) return false;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }
    return false;
  }
}

export function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * 1024 * 1024) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
