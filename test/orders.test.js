/**
 * Order + checkout tests.
 *
 * The database path is set by test/setup.js (loaded via --import), so these
 * tests always run against a throwaway database, never data/awaj.db.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

assert.ok(
  process.env.DATABASE_FILE?.includes('awaj-test-'),
  'Refusing to run: the test database was not redirected by test/setup.js'
);

const { run, get, all } = await import('../server/db/index.js');
const cart = await import('../server/lib/cart.js');
const orders = await import('../server/lib/orders.js');
const { ensureDefaults, setSetting, invalidateSettingsCache } = await import('../server/lib/settings.js');
const { hashPassword } = await import('../server/lib/security.js');

const CUSTOMER = {
  name: 'Rahim Uddin',
  phone: '01712345678',
  whatsapp: '01712345678',
  district: 'Dhaka',
  area: 'Mirpur',
  address: 'House 42, Road 7, Mirpur DOHS, Dhaka',
  note: 'Please call before delivery',
  payment: 'cod',
};

function seedCatalogue() {
  ensureDefaults();
  run('DELETE FROM order_events');
  run('DELETE FROM order_items');
  run('DELETE FROM orders');
  run('DELETE FROM product_variants');
  run('DELETE FROM product_images');
  run('DELETE FROM products');
  run('DELETE FROM categories');
  run(
    `INSERT INTO categories (id, slug, name, sort_order) VALUES (1,'gadgets','Gadgets',1)`
  );
  run(
    `INSERT INTO products (id,slug,sku,title,product_type,price,compare_price,stock_qty,category_id,delivery_min_days,delivery_max_days,rating_avg,rating_count,sold_count)
     VALUES (1,'printer','AWJ-1','Mini Printer','ready_stock',1850,2200,100000,1,1,3,4.8,100,500),
            (2,'projector','AWJ-2','Mini Projector','preorder',3250,4200,0,1,7,10,4.7,200,900),
            (3,'scarce','AWJ-3','Scarce Item','ready_stock',500,600,2,1,1,3,4.2,10,5)`
  );
  run(
    `INSERT INTO product_variants (id,product_id,name,value,price_delta,stock_qty)
     VALUES (1,1,'Color','Black',0,10),(2,1,'Color','Gold',150,3),(3,3,'Size','XL',100,2)`
  );
}

before(() => seedCatalogue());

/* ========================================================================== */
/* Cart                                                                        */
/* ========================================================================== */

test('normalizeCart drops junk and clamps quantities', () => {
  const cartIn = [
    { id: 1, qty: 2 },
    { id: 1, qty: 3, variantId: 1 },
    null,
    { id: 'abc', qty: 1 },
    { id: 0, qty: 1 },
    { id: 2, qty: 0 },
    { id: 2, qty: -5 },
    { id: 2, qty: 9999 },
    { id: 3 },
  ];
  const out = cart.normalizeCart(cartIn);

  // id 1 (no variant), id 1 (variant 1), id 2 (qty 9999). Everything else is junk.
  assert.equal(out.length, 3, 'keeps only lines with a valid id and qty >= 1');
  assert.equal(out.find((l) => l.id === 1 && l.variantId === null).qty, 2);
  assert.equal(out.find((l) => l.id === 1 && l.variantId === 1).qty, 3);

  const two = out.find((l) => l.id === 2);
  assert.equal(two.qty, cart.MAX_QTY_PER_LINE, 'an over-large qty is capped, not dropped');
  assert.ok(!out.some((l) => l.id === 3), 'a line with no quantity is removed');
});

