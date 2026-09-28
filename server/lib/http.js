/**
 * Minimal HTTP toolkit: a path-pattern router plus request/response helpers.
 * Built directly on `node:http` so the project needs no web framework.
 */
import { Buffer } from 'node:buffer';
import { createGzip, createBrotliCompress, constants } from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export const mimeFor = (ext) => MIME[ext.toLowerCase()] || 'application/octet-stream';

/* -------------------------------------------------------------------------- */
/* Cookies                                                                     */
/* -------------------------------------------------------------------------- */

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = Object.create(null);
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setCookie(res, name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) bits.push(`Expires=${new Date(opts.expires).toUTCString()}`);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  if (opts.secure) bits.push('Secure');
  bits.push(`SameSite=${opts.sameSite || 'Lax'}`);
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  list.push(bits.join('; '));
  res.setHeader('Set-Cookie', list);
}

export function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

/* -------------------------------------------------------------------------- */
/* Request body                                                                */
/* -------------------------------------------------------------------------- */

const MAX_BODY = 1024 * 1024; // 1 MB is plenty for JSON + multipart text parts

/** Read and JSON-parse the request body, honouring a size limit. */
export function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* -------------------------------------------------------------------------- */
/* Multipart (used for admin image uploads)                                    */
/* -------------------------------------------------------------------------- */

/** Buffer the whole request body, enforcing a size limit. */
export function readRawBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Parse `multipart/form-data` without a dependency.
 *
 * Deliberately simple: the body is already buffered in memory (uploads are
 * capped by config) and only the fields we actually use are handled.
 *
 * @param {Buffer} buf
 * @param {string} contentType the request Content-Type, for the boundary
 * @returns {{ fields: Record<string,string>, files: Array<{name,filename,type,data:Buffer}> }}
 */
export function parseMultipart(buf, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
  if (!match) {
    throw Object.assign(new Error('Expected multipart/form-data'), { statusCode: 400 });
  }
  return splitMultipart(buf, `--${match[1] || match[2]}`);
}

/** Convenience wrapper for callers that own the request stream. */
export async function readMultipart(req, limit = 12 * 1024 * 1024) {
  try {
    const buf = await readRawBody(req, limit);
    return parseMultipart(buf, req.headers['content-type']);
  } catch (err) {
    throw err instanceof Error && err.statusCode
      ? err
      : Object.assign(new Error(`Malformed upload: ${err.message}`), { statusCode: 400 });
  }
}

function splitMultipart(buf, boundary) {
  const fields = Object.create(null);
  const files = [];
  const sep = Buffer.from(`\r\n${boundary}`);
  const body = Buffer.concat([Buffer.from('\r\n'), buf]);

  let pos = body.indexOf(sep);
  if (pos < 0) throw new Error('no parts found');

  while (pos >= 0) {
    const partStart = pos + sep.length;
    if (body.slice(partStart, partStart + 2).toString() === '--') break; // closing boundary

    const headerEnd = body.indexOf('\r\n\r\n', partStart);
    if (headerEnd < 0) break;
    const rawHeaders = body.slice(partStart, headerEnd).toString('utf8');
    const next = body.indexOf(sep, headerEnd);
    if (next < 0) break;
    const data = body.slice(headerEnd + 4, next);

    const nameMatch = /name="([^"]*)"/i.exec(rawHeaders);
    const fileMatch = /filename="([^"]*)"/i.exec(rawHeaders);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders);
    const name = nameMatch ? nameMatch[1] : '';

    if (fileMatch && fileMatch[1]) {
      files.push({
        name,
        filename: fileMatch[1],
        type: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        data,
      });
    } else {
      fields[name] = data.toString('utf8');
    }
    pos = next;
  }

  return { fields, files };
}

/** Parse an urlencoded body, keeping repeats so variant rows survive. */
export function parseUrlEncoded(text) {
  const params = new URLSearchParams(String(text || ''));
  const out = {};
  for (const [k, v] of params) {
    if (out[k] === undefined) out[k] = v;
    else if (Array.isArray(out[`${k}__all`])) out[`${k}__all`].push(v);
    else out[`${k}__all`] = [out[k], v];
  }
  return out;
}

/**
 * Read and parse a form body, transparently handling urlencoded and multipart.
 * Returns `{ fields, files }` so one call site works for both encodings.
 */
