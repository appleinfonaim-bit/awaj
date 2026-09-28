/** Small shared helpers: escaping, formatting, slugs, dates. */

/* -------------------------------------------------------------------------- */
/* HTML escaping                                                               */
/* -------------------------------------------------------------------------- */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape for use in HTML text nodes and double-quoted attributes. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escape for embedding JSON inside a <script> block safely. */
export function escJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/* -------------------------------------------------------------------------- */
/* URLs                                                                        */
/* -------------------------------------------------------------------------- */

/** Build a URL with a query string, dropping empty values. */
export function url(path, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item !== '' && item != null) params.append(k, String(item));
    } else {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/* -------------------------------------------------------------------------- */
/* Slugs                                                                       */
/* -------------------------------------------------------------------------- */

/** URL-safe slug. Bangla/other non-ASCII is stripped, leaving a clean ASCII id. */
export function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/**
 * Ensure a slug is unique for a table by appending -2, -3, ... if needed.
 * @param {(slug: string) => string|undefined} existsFn
 */
export function uniqueSlug(base, existsFn) {
  let slug = slugify(base);
  let n = 1;
  while (existsFn(slug)) {
    n += 1;
    slug = `${slugify(base).slice(0, 72)}-${n}`;
  }
  return slug;
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/** Format BDT for display: ৳1,850 */
export function taka(amount) {
  const n = Math.round(Number(amount) || 0);
  return `৳${n.toLocaleString('en-US')}`;
}

/** Numeric input for <input type="number">, e.g. 1850 */
export const takaInput = (amount) => String(Math.round(Number(amount) || 0));

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

export const isoDate = (d = new Date()) => new Date(d).toISOString();

export function formatDate(value, opts = { dateStyle: 'medium' }) {
  if (!value) return '';
  const d = new Date(String(value).includes('T') ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', opts);
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(String(value).includes('T') ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "7-10 days" */
export const daysRange = (min, max) => (Number(min) === Number(max) ? `${min} day${min === 1 ? '' : 's'}` : `${min}-${max} days`);

/* -------------------------------------------------------------------------- */
/* Strings                                                                     */
/* -------------------------------------------------------------------------- */

export function truncate(text, max = 140) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Collapse whitespace and strip tags, for meta descriptions. */
export function plainText(html, max = 160) {
  const value = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(value, max);
}

/** First N characters of a number, e.g. 2300 -> "2.3k" */
export function compactCount(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(num);
}

export const titleCase = (s) =>
  String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

/* -------------------------------------------------------------------------- */
/* Template literal helper                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tagged template that escapes interpolations by default.
 *
 *   html`<p>${userInput}</p>`             // escaped
 *   html`<div>${raw(trustedMarkup)}</div>` // passed through
 *   html`${items.map(renderRow)}`         // array of rendered markup
 *   html`${productCard(product)}`         // another component's output
 *
 * The result is a *marked* String, so a component's output is recognised as
 * safe wherever it is interpolated - as a single value or inside an array.
 * Without that marker a nested component would be escaped a second time and the
 * entire page would render as visible source text. Plain strings and numbers
 * are still escaped, which is what protects user-supplied data.
 *
 * The marked value behaves like a string everywhere (concatenation, template
 * literals, res.end(), JSON.stringify), so callers never unwrap it.
 */
const RAW = Symbol('raw');

const mark = (text) => {
  const s = new String(text);
  s[RAW] = true;
  return s;
};

/** Mark a string as pre-rendered markup that must not be escaped. */
export const raw = (value) => mark(value ?? '');

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += interpolate(values[i]) + strings[i + 1];
  }
  return mark(out);
}

const isMarked = (v) => typeof v === 'object' && v !== null && v[RAW] === true;

function interpolate(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  // Arrays hold pre-rendered markup, so they are joined verbatim. Escaping here
  // would double-escape every component and render the page as visible text.
  if (Array.isArray(v)) return v.map(joinTrusted).join('');
  return escapeValue(v);
}

/** Array members: pre-rendered markup passes through unchanged. */
function joinTrusted(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(joinTrusted).join('');
  return String(v);
}

/** A single value: escape anything not explicitly marked as markup. */
function escapeValue(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(joinTrusted).join('');
  if (isMarked(v)) return String(v);
  return esc(v);
}

/** Build a class attribute from conditional parts. */
export function cx(...parts) {
  return parts
    .flat()
    .filter((p) => typeof p === 'string' && p.trim())
    .join(' ');
}

/** Deterministic short id for order codes etc. */
export function orderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let out = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `AWAJ-${out}`;
}