test('normalizeCart merges duplicate lines for the same product+variant', () => {
  const out = cart.normalizeCart([
    { id: 1, qty: 2, variantId: 1 },
    { id: 1, qty: 4, variantId: 1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].qty, 6);
});

test('priceCart computes subtotal, delivery and total', () => {
  const priced = cart.priceCart([{ id: 1, qty: 2 }], { district: 'Dhaka' });
  assert.equal(priced.subtotal, 3700);
  assert.equal(priced.deliveryFee, 80);
  assert.equal(priced.total, 3780);
  assert.equal(priced.itemCount, 2);
  assert.equal(priced.hasReadyStock, true);
  assert.equal(priced.hasPreorder, false);
});

test('priceCart applies outside-Dhaka delivery', () => {
  const priced = cart.priceCart([{ id: 1, qty: 1 }], { district: 'Chattogram' });
  assert.equal(priced.deliveryFee, 130);
  assert.equal(priced.total, 1850 + 130);
});

test('priceCart honours the free-delivery threshold from settings', () => {
  setSetting('delivery.free_threshold', 3000);
  invalidateSettingsCache();
  const under = cart.priceCart([{ id: 1, qty: 1 }], { district: 'Chattogram' });
  assert.equal(under.deliveryFee, 130);
  const over = cart.priceCart([{ id: 1, qty: 2 }], { district: 'Chattogram' });
  assert.equal(over.subtotal, 3700);
  assert.equal(over.deliveryFee, 0, 'free above the threshold');
  setSetting('delivery.free_threshold', 0);
  invalidateSettingsCache();
});

test('priceCart clamps quantity to available stock and reports it', () => {
  const priced = cart.priceCart([{ id: 3, qty: 5 }], { district: 'Dhaka' });
  assert.equal(priced.lines[0].qty, 2);
  assert.equal(priced.issues.length, 1);
  assert.match(priced.issues[0].message, /Only 2 left/);
});

test('priceCart removes a sold-out line and flags it', () => {
  run('UPDATE products SET stock_qty = 0 WHERE id = 3');
  const priced = cart.priceCart([{ id: 3, qty: 1 }, { id: 1, qty: 1 }], { district: 'Dhaka' });
  assert.equal(priced.lines.length, 1);
  assert.ok(priced.issues.some((i) => i.remove));
  run('UPDATE products SET stock_qty = 2 WHERE id = 3');
});

test('priceCart adds variant price deltas and names the variant', () => {
  const priced = cart.priceCart([{ id: 1, qty: 1, variantId: 2 }], { district: 'Dhaka' });
  assert.equal(priced.lines[0].unitPrice, 2000, '1850 + 150 delta');
  assert.equal(priced.lines[0].variantLabel, 'Color: Gold');
});

test('priceCart rejects a variant that belongs to another product', () => {
  const priced = cart.priceCart([{ id: 2, qty: 1, variantId: 1 }], { district: 'Dhaka' });
  assert.equal(priced.lines.length, 0);
  assert.ok(priced.issues.length > 0);
});

test('pre-order items ignore local stock and carry the 7-10 day window', () => {
  const priced = cart.priceCart([{ id: 2, qty: 1 }], { district: 'Dhaka' });
  assert.equal(priced.lines.length, 1);
  assert.equal(priced.lines[0].qty, 1);
  assert.deepEqual(priced.estimatedDays, { min: 7, max: 10 });
  assert.equal(priced.hasPreorder, true);
});

test('a mixed cart is dated by the slower leg', () => {
  const priced = cart.priceCart([{ id: 1, qty: 1 }, { id: 2, qty: 1 }], { district: 'Dhaka' });
  assert.deepEqual(priced.estimatedDays, { min: 7, max: 10 });
  assert.equal(priced.hasReadyStock, true);
  assert.equal(priced.hasPreorder, true);
  assert.equal(priced.deliveryFee, 80, 'delivery is charged once for the whole order');
});

test('an empty cart prices to zero without a delivery charge', () => {
  const priced = cart.priceCart([], { district: 'Dhaka' });
  assert.equal(priced.total, 0);
  assert.equal(priced.deliveryFee, 0);
  assert.equal(priced.itemCount, 0);
});

test('cartSummary reflects a changed catalogue price', () => {
  run('UPDATE products SET price = 2000 WHERE id = 1');
  const summary = cart.cartSummary([{ id: 1, qty: 2 }]);
  assert.equal(summary.subtotal, 4000);
  assert.equal(summary.itemCount, 2);
  run('UPDATE products SET price = 1850 WHERE id = 1');
});

/* ========================================================================== */
/* Checkout validation                                                         */
/* ========================================================================== */

const goodCart = [{ id: 1, qty: 1 }];

test('a complete valid payload passes', () => {
  const res = orders.validateCheckout({ ...CUSTOMER, cart: goodCart });
  assert.equal(res.ok, true);
  assert.equal(res.value.phone, '01712345678');
});

test('phone numbers are normalised from +880 and spaced forms', () => {
  for (const input of ['+8801712345678', '8801712345678', '01712 345678', '01712-345678']) {
    const res = orders.validateCheckout({ ...CUSTOMER, phone: input, cart: goodCart });
    assert.equal(res.ok, true, `${input} should normalise`);
    assert.equal(res.value.phone, '01712345678');
  }
});

test('invalid phone numbers are rejected', () => {
  for (const phone of ['12345', '0171234567', 'abcdefghijk', '0201234567']) {
    const res = orders.validateCheckout({ ...CUSTOMER, phone, cart: goodCart });
    assert.equal(res.ok, false, `${phone} should be rejected`);
    assert.ok(res.errors.phone);
  }
});

test('district must come from the known list', () => {
  const bad = orders.validateCheckout({ ...CUSTOMER, district: 'Atlantis', cart: goodCart });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.district);

  const good = orders.validateCheckout({ ...CUSTOMER, district: 'Chattogram', cart: goodCart });
  assert.equal(good.ok, true);
});

