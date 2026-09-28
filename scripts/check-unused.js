/**
 * Development helper: report unused named imports.
 *
 *   node scripts/check-unused.js
 *
 * Not a linter, just a quick sweep to keep the codebase tidy after refactors.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
};
['server', 'scripts', 'test'].forEach((d) => walk(join(root, d)));

const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g;

let issues = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const body = source.replace(IMPORT_RE, '');
  const names = new Set();

  for (const match of source.matchAll(IMPORT_RE)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }

  for (const name of names) {
    const pattern = new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g');
    if ((body.match(pattern) || []).length === 0) {
      console.log(`  ${file.replace(root, '.')}: unused import '${name}'`);
      issues += 1;
    }
  }
}

console.log(issues ? `\n${issues} unused import(s)\n` : 'No unused imports found.\n');
