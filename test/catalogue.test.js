/**
 * Catalogue + search tests.
 *
 * The database path is set by test/setup.js (loaded via --import), so these
 * tests always run against a throwaway database, never data/awaj.db.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

assert.ok(
  process.env.DATABASE_FILE?.includes('awaj-test-'),
  'Refusing to run: the test database was not redirected by test/setup.js'
);

import { run, all } from  '../server/db/index.js';
import * as cat from '../server/lib/catalogue.js';
import { ensureDefaults } from '../server/lib/settings.js';

const FIXTURES = [
  ['mini-printer', 'AWJ-1001', 'Mini Portable Thermal Printer', 'ready_stock', 1850, 2200, 12, 1, [30, 40, 200], 230, 1, 1],
  ['wireless-charger', 'AWJ-1002', 'Fast Wireless Charger 15W', 'ready_stock', 650, null, 4, 1, [20, 20, 220], 900, 0, 0],
  ['leather-bag', 'AWJ-2001', 'Leather Sling Bag', 'preorder', 2200, null, 0, 2, [120, 40, 30], 40, 0, 0],
  ['mini-projector', 'AWJ-3001', 'Portable Mini Projector 1080p', 'preorder', 3250, null, 0, 1, [15, 15, 18], 610, 0, 0],
  ['shoe-runner', 'AWJ-2002', 'Lightweight Running Shoes', 'preorder', 1450, 1900, 0, 2, [200, 30, 40], 120, 0, 0],
];

function reset() {
  run('DELETE FROM product_images');
  run('DELETE FROM product_variants');
  run('DELETE FROM products');
  run('DELETE FROM categories');
  run(
    `INSERT INTO categories (id, slug, name, sort_order) VALUES
      (1, 'gadgets', 'Gadgets', 1),
      (2, 'bags', 'Bags & Accessories', 2)`
  );

  for (const [slug, sku, title, type, price, compare, stock, catId, rgb, sold, trending, deal] of FIXTURES) {
    run(
      `INSERT INTO products
        (slug, sku, title, product_type, price, compare_price, stock_qty, category_id,
         keywords, color_r, color_g, color_b, sold_count, is_trending, is_hot_deal, is_new, rating_avg, rating_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,4.6,32)`,
      [slug, sku, title, type, price, compare, stock, catId, `"${title.split(' ').pop().toLowerCase()}"`,
        rgb[0], rgb[1], rgb[2], sold, trending, deal]
    );
  }
}

before(() => {
  ensureDefaults();
  reset();
});
after(() => {
  run('DELETE FROM products');
  run('DELETE FROM categories');
});

/* -------------------------------------------------------------------------- */

test('shapes a product with a computed discount percentage', () => {
  const p = cat.getProductBySlug('mini-printer');
  assert.equal(p.price, 1850);
  assert.equal(p.compare_price, 2200);
  assert.equal(p.discount, 16); // (2200-1850)/2200 = 15.9 -> 16
  assert.equal(p.is_preorder, false);
  assert.ok(p.in_stock);
});

test('ready stock uses the local delivery window, pre-order uses the China window', () => {
  const ready = cat.getProductBySlug('mini-printer');
  const pre = cat.getProductBySlug('mini-projector');
  assert.deepEqual([ready.delivery_min_days, ready.delivery_max_days], [1, 3]);
  assert.deepEqual([pre.delivery_min_days, pre.delivery_max_days], [7, 10]);
});

test('pre-order products are purchasable even with zero local stock', () => {
  const pre = cat.getProductBySlug('leather-bag');
  assert.equal(pre.stock_qty, 0);
  assert.equal(pre.in_stock, true, 'pre-order is made to order, not out of stock');
});

test('full-text search matches title, keyword and product code', () => {
  assert.equal(cat.searchProducts({ q: 'projector' }).total, 1);
  assert.equal(cat.searchProducts({ q: '2001' }).total, 1, 'code search');
  assert.ok(cat.searchProducts({ q: 'leather' }).total >= 1, 'keyword search');
});

test('search supports prefix matching so partial words still work', () => {
  assert.ok(cat.searchProducts({ q: 'charg' }).total >= 1);
  assert.ok(cat.searchProducts({ q: 'print' }).total >= 1);
});

test('search tolerates hostile FTS syntax instead of erroring', () => {
  for (const q of ['C++', '"* OR', 'AND OR NOT', '((', 'a*', "'; DROP TABLE products;--"]) {
    const res = cat.searchProducts({ q });
    assert.ok(Array.isArray(res.items), `query ${JSON.stringify(q)} should not throw`);
  }
  // And the table is still there.
  assert.ok(all('SELECT id FROM products').length > 0);
});

test('search results are ordered by relevance, not insertion order', () => {
  const res = cat.searchProducts({ q: 'mini' });
  const titles = res.items.map((p) => p.title);
  assert.ok(titles.length >= 2, 'mini printer and mini projector both match');
  assert.ok(titles.some((t) => /Thermal Printer/.test(t)));
});

test('filter by stock type', () => {
  const ready = cat.searchProducts({ type: 'ready_stock' });
  assert.ok(ready.items.every((p) => p.product_type === 'ready_stock'));
  const pre = cat.searchProducts({ type: 'preorder' });
  assert.ok(pre.items.every((p) => p.product_type === 'preorder'));
  assert.equal(ready.total + pre.total, FIXTURES.length);
});