test('payment method must be enabled in settings', () => {
  assert.equal(orders.validateCheckout({ ...CUSTOMER, payment: 'cod', cart: goodCart }).ok, true);
  assert.equal(orders.validateCheckout({ ...CUSTOMER, payment: 'crypto', cart: goodCart }).ok, false);

  setSetting('payment.cod.enabled', false);
  invalidateSettingsCache();
  const disabled = orders.validateCheckout({ ...CUSTOMER, payment: 'cod', cart: goodCart });
  assert.equal(disabled.ok, false, 'a disabled method must be refused');
  assert.ok(disabled.errors.payment);
  setSetting('payment.cod.enabled', true);
  invalidateSettingsCache();
});

test('an empty cart is rejected', () => {
  const res = orders.validateCheckout({ ...CUSTOMER, cart: [] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.cart);
});

test('name and address must be plausible', () => {
  assert.equal(orders.validateCheckout({ ...CUSTOMER, name: 'A', cart: goodCart }).ok, false);
  assert.equal(orders.validateCheckout({ ...CUSTOMER, address: 'x', cart: goodCart }).ok, false);
  assert.equal(orders.validateCheckout({ ...CUSTOMER, name: 'R<U>I>M', cart: goodCart }).ok, false);
  // Bangla names are fine.
  assert.equal(orders.validateCheckout({ ...CUSTOMER, name: 'রহিম উদ্দিন', cart: goodCart }).ok, true);
});

/* ========================================================================== */
/* Order creation                                                              */
/* ========================================================================== */

test('creating an order stores lines, decrements stock and logs an event', () => {
  const before = get('SELECT stock_qty FROM products WHERE id = 1').stock_qty;
  const res = orders.createOrder({
    value: { ...CUSTOMER, lines: goodCart },
    ip: '127.0.0.1',
    userAgent: 'test',
  });
  assert.equal(res.ok, true);
  const order = res.order;

  assert.match(order.order_code, /^AWAJ-[A-Z0-9]{6}$/);
  assert.equal(order.subtotal, 1850);
  assert.equal(order.delivery_fee, 80);
  assert.equal(order.total, 1930);
  assert.equal(order.status, 'received');
  assert.equal(order.product_type, 'ready_stock');

  const items = orders.getOrderItems(order.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Mini Printer');
  assert.equal(items[0].line_total, 1850);

  const after = get('SELECT stock_qty FROM products WHERE id = 1').stock_qty;
  assert.equal(after, before - 1, 'stock decremented');

  const events = orders.getOrderEvents(order.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'received');
});

test('order codes are unique', () => {
  const codes = new Set();
  for (let i = 0; i < 5; i += 1) {
    const res = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } });
    assert.equal(res.ok, true);
    codes.add(res.order.order_code);
  }
  assert.equal(codes.size, 5);
});

