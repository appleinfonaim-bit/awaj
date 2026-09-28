/**
 * Security primitives: password hashing, signed cookies, admin sessions and
 * CSRF tokens. All of it comes from `node:crypto` - no auth library needed.
 */
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
  createHash,
} from 'node:crypto';
import { config } from '../config.js';
import { all, get, run } from '../db/index.js';
import { parseCookies, setCookie, clearCookie } from './http.js';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* -------------------------------------------------------------------------- */
/* Passwords                                                                   */
/* -------------------------------------------------------------------------- */

/** @returns {string} `salt$hash`, both hex. */
export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verification. Never throws on malformed input. */
export function verifyPassword(plain, stored) {
  try {
    if (typeof stored !== 'string' || !stored.includes('$')) return false;
    const [saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(String(plain), Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_OPTS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Rejects passwords that would be unsafe to store or easy to guess. */
export function validatePasswordStrength(pw) {
  const value = String(pw || '');
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (value.length > 200) return 'Password is too long';
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Use at least one letter and one number';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Signed values                                                               */
/* -------------------------------------------------------------------------- */

/** Stateless signature for the cart cookie: `<payload>.<hmac>`. */
export function signValue(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function unsignValue(signed) {
  if (typeof signed !== 'string') return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 1) return null;
  const body = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Opaque, non-guessable token for guest wishlist / cart identifiers. */
export function randomToken(bytes = 16) {
  return randomBytes(bytes).toString('base64url');
}

/** Stable hash used to key rate limits without storing raw IPs. */
export function hashKey(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/* Admin sessions                                                              */
/* -------------------------------------------------------------------------- */

const SESSION_COOKIE = 'awaj_admin';

export function createSession(adminId, ip) {
  const id = randomToken(24);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  run(
    `INSERT INTO admin_sessions (id, admin_id, csrf, expires_at, ip) VALUES (?, ?, ?, ?, ?)`,
    [id, adminId, csrf, expires.toISOString(), ip || null]
  );
  run("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?", [adminId]);
  return { id, csrf, expires };
}

export function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT s.id, s.csrf, s.expires_at, u.id AS admin_id, u.username, u.role
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1`,
    [token, new Date().toISOString()]
  );
  if (!row) return null;
  return {
    id: row.id,
    csrf: row.csrf,
    expiresAt: row.expires_at,
    admin: { id: row.admin_id, username: row.username, role: row.role },
  };
}

export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run('DELETE FROM admin_sessions WHERE id = ?', [token]);
  clearCookie(res, SESSION_COOKIE);
}

/** Rotate the session id on login to prevent session fixation. */
export function attachSessionCookie(res, session) {
  setCookie(res, SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'Lax',
    expires: session.expires,
  });
}

/**
 * Verify a CSRF token using a constant-time compare.
 * Accepts the value from a form field, the `x-csrf-token` header or the
 * `_csrf` query parameter (needed for a few link-style admin actions).
 */
export function checkCsrf(session, provided) {
  if (!session || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(session.csrf));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCsrf(req, session, payload) {
  const provided =
    payload?._csrf ||
    req.headers['x-csrf-token'] ||
    new URL(req.url, 'http://x').searchParams.get('_csrf');
  return checkCsrf(session, provided);
}

export { SESSION_COOKIE };

/* -------------------------------------------------------------------------- */
/* Login throttle                                                              */
/* -------------------------------------------------------------------------- */

/** Blocks a username after repeated failures for a cooldown period. */
export function isLoginLockedOut(username) {
  const row = get(
    'SELECT hits, window_start FROM rate_limits WHERE bucket = ? AND key = ?',
    ['login_fail', hashKey(String(username).toLowerCase())]
  );
  if (!row) return { locked: false };
  const startedAt = new Date(row.window_start).getTime();
  const windowMs = 15 * 60_000;
  if (Date.now() - startedAt > windowMs) return { locked: false };
  return { locked: row.hits >= 8, retryAfterSec: Math.ceil((startedAt + windowMs - Date.now()) / 1000) };
}

export function recordLoginFailure(username) {
  run(
    `INSERT INTO rate_limits (bucket, key, hits, window_start) VALUES ('login_fail', ?, 1, datetime('now'))
     ON CONFLICT(bucket, key) DO UPDATE SET hits = hits + 1`,
    [hashKey(String(username).toLowerCase())]
  );
}

export function clearLoginFailures(username) {
  run('DELETE FROM rate_limits WHERE bucket = ? AND key = ?', [
    'login_fail',
    hashKey(String(username).toLowerCase()),
  ]);
}

export function listAdminUsers() {
  return all('SELECT id, username, role, is_active, last_login_at, created_at FROM admin_users ORDER BY id');
}
