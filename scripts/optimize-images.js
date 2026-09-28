/**
 * Generate WebP derivatives for every uploaded product image.
 *
 * Only useful when `sharp` is installed:
 *
 *   npm install sharp
 *   npm run images:optimize
 *
 * Without sharp the script exits with an explanation, because the site still
 * works - it just serves the original uploads.
 */
import { statSync, existsSync } from  'node:fs';
import { join } from  'node:path';
import { all, run, paths } from  '../server/db/index.js';
import { ensureDerivatives, isOptimisationAvailable, hexToRgb } from '../server/lib/images.js';

const available = await isOptimisationAvailable();

if (!available) {
  console.log(`
  Image optimisation is unavailable because the "sharp" package is not installed.

  The website works fine without it - it simply serves the original uploaded
  images instead of optimised WebP versions.

  To enable it:

    npm install sharp
    npm run images:optimize
`);
  process.exit(0);
}

const onlyMissing = !process.argv.includes('--force');
let processed = 0;
let failed = 0;

const images = all('SELECT id, product_id, path FROM product_images ORDER BY product_id, sort_order');

console.log(`\n  Optimising ${images.length} product image${images.length === 1 ? '' : 's'}...\n`);

for (const image of images) {
  const abs = join(paths.uploads, image.path);
  if (!existsSync(abs)) {
    console.log(`  missing   ${image.path}`);
    failed += 1;
    continue;
  }

  try {
    const since = onlyMissing ? 0 : statSync(abs).mtimeMs;
    const info = await ensureDerivatives(image.path, since);

    // Refresh the stored dominant colour, which powers offline image search.
    if (info.dominant) {
      const rgb = hexToRgb(info.dominant);
      if (rgb) {
        run('UPDATE products SET color_hex = ?, color_r = ?, color_g = ?, color_b = ? WHERE id = ?', [
          info.dominant, rgb.r, rgb.g, rgb.b, image.product_id,
        ]);
      }
    }

    run('UPDATE product_images SET width = ?, height = ? WHERE id = ?', [info.width, info.height, image.id]);
    processed += 1;
    process.stdout.write(`\r  processed ${processed}/${images.length}   `);
  } catch (err) {
    failed += 1;
    console.log(`\n  failed    ${image.path}: ${err.message}`);
  }
}

console.log(`\n\n  ${processed} optimised, ${failed} skipped or failed.`);
console.log('  WebP sizes 400/800/1200 plus a blurred preview are now available.\n');
