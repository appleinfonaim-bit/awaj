/**
 * Test bootstrap.
 *
 * Loaded via `node --import ./test/setup.js` so it runs BEFORE any test file,
 * which matters because `server/db/index.js` reads DATABASE_FILE at import
 * time. Without this, running the test suite would truncate the real
 * development database.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'awaj-test-'));

process.env.DATABASE_FILE = join(dir, 'test.db');
process.env.DATABASE_DIR = dir;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-not-used-in-production-0123456789';
process.env.WHATSAPP_NUMBER = '8801700000000';
process.env.FACEBOOK_PAGE_URL = '';

// Fail loudly if a test somehow reaches the real database.
const realDb = process.env.AWAJ_REAL_DB;
if (realDb) {
  // eslint-disable-next-line no-console
  console.warn(`[test] using temporary database at ${process.env.DATABASE_FILE} (real db: ${realDb})`);
}
