/**
 * SQLite connection + query helpers.
 *
 * Uses the built-in `node:sqlite` module so the whole project runs with zero
 * npm dependencies. WAL mode is enabled for concurrent reads during writes.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

export const paths = {
  root,
  schema: join(here, 'schema.sql'),
  data: join(root, 'data'),
  uploads: join(root, 'data', 'uploads'),
  public: join(root, 'public'),
};

mkdirSync(paths.data, { recursive: true });
mkdirSync(paths.uploads, { recursive: true });

export const db = new DatabaseSync(config.databaseFile);

/** Pragmas are per-connection, so they must be set on every boot. */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
`);

/** Apply the schema. Every statement is CREATE ... IF NOT EXISTS. */
export function migrate() {
  db.exec(readFileSync(paths.schema, 'utf8'));
}

migrate();

/* -------------------------------------------------------------------------- */
/* Thin query helpers                                                          */
/* -------------------------------------------------------------------------- */

// node:sqlite returns null-prototype objects; normalise for safer spreading
// and for JSON.stringify / structuredClone compatibility downstream.
const plain = (row) => (row ? { ...row } : row);

/**
 * Parameters may be passed positionally (array) or by name (object).
 * Named parameters are far more readable for wide INSERT/UPDATE statements,
 * where a miscounted `?` is otherwise silent.
 */
const bind = (stmt, params) =>
  Array.isArray(params) || params == null
    ? stmt.all(...(params ?? []))
    : stmt.all(params);

const bindOne = (stmt, params) =>
  Array.isArray(params) || params == null
    ? stmt.get(...(params ?? []))
    : stmt.get(params);

const bindRun = (stmt, params) =>
  Array.isArray(params) || params == null
    ? stmt.run(...(params ?? []))
    : stmt.run(params);

export const all = (sql, params = []) => bind(db.prepare(sql), params).map(plain);
export const get = (sql, params = []) => plain(bindOne(db.prepare(sql), params));
export const run = (sql, params = []) => bindRun(db.prepare(sql), params);
export const pluck = (sql, params = []) => {
  const row = bindOne(db.prepare(sql), params);
  return row ? Object.values(row)[0] : undefined;
};

/** Wrap a function in a transaction; rolls back on throw. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* the transaction was already aborted */
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sliding-window counter stored in SQLite (no in-memory state, so it survives
 * restarts and works with more than one process).
 *
 * @param {string} bucket e.g. 'login' | 'order' | 'track'
 * @param {string} key    e.g. an IP address or a hash of it
 * @param {number} limit  max hits allowed inside the window
 * @param {number} windowMs
 * @returns {{ ok: boolean, remaining: number, retryAfterSec: number }}
 */
export function rateLimit(bucket, key, limit, windowMs) {
  const now = Date.now();
  const start = new Date(now - windowMs).toISOString();

  run(
    `INSERT INTO rate_limits (bucket, key, hits, window_start) VALUES (?, ?, 1, ?)
     ON CONFLICT(bucket, key) DO UPDATE SET
       hits = CASE WHEN window_start <= ? THEN 1 ELSE hits + 1 END,
       window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END`,
    [bucket, key, new Date(now).toISOString(), start, start, new Date(now).toISOString()]
  );

  const row = get('SELECT hits, window_start FROM rate_limits WHERE bucket = ? AND key = ?', [bucket, key]);
  const hits = row?.hits ?? 1;
  const windowStart = new Date(row?.window_start ?? now).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  return { ok: hits <= limit, remaining: Math.max(0, limit - hits), retryAfterSec };
}

export function clearRateLimit(bucket, key) {
  run('DELETE FROM rate_limits WHERE bucket = ? AND key = ?', [bucket, key]);
}

/** Housekeeping: drop expired sessions and stale rate-limit rows. */
export function prune() {
  const now = new Date().toISOString();
  run('DELETE FROM admin_sessions WHERE expires_at < ?', [now]);
  run('DELETE FROM rate_limits WHERE window_start < ?', [new Date(Date.now() - 864e5).toISOString()]);
}

export default db;