export async function readForm(req, limit = 12 * 1024 * 1024) {
  const buf = await readRawBody(req, limit);
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('multipart/form-data')) {
    return parseMultipart(buf, contentType);
  }
  return { fields: parseUrlEncoded(buf.toString('utf8')), files: [] };
}

/** Restore a repeated field to its full list of submitted values. */
export function withRepeats(form) {
  const out = { ...form };
  for (const [key, list] of Object.entries(form)) {
    if (key.endsWith('__all')) out[key.slice(0, -5)] = list;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compiles `/product/:slug` into a matcher. Static segments are escaped, param
 * names are captured, and an optional trailing `*` becomes a greedy wildcard.
 */
function compile(pattern) {
  const names = [];
  const source = pattern
    .replace(/\/+$/, '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    })
    .replace(/\*/g, () => {
      names.push('wildcard');
      return '(.*)';
    });
  return { regex: new RegExp(`^${source || '/'}/?$`), names };
}

export class Router {
  constructor() {
    /** @type {Array<{method:string, regex:RegExp, names:string[], handler:Function, pattern:string}>} */
    this.routes = [];
  }

  add(method, pattern, handler) {
    const { regex, names } = compile(pattern);
    this.routes.push({ method: method.toUpperCase(), regex, names, handler, pattern });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  del(p, h) { return this.add('DELETE', p, h); }

  /**
   * @returns {{ handler: Function, params: object } | null | 'method-mismatch'}
   */
  match(method, pathname) {
    let pathExists = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (route.method !== method) continue;
      const params = {};
      route.names.forEach((n, i) => {
        params[n] = decodeURIComponent(m[i + 1] ?? '');
      });
      return { handler: route.handler, params, pattern: route.pattern };
    }
    return pathExists ? 'method-mismatch' : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

/** Types worth compressing. Everything else is already compressed. */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg)/;

export const encoders = {
  gzip: () => createGzip({ level: 6 }),
  br: () => createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
};

/**
 * Pick a response encoding the client accepts.
 * @returns {'br'|'gzip'|''}
 */
export function negotiateEncoding(req) {
  const accept = String(req?.headers?.['accept-encoding'] || '');
  if (!accept) return '';
  const supports = (name) => {
    const match = new RegExp(`(^|,)\\s*${name}\\s*(;[^,]*)?`).exec(accept);
    if (!match) return false;
    // An explicit q=0 means the client refuses this encoding.
    return !/q=0(\.0+)?\s*$/.test(match[2] || '');
  };
  if (supports('br')) return 'br';
  if (supports('gzip')) return 'gzip';
  return '';
}

/**
 * Send a response, compressing the body when it is worth it.
 *
 * This is the biggest single performance win available: the homepage is a few
 * hundred KB of HTML that compresses to roughly a tenth of that, which matters
 * a great deal for customers on mobile data in Bangladesh.
 */
export function send(res, status, body, headers = {}) {
  if (res.writableEnded) return;

  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : String(body);
  const type = String(headers['Content-Type'] || '');

  const out = { 'X-Content-Type-Options': 'nosniff', ...headers };

  const size = isBuffer ? payload.length : Buffer.byteLength(payload);
  const shouldCompress =
    !isBuffer && COMPRESSIBLE.test(type) && size > 1024 && !out['Content-Encoding'];

  // The handler entry point stashes the request here so every send() call,
  // including ones deep inside the route layer, can see Accept-Encoding.
  const encoding = shouldCompress ? negotiateEncoding(res.req) : '';

  if (!encoding) {
    out['Content-Length'] = size;
    res.writeHead(status, out);
    return res.end(payload);
  }

  out['Content-Encoding'] = encoding;
  out.Vary = out.Vary ? `${out.Vary}, Accept-Encoding` : 'Accept-Encoding';
  delete out['Content-Length'];

  res.writeHead(status, out);
  const stream = encoders[encoding]();
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return stream.end(payload);
}

export const sendJson = (res, status, data, headers = {}) =>
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });

export const sendHtml = (res, status, html, headers = {}) =>
  send(res, status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    ...headers,
  });

export const redirect = (res, location, status = 302) => {
  res.writeHead(status, { Location: location });
  res.end();
};

/* -------------------------------------------------------------------------- */
/* Client address                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort client IP. Proxy headers are only honoured when
 * TRUST_PROXY=1, otherwise a client could spoof its way around rate limits.
 */
export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}
