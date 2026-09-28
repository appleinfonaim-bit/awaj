/**
 * Set or reset the admin password from the terminal.
 *
 *   npm run admin:password -- <new-password>
 *   npm run admin:password -- --generate
 *
 * Useful for recovering access if you forget the password, and for setting a
 * strong one before going live.
 */
import { all, run } from  '../server/db/index.js';
import { hashPassword, validatePasswordStrength } from '../server/lib/security.js';
import { config } from '../server/config.js';

const args = process.argv.slice(2);

function usage(message) {
  console.error(`
  ${message || 'Set the AWAJ admin password.'}

  Usage:
    npm run admin:password -- <new-password>    set a specific password
    npm run admin:password -- --generate        generate a strong random one
`);
  process.exit(1);
}

const users = all('SELECT id, username FROM admin_users');
if (!users.length) {
  console.error('  No admin account exists yet. Run: npm run seed');
  process.exit(1);
}

const target = users[0];

if (args.includes('--generate')) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^*-_=+';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const password = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');

  run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hashPassword(password), target.id]);
  // Changing the password invalidates every existing session.
  run('DELETE FROM admin_sessions WHERE admin_id = ?', [target.id]);

  console.log(`\n  Password updated for "${target.username}"\n`);
  console.log(`    ${password}\n`);
  console.log('  Copy it somewhere safe now, it will not be shown again.');
  console.log(`  Sign in at http://localhost:${config.port}/admin\n`);
  process.exit(0);
}

const password = args.join(' ');
if (!password) usage('Provide a new password.');

const problem = validatePasswordStrength(password);
if (problem) usage(problem);

run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hashPassword(password), target.id]);
run('DELETE FROM admin_sessions WHERE admin_id = ?', [target.id]);

console.log(`\n  Password updated for "${target.username}". All sessions signed out.\n`);