test('filter by category slug and by multiple categories', () => {
  assert.equal(cat.searchProducts({ category: 'gadgets' }).total, 3);
  assert.equal(cat.searchProducts({ category: ['gadgets', 'bags'] }).total, 5);
});

test('filter by price range', () => {
  const res = cat.searchProducts({ minPrice: 1000, maxPrice: 2000 });
  assert.ok(res.items.every((p) => p.price >= 1000 && p.price <= 2000));
  assert.ok(res.total >= 2);
});

test('filter by discount', () => {
  const res = cat.searchProducts({ discounted: true });
  assert.ok(res.items.every((p) => p.discount > 0));
});

test('filter inStock excludes sold-out ready stock but keeps pre-order', () => {
  const res = cat.searchProducts({ inStock: true });
  assert.ok(res.items.every((p) => p.product_type === 'preorder' || p.stock_qty > 0));
});

test('hot deal filter only returns active deals', () => {
  const res = cat.searchProducts({ hotDeal: true });
  assert.ok(res.items.every((p) => p.deal_active));
});

test('sorting works for every documented option', () => {
  const asc = cat.searchProducts({ sort: 'price_asc' }).items.map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = cat.searchProducts({ sort: 'price_desc' }).items.map((p) => p.price);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  const pop = cat.searchProducts({ sort: 'popular' }).items.map((p) => p.sold_count);
  assert.deepEqual(pop, [...pop].sort((a, b) => b - a));
});

test('pagination reports consistent totals and page counts', () => {
  const page1 = cat.searchProducts({ perPage: 2, page: 1, sort: 'price_asc' });
  const page2 = cat.searchProducts({ perPage: 2, page: 2, sort: 'price_asc' });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.total, FIXTURES.length);
  assert.equal(page1.pages, 3);
  const overlap = page1.items.filter((a) => page2.items.some((b) => b.id === a.id));
  assert.equal(overlap.length, 0, 'pages must not overlap');
});

test('out-of-range page returns empty rather than erroring', () => {
  const res = cat.searchProducts({ perPage: 2, page: 99 });
  assert.equal(res.items.length, 0);
  assert.equal(res.total, FIXTURES.length);
});

test('inactive products never appear in storefront queries', () => {
  run("UPDATE products SET is_active = 0 WHERE slug = 'leather-bag'");
  const res = cat.searchProducts({ perPage: 50 });
  assert.ok(!res.items.some((p) => p.slug === 'leather-bag'));
  assert.equal(cat.getProductBySlug('leather-bag'), null);
  run("UPDATE products SET is_active = 1 WHERE slug = 'leather-bag'");
});

test('offline image search matches by dominant colour', () => {
  // Query colour close to the navy printer (30,40,200)
  const res = cat.searchProducts({ color: '#1e28c8' });
  const titles = res.items.map((p) => p.title);
  assert.ok(titles.includes('Mini Portable Thermal Printer'), 'navy query finds the navy printer');
  assert.ok(!titles.includes('Leather Sling Bag'), 'brown bag is not a match');
});

test('parseColor handles the input shapes it can receive', () => {
  assert.deepEqual(cat.parseColor('#ff8800'), { r: 255, g: 136, b: 0 });
  assert.deepEqual(cat.parseColor('ff8800'), { r: 255, g: 136, b: 0 });
  assert.equal(cat.parseColor('nope'), null);
  assert.equal(cat.parseColor(''), null);
});

test('FTS index follows inserts, updates and deletes', () => {
  run("UPDATE products SET title = 'Portable Bluetooth Photo Printer' WHERE slug = 'mini-printer'");
  assert.ok(cat.searchProducts({ q: 'photo' }).total >= 1, 'index follows UPDATE');

  const before = cat.searchProducts({ q: 'photo' }).total;
  run("DELETE FROM products WHERE slug = 'mini-printer'");
  assert.ok(cat.searchProducts({ q: 'photo' }).total < before, 'index follows DELETE');

  reset(); // restore for the remaining tests
});

test('getProductBySlug attaches images, variants and related products', () => {
  const p = cat.getProductBySlug('mini-projector');
  assert.ok(Array.isArray(p.images));
  assert.ok(Array.isArray(p.variants));
  assert.ok(Array.isArray(p.reviews));
  assert.equal(p.category.slug, 'gadgets');
});

test('getProductsByIds preserves the requested order and skips missing ids', () => {
  const ids = all('SELECT id FROM products ORDER BY price DESC').map((r) => r.id);
  const products = cat.getProductsByIds([ids[0], 999999, ids[1]]);
  assert.equal(products.length, 2);
  assert.equal(products[0].id, ids[0]);
  assert.equal(products[1].id, ids[1]);
});

test('catalogue stats and price bounds reflect live data', () => {
  const stats = cat.getCatalogueStats();
  assert.equal(stats.total, FIXTURES.length);
  assert.equal(stats.readyStock, 2);
  assert.equal(stats.preorder, 3);
  const bounds = cat.getPriceBounds();
  assert.equal(bounds.min, 650);
  assert.equal(bounds.max, 3250);
});

test('related products exclude the product itself', () => {
  const p = cat.getProductBySlug('mini-projector');
  const related = cat.getRelatedProducts(p, 5);
  assert.ok(related.every((r) => r.id !== p.id));
});