test('order lines snapshot the product details at purchase time', () => {
  const res = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } });
  const items = orders.getOrderItems(res.order.id);
  const stored = items[0];

  // Change the catalogue afterwards; the invoice must not move.
  run('UPDATE products SET title = ?, price = ? WHERE id = ?', ['Renamed Product', 9999, 1]);
  const again = orders.getOrderItems(res.order.id);
  assert.equal(again[0].title, stored.title);
  assert.equal(again[0].unit_price, stored.unit_price);

  run('UPDATE products SET title = ?, price = ? WHERE id = ?', ['Mini Printer', 1850, 1]);
});

test('a pre-order order does not decrement local stock', () => {
  const before = get('SELECT stock_qty FROM products WHERE id = 2').stock_qty;
  const res = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 2, qty: 3 }] } });
  assert.equal(res.ok, true);
  assert.equal(res.order.product_type, 'preorder');
  assert.equal(get('SELECT stock_qty FROM products WHERE id = 2').stock_qty, before);
});

test('ordering more than available stock is rejected, not silently reduced', () => {
  const available = get('SELECT stock_qty FROM products WHERE id = 3').stock_qty;
  assert.throws(
    () => orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 3, qty: available + 50 }] } }),
    (err) => err.code === 'stock_changed'
  );
  assert.equal(get('SELECT stock_qty FROM products WHERE id = 3').stock_qty, available, 'stock untouched');
});

test('a cart that became entirely unavailable is refused', () => {
  run('UPDATE products SET is_active = 0 WHERE id = 3');
  const res = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 3, qty: 1 }] } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.cart);
  run('UPDATE products SET is_active = 1 WHERE id = 3');
});

/* ========================================================================== */
/* Status transitions                                                          */
/* ========================================================================== */

test('status machine allows the normal forward path', () => {
  assert.equal(orders.canTransition('received', 'confirmed'), true);
  assert.equal(orders.canTransition('confirmed', 'ready_for_delivery'), true);
  assert.equal(orders.canTransition('ready_for_delivery', 'delivered'), true);
});

test('status machine rejects skipping and reversing', () => {
  assert.equal(orders.canTransition('received', 'delivered'), false);
  assert.equal(orders.canTransition('delivered', 'received'), false);
  assert.equal(orders.canTransition('delivered', 'cancelled'), false, 'a delivered order is final');
});

test('any live order can be cancelled, which restores stock', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 2 }] } }).order;
  const afterOrder = get('SELECT stock_qty FROM products WHERE id = 1').stock_qty;

  const res = orders.updateOrderStatus(order.id, 'cancelled', { note: 'Customer changed their mind' });
  assert.equal(res.ok, true);
  assert.equal(get('SELECT stock_qty FROM products WHERE id = 1').stock_qty, afterOrder + 2);
});

test('an invalid status change is refused with a readable message', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  const res = orders.updateOrderStatus(order.id, 'delivered');
  assert.equal(res.ok, false);
  assert.match(res.error, /Cannot change from/);
});

test('status changes are appended to the visible timeline', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  orders.updateOrderStatus(order.id, 'confirmed', { note: 'Called and confirmed' });
  const events = orders.getOrderEvents(order.id);
  assert.equal(events.length, 2);
  assert.equal(events[1].status, 'confirmed');
  assert.equal(events[1].note, 'Called and confirmed');
  assert.equal(events[1].visible, 1);
});

test('internal notes stay hidden from customers', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  orders.updateOrderStatus(order.id, 'confirmed', { note: 'Internal: check customs risk', visible: false });
  assert.ok(!orders.getOrderEvents(order.id).some((e) => e.note?.includes('Internal')));
  assert.ok(orders.getOrderEvents(order.id, true).some((e) => e.note?.includes('Internal')));
});

/* ========================================================================== */
/* Tracking                                                                    */
/* ========================================================================== */

test('ready-stock tracking omits the China steps', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  orders.updateOrderStatus(order.id, 'confirmed');
  orders.updateOrderStatus(order.id, 'ready_for_delivery');

  const timeline = orders.buildTimeline(orders.getOrderById(order.id));
  const statuses = timeline.map((s) => s.status);
  assert.deepEqual(statuses, ['received', 'confirmed', 'ready_for_delivery', 'delivered']);
  assert.ok(!statuses.includes('ordered_from_china'));
});

test('pre-order tracking includes the full China journey', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 2, qty: 1 }] } }).order;
  const timeline = orders.buildTimeline(orders.getOrderById(order.id));
  assert.ok(timeline.some((s) => s.status === 'ordered_from_china'));
  assert.ok(timeline.some((s) => s.status === 'arrived_bd'));
  assert.equal(timeline.length, 7);
});

test('timeline marks completed, current and upcoming steps', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  orders.updateOrderStatus(order.id, 'confirmed');
  const timeline = orders.buildTimeline(orders.getOrderById(order.id));
  assert.equal(timeline[0].state, 'done');
  assert.equal(timeline[1].state, 'current');
  assert.equal(timeline[2].state, 'upcoming');
});

test('tracking requires a matching phone number', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  const good = orders.trackOrder(order.order_code, '01712345678');
  assert.equal(good.ok, true);
  assert.equal(good.order.order_code, order.order_code);

  const wrong = orders.trackOrder(order.order_code, '01999999999');
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /could not find/i);
});

test('tracking rejects a malformed order id', () => {
  const res = orders.trackOrder('not-an-order', '01712345678');
  assert.equal(res.ok, false);
  assert.match(res.error, /AWAJ-/);
});

test('order code lookup is case and whitespace tolerant', () => {
  const order = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  const res = orders.trackOrder(`  ${order.order_code.toLowerCase()} `, '01712345678');
  assert.equal(res.ok, true);
});

/* ========================================================================== */
/* Admin listing                                                               */
/* ========================================================================== */

test('listOrders filters by status and free text', () => {
  const mine = orders.createOrder({ value: { ...CUSTOMER, lines: [{ id: 1, qty: 1 }] } }).order;
  orders.updateOrderStatus(mine.id, 'confirmed');

  const confirmed = orders.listOrders({ status: 'confirmed' });
  assert.ok(confirmed.items.every((o) => o.status === 'confirmed'));
  assert.ok(confirmed.items.some((o) => o.order_code === mine.order_code));

  const byCode = orders.listOrders({ q: mine.order_code });
  assert.equal(byCode.total, 1);
  assert.equal(byCode.items[0].order_code, mine.order_code);

  const byPhone = orders.listOrders({ q: '01712345678' });
  assert.ok(byPhone.total >= 1);
});

test('listOrders paginates', () => {
  const res = orders.listOrders({ perPage: 2, page: 1 });
  assert.ok(res.items.length <= 2);
  assert.equal(res.perPage, 2);
  assert.ok(res.pages >= 1);
});

test('orderStats aggregates revenue and open counts', () => {
  const stats = orders.orderStats();
  assert.ok(stats.total > 0);
  assert.ok(stats.revenue > 0);
  assert.equal(typeof stats.todayOrders, 'number');
  assert.ok(stats.open >= 0);
});
